/**
 * Behavioural tests for tasks:qualityStats IPC handler (T836)
 *
 * Strategy: real sql.js Database in memory, fs/promises mocked to read/write
 * from a Buffer variable so writeDb operates on the actual in-memory schema.
 *
 * Framework: Vitest (node environment)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Shared in-memory buffer ───────────────────────────────────────────────────
let dbBuffer: Buffer = Buffer.alloc(0)
let dbMtime = 1000

// ── Mock fs/promises ─────────────────────────────────────────────────────────
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(async () => ({ mtimeMs: dbMtime })),
    readFile: vi.fn(async () => dbBuffer),
    writeFile: vi.fn(async (_path: string, data: Buffer) => {
      dbBuffer = data
      dbMtime += 1
    }),
    rename: vi.fn(async () => undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
  stat: vi.fn(async () => ({ mtimeMs: dbMtime })),
  readFile: vi.fn(async () => dbBuffer),
  writeFile: vi.fn(async (_path: string, data: Buffer) => {
    dbBuffer = data
    dbMtime += 1
  }),
  rename: vi.fn(async () => undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

// ── Mock fs (sync) ────────────────────────────────────────────────────────────
vi.mock('fs', () => {
  const watch = vi.fn(() => ({ close: vi.fn() }))
  const existsSync = vi.fn(() => false)
  const readdirSync = vi.fn(() => [] as string[])
  const stat = vi.fn((_path: string, cb?: (err: null, stat: { mtimeMs: number }) => void) => {
    if (cb) cb(null, { mtimeMs: 1000 })
    return Promise.resolve({ mtimeMs: 1000 })
  })
  return {
    default: { watch, existsSync, readdirSync, stat },
    watch,
    existsSync,
    readdirSync,
    stat,
  }
})

// ── Mock electron ─────────────────────────────────────────────────────────────
const handlers: Record<string, (event: unknown, ...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
  dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
  app: { getVersion: vi.fn(() => '0.5.0') },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null), getAllWindows: vi.fn(() => []) },
}))

// ── Mock migration ────────────────────────────────────────────────────────────
vi.mock('./migration', () => ({
  runTaskStatusMigration: vi.fn(() => 0),
  runAddPriorityMigration: vi.fn(() => false),
  runTaskStatutI18nMigration: vi.fn(() => 0),
  runAddConvIdToSessionsMigration: vi.fn(() => false),
  runAddTokensToSessionsMigration: vi.fn(() => 0),
  runRemoveThinkingModeBudgetTokensMigration: vi.fn(() => false),
  runDropCommentaireColumnMigration: vi.fn(() => 0),
  runSessionStatutI18nMigration: vi.fn(() => 0),
  runMakeAgentAssigneNotNullMigration: vi.fn(() => false),
  runMakeCommentAgentNotNullMigration: vi.fn(() => false),
  runAddAgentGroupsMigration: vi.fn(() => false),
  migrateDb: vi.fn(() => 0),
  CURRENT_SCHEMA_VERSION: 1,
}))

// ── Mock claude-md ────────────────────────────────────────────────────────────
vi.mock('./claude-md', () => ({
  insertAgentIntoClaudeMd: vi.fn((content: string) => content),
}))

vi.mock('./db-lock', () => ({
  acquireWriteLock: vi.fn().mockResolvedValue('/mock.wlock'),
  releaseWriteLock: vi.fn().mockResolvedValue(undefined),
}))

// ── Import after mocks ────────────────────────────────────────────────────────
import { getSqlJs, registerDbPath, clearDbCacheEntry, queryLive, writeDb } from './db'
import { registerIpcHandlers } from './ipc'

// ── Schema builder ────────────────────────────────────────────────────────────
async function buildSchema(): Promise<any> {
  const sqlJs = await getSqlJs()
  const db = new sqlJs.Database()

  db.run(`CREATE TABLE agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT,
    scope TEXT,
    system_prompt TEXT,
    system_prompt_suffix TEXT,
    thinking_mode TEXT,
    allowed_tools TEXT,
    auto_launch INTEGER NOT NULL DEFAULT 1,
    permission_mode TEXT CHECK(permission_mode IN ('default', 'auto')) DEFAULT 'default',
    max_sessions INTEGER NOT NULL DEFAULT 3,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    status TEXT DEFAULT 'todo',
    agent_creator_id INTEGER,
    agent_assigned_id INTEGER,
    agent_validator_id INTEGER,
    parent_task_id INTEGER,
    session_id INTEGER,
    scope TEXT,
    effort INTEGER,
    priority TEXT DEFAULT 'normal',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    validated_at TEXT
  )`)

  db.run(`CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER,
    started_at TEXT,
    ended_at TEXT,
    updated_at TEXT,
    status TEXT,
    summary TEXT,
    claude_conv_id TEXT,
    cost_usd REAL,
    duration_ms INTEGER,
    num_turns INTEGER,
    tokens_in INTEGER,
    tokens_out INTEGER,
    tokens_cache_read INTEGER,
    tokens_cache_write INTEGER
  )`)

  db.run(`CREATE TABLE task_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    agent_id INTEGER,
    content TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE task_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_task INTEGER,
    to_task INTEGER,
    type TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file TEXT,
    agent_id INTEGER,
    session_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    released_at TEXT
  )`)

  db.run(`CREATE TABLE agent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    agent_id INTEGER,
    level TEXT,
    action TEXT,
    detail TEXT,
    files TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
  )`)

  db.run(`CREATE TABLE scopes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    folder TEXT,
    techno TEXT,
    description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE task_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    role TEXT CHECK(role IN ('primary', 'support', 'reviewer')),
    assigned_at TEXT DEFAULT (datetime('now')),
    UNIQUE(task_id, agent_id)
  )`)

  return db
}

const TEST_DB_PATH = '/test/ipc-session-stats-test.db'

// ── Test setup ────────────────────────────────────────────────────────────────
beforeEach(async () => {
  vi.clearAllMocks()
  clearDbCacheEntry(TEST_DB_PATH)
  dbMtime = 1000

  const db = await buildSchema()
  dbBuffer = Buffer.from(db.export())
  db.close()

  registerDbPath(TEST_DB_PATH)
  registerIpcHandlers()
})

afterEach(() => {
  clearDbCacheEntry(TEST_DB_PATH)
})

// ── Helpers ───────────────────────────────────────────────────────────────────
async function insertAgent(name: string, scope?: string): Promise<number> {
  await writeDb<void>(TEST_DB_PATH, (db) => {
    db.run('INSERT INTO agents (name, type, scope) VALUES (?, ?, ?)', [name, 'test', scope ?? null])
  })
  const rows = await queryLive(TEST_DB_PATH, 'SELECT id FROM agents WHERE name = ?', [name]) as Array<{ id: number }>
  return rows[0].id
}

async function insertTask(opts: {
  title: string
  status?: string
  agentId?: number | null
  scope?: string | null
}): Promise<number> {
  const { title, status = 'todo', agentId = null, scope = null } = opts
  await writeDb<void>(TEST_DB_PATH, (db) => {
    db.run(
      'INSERT INTO tasks (title, status, agent_assigned_id, scope) VALUES (?, ?, ?, ?)',
      [title, status, agentId, scope]
    )
  })
  const rows = await queryLive(TEST_DB_PATH, 'SELECT id FROM tasks WHERE title = ?', [title]) as Array<{ id: number }>
  return rows[0].id
}

async function insertComment(opts: {
  taskId: number
  agentId: number
  content: string
}): Promise<void> {
  await writeDb<void>(TEST_DB_PATH, (db) => {
    db.run(
      'INSERT INTO task_comments (task_id, agent_id, content) VALUES (?, ?, ?)',
      [opts.taskId, opts.agentId, opts.content]
    )
  })
}

// ── Tests: tasks:qualityStats ─────────────────────────────────────────────────

describe('tasks:qualityStats — behavioural (T836)', () => {
  it('returns DB_PATH_NOT_ALLOWED for unregistered dbPath', async () => {
    let threw = false
    try {
      await handlers['tasks:qualityStats'](null, '/unknown/path.db', {})
    } catch {
      threw = true
    }
    // assertDbPathAllowed throws an Error — the handler propagates it
    expect(threw).toBe(true)
  })

  it('returns { success: true, rows: [] } when no agent has done/archived tasks', async () => {
    await insertAgent('agent-no-tasks')
    // insert a todo task — should not be counted
    const agentId = await insertAgent('agent-todo-only')
    await insertTask({ title: 'task-todo', status: 'todo', agentId })

    const result = await handlers['tasks:qualityStats'](null, TEST_DB_PATH, {}) as {
      success: boolean
      rows: unknown[]
    }

    expect(result.success).toBe(true)
    expect(result.rows).toHaveLength(0)
  })

  it('returns aggregated rows with total_tasks, rejected_tasks, rejection_rate', async () => {
    const agentId = await insertAgent('agent-quality')
    const t1 = await insertTask({ title: 'task-done-1', status: 'done', agentId })
    const t2 = await insertTask({ title: 'task-done-2', status: 'done', agentId })
    const t3 = await insertTask({ title: 'task-archived', status: 'archived', agentId })

    // Reviewer agent (id=4 in source code) — insert with fixed id
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run('INSERT INTO agents (id, name, type) VALUES (4, "reviewer", "review")')
    })
    // reject t1 via "rejet" keyword
    await insertComment({ taskId: t1, agentId: 4, content: 'rejet: code trop complexe' })

    const result = await handlers['tasks:qualityStats'](null, TEST_DB_PATH, {}) as {
      success: boolean
      rows: Array<{ agent_name: string; total_tasks: number; rejected_tasks: number; rejection_rate: number }>
    }

    expect(result.success).toBe(true)
    const row = result.rows.find(r => r.agent_name === 'agent-quality')
    expect(row).toBeDefined()
    expect(row!.total_tasks).toBe(3)
    expect(row!.rejected_tasks).toBe(1)
    expect(row!.rejection_rate).toBe(33.3)
  })

  it('detects rejection via keyword "rejet"', async () => {
    const agentId = await insertAgent('agent-rejet')
    const taskId = await insertTask({ title: 'task-rejet', status: 'done', agentId })
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run('INSERT OR IGNORE INTO agents (id, name, type) VALUES (4, "reviewer", "review")')
    })
    await insertComment({ taskId, agentId: 4, content: 'rejet: mauvaise implémentation' })

    const result = await handlers['tasks:qualityStats'](null, TEST_DB_PATH, {}) as {
      success: boolean
      rows: Array<{ agent_name: string; rejected_tasks: number }>
    }

    const row = result.rows.find(r => r.agent_name === 'agent-rejet')
    expect(row!.rejected_tasks).toBe(1)
  })

  it('detects rejection via keyword "retour"', async () => {
    const agentId = await insertAgent('agent-retour')
    const taskId = await insertTask({ title: 'task-retour', status: 'done', agentId })
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run('INSERT OR IGNORE INTO agents (id, name, type) VALUES (4, "reviewer", "review")')
    })
    await insertComment({ taskId, agentId: 4, content: 'retour au développeur: corriger les tests' })

    const result = await handlers['tasks:qualityStats'](null, TEST_DB_PATH, {}) as {
      success: boolean
      rows: Array<{ agent_name: string; rejected_tasks: number }>
    }

    const row = result.rows.find(r => r.agent_name === 'agent-retour')
    expect(row!.rejected_tasks).toBe(1)
  })

  it('detects rejection via keyword "todo"', async () => {
    const agentId = await insertAgent('agent-todo-kw')
    const taskId = await insertTask({ title: 'task-todo-kw', status: 'done', agentId })
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run('INSERT OR IGNORE INTO agents (id, name, type) VALUES (4, "reviewer", "review")')
    })
    await insertComment({ taskId, agentId: 4, content: 'retour todo: à retravailler' })

    const result = await handlers['tasks:qualityStats'](null, TEST_DB_PATH, {}) as {
      success: boolean
      rows: Array<{ agent_name: string; rejected_tasks: number }>
    }

    const row = result.rows.find(r => r.agent_name === 'agent-todo-kw')
    expect(row!.rejected_tasks).toBe(1)
  })

  it('does not count rejection when comment comes from another agent (agent_id != 4)', async () => {
    const agentId = await insertAgent('agent-no-reject')
    const taskId = await insertTask({ title: 'task-no-reject', status: 'done', agentId })
    const otherId = await insertAgent('other-agent')
    // Comment with rejection keyword but NOT from reviewer (id=4)
    await insertComment({ taskId, agentId: otherId, content: 'rejet ignoré car mauvais agent' })

    const result = await handlers['tasks:qualityStats'](null, TEST_DB_PATH, {}) as {
      success: boolean
      rows: Array<{ agent_name: string; rejected_tasks: number }>
    }

    const row = result.rows.find(r => r.agent_name === 'agent-no-reject')
    expect(row!.rejected_tasks).toBe(0)
    expect(row!.rejection_rate).toBe(0)
  })

  it('filters by perimetre when param perimetre is provided', async () => {
    const agentFront = await insertAgent('agent-front', 'front-vuejs')
    const agentBack = await insertAgent('agent-back', 'back-electron')
    await insertTask({ title: 'task-front', status: 'done', agentId: agentFront, scope: 'front-vuejs' })
    await insertTask({ title: 'task-back', status: 'done', agentId: agentBack, scope: 'back-electron' })

    const result = await handlers['tasks:qualityStats'](null, TEST_DB_PATH, { perimetre: 'front-vuejs' }) as {
      success: boolean
      rows: Array<{ agent_name: string; total_tasks: number }>
    }

    expect(result.success).toBe(true)
    // only front agent should appear (HAVING total_tasks > 0)
    const frontRow = result.rows.find(r => r.agent_name === 'agent-front')
    const backRow = result.rows.find(r => r.agent_name === 'agent-back')
    expect(frontRow).toBeDefined()
    expect(frontRow!.total_tasks).toBe(1)
    expect(backRow).toBeUndefined()
  })

  it('returns all agents when perimetre param is null (no filter)', async () => {
    const agentA = await insertAgent('agent-all-a', 'front-vuejs')
    const agentB = await insertAgent('agent-all-b', 'back-electron')
    await insertTask({ title: 'task-a', status: 'done', agentId: agentA, scope: 'front-vuejs' })
    await insertTask({ title: 'task-b', status: 'done', agentId: agentB, scope: 'back-electron' })

    const result = await handlers['tasks:qualityStats'](null, TEST_DB_PATH, { perimetre: null }) as {
      success: boolean
      rows: Array<{ agent_name: string }>
    }

    expect(result.success).toBe(true)
    const names = result.rows.map(r => r.agent_name)
    expect(names).toContain('agent-all-a')
    expect(names).toContain('agent-all-b')
  })

  it('returns { success: false, error, rows: [] } when queryLive throws', async () => {
    // Corrupt the DB buffer to trigger a sql.js error
    clearDbCacheEntry(TEST_DB_PATH)
    dbBuffer = Buffer.from('not-a-valid-sqlite-db')

    const result = await handlers['tasks:qualityStats'](null, TEST_DB_PATH, {}) as {
      success: boolean
      error: string
      rows: unknown[]
    }

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.rows).toEqual([])
  })
})
