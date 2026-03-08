import { describe, it, expect } from 'vitest'
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'

/**
 * Tests for dbw.js multi-statement SQL support (T1155).
 *
 * Verifies the exec() vs prepare() branching logic using sql.js directly.
 * These tests prove that db.exec() handles multiple statements while
 * db.prepare() silently drops all but the first.
 */

let SQL: Awaited<ReturnType<typeof initSqlJs>>

// Initialize sql.js WASM once for all tests
beforeAll(async () => {
  SQL = await initSqlJs()
})

describe('dbw multi-statement support', () => {
  let db: SqlJsDatabase

  beforeEach(() => {
    db = new SQL.Database()
  })

  afterEach(() => {
    db.close()
  })

  it('db.exec() executes multiple statements separated by ;', () => {
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    db.exec("INSERT INTO t (val) VALUES ('a'); INSERT INTO t (val) VALUES ('b');")
    const rows = db.exec('SELECT val FROM t ORDER BY id')
    expect(rows[0].values).toHaveLength(2)
    expect(rows[0].values[0][0]).toBe('a')
    expect(rows[0].values[1][0]).toBe('b')
  })

  it('db.prepare() only executes the first statement (proves the bug)', () => {
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    const stmt = db.prepare(
      "INSERT INTO t (val) VALUES ('a'); INSERT INTO t (val) VALUES ('b');"
    )
    stmt.run()
    stmt.free()
    const rows = db.exec('SELECT val FROM t ORDER BY id')
    expect(rows[0].values).toHaveLength(1)
    expect(rows[0].values[0][0]).toBe('a')
  })

  it('db.exec() works with a single statement (backward-compatible)', () => {
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    db.exec("INSERT INTO t (val) VALUES ('single')")
    const rows = db.exec('SELECT val FROM t')
    expect(rows[0].values).toHaveLength(1)
    expect(rows[0].values[0][0]).toBe('single')
  })

  it('db.prepare() with params still works for single statement', () => {
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    const stmt = db.prepare('INSERT INTO t (val) VALUES (?)')
    stmt.run(['parameterized'])
    stmt.free()
    const rows = db.exec('SELECT val FROM t')
    expect(rows[0].values).toHaveLength(1)
    expect(rows[0].values[0][0]).toBe('parameterized')
  })

  it('multi-statement INSERT + UPDATE in single exec() (ticket-completing pattern)', () => {
    db.exec('CREATE TABLE tasks (id INTEGER PRIMARY KEY, status TEXT)')
    db.exec(
      'CREATE TABLE comments (id INTEGER PRIMARY KEY, task_id INT, content TEXT)'
    )
    db.exec("INSERT INTO tasks (id, status) VALUES (1, 'todo')")

    // Simulates the agent ticket-completing pattern
    db.exec(
      "INSERT INTO comments (task_id, content) VALUES (1, 'done comment');\n" +
        "UPDATE tasks SET status = 'done' WHERE id = 1;"
    )

    const comments = db.exec('SELECT content FROM comments WHERE task_id = 1')
    expect(comments[0].values).toHaveLength(1)
    expect(comments[0].values[0][0]).toBe('done comment')

    const tasks = db.exec('SELECT status FROM tasks WHERE id = 1')
    expect(tasks[0].values[0][0]).toBe('done')
  })
})
