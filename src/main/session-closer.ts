/**
 * Session closer — auto-closes started sessions when their associated task is done,
 * and detects sessions manually closed between poll cycles.
 *
 * Poll interval: 30s. Started from ipc-db.ts on watch-db / stopped on unwatch-db.
 *
 * Logic: every 30s,
 * 1. Zombie-close: find sessions in 'started' whose agent has at least one task
 *    in 'done' for more than 1 minute (done AFTER the session started) AND no
 *    task in 'todo' or 'in_progress'. Tasks from previous sessions are ignored.
 * 2. Manually-closed: find sessions that transitioned to 'completed' since last poll
 *    (covers agents with no assigned tasks, e.g. review, doc).
 *
 * Uses agent_id FK instead of summary LIKE (which matched nothing on active sessions).
 *
 * @module session-closer
 */

import { writeDb, queryLive, assertDbPathAllowed } from './db'

let pollerInterval: ReturnType<typeof setInterval> | null = null

/**
 * Quick pre-check: returns true if at least one session is in 'started' status.
 * Used to skip expensive zombie/manual-close queries when nothing is active.
 */
async function hasStartedSessions(dbPath: string): Promise<boolean> {
  const rows = await queryLive(
    dbPath,
    `SELECT 1 FROM sessions WHERE status = 'started' LIMIT 1`,
    []
  )
  return rows.length > 0
}

/**
 * Timestamp of the last poll cycle end (SQLite format: 'YYYY-MM-DD HH:MM:SS').
 * Used by detectManuallyClosed to find sessions closed since the last cycle.
 * Initialized to now() on startSessionCloser to avoid re-emitting old sessions.
 */
let lastCheckedAt: string = ''

/** Return current time as SQLite datetime string ('YYYY-MM-DD HH:MM:SS'). */
function currentSqliteTime(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * Start periodic poll (30s) that closes started sessions
 * whose associated task has been in 'done' for more than 1 minute,
 * and emits agent_ids for sessions that were manually closed between cycles.
 * Replaces any existing poller.
 *
 * @param onSessionsClosed - Optional callback called with the list of agent_ids
 *   whose sessions were closed. Only invoked when at least one session is closed.
 */
export function startSessionCloser(
  dbPath: string,
  onSessionsClosed?: (agentIds: number[]) => void
): void {
  stopSessionCloser()
  lastCheckedAt = currentSqliteTime()
  pollerInterval = setInterval(async () => {
    try {
      if (!(await hasStartedSessions(dbPath))) {
        lastCheckedAt = currentSqliteTime()
        return
      }
      const zombieIds = await closeZombieSessions(dbPath)
      const manualIds = await detectManuallyClosed(dbPath, lastCheckedAt)
      lastCheckedAt = currentSqliteTime()
      const allIds = [...new Set([...zombieIds, ...manualIds])]
      if (allIds.length > 0) onSessionsClosed?.(allIds)
    } catch (err) {
      console.error('[session-closer] poll error:', err)
    }
  }, 30_000)
  console.log('[session-closer] started for', dbPath)
}

/** Stop session closer and clear interval. */
export function stopSessionCloser(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval)
    pollerInterval = null
  }
}

/**
 * Close all started sessions whose agent has completed all tasks (none in todo/in_progress)
 * and has at least one task in 'done' for > 1 minute.
 *
 * Uses agent_id FK match instead of summary LIKE — active sessions have NULL summary,
 * so the old LIKE pattern never matched.
 *
 * @returns List of agent_ids whose sessions were closed (empty if none).
 *
 * Exported for testing.
 */
export async function closeZombieSessions(dbPath: string): Promise<number[]> {
  assertDbPathAllowed(dbPath)
  const ELIGIBILITY_WHERE = `
      WHERE status = 'started'
        AND agent_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.agent_assigned_id = sessions.agent_id
            AND t.status IN ('todo', 'in_progress')
        )
        AND EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.agent_assigned_id = sessions.agent_id
            AND t.status = 'done'
            AND t.updated_at < datetime('now', '-1 minute')
            AND t.updated_at > sessions.started_at
        )`
  let closedAgentIds: number[] = []
  await writeDb(dbPath, (db) => {
    const result = db.exec(`SELECT id, agent_id FROM sessions ${ELIGIBILITY_WHERE}`)
    const rows = result[0]?.values ?? []
    if (rows.length > 0) {
      const sessionIds = rows.map((r) => r[0] as number)
      closedAgentIds = [...new Set(rows.map((r) => r[1] as number))]
      const placeholders = sessionIds.map(() => '?').join(',')
      db.run(
        `UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id IN (${placeholders})`,
        sessionIds
      )
    }

    // T1884: close stale sessions started > 6 hours ago (regardless of task status)
    // T1937: increased from 2h to 6h — the previous threshold killed long-running agents.
    // Cascade is now safe: V1 fix ensures closeTabGroup won't kill tabs with active streamId.
    const staleResult = db.exec(
      `SELECT id, agent_id FROM sessions
       WHERE status = 'started'
         AND agent_id IS NOT NULL
         AND started_at < datetime('now', '-6 hours')`
    )
    const staleRows = staleResult[0]?.values ?? []
    if (staleRows.length > 0) {
      const staleSessionIds = staleRows.map((r) => r[0] as number)
      const staleAgentIds = [...new Set(staleRows.map((r) => r[1] as number))]
      const ph = staleSessionIds.map(() => '?').join(',')
      db.run(
        `UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id IN (${ph})`,
        staleSessionIds
      )
      closedAgentIds.push(...staleAgentIds)
    }

    closedAgentIds = [...new Set(closedAgentIds)]
    // T1110: return false when 0 rows modified → writeDb skips export+write
    return db.getRowsModified() > 0
  })
  return closedAgentIds
}

/**
 * Detect sessions that transitioned to 'completed' since the last poll cycle.
 * Covers agents with no assigned tasks (review, doc, etc.) who close their own session.
 *
 * Uses `ended_at > since` (strictly greater) to avoid re-emitting sessions already
 * detected in the previous cycle.
 *
 * @param since - SQLite datetime string; only sessions closed strictly after this are returned.
 * @returns List of agent_ids whose sessions were manually closed since `since`.
 *
 * Exported for testing.
 */
export async function detectManuallyClosed(dbPath: string, since: string): Promise<number[]> {
  assertDbPathAllowed(dbPath)
  const rows = await queryLive(
    dbPath,
    `SELECT DISTINCT agent_id FROM sessions
     WHERE status = 'completed'
       AND ended_at > ?
       AND agent_id IS NOT NULL`,
    [since]
  )
  return rows.map((r) => (r as { agent_id: number }).agent_id)
}
