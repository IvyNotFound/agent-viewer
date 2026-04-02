#!/usr/bin/env node
/**
 * dbq.js — SQLite read wrapper (sqlite3 CLI binary, no native module)
 *
 * Usage:
 *   node scripts/dbq.js "SELECT id, title, status FROM tasks LIMIT 10"
 *   node scripts/dbq.js --json "SELECT ..."   # JSON output (programmatic)
 *   echo "SELECT ..." | node scripts/dbq.js   # stdin (safe for complex queries)
 *   echo "SELECT ..." | node scripts/dbq.js --json
 *
 * Default output: compact pipe-separated table (minimal tokens)
 *   id|title|status
 *   1|Setup|archived
 *
 * Stdin mode avoids shell interpretation of backticks, $(), quotes and newlines.
 */

const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const args = process.argv.slice(2)
const jsonMode = args.includes('--json')
const sqlArg = args.find((a) => !a.startsWith('--'))

const dbPath = path.resolve(process.cwd(), '.claude/project.db')
const binaryName = process.platform === 'win32' ? 'sqlite3.exe' : 'sqlite3'
const sqliteBin = path.resolve(__dirname, '..', 'resources', 'bin', binaryName)

function ensureBin() {
  if (!fs.existsSync(sqliteBin)) {
    console.error(`ERREUR dbq: sqlite3 binary not found at ${sqliteBin}`)
    console.error('Run: npm run download-sqlite3')
    process.exit(1)
  }
}

function normalizeSql(sql) {
  sql = sql.replace(/[\u201C\u201D]/g, '"')
  sql = sql.replace(/[\u2018\u2019]/g, "'")
  sql = sql.replace(/\\"/g, '"')
  sql = sql.replace(/\\'/g, "'")
  return sql
}

/**
 * Runs the query and prints results.
 * @param {string} sql
 */
function run(sql) {
  sql = normalizeSql(sql)
  ensureBin()

  // .timeout is a dot-command (no output), unlike PRAGMA busy_timeout which echoes the value
  const script = `.timeout 5000\n${sql}`

  try {
    if (jsonMode) {
      const output = execFileSync(sqliteBin, ['-json', dbPath], {
        input: script,
        encoding: 'utf8',
      })
      const rows = JSON.parse(output.trim() || '[]')
      console.log(JSON.stringify(rows, null, 2))
    } else {
      const output = execFileSync(sqliteBin, ['-header', '-separator', '|', '-nullvalue', 'NULL', dbPath], {
        input: script,
        encoding: 'utf8',
      })
      if (!output.trim()) {
        console.log('(empty)')
        return
      }
      process.stdout.write(output)
    }
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message
    console.error('ERREUR dbq:', stderr)
    process.exit(1)
  }
}

if (sqlArg) {
  run(sqlArg)
} else if (!process.stdin.isTTY) {
  let chunks = []
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => chunks.push(chunk))
  process.stdin.on('end', () => {
    const sql = chunks.join('').trim()
    if (!sql) {
      console.error('Error: no SQL provided via stdin')
      process.exit(1)
    }
    run(sql)
  })
} else {
  console.error('Usage: node scripts/dbq.js [--json] "<SQL>"')
  console.error('       echo "<SQL>" | node scripts/dbq.js [--json]')
  process.exit(1)
}
