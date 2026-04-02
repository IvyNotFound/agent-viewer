#!/usr/bin/env node
/**
 * dbw.js — SQLite write wrapper (sqlite3 CLI binary, no native module)
 *
 * Usage:
 *   node scripts/dbw.js "UPDATE tasks SET statut='en_cours' WHERE id=250"
 *   echo "UPDATE ..." | node scripts/dbw.js   # stdin (safe for complex queries)
 *   echo '{"sql":"INSERT INTO t (col) VALUES (?)","params":["val with apostrophe O'\''Brien"]}' | node scripts/dbw.js
 *
 * Uses sqlite3 CLI binary for direct file access — no NMV conflict with Electron.
 * Advisory lock (.wlock file) serializes concurrent writes between agents.
 *
 * Stdin mode avoids shell interpretation of backticks, $(), quotes and newlines.
 * Useful for long UPDATE/INSERT with system_prompt content or multi-line SQL.
 */

const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const { acquireLock, releaseLock, cleanupOrphanTmp } = require('./dblock')

const sqlArg = process.argv[2]

const dbPath = path.resolve(process.cwd(), '.claude/project.db')
const binaryName = process.platform === 'win32' ? 'sqlite3.exe' : 'sqlite3'
const sqliteBin = path.resolve(__dirname, '..', 'resources', 'bin', binaryName)

function ensureBin() {
  if (!fs.existsSync(sqliteBin)) {
    console.error(`ERREUR dbw: sqlite3 binary not found at ${sqliteBin}`)
    console.error('Run: npm run download-sqlite3')
    process.exit(1)
  }
}

function normalizeSql(sql) {
  // Normalize MySQL/PostgreSQL datetime functions to SQLite equivalents.
  sql = sql.replace(/\bNOW\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP')
  // Normalize typographic quotes to ASCII equivalents.
  sql = sql.replace(/[\u201C\u201D]/g, '"')
  sql = sql.replace(/[\u2018\u2019]/g, "'")
  sql = sql.replace(/\\"/g, '"')
  sql = sql.replace(/\\'/g, "'")
  return sql
}

/**
 * Substitutes ? placeholders with properly SQL-escaped values.
 * Handles strings (apostrophe escaping), numbers, booleans, and null.
 * @param {string} sql
 * @param {any[]} params
 * @returns {string}
 */
function substParams(sql, params) {
  let i = 0
  return sql.replace(/\?/g, () => {
    const val = params[i++]
    if (val === null || val === undefined) return 'NULL'
    if (typeof val === 'number') return String(val)
    if (typeof val === 'boolean') return val ? '1' : '0'
    return "'" + String(val).replace(/'/g, "''") + "'"
  })
}

/**
 * Executes a write SQL statement directly on the database file.
 * Serialized via advisory lock to prevent concurrent lost-update races.
 * @param {string} sql
 * @param {any[]} [params=[]] — Bound parameters for prepared statement (T620)
 */
function run(sql, params = []) {
  sql = normalizeSql(sql)
  if (params.length > 0) {
    sql = substParams(sql, params)
  }
  ensureBin()
  cleanupOrphanTmp(dbPath)
  const lockPath = acquireLock(dbPath)
  try {
    // .timeout is a dot-command (no output pollution); WAL is persistent on the DB file
    const script = `.timeout 5000\n${sql}`
    execFileSync(sqliteBin, [dbPath], {
      input: script,
      encoding: 'utf8',
    })
  } catch (err) {
    releaseLock(lockPath)
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message
    console.error('ERREUR dbw:', stderr)
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
