/**
 * Behavioural tests for tasks:getArchived IPC handler (T474)
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

// ── Mock electron ────────────────────────────────────────────────────────────
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
}))

// ── Mock claude-md ────────────────────────────────────────────────────────────
vi.mock('./claude-md', () => ({
  insertAgentIntoClaudeMd: vi.fn((content: string) => content),
}))

vi.mock('./db-lock', () => ({
  acquireWriteLock: vi.fn().mockResolvedValue('/mock.wlock'),
  releaseWriteLock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('better-sqlite3', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    default: function MockDatabase() { return new (mod as any).default(':memory:') },
  }
})

// ── Import after mocks ────────────────────────────────────────────────────────
import { registerDbPath, clearDbCacheEntry, queryLive, writeDb } from './db'
import { registerIpcHandlers } from './ipc'

// ── Schema builder ────────────────────────────────────────────────────────────
async function buildSchema(): Promise<void> {
  await writeDb(TEST_DB_PATH, (db) => {
    db.run(`CREATE TABLE IF NOT EXISTS agents (
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

    db.run(`CREATE TABLE IF NOT EXISTS tasks (
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

    db.run(`CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER,
      started_at TEXT,
      ended_at TEXT,
      updated_at TEXT,
      status TEXT,
      summary TEXT,
      conv_id TEXT
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS task_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      agent_id INTEGER,
      content TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS task_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_task INTEGER,
      to_task INTEGER,
      type TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS locks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file TEXT,
      agent_id INTEGER,
      session_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      released_at TEXT
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS agent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      agent_id INTEGER,
      level TEXT,
      action TEXT,
      detail TEXT,
      files TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS scopes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      folder TEXT,
      techno TEXT,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS task_agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      agent_id INTEGER NOT NULL REFERENCES agents(id),
      role TEXT CHECK(role IN ('primary', 'support', 'reviewer')),
      assigned_at TEXT DEFAULT (datetime('now')),
      UNIQUE(task_id, agent_id)
    )`)
  })
}

const TEST_DB_PATH = '/test/ipc-tasks-test.db'

// ── Test setup ────────────────────────────────────────────────────────────────
beforeEach(async () => {
  vi.clearAllMocks()
  clearDbCacheEntry(TEST_DB_PATH)
  dbMtime = 1000

  registerDbPath(TEST_DB_PATH)
  await buildSchema()
  registerIpcHandlers()
})

afterEach(() => {
  clearDbCacheEntry(TEST_DB_PATH)
})

// ── Helpers ───────────────────────────────────────────────────────────────────
async function insertAgent(name: string): Promise<number> {
  await writeDb<void>(TEST_DB_PATH, (db) => {
    db.run('INSERT INTO agents (name, type) VALUES (?, ?)', [name, 'test'])
  })
  const rows = await queryLive(TEST_DB_PATH, 'SELECT id FROM agents WHERE name = ?', [name]) as Array<{ id: number }>
  return rows[0].id
}

async function insertTask(opts: {
  title: string
  status?: string
  agentId?: number
  scope?: string
  updatedAt?: string
}): Promise<number> {
  const { title, status = 'todo', agentId = null, scope = null, updatedAt = null } = opts
  await writeDb<void>(TEST_DB_PATH, (db) => {
    if (updatedAt) {
      db.run(
        'INSERT INTO tasks (title, status, agent_assigned_id, scope, updated_at) VALUES (?, ?, ?, ?, ?)',
        [title, status, agentId, scope, updatedAt]
      )
    } else {
      db.run(
        'INSERT INTO tasks (title, status, agent_assigned_id, scope) VALUES (?, ?, ?, ?)',
        [title, status, agentId, scope]
      )
    }
  })
  const rows = await queryLive(TEST_DB_PATH, 'SELECT id FROM tasks WHERE title = ?', [title]) as Array<{ id: number }>
  return rows[0].id
}

// ── Tests: tasks:getArchived ──────────────────────────────────────────────────

describe('tasks:getArchived — behavioural (T474)', () => {
  it('returns { rows: [], total: 0 } for empty DB', async () => {
    const result = await handlers['tasks:getArchived'](
      null,
      TEST_DB_PATH,
      { page: 0, pageSize: 10 }
    ) as { rows: unknown[]; total: number }

    expect(result.rows).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('returns only archived tasks', async () => {
    await insertTask({ title: 'task-todo', status: 'todo' })
    await insertTask({ title: 'task-done', status: 'done' })
    await insertTask({ title: 'task-archived', status: 'archived' })

    const result = await handlers['tasks:getArchived'](
      null,
      TEST_DB_PATH,
      { page: 0, pageSize: 10 }
    ) as { rows: Array<{ title: string }>; total: number }

    expect(result.total).toBe(1)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].title).toBe('task-archived')
  })

  it('filters by agentId', async () => {
    const agentA = await insertAgent('agent-filter-a')
    const agentB = await insertAgent('agent-filter-b')
    await insertTask({ title: 'task-agent-a', status: 'archived', agentId: agentA })
    await insertTask({ title: 'task-agent-b', status: 'archived', agentId: agentB })

    const result = await handlers['tasks:getArchived'](
      null,
      TEST_DB_PATH,
      { page: 0, pageSize: 10, agentId: agentA }
    ) as { rows: Array<{ title: string }>; total: number }

    expect(result.total).toBe(1)
    expect(result.rows[0].title).toBe('task-agent-a')
  })

  it('filters by scope', async () => {
    await insertTask({ title: 'task-front', status: 'archived', scope: 'front-vuejs' })
    await insertTask({ title: 'task-back', status: 'archived', scope: 'back-electron' })

    const result = await handlers['tasks:getArchived'](
      null,
      TEST_DB_PATH,
      { page: 0, pageSize: 10, perimetre: 'front-vuejs' }
    ) as { rows: Array<{ title: string }>; total: number }

    expect(result.total).toBe(1)
    expect(result.rows[0].title).toBe('task-front')
  })

  it('filters by agentId + scope combined', async () => {
    const agent = await insertAgent('agent-combo')
    await insertTask({ title: 'task-combo-match', status: 'archived', agentId: agent, scope: 'back-electron' })
    await insertTask({ title: 'task-combo-wrong-agent', status: 'archived', agentId: null, scope: 'back-electron' })
    await insertTask({ title: 'task-combo-wrong-perim', status: 'archived', agentId: agent, scope: 'front-vuejs' })

    const result = await handlers['tasks:getArchived'](
      null,
      TEST_DB_PATH,
      { page: 0, pageSize: 10, agentId: agent, perimetre: 'back-electron' }
    ) as { rows: Array<{ title: string }>; total: number }

    expect(result.total).toBe(1)
    expect(result.rows[0].title).toBe('task-combo-match')
  })

  it('paginates: page=0 returns first pageSize rows', async () => {
    for (let i = 1; i <= 5; i++) {
      await insertTask({ title: `task-page-${i}`, status: 'archived' })
    }

    const result = await handlers['tasks:getArchived'](
      null,
      TEST_DB_PATH,
      { page: 0, pageSize: 3 }
    ) as { rows: unknown[]; total: number }

    expect(result.total).toBe(5)
    expect(result.rows).toHaveLength(3)
  })

  it('paginates: page=1 returns second batch', async () => {
    for (let i = 1; i <= 5; i++) {
      await insertTask({ title: `task-batch-${i}`, status: 'archived' })
    }

    const result = await handlers['tasks:getArchived'](
      null,
      TEST_DB_PATH,
      { page: 1, pageSize: 3 }
    ) as { rows: unknown[]; total: number }

    expect(result.total).toBe(5)
    expect(result.rows).toHaveLength(2)
  })
})
