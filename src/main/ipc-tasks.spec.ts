/**
 * Behavioural tests for tasks:getArchived / tasks:updateStatus IPC handlers (T474)
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
    claude_conv_id TEXT
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

const TEST_DB_PATH = '/test/ipc-tasks-test.db'

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
async function insertAgent(name: string): Promise<number> {
  await writeDb<void>(TEST_DB_PATH, (db) => {
    db.run('INSERT INTO agents (name, type) VALUES (?, ?)', [name, 'test'])
  })
  const rows = await queryLive(TEST_DB_PATH, 'SELECT id FROM agents WHERE name = ?', [name]) as Array<{ id: number }>
  return rows[0].id
}

async function insertTask(opts: {
  title: string
  statut?: string
  agentId?: number
  perimetre?: string
  updatedAt?: string
}): Promise<number> {
  const { title, statut = 'todo', agentId = null, perimetre = null, updatedAt = null } = opts
  await writeDb<void>(TEST_DB_PATH, (db) => {
    if (updatedAt) {
      db.run(
        'INSERT INTO tasks (title, status, agent_assigned_id, scope, updated_at) VALUES (?, ?, ?, ?, ?)',
        [title, statut, agentId, perimetre, updatedAt]
      )
    } else {
      db.run(
        'INSERT INTO tasks (title, status, agent_assigned_id, scope) VALUES (?, ?, ?, ?)',
        [title, statut, agentId, perimetre]
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
    await insertTask({ title: 'task-todo', statut: 'todo' })
    await insertTask({ title: 'task-done', statut: 'done' })
    await insertTask({ title: 'task-archived', statut: 'archived' })

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
    await insertTask({ title: 'task-agent-a', statut: 'archived', agentId: agentA })
    await insertTask({ title: 'task-agent-b', statut: 'archived', agentId: agentB })

    const result = await handlers['tasks:getArchived'](
      null,
      TEST_DB_PATH,
      { page: 0, pageSize: 10, agentId: agentA }
    ) as { rows: Array<{ title: string }>; total: number }

    expect(result.total).toBe(1)
    expect(result.rows[0].title).toBe('task-agent-a')
  })

  it('filters by perimetre', async () => {
    await insertTask({ title: 'task-front', statut: 'archived', perimetre: 'front-vuejs' })
    await insertTask({ title: 'task-back', statut: 'archived', perimetre: 'back-electron' })

    const result = await handlers['tasks:getArchived'](
      null,
      TEST_DB_PATH,
      { page: 0, pageSize: 10, perimetre: 'front-vuejs' }
    ) as { rows: Array<{ title: string }>; total: number }

    expect(result.total).toBe(1)
    expect(result.rows[0].title).toBe('task-front')
  })

  it('filters by agentId + perimetre combined', async () => {
    const agent = await insertAgent('agent-combo')
    await insertTask({ title: 'task-combo-match', statut: 'archived', agentId: agent, perimetre: 'back-electron' })
    await insertTask({ title: 'task-combo-wrong-agent', statut: 'archived', agentId: null, perimetre: 'back-electron' })
    await insertTask({ title: 'task-combo-wrong-perim', statut: 'archived', agentId: agent, perimetre: 'front-vuejs' })

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
      await insertTask({ title: `task-page-${i}`, statut: 'archived' })
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
      await insertTask({ title: `task-batch-${i}`, statut: 'archived' })
    }

    const result = await handlers['tasks:getArchived'](
      null,
      TEST_DB_PATH,
      { page: 1, pageSize: 3 }
    ) as { rows: unknown[]; total: number }

    expect(result.total).toBe(5)
    expect(result.rows).toHaveLength(2)
  })

  it('rows are sorted by updated_at DESC', async () => {
    await insertTask({ title: 'task-old', statut: 'archived', updatedAt: '2026-01-01 10:00:00' })
    await insertTask({ title: 'task-new', statut: 'archived', updatedAt: '2026-01-02 10:00:00' })

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
  it('updates statut to done → { success: true }', async () => {
    const taskId = await insertTask({ title: 'task-to-done', statut: 'todo' })

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

  it('updates statut to archived → { success: true }', async () => {
    const taskId = await insertTask({ title: 'task-to-archive', statut: 'done' })

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

  it('accepts all allowed statuts: todo, in_progress, done, archived', async () => {
    for (const statut of ['todo', 'in_progress', 'done', 'archived'] as const) {
      const taskId = await insertTask({ title: `task-statut-${statut}`, statut: 'todo' })
      const result = await handlers['tasks:updateStatus'](
        null,
        TEST_DB_PATH,
        taskId,
        statut
      ) as { success: boolean }
      expect(result.success).toBe(true)
    }
  })

  it('invalid statut → { success: false, error }', async () => {
    const taskId = await insertTask({ title: 'task-invalid-statut' })

    const result = await handlers['tasks:updateStatus'](
      null,
      TEST_DB_PATH,
      taskId,
      'hacked'
    ) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid statut')
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

// ── Tests: task:getLinks ──────────────────────────────────────────────────────

describe('task:getLinks (T511)', () => {
  async function insertLink(fromTask: number, toTask: number, type: string): Promise<void> {
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run('INSERT INTO task_links (from_task, to_task, type) VALUES (?, ?, ?)', [fromTask, toTask, type])
    })
  }

  it('returns { success: true, links: [] } for task with no links', async () => {
    const taskId = await insertTask({ title: 'task-no-links' })

    const result = await handlers['task:getLinks'](null, TEST_DB_PATH, taskId) as { success: boolean; links: unknown[] }

    expect(result.success).toBe(true)
    expect(result.links).toHaveLength(0)
  })

  it('returns links where task is from_task', async () => {
    const t1 = await insertTask({ title: 'source', statut: 'in_progress' })
    const t2 = await insertTask({ title: 'target', statut: 'todo' })
    await insertLink(t1, t2, 'blocks')

    const result = await handlers['task:getLinks'](null, TEST_DB_PATH, t1) as {
      success: boolean
      links: Array<{ type: string; from_task: number; to_task: number; from_title: string; to_title: string; from_status: string; to_status: string }>
    }

    expect(result.success).toBe(true)
    expect(result.links).toHaveLength(1)
    expect(result.links[0].type).toBe('blocks')
    expect(result.links[0].from_task).toBe(t1)
    expect(result.links[0].to_task).toBe(t2)
    expect(result.links[0].from_title).toBe('source')
    expect(result.links[0].to_title).toBe('target')
    expect(result.links[0].to_status).toBe('todo')
  })

  it('returns links where task is to_task', async () => {
    const t1 = await insertTask({ title: 'blocker', statut: 'done' })
    const t2 = await insertTask({ title: 'blocked', statut: 'todo' })
    await insertLink(t1, t2, 'depends_on')

    const result = await handlers['task:getLinks'](null, TEST_DB_PATH, t2) as {
      success: boolean
      links: Array<{ type: string; from_task: number; to_task: number }>
    }

    expect(result.success).toBe(true)
    expect(result.links).toHaveLength(1)
    expect(result.links[0].from_task).toBe(t1)
    expect(result.links[0].to_task).toBe(t2)
  })

  it('returns all link types including lie_a and duplique', async () => {
    const t1 = await insertTask({ title: 'task-a' })
    const t2 = await insertTask({ title: 'task-b' })
    const t3 = await insertTask({ title: 'task-c' })
    await insertLink(t1, t2, 'related_to')
    await insertLink(t1, t3, 'duplicates')

    const result = await handlers['task:getLinks'](null, TEST_DB_PATH, t1) as {
      success: boolean
      links: Array<{ type: string }>
    }

    expect(result.success).toBe(true)
    expect(result.links).toHaveLength(2)
    const types = result.links.map(l => l.type).sort()
    expect(types).toEqual(['duplicates', 'related_to'])
  })

  it('invalid taskId returns { success: false }', async () => {
    const result = await handlers['task:getLinks'](null, TEST_DB_PATH, 'bad' as unknown as number) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid taskId')
  })

  it('rejects unregistered dbPath', async () => {
    await expect(
      handlers['task:getLinks'](null, '/unregistered/evil.db', 1)
    ).rejects.toThrow('DB_PATH_NOT_ALLOWED')
  })
})
