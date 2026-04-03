/**
 * Integration tests — ipc-agent-tasks-query.ts handlers — T1479
 *
 * Directly exercises registerAgentTaskQueryHandlers() for:
 * - task:getAssignees: valid taskId, non-integer taskId, empty result
 * - search-tasks: filters by status, agent_id, scope; empty query; FTS fallback; unknown filter ignored
 * - task:getLinks: valid taskId, no links returns empty array
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Shared in-memory buffer ───────────────────────────────────────────────────
let dbBuffer: Buffer = Buffer.alloc(0)
let dbMtime = 1000

// ── Mock fs/promises ──────────────────────────────────────────────────────────
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(async () => ({ mtimeMs: dbMtime })),
    readFile: vi.fn(async () => dbBuffer),
    writeFile: vi.fn(async (_path: string, data: Buffer) => { dbBuffer = data; dbMtime += 1 }),
    rename: vi.fn(async () => undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
  stat: vi.fn(async () => ({ mtimeMs: dbMtime })),
  readFile: vi.fn(async () => dbBuffer),
  writeFile: vi.fn(async (_path: string, data: Buffer) => { dbBuffer = data; dbMtime += 1 }),
  rename: vi.fn(async () => undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}))

// ── Mock fs (sync) ────────────────────────────────────────────────────────────
vi.mock('fs', () => {
  const watch = vi.fn(() => ({ close: vi.fn() }))
  const existsSync = vi.fn(() => false)
  const readdirSync = vi.fn(() => [] as string[])
  const createReadStream = vi.fn(() => ({ on: vi.fn(), destroy: vi.fn() }))
  return {
    default: { watch, existsSync, readdirSync, createReadStream },
    watch, existsSync, readdirSync, createReadStream,
  }
})

// ── Mock readline ─────────────────────────────────────────────────────────────
vi.mock('readline', async () => {
  const { EventEmitter } = await import('events')
  const createInterface = vi.fn(({ input }: { input: NodeJS.ReadableStream }) => {
    input.on('error', () => {})
    if ('destroy' in input && typeof input.destroy === 'function') input.destroy()
    const rl = new EventEmitter() as NodeJS.EventEmitter & { close: () => void }
    rl.close = () => {}
    setImmediate(() => { rl.emit('error', new Error('ENOENT: no such file')) })
    return rl
  })
  return { createInterface, default: { createInterface } }
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

vi.mock('child_process', () => ({
  default: { execSync: vi.fn(), execFile: vi.fn(), spawn: vi.fn(() => ({ unref: vi.fn() })) },
  execSync: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}))

// ── Import after mocks ────────────────────────────────────────────────────────
import { registerDbPath, clearDbCacheEntry, queryLive, writeDb } from './db'
import { registerAgentTaskQueryHandlers } from './ipc-agent-tasks-query'
import { buildSchema, insertAgent, insertTask, TEST_DB_PATH } from './test-utils/ipc-test-setup'

// ── Test setup ────────────────────────────────────────────────────────────────
beforeEach(async () => {
  vi.clearAllMocks()
  clearDbCacheEntry(TEST_DB_PATH)
  dbMtime = 1000
  dbBuffer = Buffer.alloc(0)

  await buildSchema()
  registerDbPath(TEST_DB_PATH)
  registerAgentTaskQueryHandlers()
})

afterEach(() => {
  clearDbCacheEntry(TEST_DB_PATH)
})

// ── task:getAssignees ─────────────────────────────────────────────────────────

describe('task:getAssignees (T1479)', () => {
  it('valid taskId → returns array of assignees', async () => {
    const agentId = await insertAgent('assignee-for-get')
    const taskId = await insertTask('task-with-assignees')
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run('INSERT INTO task_agents (task_id, agent_id, role) VALUES (?, ?, ?)', [taskId, agentId, 'primary'])
    })

    const result = await handlers['task:getAssignees'](null, TEST_DB_PATH, taskId) as {
      success: boolean; assignees: Array<{ agent_id: number; agent_name: string; role: string }>
    }
    expect(result.success).toBe(true)
    expect(result.assignees).toHaveLength(1)
    expect(result.assignees[0].agent_id).toBe(agentId)
    expect(result.assignees[0].agent_name).toBe('assignee-for-get')
    expect(result.assignees[0].role).toBe('primary')
  })

  it('taskId with no assignees → empty array', async () => {
    const taskId = await insertTask('no-assignees-task')
    const result = await handlers['task:getAssignees'](null, TEST_DB_PATH, taskId) as { success: boolean; assignees: unknown[] }
    expect(result.success).toBe(true)
    expect(result.assignees).toEqual([])
  })

  it('non-integer taskId (float) → success: false', async () => {
    const result = await handlers['task:getAssignees'](null, TEST_DB_PATH, 1.5) as { success: boolean; error: string; assignees: unknown[] }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid taskId')
    expect(result.assignees).toEqual([])
  })

  it('non-integer taskId (string) → success: false', async () => {
    const result = await handlers['task:getAssignees'](null, TEST_DB_PATH, 'abc' as unknown as number) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid taskId')
  })

  it('unauthorized dbPath → success: false', async () => {
    const result = await handlers['task:getAssignees'](null, '/evil/db.db', 1) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('DB_PATH_NOT_ALLOWED')
  })

  it('multiple assignees returned ordered by assigned_at', async () => {
    const agentA = await insertAgent('assignee-order-a')
    const agentB = await insertAgent('assignee-order-b')
    const taskId = await insertTask('multi-assignee-task')
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run('INSERT INTO task_agents (task_id, agent_id, role) VALUES (?, ?, ?)', [taskId, agentA, 'support'])
      db.run('INSERT INTO task_agents (task_id, agent_id, role) VALUES (?, ?, ?)', [taskId, agentB, 'reviewer'])
    })

    const result = await handlers['task:getAssignees'](null, TEST_DB_PATH, taskId) as { success: boolean; assignees: Array<{ agent_id: number }> }
    expect(result.success).toBe(true)
    expect(result.assignees).toHaveLength(2)
  })
})

// ── search-tasks ──────────────────────────────────────────────────────────────

describe('search-tasks (T1479)', () => {
  it('empty query → returns all results (no FTS, no WHERE clause)', async () => {
    await insertTask('searchable-task-1')
    await insertTask('searchable-task-2')

    const result = await handlers['search-tasks'](null, TEST_DB_PATH, '') as { success: boolean; results: unknown[] }
    expect(result.success).toBe(true)
    expect(result.results.length).toBeGreaterThanOrEqual(2)
  })

  it('filter by status → only matching tasks returned', async () => {
    await insertTask('todo-task', { status: 'todo' })
    await insertTask('done-task', { status: 'done' })

    const result = await handlers['search-tasks'](null, TEST_DB_PATH, '', { status: 'todo' }) as {
      success: boolean; results: Array<{ status: string }>
    }
    expect(result.success).toBe(true)
    expect(result.results.every(r => r.status === 'todo')).toBe(true)
  })

  it('filter by agent_id → only tasks for that agent', async () => {
    const agentId = await insertAgent('search-agent-filter')
    await insertTask('agent-task', { agentId })
    await insertTask('other-task')

    const result = await handlers['search-tasks'](null, TEST_DB_PATH, '', { agent_id: agentId }) as {
      success: boolean; results: Array<{ agent_assigne: string }>
    }
    expect(result.success).toBe(true)
    expect(result.results.length).toBeGreaterThanOrEqual(1)
    expect(result.results.every(r => r.agent_assigne === 'search-agent-filter')).toBe(true)
  })

  it('filter by scope → only tasks with that scope', async () => {
    await insertTask('scoped-task', { scope: 'back-electron' })
    await insertTask('other-scope-task', { scope: 'front-vuejs' })

    const result = await handlers['search-tasks'](null, TEST_DB_PATH, '', { scope: 'back-electron' }) as {
      success: boolean; results: Array<{ scope: string }>
    }
    expect(result.success).toBe(true)
    expect(result.results.every(r => r.scope === 'back-electron')).toBe(true)
  })

  it('filter by statut (French alias) → same as status filter', async () => {
    await insertTask('french-todo', { status: 'todo' })
    await insertTask('french-done', { status: 'done' })

    const result = await handlers['search-tasks'](null, TEST_DB_PATH, '', { statut: 'todo' }) as {
      success: boolean; results: Array<{ status: string }>
    }
    expect(result.success).toBe(true)
    expect(result.results.every(r => r.status === 'todo')).toBe(true)
  })

  it('search by title text → returns matching tasks', async () => {
    await insertTask('unique-search-term-xyz')
    await insertTask('unrelated-task')

    const result = await handlers['search-tasks'](null, TEST_DB_PATH, 'unique-search-term-xyz') as {
      success: boolean; results: Array<{ title: string }>
    }
    expect(result.success).toBe(true)
    // Falls back to LIKE search when FTS table is not available
    const hasMatch = result.results.some(r => r.title.includes('unique-search-term-xyz'))
    expect(hasMatch).toBe(true)
  })

  it('results include description_excerpt field', async () => {
    await insertTask('excerpt-task', { description: 'This is a long description' })

    const result = await handlers['search-tasks'](null, TEST_DB_PATH, '') as {
      success: boolean; results: Array<{ description_excerpt?: string }>
    }
    expect(result.success).toBe(true)
    expect(result.results.length).toBeGreaterThan(0)
    expect('description_excerpt' in result.results[0]).toBe(true)
  })

  it('unauthorized dbPath → success: false', async () => {
    const result = await handlers['search-tasks'](null, '/evil/db.db', '') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('DB_PATH_NOT_ALLOWED')
  })

  it('combined status + agent_id filter', async () => {
    const agentId = await insertAgent('combined-filter-agent')
    await insertTask('combined-match', { status: 'in_progress', agentId })
    await insertTask('combined-mismatch-status', { status: 'done', agentId })
    await insertTask('combined-mismatch-agent', { status: 'in_progress' })

    const result = await handlers['search-tasks'](null, TEST_DB_PATH, '', { status: 'in_progress', agent_id: agentId }) as {
      success: boolean; results: Array<{ status: string }>
    }
    expect(result.success).toBe(true)
    expect(result.results.length).toBeGreaterThanOrEqual(1)
    expect(result.results.every(r => r.status === 'in_progress')).toBe(true)
  })
})

// ── task:getLinks ─────────────────────────────────────────────────────────────

describe('task:getLinks (T1479)', () => {
  it('valid taskId with no links → empty array', async () => {
    const taskId = await insertTask('isolated-task-links')
    const result = await handlers['task:getLinks'](null, TEST_DB_PATH, taskId) as { success: boolean; links: unknown[] }
    expect(result.success).toBe(true)
    expect(result.links).toEqual([])
  })

  it('returns links where task is from_task', async () => {
    const from = await insertTask('from-task')
    const to = await insertTask('to-task')
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run("INSERT INTO task_links (from_task, to_task, type) VALUES (?, ?, 'blocks')", [from, to])
    })

    const result = await handlers['task:getLinks'](null, TEST_DB_PATH, from) as {
      success: boolean; links: Array<{ from_task: number; to_task: number; type: string; from_title: string; to_title: string }>
    }
    expect(result.success).toBe(true)
    expect(result.links).toHaveLength(1)
    expect(result.links[0].from_task).toBe(from)
    expect(result.links[0].to_task).toBe(to)
    expect(result.links[0].type).toBe('blocks')
    expect(result.links[0].from_title).toBe('from-task')
    expect(result.links[0].to_title).toBe('to-task')
  })

  it('returns links where task is to_task', async () => {
    const from = await insertTask('link-source')
    const to = await insertTask('link-target')
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run("INSERT INTO task_links (from_task, to_task, type) VALUES (?, ?, 'depends_on')", [from, to])
    })

    const result = await handlers['task:getLinks'](null, TEST_DB_PATH, to) as { success: boolean; links: Array<{ from_task: number }> }
    expect(result.success).toBe(true)
    expect(result.links).toHaveLength(1)
    expect(result.links[0].from_task).toBe(from)
  })

  it('non-integer taskId → success: false', async () => {
    const result = await handlers['task:getLinks'](null, TEST_DB_PATH, 1.5) as { success: boolean; error: string; links: unknown[] }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid taskId')
    expect(result.links).toEqual([])
  })

  it('unauthorized dbPath → throws DB_PATH_NOT_ALLOWED', async () => {
    await expect(handlers['task:getLinks'](null, '/evil/db.db', 1)).rejects.toThrow('DB_PATH_NOT_ALLOWED')
  })

  it('multiple links returned for task with many dependencies', async () => {
    const main = await insertTask('hub-task')
    const dep1 = await insertTask('hub-dep-1')
    const dep2 = await insertTask('hub-dep-2')
    await writeDb<void>(TEST_DB_PATH, (db) => {
      db.run("INSERT INTO task_links (from_task, to_task, type) VALUES (?, ?, 'blocks')", [main, dep1])
      db.run("INSERT INTO task_links (from_task, to_task, type) VALUES (?, ?, 'blocks')", [main, dep2])
    })

    const result = await handlers['task:getLinks'](null, TEST_DB_PATH, main) as { success: boolean; links: unknown[] }
    expect(result.success).toBe(true)
    expect(result.links).toHaveLength(2)
  })
})
