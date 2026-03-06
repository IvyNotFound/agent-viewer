/**
 * Integration tests for IPC handlers — T985
 *
 * Covers handlers not tested elsewhere:
 * - session:updateResult, sessions:statsCost
 * - close-agent-sessions, update-perimetre
 * - build-agent-prompt, search-tasks
 * - create-agent, rename-agent
 * - update-agent-system-prompt, update-agent-thinking-mode
 * - session:setConvId
 *
 * Strategy: real sql.js Database in memory via mocked fs/promises.
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
  const createReadStream = vi.fn(() => ({
    on: vi.fn(),
    destroy: vi.fn(),
  }))
  return {
    default: { watch, existsSync, readdirSync, createReadStream },
    watch,
    existsSync,
    readdirSync,
    createReadStream,
  }
})

// ── Mock readline ─────────────────────────────────────────────────────────────
vi.mock('readline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('readline')>()
  const { EventEmitter } = await import('events')
  const createInterface = vi.fn(({ input }: { input: NodeJS.ReadableStream }) => {
    input.on('error', () => {})
    if ('destroy' in input && typeof input.destroy === 'function') input.destroy()
    const rl = new EventEmitter() as NodeJS.EventEmitter & { close: () => void }
    rl.close = () => {}
    setImmediate(() => { rl.emit('error', new Error('ENOENT: no such file')) })
    return rl
  })
  return { ...actual, createInterface, default: { ...actual, createInterface } }
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
  app: { getVersion: vi.fn(() => '0.5.0'), isPackaged: false, getAppPath: vi.fn(() => '/app') },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null), getAllWindows: vi.fn(() => []) },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined), showItemInFolder: vi.fn() },
}))

// ── Mock claude-md ─────────────────────────────────────────────────────────────
vi.mock('./claude-md', () => ({
  insertAgentIntoClaudeMd: vi.fn((content: string) => content),
}))

// ── Mock child_process ────────────────────────────────────────────────────────
vi.mock('child_process', () => ({
  default: { execSync: vi.fn(), execFile: vi.fn(), spawn: vi.fn(() => ({ unref: vi.fn() })) },
  execSync: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}))

// ── Import after mocks ────────────────────────────────────────────────────────
import { getSqlJs, registerDbPath, registerProjectPath, clearDbCacheEntry, queryLive, writeDb } from './db'
import { registerIpcHandlers } from './ipc'

// ── Schema builder ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildSchema(): Promise<any> {
  const sqlJs = await getSqlJs()
  const db = new sqlJs.Database()

  db.run(`CREATE TABLE agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT,
    perimetre TEXT,
    system_prompt TEXT,
    system_prompt_suffix TEXT,
    thinking_mode TEXT,
    allowed_tools TEXT,
    auto_launch INTEGER NOT NULL DEFAULT 1,
    permission_mode TEXT DEFAULT 'default',
    max_sessions INTEGER NOT NULL DEFAULT 3,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT,
    description TEXT,
    statut TEXT DEFAULT 'todo',
    agent_createur_id INTEGER,
    agent_assigne_id INTEGER,
    agent_valideur_id INTEGER,
    parent_task_id INTEGER,
    session_id INTEGER,
    perimetre TEXT,
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
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    statut TEXT DEFAULT 'started',
    summary TEXT,
    claude_conv_id TEXT,
    cost_usd REAL,
    duration_ms INTEGER,
    num_turns INTEGER,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    tokens_cache_read INTEGER DEFAULT 0,
    tokens_cache_write INTEGER DEFAULT 0
  )`)

  db.run(`CREATE TABLE task_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    agent_id INTEGER,
    contenu TEXT,
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
    fichier TEXT,
    agent_id INTEGER,
    session_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    released_at TEXT
  )`)

  db.run(`CREATE TABLE agent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    agent_id INTEGER,
    niveau TEXT,
    action TEXT,
    detail TEXT,
    fichiers TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
  )`)

  db.run(`CREATE TABLE perimetres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    dossier TEXT,
    techno TEXT,
    description TEXT,
    actif INTEGER NOT NULL DEFAULT 1,
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

  db.run(`CREATE TABLE agent_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    parent_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE agent_group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES agent_groups(id),
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(agent_id)
  )`)

  return db
}

const TEST_DB_PATH = '/test/ipc-integration-test.db'
const TEST_PROJECT_PATH = '/test/project'

// ── Helpers ───────────────────────────────────────────────────────────────────
async function insertAgent(name: string, extra?: { type?: string; perimetre?: string }): Promise<number> {
  await writeDb<void>(TEST_DB_PATH, (db) => {
    db.run('INSERT INTO agents (name, type, perimetre) VALUES (?, ?, ?)', [name, extra?.type ?? 'test', extra?.perimetre ?? null])
  })
  const rows = await queryLive(TEST_DB_PATH, 'SELECT id FROM agents WHERE name = ?', [name]) as Array<{ id: number }>
  return rows[0].id
}

async function insertSession(agentId: number, opts?: {
  statut?: string
  convId?: string
  costUsd?: number
  startedAt?: string
}): Promise<number> {
  await writeDb<void>(TEST_DB_PATH, (db) => {
    db.run(
      'INSERT INTO sessions (agent_id, statut, claude_conv_id, cost_usd, started_at) VALUES (?, ?, ?, ?, ?)',
      [agentId, opts?.statut ?? 'started', opts?.convId ?? null, opts?.costUsd ?? null, opts?.startedAt ?? "datetime('now')"]
    )
  })
  const rows = await queryLive(TEST_DB_PATH, 'SELECT id FROM sessions WHERE agent_id = ? ORDER BY id DESC LIMIT 1', [agentId]) as Array<{ id: number }>
  return rows[0].id
}

async function insertTask(titre: string, opts?: {
  statut?: string
  agentId?: number | null
  perimetre?: string | null
  description?: string
}): Promise<number> {
  await writeDb<void>(TEST_DB_PATH, (db) => {
    db.run(
      'INSERT INTO tasks (titre, statut, agent_assigne_id, perimetre, description) VALUES (?, ?, ?, ?, ?)',
      [titre, opts?.statut ?? 'todo', opts?.agentId ?? null, opts?.perimetre ?? null, opts?.description ?? null]
    )
  })
  const rows = await queryLive(TEST_DB_PATH, 'SELECT id FROM tasks WHERE titre = ? ORDER BY id DESC LIMIT 1', [titre]) as Array<{ id: number }>
  return rows[0].id
}

// ── Test setup ────────────────────────────────────────────────────────────────
beforeEach(async () => {
  vi.clearAllMocks()
  clearDbCacheEntry(TEST_DB_PATH)
  dbMtime = 1000

  const db = await buildSchema()
  dbBuffer = Buffer.from(db.export())
  db.close()

  registerDbPath(TEST_DB_PATH)
  registerProjectPath(TEST_PROJECT_PATH)
  registerIpcHandlers()
})

afterEach(() => {
  clearDbCacheEntry(TEST_DB_PATH)
})

// ── Tests: session:updateResult ───────────────────────────────────────────────

describe('session:updateResult (T985)', () => {
  it('updates cost_usd, duration_ms, num_turns for a valid session', async () => {
    const agentId = await insertAgent('agent-cost')
    const sessionId = await insertSession(agentId)

    const result = await handlers['session:updateResult'](
      null, TEST_DB_PATH, sessionId,
      { cost_usd: 0.0042, duration_ms: 12345, num_turns: 7 }
    ) as { success: boolean }

    expect(result.success).toBe(true)

    const rows = await queryLive(
      TEST_DB_PATH,
      'SELECT cost_usd, duration_ms, num_turns FROM sessions WHERE id = ?',
      [sessionId]
    ) as Array<{ cost_usd: number; duration_ms: number; num_turns: number }>
    expect(rows[0].cost_usd).toBeCloseTo(0.0042)
    expect(rows[0].duration_ms).toBe(12345)
    expect(rows[0].num_turns).toBe(7)
  })

  it('returns { success: false, error: INVALID_SESSION_ID } for non-integer sessionId', async () => {
    const result = await handlers['session:updateResult'](
      null, TEST_DB_PATH, 1.5,
      { cost_usd: 1.0 }
    ) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_SESSION_ID')
  })

  it('returns { success: false, error: INVALID_SESSION_ID } for sessionId <= 0', async () => {
    const result = await handlers['session:updateResult'](
      null, TEST_DB_PATH, 0,
      { cost_usd: 1.0 }
    ) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_SESSION_ID')
  })

  it('accepts null fields and stores NULL in DB', async () => {
    const agentId = await insertAgent('agent-null-cost')
    const sessionId = await insertSession(agentId)

    const result = await handlers['session:updateResult'](
      null, TEST_DB_PATH, sessionId,
      { cost_usd: null, duration_ms: null, num_turns: null }
    ) as { success: boolean }

    expect(result.success).toBe(true)
    const rows = await queryLive(
      TEST_DB_PATH,
      'SELECT cost_usd, duration_ms, num_turns FROM sessions WHERE id = ?',
      [sessionId]
    ) as Array<{ cost_usd: null; duration_ms: null; num_turns: null }>
    expect(rows[0].cost_usd).toBeNull()
    expect(rows[0].duration_ms).toBeNull()
    expect(rows[0].num_turns).toBeNull()
  })

  it('rejects unregistered dbPath', async () => {
    await expect(
      handlers['session:updateResult'](null, '/evil/db.db', 1, { cost_usd: 1.0 })
    ).rejects.toThrow('DB_PATH_NOT_ALLOWED')
  })
})

// ── Tests: sessions:statsCost ─────────────────────────────────────────────────

describe('sessions:statsCost (T985)', () => {
  it('returns { success: false, error: INVALID_PERIOD } for unknown period', async () => {
    const result = await handlers['sessions:statsCost'](
      null, TEST_DB_PATH, { period: 'year' }
    ) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_PERIOD')
  })

  it('returns { success: true, rows: [] } when no sessions have cost_usd', async () => {
    const agentId = await insertAgent('agent-stats')
    await insertSession(agentId, { statut: 'completed' })

    const result = await handlers['sessions:statsCost'](
      null, TEST_DB_PATH, { period: 'day' }
    ) as { success: boolean; rows: unknown[] }

    expect(result.success).toBe(true)
    expect(result.rows).toHaveLength(0)
  })

  it('aggregates cost per agent per day', async () => {
    const agentId = await insertAgent('agent-agg')
    await insertSession(agentId, { statut: 'completed', costUsd: 0.01, startedAt: '2026-03-01 10:00:00' })
    await insertSession(agentId, { statut: 'completed', costUsd: 0.02, startedAt: '2026-03-01 11:00:00' })

    const result = await handlers['sessions:statsCost'](
      null, TEST_DB_PATH, { period: 'day', limit: 10 }
    ) as { success: boolean; rows: Array<{ agent_name: string; total_cost: number; session_count: number }> }

    expect(result.success).toBe(true)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].agent_name).toBe('agent-agg')
    expect(result.rows[0].session_count).toBe(2)
    expect(result.rows[0].total_cost).toBeCloseTo(0.03, 4)
  })

  it('filters by agentId when provided', async () => {
    const agentA = await insertAgent('agent-stats-a')
    const agentB = await insertAgent('agent-stats-b')
    await insertSession(agentA, { statut: 'completed', costUsd: 0.05, startedAt: '2026-03-01 10:00:00' })
    await insertSession(agentB, { statut: 'completed', costUsd: 0.10, startedAt: '2026-03-01 10:00:00' })

    const result = await handlers['sessions:statsCost'](
      null, TEST_DB_PATH, { period: 'day', agentId: agentA, limit: 10 }
    ) as { success: boolean; rows: Array<{ agent_name: string }> }

    expect(result.success).toBe(true)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].agent_name).toBe('agent-stats-a')
  })

  it('rejects unregistered dbPath', async () => {
    await expect(
      handlers['sessions:statsCost'](null, '/evil/db.db', { period: 'day' })
    ).rejects.toThrow('DB_PATH_NOT_ALLOWED')
  })
})

// ── Tests: close-agent-sessions ───────────────────────────────────────────────

describe('close-agent-sessions (T985)', () => {
  it('marks all started sessions as completed for an agent', async () => {
    const agentId = await insertAgent('agent-close-sessions')
    await insertSession(agentId, { statut: 'started' })
    await insertSession(agentId, { statut: 'started' })

    const result = await handlers['close-agent-sessions'](
      null, TEST_DB_PATH, 'agent-close-sessions'
    ) as { success: boolean }

    expect(result.success).toBe(true)

    const rows = await queryLive(
      TEST_DB_PATH,
      "SELECT statut FROM sessions WHERE agent_id = ?",
      [agentId]
    ) as Array<{ statut: string }>
    expect(rows.every(r => r.statut === 'completed')).toBe(true)
  })

  it('does not affect other agents sessions', async () => {
    const agentA = await insertAgent('agent-close-a')
    const agentB = await insertAgent('agent-close-b')
    await insertSession(agentA, { statut: 'started' })
    await insertSession(agentB, { statut: 'started' })

    await handlers['close-agent-sessions'](null, TEST_DB_PATH, 'agent-close-a')

    const rowsB = await queryLive(
      TEST_DB_PATH,
      'SELECT statut FROM sessions WHERE agent_id = ?',
      [agentB]
    ) as Array<{ statut: string }>
    expect(rowsB[0].statut).toBe('started')
  })

  it('returns { success: true } when agent has no started sessions', async () => {
    await insertAgent('agent-no-sessions')

    const result = await handlers['close-agent-sessions'](
      null, TEST_DB_PATH, 'agent-no-sessions'
    ) as { success: boolean }

    expect(result.success).toBe(true)
  })

  it('returns { success: false } for unregistered dbPath', async () => {
    const result = await handlers['close-agent-sessions'](
      null, '/evil/db.db', 'agent-name'
    ) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('DB_PATH_NOT_ALLOWED')
  })
})

// ── Tests: update-perimetre ───────────────────────────────────────────────────

describe('update-perimetre (T985)', () => {
  it('updates perimeter name and description', async () => {
    let perimetreId!: number
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run("INSERT INTO perimetres (name, description) VALUES ('front-old', 'Old desc')")
      const rows = db.exec("SELECT last_insert_rowid() as id")
      perimetreId = rows[0].values[0][0] as number
    })

    const result = await handlers['update-perimetre'](
      null, TEST_DB_PATH, perimetreId, 'front-old', 'front-new', 'New desc'
    ) as { success: boolean }

    expect(result.success).toBe(true)

    const rows = await queryLive(
      TEST_DB_PATH,
      'SELECT name, description FROM perimetres WHERE id = ?',
      [perimetreId]
    ) as Array<{ name: string; description: string }>
    expect(rows[0].name).toBe('front-new')
    expect(rows[0].description).toBe('New desc')
  })

  it('cascades rename to tasks.perimetre', async () => {
    let perimetreId!: number
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run("INSERT INTO perimetres (name) VALUES ('cascade-peri')")
      const rows = db.exec("SELECT last_insert_rowid() as id")
      perimetreId = rows[0].values[0][0] as number
    })
    await insertTask('task-in-peri', { perimetre: 'cascade-peri' })

    await handlers['update-perimetre'](
      null, TEST_DB_PATH, perimetreId, 'cascade-peri', 'cascade-peri-new', ''
    )

    const taskRows = await queryLive(
      TEST_DB_PATH,
      "SELECT perimetre FROM tasks WHERE titre = 'task-in-peri'",
      []
    ) as Array<{ perimetre: string }>
    expect(taskRows[0].perimetre).toBe('cascade-peri-new')
  })

  it('cascades rename to agents.perimetre', async () => {
    let perimetreId!: number
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run("INSERT INTO perimetres (name) VALUES ('agent-peri')")
      const rows = db.exec("SELECT last_insert_rowid() as id")
      perimetreId = rows[0].values[0][0] as number
    })
    await insertAgent('agent-in-peri', { perimetre: 'agent-peri' })

    await handlers['update-perimetre'](
      null, TEST_DB_PATH, perimetreId, 'agent-peri', 'agent-peri-new', ''
    )

    const agentRows = await queryLive(
      TEST_DB_PATH,
      "SELECT perimetre FROM agents WHERE name = 'agent-in-peri'",
      []
    ) as Array<{ perimetre: string }>
    expect(agentRows[0].perimetre).toBe('agent-peri-new')
  })

  it('does not cascade when name unchanged', async () => {
    let perimetreId!: number
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run("INSERT INTO perimetres (name) VALUES ('no-change')")
      const rows = db.exec("SELECT last_insert_rowid() as id")
      perimetreId = rows[0].values[0][0] as number
    })
    await insertTask('task-no-cascade', { perimetre: 'no-change' })

    await handlers['update-perimetre'](
      null, TEST_DB_PATH, perimetreId, 'no-change', 'no-change', 'Updated desc'
    )

    const taskRows = await queryLive(
      TEST_DB_PATH,
      "SELECT perimetre FROM tasks WHERE titre = 'task-no-cascade'",
      []
    ) as Array<{ perimetre: string }>
    expect(taskRows[0].perimetre).toBe('no-change')
  })

  it('returns { success: false } for unregistered dbPath', async () => {
    const result = await handlers['update-perimetre'](
      null, '/evil/db.db', 1, 'old', 'new', 'desc'
    ) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('DB_PATH_NOT_ALLOWED')
  })
})

// ── Tests: search-tasks ───────────────────────────────────────────────────────

describe('search-tasks (T985)', () => {
  it('returns all tasks when query is empty', async () => {
    await insertTask('task-search-1')
    await insertTask('task-search-2')

    const result = await handlers['search-tasks'](null, TEST_DB_PATH, '') as { success: boolean; results: unknown[] }

    expect(result.success).toBe(true)
    expect(result.results).toHaveLength(2)
  })

  it('matches tasks by titre (LIKE fallback)', async () => {
    await insertTask('alpha task')
    await insertTask('beta task')

    // search-tasks uses FTS4 first, falls back to LIKE — no FTS in test schema
    const result = await handlers['search-tasks'](null, TEST_DB_PATH, 'alpha') as { success: boolean; results: Array<{ titre: string }> }

    expect(result.success).toBe(true)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].titre).toBe('alpha task')
  })

  it('matches tasks by description (LIKE fallback)', async () => {
    await insertTask('task-desc-search', { description: 'unique-keyword-xyz' })
    await insertTask('other-task', { description: 'nothing special' })

    const result = await handlers['search-tasks'](
      null, TEST_DB_PATH, 'unique-keyword-xyz'
    ) as { success: boolean; results: Array<{ titre: string }> }

    expect(result.success).toBe(true)
    expect(result.results.map(r => r.titre)).toContain('task-desc-search')
  })

  it('filters by statut when provided', async () => {
    await insertTask('task-todo', { statut: 'todo' })
    await insertTask('task-done', { statut: 'done' })

    const result = await handlers['search-tasks'](
      null, TEST_DB_PATH, '', { statut: 'todo' }
    ) as { success: boolean; results: Array<{ statut: string }> }

    expect(result.success).toBe(true)
    expect(result.results.every(r => r.statut === 'todo')).toBe(true)
  })

  it('filters by perimetre when provided', async () => {
    await insertTask('task-front', { perimetre: 'front-vuejs' })
    await insertTask('task-back', { perimetre: 'back-electron' })

    const result = await handlers['search-tasks'](
      null, TEST_DB_PATH, '', { perimetre: 'front-vuejs' }
    ) as { success: boolean; results: Array<{ perimetre: string }> }

    expect(result.success).toBe(true)
    expect(result.results.every(r => r.perimetre === 'front-vuejs')).toBe(true)
  })

  it('returns { success: false, results: [] } for unregistered dbPath', async () => {
    const result = await handlers['search-tasks'](
      null, '/evil/db.db', 'query'
    ) as { success: boolean; results: unknown[] }

    expect(result.success).toBe(false)
    expect(result.results).toEqual([])
  })
})

// ── Tests: create-agent ───────────────────────────────────────────────────────

describe('create-agent (T985)', () => {
  it('creates an agent and returns { success: true, agentId }', async () => {
    const result = await handlers['create-agent'](
      null,
      TEST_DB_PATH,
      TEST_PROJECT_PATH,
      { name: 'new-agent', type: 'dev', perimetre: 'front-vuejs', thinkingMode: null, systemPrompt: null, description: 'Test agent' }
    ) as { success: boolean; agentId: number; claudeMdUpdated: boolean }

    expect(result.success).toBe(true)
    expect(typeof result.agentId).toBe('number')

    const rows = await queryLive(TEST_DB_PATH, 'SELECT name, type FROM agents WHERE id = ?', [result.agentId]) as Array<{ name: string; type: string }>
    expect(rows[0].name).toBe('new-agent')
    expect(rows[0].type).toBe('dev')
  })

  it('returns { success: false, error } for duplicate agent name', async () => {
    await insertAgent('duplicate-agent')

    const result = await handlers['create-agent'](
      null,
      TEST_DB_PATH,
      TEST_PROJECT_PATH,
      { name: 'duplicate-agent', type: 'test', perimetre: null, thinkingMode: null, systemPrompt: null, description: '' }
    ) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('duplicate-agent')
  })

  it('returns { success: false, error: DB_PATH_NOT_ALLOWED } for unregistered dbPath', async () => {
    const result = await handlers['create-agent'](
      null,
      '/evil/db.db',
      TEST_PROJECT_PATH,
      { name: 'evil-agent', type: 'test', perimetre: null, thinkingMode: null, systemPrompt: null, description: '' }
    ) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('DB_PATH_NOT_ALLOWED')
  })
})

// ── Tests: rename-agent ───────────────────────────────────────────────────────

describe('rename-agent (T985)', () => {
  it('renames an agent in the DB', async () => {
    const agentId = await insertAgent('agent-rename-me')

    const result = await handlers['rename-agent'](
      null, TEST_DB_PATH, agentId, 'agent-renamed'
    ) as { success: boolean }

    expect(result.success).toBe(true)

    const rows = await queryLive(TEST_DB_PATH, 'SELECT name FROM agents WHERE id = ?', [agentId]) as Array<{ name: string }>
    expect(rows[0].name).toBe('agent-renamed')
  })

  it('returns { success: false, error } for unregistered dbPath', async () => {
    const result = await handlers['rename-agent'](
      null, '/evil/db.db', 1, 'new-name'
    ) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('DB_PATH_NOT_ALLOWED')
  })

  it('returns { success: true } even for non-existent agentId (UPDATE no-op)', async () => {
    const result = await handlers['rename-agent'](
      null, TEST_DB_PATH, 99999, 'ghost'
    ) as { success: boolean }

    expect(result.success).toBe(true)
  })
})

// ── Tests: update-agent-system-prompt ────────────────────────────────────────

describe('update-agent-system-prompt (T985)', () => {
  it('updates system_prompt for an agent', async () => {
    const agentId = await insertAgent('agent-sp')

    const result = await handlers['update-agent-system-prompt'](
      null, TEST_DB_PATH, agentId, 'You are a helpful agent.'
    ) as { success: boolean }

    expect(result.success).toBe(true)

    const rows = await queryLive(TEST_DB_PATH, 'SELECT system_prompt FROM agents WHERE id = ?', [agentId]) as Array<{ system_prompt: string }>
    expect(rows[0].system_prompt).toBe('You are a helpful agent.')
  })

  it('stores NULL when empty string is passed', async () => {
    const agentId = await insertAgent('agent-sp-null')
    // First set a value
    await handlers['update-agent-system-prompt'](null, TEST_DB_PATH, agentId, 'Initial prompt')
    // Then clear it
    await handlers['update-agent-system-prompt'](null, TEST_DB_PATH, agentId, '')

    const rows = await queryLive(TEST_DB_PATH, 'SELECT system_prompt FROM agents WHERE id = ?', [agentId]) as Array<{ system_prompt: null }>
    expect(rows[0].system_prompt).toBeNull()
  })

  it('returns { success: false, error } for unregistered dbPath', async () => {
    const result = await handlers['update-agent-system-prompt'](
      null, '/evil/db.db', 1, 'prompt'
    ) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('DB_PATH_NOT_ALLOWED')
  })
})

// ── Tests: update-agent-thinking-mode ────────────────────────────────────────

describe('update-agent-thinking-mode (T985)', () => {
  it('sets thinking_mode to "auto" → persisted in DB', async () => {
    const agentId = await insertAgent('agent-think-auto')

    const result = await handlers['update-agent-thinking-mode'](
      null, TEST_DB_PATH, agentId, 'auto'
    ) as { success: boolean }

    expect(result.success).toBe(true)
    const rows = await queryLive(TEST_DB_PATH, 'SELECT thinking_mode FROM agents WHERE id = ?', [agentId]) as Array<{ thinking_mode: string }>
    expect(rows[0].thinking_mode).toBe('auto')
  })

  it('sets thinking_mode to "disabled" → persisted in DB', async () => {
    const agentId = await insertAgent('agent-think-disabled')

    await handlers['update-agent-thinking-mode'](null, TEST_DB_PATH, agentId, 'disabled')

    const rows = await queryLive(TEST_DB_PATH, 'SELECT thinking_mode FROM agents WHERE id = ?', [agentId]) as Array<{ thinking_mode: string }>
    expect(rows[0].thinking_mode).toBe('disabled')
  })

  it('returns { success: false, error } for invalid value', async () => {
    const agentId = await insertAgent('agent-think-invalid')

    const result = await handlers['update-agent-thinking-mode'](
      null, TEST_DB_PATH, agentId, 'always'
    ) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('always')
  })

  it('accepts null → stored as NULL in DB', async () => {
    const agentId = await insertAgent('agent-think-null')
    await handlers['update-agent-thinking-mode'](null, TEST_DB_PATH, agentId, 'auto')
    await handlers['update-agent-thinking-mode'](null, TEST_DB_PATH, agentId, null)

    const rows = await queryLive(TEST_DB_PATH, 'SELECT thinking_mode FROM agents WHERE id = ?', [agentId]) as Array<{ thinking_mode: null }>
    expect(rows[0].thinking_mode).toBeNull()
  })

  it('returns { success: false, error } for unregistered dbPath', async () => {
    const result = await handlers['update-agent-thinking-mode'](
      null, '/evil/db.db', 1, 'auto'
    ) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('DB_PATH_NOT_ALLOWED')
  })
})

// ── Tests: session:setConvId ─────────────────────────────────────────────────

describe('session:setConvId (T985)', () => {
  const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

  it('sets claude_conv_id on the latest started session for an agent', async () => {
    const agentId = await insertAgent('agent-conv')
    const sessionId = await insertSession(agentId, { statut: 'started' })

    const result = await handlers['session:setConvId'](
      null, TEST_DB_PATH, agentId, VALID_UUID
    ) as { success: boolean; updated: boolean }

    expect(result.success).toBe(true)
    expect(result.updated).toBe(true)

    const rows = await queryLive(
      TEST_DB_PATH,
      'SELECT claude_conv_id FROM sessions WHERE id = ?',
      [sessionId]
    ) as Array<{ claude_conv_id: string }>
    expect(rows[0].claude_conv_id).toBe(VALID_UUID)
  })

  it('returns { success: true, updated: false } when no matching session found', async () => {
    const agentId = await insertAgent('agent-no-conv-session')

    const result = await handlers['session:setConvId'](
      null, TEST_DB_PATH, agentId, VALID_UUID
    ) as { success: boolean; updated: boolean }

    expect(result.success).toBe(true)
    expect(result.updated).toBe(false)
  })

  it('does not overwrite existing claude_conv_id (already set)', async () => {
    const agentId = await insertAgent('agent-conv-existing')
    await insertSession(agentId, { statut: 'started', convId: 'existing-uuid' })

    const result = await handlers['session:setConvId'](
      null, TEST_DB_PATH, agentId, VALID_UUID
    ) as { success: boolean; updated: boolean }

    // No match because claude_conv_id IS NOT NULL condition excludes it
    expect(result.success).toBe(true)
    expect(result.updated).toBe(false)
  })

  it('returns { success: false, error } for invalid arguments', async () => {
    // empty dbPath
    const result1 = await handlers['session:setConvId'](null, '', 1, VALID_UUID) as { success: boolean }
    // empty convId
    const result3 = await handlers['session:setConvId'](null, TEST_DB_PATH, 1, '') as { success: boolean }

    expect(result1.success).toBe(false)
    expect(result3.success).toBe(false)
  })

  it('rejects unregistered dbPath', async () => {
    const result = await handlers['session:setConvId'](
      null, '/evil/db.db', 1, VALID_UUID
    ) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('DB_PATH_NOT_ALLOWED')
  })
})

// ── Tests: build-agent-prompt ─────────────────────────────────────────────────

describe('build-agent-prompt (T985)', () => {
  it('returns userPrompt as-is when dbPath/agentId are not provided', async () => {
    const result = await handlers['build-agent-prompt'](
      null, 'agent-name', 'T123 task prompt'
    ) as string

    expect(result).toBe('T123 task prompt')
  })

  it('returns userPrompt as-is when dbPath is not registered', async () => {
    const result = await handlers['build-agent-prompt'](
      null, 'agent-name', 'prompt text', '/unregistered/db.db', 1
    ) as string

    // Falls back to base on error
    expect(result).toBe('prompt text')
  })

  it('creates a session and includes context block for valid agent', async () => {
    const agentId = await insertAgent('context-agent', { type: 'test', perimetre: 'back-electron' })
    await insertTask('open-task', { statut: 'todo', agentId })

    const result = await handlers['build-agent-prompt'](
      null, 'context-agent', 'T999', TEST_DB_PATH, agentId
    ) as string

    expect(result).toContain('=== IDENTIFIANTS ===')
    expect(result).toContain('context-agent')
    expect(result).toContain('=== TÂCHES ASSIGNÉES ===')
    expect(result).toContain('open-task')
    expect(result).toContain('T999')
  })

  it('creates a new session row in DB', async () => {
    const agentId = await insertAgent('session-creator')
    const sessionsBefore = await queryLive(TEST_DB_PATH, 'SELECT COUNT(*) as cnt FROM sessions', []) as Array<{ cnt: number }>

    await handlers['build-agent-prompt'](
      null, 'session-creator', 'my prompt', TEST_DB_PATH, agentId
    )

    const sessionsAfter = await queryLive(TEST_DB_PATH, 'SELECT COUNT(*) as cnt FROM sessions', []) as Array<{ cnt: number }>
    expect(sessionsAfter[0].cnt).toBe(sessionsBefore[0].cnt + 1)
  })

  it('includes previous session summary when available', async () => {
    const agentId = await insertAgent('agent-with-history')
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run(
        "INSERT INTO sessions (agent_id, statut, summary) VALUES (?, 'completed', ?)",
        [agentId, 'Done:T123. Pending:none. Next:backlog']
      )
    })

    const result = await handlers['build-agent-prompt'](
      null, 'agent-with-history', '', TEST_DB_PATH, agentId
    ) as string

    expect(result).toContain('Done:T123')
  })

  it('shows active locks in context block', async () => {
    const agentId = await insertAgent('agent-locked')
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run('INSERT INTO locks (fichier, agent_id) VALUES (?, ?)', ['src/main/ipc.ts', agentId])
    })

    const result = await handlers['build-agent-prompt'](
      null, 'agent-locked', '', TEST_DB_PATH, agentId
    ) as string

    expect(result).toContain('src/main/ipc.ts')
  })
})
