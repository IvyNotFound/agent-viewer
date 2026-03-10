/**
 * IPC handlers — Session & token management
 *
 * Handles session conv ID storage and token parsing from Claude Code JSONL files.
 *
 * @module ipc-agent-sessions
 */

import { ipcMain } from 'electron'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { assertDbPathAllowed, queryLive, writeDb } from './db'
import { ConvIdSchema, AgentDisplayNameSchema } from '../shared/ipc-schemas'

// ── Token parsing helpers (T518) ──────────────────────────────────────────────

interface TokenCounts {
  tokensIn: number
  tokensOut: number
  cacheRead: number
  cacheWrite: number
}

/**
 * Derive Claude Code's project slug from a WSL project path.
 * e.g. '/mnt/c/Users/foo/project' → '-mnt-c-Users-foo-project'
 */
function claudeProjectSlug(projectPath: string): string {
  return projectPath.replace(/\//g, '-')
}

/**
 * Derive WSL project path from a db path.
 * e.g. '/mnt/c/Users/foo/project/.claude/project.db' → '/mnt/c/Users/foo/project'
 */
function projectPathFromDb(dbPath: string): string {
  return dirname(dirname(dbPath))
}

/**
 * T518: Parse token usage from a Claude Code conversation JSONL file.
 * Sums tokens across all finalized assistant messages (stop_reason != null).
 * Each API call generates 2 JSONL entries with the same requestId:
 *   - streaming start (stop_reason: null, output_tokens ~1)
 *   - final message  (stop_reason: e.g. 'tool_use', full output_tokens)
 * Only the final entry is counted to avoid double-counting.
 *
 * @param projectPath - WSL project path (e.g. '/mnt/c/Users/foo/project')
 * @param convId - Claude Code conversation UUID
 */
async function parseConvTokens(projectPath: string, convId: string): Promise<TokenCounts> {
  const slug = claudeProjectSlug(projectPath)
  const jsonlPath = join(homedir(), '.claude', 'projects', slug, `${convId}.jsonl`)

  let tokensIn = 0, tokensOut = 0, cacheRead = 0, cacheWrite = 0

  await new Promise<void>((resolve, reject) => {
    const rl = createInterface({
      input: createReadStream(jsonlPath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    })
    rl.on('line', (line) => {
      if (!line.trim()) return
      try {
        const obj = JSON.parse(line)
        // Only count finalized assistant messages (stop_reason != null = streaming start only)
        if (obj.type !== 'assistant') return
        if (!obj.message?.usage || obj.message.stop_reason == null) return
        const u = obj.message.usage
        tokensIn  += (u.input_tokens                ?? 0)
        tokensOut += (u.output_tokens               ?? 0)
        cacheRead += (u.cache_read_input_tokens      ?? 0)
        cacheWrite += (u.cache_creation_input_tokens ?? 0)
      } catch { /* malformed line — skip */ }
    })
    rl.on('close', resolve)
    rl.on('error', reject)
  })

  return { tokensIn, tokensOut, cacheRead, cacheWrite }
}

// ── Handler registration ─────────────────────────────────────────────────────

/** Register session & token IPC handlers. */
export function registerAgentSessionHandlers(): void {
  /**
   * Store the Claude Code conversation ID on the latest session for --resume support.
   * @param dbPath - Registered DB path
   * @param agentId - Agent ID
   * @param convId - Claude Code conversation UUID
   * @returns {{ success: boolean, error?: string }}
   */
  ipcMain.handle('session:setConvId', async (_event, dbPath: string, agentId: number, convId: string) => {
    if (!dbPath || typeof agentId !== 'number' || !convId) {
      return { success: false, error: 'Invalid arguments' }
    }
    if (!ConvIdSchema.safeParse(convId).success) {
      return { success: false, error: 'Invalid convId: must be a valid UUID' }
    }
    try {
      assertDbPathAllowed(dbPath)
      const rowsModified = await writeDb<number>(dbPath, (db) => {
        db.run(
          `UPDATE sessions SET claude_conv_id = ?
           WHERE id = (
             SELECT id FROM sessions
             WHERE agent_id = ? AND status = 'started' AND claude_conv_id IS NULL
             ORDER BY id DESC LIMIT 1
           )`,
          [convId, agentId]
        )
        return db.getRowsModified() as number
      })
      console.log(`[IPC session:setConvId] agent=${agentId} conv_id=${convId} updated=${rowsModified}`)
      return { success: true, updated: rowsModified > 0 }
    } catch (err) {
      console.error('[IPC session:setConvId]', err)
      return { success: false, error: String(err) }
    }
  })

  /**
   * T518: Parse token usage from a completed Claude Code session JSONL and persist to DB.
   * Reads ~/.claude/projects/<slug>/<convId>.jsonl, sums finalized assistant messages,
   * and updates sessions.tokens_* WHERE claude_conv_id = convId.
   *
   * @param dbPath - Registered DB path
   * @param convId - Claude Code conversation UUID
   * @param projectPath - WSL project path (derived from dbPath if omitted)
   */
  ipcMain.handle('session:parseTokens', async (_event, dbPath: string, convId: string, projectPath?: string) => {
    if (!dbPath || !convId) return { success: false, error: 'Invalid arguments' }
    if (!ConvIdSchema.safeParse(convId).success) return { success: false, error: 'Invalid convId format' }
    try {
      assertDbPathAllowed(dbPath)
      const resolvedProjectPath = projectPath ?? projectPathFromDb(dbPath)
      const counts = await parseConvTokens(resolvedProjectPath, convId)
      await writeDb(dbPath, (db) => {
        db.run(
          `UPDATE sessions
           SET tokens_in = ?, tokens_out = ?, tokens_cache_read = ?, tokens_cache_write = ?
           WHERE claude_conv_id = ?`,
          [counts.tokensIn, counts.tokensOut, counts.cacheRead, counts.cacheWrite, convId]
        )
      })
      console.log(`[IPC session:parseTokens] conv=${convId} in=${counts.tokensIn} out=${counts.tokensOut}`)
      return { success: true, ...counts }
    } catch (err) {
      console.error('[IPC session:parseTokens]', err)
      return { success: false, error: String(err) }
    }
  })

  /**
   * T518: Retroactively sync token counts for all sessions that have a claude_conv_id
   * but zero tokens. Useful for populating data from sessions started before T518.
   *
   * @param dbPath - Registered DB path
   * @param projectPath - WSL project path (derived from dbPath if omitted)
   */
  ipcMain.handle('session:syncAllTokens', async (_event, dbPath: string, projectPath?: string) => {
    if (!dbPath) return { success: false, updated: 0, errors: [], error: 'Invalid arguments' }
    try {
      assertDbPathAllowed(dbPath)
      const resolvedProjectPath = projectPath ?? projectPathFromDb(dbPath)

      const rows = await queryLive(
        dbPath,
        `SELECT id, claude_conv_id FROM sessions
         WHERE claude_conv_id IS NOT NULL
           AND (tokens_in = 0 OR tokens_in IS NULL)
         ORDER BY id DESC`,
        []
      ) as Array<{ id: number; claude_conv_id: string }>

      let updated = 0
      const errors: string[] = []

      // Collect all valid updates — run up to 5 parseConvTokens in parallel to reduce latency
      const SYNC_CONCURRENCY = 5
      const updates: Array<{ id: number; counts: Awaited<ReturnType<typeof parseConvTokens>> }> = []
      for (let i = 0; i < rows.length; i += SYNC_CONCURRENCY) {
        const batch = rows.slice(i, i + SYNC_CONCURRENCY)
        await Promise.all(batch.map(async (row) => {
          try {
            const counts = await parseConvTokens(resolvedProjectPath, row.claude_conv_id)
            if (counts.tokensIn > 0 || counts.tokensOut > 0) {
              updates.push({ id: row.id, counts })
            }
          } catch (err) {
            errors.push(`session ${row.id}: ${String(err)}`)
          }
        }))
      }

      // Single writeDb call for all updates — O(1) instead of O(N) full-file rewrites
      if (updates.length > 0) {
        await writeDb(dbPath, (db) => {
          for (const { id, counts } of updates) {
            db.run(
              `UPDATE sessions
               SET tokens_in = ?, tokens_out = ?, tokens_cache_read = ?, tokens_cache_write = ?
               WHERE id = ?`,
              [counts.tokensIn, counts.tokensOut, counts.cacheRead, counts.cacheWrite, id]
            )
          }
        })
        updated = updates.length
      }

      console.log(`[IPC session:syncAllTokens] updated=${updated}/${rows.length}`)
      return { success: true, updated, errors }
    } catch (err) {
      console.error('[IPC session:syncAllTokens]', err)
      return { success: false, updated: 0, errors: [], error: String(err) }
    }
  })

  /**
   * T518: Collect and persist token counts for the most recent session of an agent.
   * Called after session close. Finds the latest session with a conv_id but no tokens,
   * parses the JSONL file, and updates sessions.tokens_*.
   *
   * @param dbPath - Registered DB path
   * @param agentName - Agent name to look up
   */
  ipcMain.handle('session:collectTokens', async (_event, dbPath: string, agentName: string) => {
    if (!dbPath || !agentName) return { success: false, error: 'Invalid arguments' }
    if (!AgentDisplayNameSchema.safeParse(agentName).success) {
      return { success: false, error: 'Invalid agentName: must be a non-empty string (max 200 chars)' }
    }
    try {
      assertDbPathAllowed(dbPath)
      const resolvedProjectPath = projectPathFromDb(dbPath)

      const rows = await queryLive(
        dbPath,
        `SELECT s.id, s.claude_conv_id
         FROM sessions s
         JOIN agents a ON a.id = s.agent_id
         WHERE a.name = ?
           AND s.claude_conv_id IS NOT NULL
           AND (s.tokens_in = 0 OR s.tokens_in IS NULL)
         ORDER BY s.id DESC
         LIMIT 1`,
        [agentName]
      ) as Array<{ id: number; claude_conv_id: string }>

      if (rows.length === 0) return { success: true, tokens: null }

      const { id: sessionId, claude_conv_id: convId } = rows[0]
      const counts = await parseConvTokens(resolvedProjectPath, convId)
      await writeDb(dbPath, (db) => {
        db.run(
          `UPDATE sessions
           SET tokens_in = ?, tokens_out = ?, tokens_cache_read = ?, tokens_cache_write = ?
           WHERE id = ?`,
          [counts.tokensIn, counts.tokensOut, counts.cacheRead, counts.cacheWrite, sessionId]
        )
      })
      console.log(`[IPC session:collectTokens] agent=${agentName} session=${sessionId} in=${counts.tokensIn} out=${counts.tokensOut}`)
      return { success: true, tokens: counts }
    } catch (err) {
      console.error('[IPC session:collectTokens]', err)
      return { success: false, error: String(err) }
    }
  })
}
