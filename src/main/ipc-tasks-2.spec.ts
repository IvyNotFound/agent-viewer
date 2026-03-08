/**
 * Behavioural tests for tasks:updateStatus / task:getLinks IPC handlers (T474, T511)
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
      claude_conv_id TEXT
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

const TEST_DB_PATH = '/test/ipc-tasks-2-test.db'

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

// ── Tests: tasks:getArchived (overflow from ipc-tasks.spec.ts) ───────────────

describe('tasks:getArchived — behavioural (T474) continued', () => {
  it('rows are sorted by updated_at DESC', async () => {
    await insertTask({ title: 'task-old', status: 'archived', updatedAt: '2026-01-01 10:00:00' })
    await insertTask({ title: 'task-new', status: 'archived', updatedAt: '2026-01-02 10:00:00' })

    const result = await handlers['tasks:getArchived'](
      null,
      TEST_DB_PATH,
      { page: 0, pageSize: 10 }
    ) as { rows: Array<{ title: string }> }

    expect(result.rows[0].title).toBe('task-new')
    expect(result.rows[1].title).toBe('task-old')
  })

  it('rejects unregistered dbPath with DB_PATH_NOT_ALLOWED', async () => {
    await expect(
      handlers['tasks:getArchived'](null, '/unregistered/evil.db', { page: 0, pageSize: 10 })
    ).rejects.toThrow('DB_PATH_NOT_ALLOWED')
  })
})

// ── Tests: tasks:updateStatus ─────────────────────────────────────────────────

describe('tasks:updateStatus — behavioural (T474)', () => {
  it('updates status to done → { success: true }', async () => {
    const taskId = await insertTask({ title: 'task-to-done', status: 'todo' })

    const result = await handlers['tasks:updateStatus'](
      null,
      TEST_DB_PATH,
      taskId,
      'done'
    ) as { success: boolean }

    expect(result.success).toBe(true)

    const rows = await queryLive(TEST_DB_PATH, 'SELECT status FROM tasks WHERE id = ?', [taskId]) as Array<{ status: string }>
    expect(rows[0].status).toBe('done')
  })

  it('updates status to archived → { success: true }', async () => {
    const taskId = await insertTask({ title: 'task-to-archive', status: 'done' })

    const result = await handlers['tasks:updateStatus'](
      null,
      TEST_DB_PATH,
      taskId,
      'archived'
    ) as { success: boolean }

    expect(result.success).toBe(true)

    const rows = await queryLive(TEST_DB_PATH, 'SELECT status FROM tasks WHERE id = ?', [taskId]) as Array<{ status: string }>
    expect(rows[0].status).toBe('archived')
  })

  it('accepts all allowed statuses: todo, in_progress, done, archived', async () => {
    for (const status of ['todo', 'in_progress', 'done', 'archived'] as const) {
      const taskId = await insertTask({ title: `task-status-${status}`, status: 'todo' })
      const result = await handlers['tasks:updateStatus'](
        null,
        TEST_DB_PATH,
        taskId,
        status
      ) as { success: boolean }
      expect(result.success).toBe(true)
    }
  })

  it('invalid status → { success: false, error }', async () => {
    const taskId = await insertTask({ title: 'task-invalid-status' })

    const result = await handlers['tasks:updateStatus'](
      null,
      TEST_DB_PATH,
      taskId,
      'hacked'
    ) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid status')
  })

  it('rejects unregistered dbPath with DB_PATH_NOT_ALLOWED', async () => {
    await expect(
      handlers['tasks:updateStatus'](null, '/unregistered/evil.db', 1, 'done')
    ).rejects.toThrow('DB_PATH_NOT_ALLOWED')
  })

  it('non-existent taskId → { success: true } (UPDATE 0 rows is not an error)', async () => {
    // SQLite UPDATE with no matching rows is a no-op, not an error
    const result = await handlers['tasks:updateStatus'](
      null,
      TEST_DB_PATH,
      99999,
      'done'
    ) as { success: boolean }

    expect(result.success).toBe(true)
  })
})

