#!/usr/bin/env node
/**
 * dbstart.js — All-in-one agent session startup (sqlite3 CLI binary, no native module)
 *
 * Usage: node scripts/dbstart.js <agent-name> [type] [scope]
 *
 * Performs in one pass:
 *   1. Registers agent (INSERT OR IGNORE)
 *   2. Creates new session (INSERT) → prints session_id + agent_id
 *   3. Shows last terminated session summary
 *   4. Lists open tasks assigned to this agent (todo / in_progress)
 *
 * Replaces 3-5 separate dbq/dbw calls at session startup.
 */

const { execFileSync, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const { randomUUID } = require('node:crypto')
const { acquireLock, releaseLock, cleanupOrphanTmp } = require('./dblock')

const agent = process.argv[2]
const type = process.argv[3] || agent
const scope = process.argv[4] || 'global'

if (agent === '--help' || agent === '-h') {
  console.log('Usage: node scripts/dbstart.js <agent-name> [type] [scope]')
  process.exit(0)
}

if (!agent) {
  console.error('Usage: node scripts/dbstart.js <agent-name> [type] [scope]')
  process.exit(1)
}

// Worktree detection — agents should always run DB scripts from the main repo
const cwd = process.cwd()
const normalizedCwd = cwd.replace(/\\/g, '/')
const worktreeMarker = '.claude/worktrees'
const isInWorktree = normalizedCwd.includes(worktreeMarker)
const mainRepoPath = isInWorktree
  ? cwd.slice(0, normalizedCwd.indexOf(worktreeMarker)).replace(/[\\/]+$/, '')
  : cwd
const dbPath = path.resolve(mainRepoPath, '.claude/project.db')

const binaryName = process.platform === 'win32' ? 'sqlite3.exe' : 'sqlite3'
const sqliteBin = path.resolve(__dirname, '..', 'resources', 'bin', binaryName)

function ensureBin() {
  if (!fs.existsSync(sqliteBin)) {
    console.error(`ERREUR dbstart: sqlite3 binary not found at ${sqliteBin}`)
    console.error('Run: npm run download-sqlite3')
    process.exit(1)
  }
}

/**
 * Executes a SQL script (passed via stdin) and returns trimmed stdout.
 * Uses .timeout dot-command (no output) for busy timeout.
 * @param {string} sql
 * @param {string[]} [extraFlags=[]] — e.g. ['-json']
 * @returns {string}
 */
function sqlExec(sql, extraFlags = []) {
  const script = `.timeout 5000\n${sql}`
  return execFileSync(sqliteBin, [...extraFlags, dbPath], {
    input: script,
    encoding: 'utf8',
  }).trim()
}

/**
 * Escapes a string value for safe inline SQL interpolation.
 * @param {string} val
 * @returns {string}
 */
function esc(val) {
  return "'" + String(val).replace(/'/g, "''") + "'"
}

try {
  ensureBin()
  cleanupOrphanTmp(dbPath)
  const lockPath = acquireLock(dbPath)

  try {
    // Guard: reject purely numeric agent names (likely an agent_id passed by mistake)
    if (/^\d+$/.test(agent)) {
      const hint = sqlExec(`SELECT name FROM agents WHERE id = ${parseInt(agent, 10)}`)
      const hintMsg = hint ? ` Utilisez: node scripts/dbstart.js ${hint}` : ''
      releaseLock(lockPath)
      console.error(`ERREUR: nom d'agent "${agent}" est un entier (probablement un agent_id).${hintMsg}`)
      process.exit(3)
    }

    // 1. Register agent (idempotent) + get agent_id in one pass
    const agentId = parseInt(
      sqlExec(
        `INSERT OR IGNORE INTO agents (name, type, scope) VALUES (${esc(agent)}, ${esc(type)}, ${esc(scope)});\n` +
        `SELECT id FROM agents WHERE name = ${esc(agent)};`
      ),
      10
    )

    // 2. Mark zombie sessions as terminated + get count
    const zombieChanges = parseInt(
      sqlExec(
        `UPDATE sessions\n` +
        `SET status = 'completed',\n` +
        `    ended_at = datetime('now'),\n` +
        `    summary = 'Auto-closed: zombie session (no activity for 60min)'\n` +
        `WHERE status = 'started'\n` +
        `  AND ended_at IS NULL\n` +
        `  AND started_at < datetime('now', '-60 minutes');\n` +
        `SELECT changes();`
      ),
      10
    )
    if (zombieChanges > 0) {
      console.log(`\n[auto-release] ${zombieChanges} zombie session(s) marked as completed`)
    }

    // 3. Check parallel session limit
    const maxSessions = parseInt(
      sqlExec(`SELECT COALESCE(max_sessions, 3) FROM agents WHERE id = ${agentId}`),
      10
    )
    const activeCount = parseInt(
      sqlExec(`SELECT COUNT(*) FROM sessions WHERE agent_id = ${agentId} AND status = 'started'`),
      10
    )
    if (maxSessions !== -1 && activeCount >= maxSessions) {
      releaseLock(lockPath)
      console.error(
        `ERREUR: ${agent} a déjà ${activeCount} session(s) active(s) (max ${maxSessions}). Terminer une session avant d'en ouvrir une nouvelle.`
      )
      process.exit(2)
    }

    // 4. Create session with pre-assigned conv_id (T626) + get session_id
    const sessionUUID = randomUUID()
    const sessionId = parseInt(
      sqlExec(
        `INSERT INTO sessions (agent_id, claude_conv_id) VALUES (${agentId}, ${esc(sessionUUID)});\n` +
        `SELECT last_insert_rowid();`
      ),
      10
    )

    // Release lock — writes are done
    releaseLock(lockPath)

    // === OUTPUT ===

    console.log(`=== IDENTIFIANTS ===`)
    console.log(`agent_id: ${agentId}`)
    console.log(`session_id: ${sessionId}`)
    console.log(`SESSION_ID=${sessionUUID}`)

    if (isInWorktree) {
      console.log('\n=== WORKTREE ACTIF ===')
      console.log(`Dev depuis : ${cwd}`)
      console.log(`DB via : cd ${mainRepoPath} && node scripts/dbq.js ...`)
    }

    // 5. Last terminated session (read-only, no lock needed)
    const prevJson = sqlExec(
      `SELECT summary, ended_at FROM sessions\n` +
      `WHERE agent_id = ${agentId} AND status = 'completed' AND id != ${sessionId}\n` +
      `ORDER BY ended_at DESC LIMIT 1;`,
      ['-json']
    )

    console.log('\n=== SESSION PRÉCÉDENTE ===')
    const prevRows = JSON.parse(prevJson || '[]')
    if (prevRows.length > 0) {
      const prev = prevRows[0]
      console.log(`ended_at: ${prev.ended_at}`)
      console.log(`summary: ${prev.summary ?? '(aucun)'}`)
    } else {
      console.log('(aucune session completed)')
    }

    // 6. Open tasks (todo + in_progress)
    const tasksJson = sqlExec(
      `SELECT t.id, t.status, t.scope, t.priority, t.title, t.description\n` +
      `FROM tasks t\n` +
      `WHERE t.agent_assigned_id = ${agentId} AND t.status IN ('todo', 'in_progress')\n` +
      `ORDER BY t.status DESC, t.updated_at DESC;`,
      ['-json']
    )

    const tasks = JSON.parse(tasksJson || '[]')

    console.log('\n=== TÂCHES ASSIGNÉES ===')
    if (tasks.length === 0) {
      console.log('(aucune tâche todo / in_progress)')
    } else {
      for (const t of tasks) {
        console.log(`\n[T${t.id}] ${t.status} | ${t.scope ?? '-'} | prio:${t.priority} | ${t.title}`)
        if (t.description) console.log(t.description)
      }
    }

  } catch (err) {
    releaseLock(lockPath)
    throw err
  }

  // Non-fatal: prune orphan worktrees on startup (ADR-006)
  try {
    execSync('git worktree prune', { cwd: process.cwd(), stdio: 'pipe' })
  } catch (e) {
    console.warn('[dbstart] git worktree prune failed:', e.message)
  }
} catch (err) {
  console.error('ERREUR dbstart:', err.message)
  process.exit(1)
}
