#!/usr/bin/env node
/**
 * dbq.js — SQLite read wrapper (better-sqlite3, file-based)
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

const Database = require('better-sqlite3')
const path = require('path')

const args = process.argv.slice(2)
const jsonMode = args.includes('--json')
const sqlArg = args.find((a) => !a.startsWith('--'))

const dbPath = path.resolve(process.cwd(), '.claude/project.db')

/**
 * Runs the query and prints results.
 * @param {string} sql
 */
function run(sql) {
  // Normalize typographic quotes to ASCII equivalents.
  sql = sql.replace(/[\u201C\u201D]/g, '"')
  sql = sql.replace(/[\u2018\u2019]/g, "'")
  sql = sql.replace(/\\"/g, '"')
  sql = sql.replace(/\\'/g, "'")

  try {
    const db = new Database(dbPath, { readonly: true })
    db.pragma('busy_timeout = 5000')
    const stmt = db.prepare(sql)

    if (!stmt.reader) {
      db.close()
      console.error('ERREUR dbq: query is not a SELECT statement')
      process.exit(1)
    }

    const rows = stmt.all()
    db.close()

    if (jsonMode) {
      console.log(JSON.stringify(rows, null, 2))
      return
    }

    if (rows.length === 0) {
      console.log('(empty)')
      return
    }

    const columns = Object.keys(rows[0])
    console.log(columns.join('|'))
    for (const row of rows) {
      console.log(columns.map((c) => (row[c] === null ? 'NULL' : String(row[c]))).join('|'))
    }
  } catch (err) {
    console.error('ERREUR dbq:', err.message)
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
