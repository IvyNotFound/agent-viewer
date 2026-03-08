import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'

/**
 * Tests for dbw.js multi-statement SQL support (T1155).
 *
 * Verifies the exec() vs prepare() branching logic using better-sqlite3 directly.
 * These tests prove that db.exec() handles multiple statements while
 * db.prepare() only handles single statements.
 */

describe('dbw multi-statement support (better-sqlite3)', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('db.exec() executes multiple statements separated by ;', () => {
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    db.exec("INSERT INTO t (val) VALUES ('a'); INSERT INTO t (val) VALUES ('b');")
    const rows = db.prepare('SELECT val FROM t ORDER BY id').all() as { val: string }[]
    expect(rows).toHaveLength(2)
    expect(rows[0].val).toBe('a')
    expect(rows[1].val).toBe('b')
  })

  it('db.prepare() only handles a single statement', () => {
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    // better-sqlite3 prepare() throws on multi-statement SQL
    expect(() => {
      db.prepare("INSERT INTO t (val) VALUES ('a'); INSERT INTO t (val) VALUES ('b');")
    }).toThrow()
  })

  it('db.exec() works with a single statement (backward-compatible)', () => {
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    db.exec("INSERT INTO t (val) VALUES ('single')")
    const rows = db.prepare('SELECT val FROM t').all() as { val: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].val).toBe('single')
  })

  it('db.prepare() with params works for single statement', () => {
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    db.prepare('INSERT INTO t (val) VALUES (?)').run('parameterized')
    const rows = db.prepare('SELECT val FROM t').all() as { val: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].val).toBe('parameterized')
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

    const comments = db.prepare('SELECT content FROM comments WHERE task_id = 1').all() as { content: string }[]
    expect(comments).toHaveLength(1)
    expect(comments[0].content).toBe('done comment')

    const tasks = db.prepare('SELECT status FROM tasks WHERE id = 1').all() as { status: string }[]
    expect(tasks[0].status).toBe('done')
  })
})
