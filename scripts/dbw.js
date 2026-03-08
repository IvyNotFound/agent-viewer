#!/usr/bin/env node
/**
 * dbw.js — SQLite write wrapper (better-sqlite3, file-based)
 *
 * Usage:
 *   node scripts/dbw.js "UPDATE tasks SET statut='en_cours' WHERE id=250"
 *   echo "UPDATE ..." | node scripts/dbw.js   # stdin (safe for complex queries)
 *   echo '{"sql":"INSERT INTO t (col) VALUES (?)","params":["val with apostrophe O'\''Brien"]}' | node scripts/dbw.js
 *
 * Uses better-sqlite3 for direct file access — no export/import cycle.
 * Advisory lock (.wlock file) serializes concurrent writes between agents.
 *
 * Stdin mode avoids shell interpretation of backticks, $(), quotes and newlines.
 * Useful for long UPDATE/INSERT with system_prompt content or multi-line SQL.
 */

const Database = require('better-sqlite3')
const path = require('path')
const { acquireLock, releaseLock, cleanupOrphanTmp } = require('./dblock')

const sqlArg = process.argv[2]

const dbPath = path.resolve(process.cwd(), '.claude/project.db')

/**
 * Executes a write SQL statement directly on the database file.
 * Serialized via advisory lock to prevent concurrent lost-update races.
 * @param {string} sql
 * @param {any[]} [params=[]] — Bound parameters for prepared statement (T620)
 */
function run(sql, params = []) {
  // Normalize MySQL/PostgreSQL datetime functions to SQLite equivalents.
  sql = sql.replace(/\bNOW\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP')
  // Normalize typographic quotes to ASCII equivalents.
  sql = sql.replace(/[\u201C\u201D]/g, '"')
  sql = sql.replace(/[\u2018\u2019]/g, "'")
  sql = sql.replace(/\\"/g, '"')
  sql = sql.replace(/\\'/g, "'")

  cleanupOrphanTmp(dbPath)
  const lockPath = acquireLock(dbPath)
  try {
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 5000')
    if (params.length > 0) {
      // Parameterized query — single statement only
      db.prepare(sql).run(...params)
    } else {
      // Non-parameterized — support multi-statement via exec()
      db.exec(sql)
    }
    db.close()
  } catch (err) {
    releaseLock(lockPath)
    console.error('ERREUR dbw:', err.message)
    process.exit(1)
  }
  releaseLock(lockPath)
}

if (sqlArg) {
  // Positional argument — backward-compatible mode
  run(sqlArg)
} else if (!process.stdin.isTTY) {
  // Stdin mode — safe for multi-line SQL with backticks, quotes, $vars, newlines
  // Also accepts JSON mode: { "sql": "...", "params": [...] } for parameterized queries (T620)
  const chunks = []
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => chunks.push(chunk))
  process.stdin.on('end', () => {
    const raw = chunks.join('').trim()
    if (!raw) {
      console.error('Error: no SQL provided via stdin')
      process.exit(1)
    }
    // JSON mode: detect by leading { and presence of "sql" key
    if (raw.startsWith('{')) {
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch (e) {
        console.error('Error: stdin starts with { but is not valid JSON:', e.message)
        process.exit(1)
      }
      if (typeof parsed.sql !== 'string') {
        console.error('Error: JSON mode requires a "sql" string field')
        process.exit(1)
      }
      run(parsed.sql, Array.isArray(parsed.params) ? parsed.params : [])
    } else {
      run(raw)
    }
  })
} else {
  console.error('Usage: node scripts/dbw.js "<SQL>"')
  console.error('       echo "<SQL>" | node scripts/dbw.js')
  process.exit(1)
}
