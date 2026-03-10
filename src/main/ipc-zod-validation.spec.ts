/**
 * Tests — Zod runtime validation on critical IPC handlers — T1227
 *
 * Covers:
 * - rename-agent: invalid agentId / empty newName / oversized newName
 * - update-agent-system-prompt: invalid agentId / oversized systemPrompt
 * - update-agent: invalid agentId / invalid maxSessions / invalid name
 * - create-agent: missing/invalid required fields
 * - close-agent-sessions: empty agentName / oversized agentName
 * - update-perimetre: invalid id / empty newName
 * - git:worktree-create: invalid sessionId / invalid agentName
 * - git:worktree-remove: empty workDir
 * - session:setConvId: invalid convId format
 * - session:collectTokens: empty agentName
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
    access: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
  stat: vi.fn(async () => ({ mtimeMs: dbMtime })),
  readFile: vi.fn(async () => dbBuffer),
  writeFile: vi.fn(async (_path: string, data: Buffer) => { dbBuffer = data; dbMtime += 1 }),
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

vi.mock('./claude-md', () => ({ insertAgentIntoClaudeMd: vi.fn((c: string) => c) }))

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
import { registerDbPath, registerProjectPath, clearDbCacheEntry } from './db'
import { registerIpcHandlers } from './ipc'
import {
  buildSchema,
  insertAgent,
  TEST_DB_PATH,
  TEST_PROJECT_PATH,
} from './test-utils/ipc-test-setup'

// ── Test setup ────────────────────────────────────────────────────────────────
beforeEach(async () => {
  vi.clearAllMocks()
  clearDbCacheEntry(TEST_DB_PATH)
  dbMtime = 1000

  await buildSchema()

  registerDbPath(TEST_DB_PATH)
  registerProjectPath(TEST_PROJECT_PATH)
  registerIpcHandlers()
})

afterEach(() => {
  clearDbCacheEntry(TEST_DB_PATH)
})

// ── Tests: rename-agent zod validation (T1227) ────────────────────────────────

describe('rename-agent — zod validation (T1227)', () => {
  it('returns { success: false, error } for non-integer agentId', async () => {
    const result = await handlers['rename-agent'](null, TEST_DB_PATH, 1.5, 'new-name') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('agentId')
  })

  it('returns { success: false, error } for negative agentId', async () => {
    const result = await handlers['rename-agent'](null, TEST_DB_PATH, -1, 'new-name') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('agentId')
  })

  it('returns { success: false, error } for empty newName', async () => {
    const agentId = await insertAgent('rename-agent-zod')
    const result = await handlers['rename-agent'](null, TEST_DB_PATH, agentId, '') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('newName')
  })

  it('returns { success: false, error } for oversized newName (> 200 chars)', async () => {
    const agentId = await insertAgent('rename-agent-zod-long')
    const longName = 'a'.repeat(201)
    const result = await handlers['rename-agent'](null, TEST_DB_PATH, agentId, longName) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('newName')
  })
})

// ── Tests: update-agent-system-prompt zod validation (T1227) ─────────────────

describe('update-agent-system-prompt — zod validation (T1227)', () => {
  it('returns { success: false, error } for non-integer agentId', async () => {
    const result = await handlers['update-agent-system-prompt'](null, TEST_DB_PATH, 0, 'prompt') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('agentId')
  })

  it('returns { success: false, error } for systemPrompt exceeding 100 000 chars', async () => {
    const agentId = await insertAgent('agent-sp-huge')
    const hugePrompt = 'x'.repeat(100_001)
    const result = await handlers['update-agent-system-prompt'](null, TEST_DB_PATH, agentId, hugePrompt) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('systemPrompt')
  })

  it('accepts empty string (clears system prompt)', async () => {
    const agentId = await insertAgent('agent-sp-empty-zod')
    const result = await handlers['update-agent-system-prompt'](null, TEST_DB_PATH, agentId, '') as { success: boolean }
    expect(result.success).toBe(true)
  })
})

// ── Tests: update-agent zod validation (T1227) ────────────────────────────────

describe('update-agent — zod validation (T1227)', () => {
  it('returns { success: false, error } for non-integer agentId', async () => {
    const result = await handlers['update-agent'](null, TEST_DB_PATH, -5, { name: 'x' }) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('agentId')
  })

  it('returns { success: false, error } for empty name', async () => {
    const agentId = await insertAgent('agent-update-zod')
    const result = await handlers['update-agent'](null, TEST_DB_PATH, agentId, { name: '' }) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('name')
  })

  it('returns { success: false, error } containing "maxSessions" for invalid maxSessions=0', async () => {
    const agentId = await insertAgent('agent-maxsessions-zod')
    const result = await handlers['update-agent'](null, TEST_DB_PATH, agentId, { maxSessions: 0 }) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('maxSessions')
  })

  it('returns { success: false, error } for oversized systemPrompt', async () => {
    const agentId = await insertAgent('agent-update-sp-zod')
    const result = await handlers['update-agent'](null, TEST_DB_PATH, agentId, { systemPrompt: 'x'.repeat(100_001) }) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).not.toBeUndefined()
  })
})

// ── Tests: create-agent zod validation (T1227) ────────────────────────────────

describe('create-agent — zod validation (T1227)', () => {
  it('returns { success: false, error } for empty agent name', async () => {
    const result = await handlers['create-agent'](
      null, TEST_DB_PATH, TEST_PROJECT_PATH,
      { name: '', type: 'dev', scope: null, thinkingMode: null, systemPrompt: null, description: '' }
    ) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('name')
  })

  it('returns { success: false, error } for empty type', async () => {
    const result = await handlers['create-agent'](
      null, TEST_DB_PATH, TEST_PROJECT_PATH,
      { name: 'valid-name', type: '', scope: null, thinkingMode: null, systemPrompt: null, description: '' }
    ) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('type')
  })

  it('returns { success: false, error } for oversized name (> 200 chars)', async () => {
    const result = await handlers['create-agent'](
      null, TEST_DB_PATH, TEST_PROJECT_PATH,
      { name: 'a'.repeat(201), type: 'dev', scope: null, thinkingMode: null, systemPrompt: null, description: '' }
    ) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('name')
  })
})

// ── Tests: close-agent-sessions zod validation (T1227) ───────────────────────

describe('close-agent-sessions — zod validation (T1227)', () => {
  it('returns { success: false, error } for empty agentName', async () => {
    const result = await handlers['close-agent-sessions'](null, TEST_DB_PATH, '') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('agentName')
  })

  it('returns { success: false, error } for oversized agentName (> 200 chars)', async () => {
    const result = await handlers['close-agent-sessions'](null, TEST_DB_PATH, 'a'.repeat(201)) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('agentName')
  })

  it('succeeds for valid agentName (no sessions to close = no-op)', async () => {
    const result = await handlers['close-agent-sessions'](null, TEST_DB_PATH, 'nonexistent-agent') as { success: boolean }
    expect(result.success).toBe(true)
  })
})

// ── Tests: update-perimetre zod validation (T1227) ───────────────────────────

describe('update-perimetre — zod validation (T1227)', () => {
  it('returns { success: false, error } for non-integer id', async () => {
    const result = await handlers['update-perimetre'](null, TEST_DB_PATH, 0, 'old', 'new', '') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('id')
  })

  it('returns { success: false, error } for negative id', async () => {
    const result = await handlers['update-perimetre'](null, TEST_DB_PATH, -1, 'old', 'new', '') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('id')
  })

  it('returns { success: false, error } for empty newName', async () => {
    const result = await handlers['update-perimetre'](null, TEST_DB_PATH, 1, 'old', '', '') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('newName')
  })
})

// ── Tests: git:worktree-create zod validation (T1227) ────────────────────────

describe('git:worktree-create — zod validation (T1227)', () => {
  it('returns { success: false, error } for sessionId with special chars', async () => {
    const result = await handlers['git:worktree-create'](null, TEST_PROJECT_PATH, 'invalid/id!', 'agent') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('sessionId')
  })

  it('returns { success: false, error } for agentName with spaces', async () => {
    const result = await handlers['git:worktree-create'](null, TEST_PROJECT_PATH, 'valid-id', 'agent name') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('agentName')
  })
})

// ── Tests: git:worktree-remove zod validation (T1227) ────────────────────────

describe('git:worktree-remove — zod validation (T1227)', () => {
  it('returns { success: false, error } for empty workDir', async () => {
    const result = await handlers['git:worktree-remove'](null, TEST_PROJECT_PATH, '') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('workDir')
  })
})

// ── Tests: session:setConvId zod validation (T1227) ──────────────────────────

describe('session:setConvId — zod validation (T1227)', () => {
  it('returns { success: false, error } for non-UUID convId', async () => {
    const agentId = await insertAgent('agent-setconvid-zod')
    const result = await handlers['session:setConvId'](null, TEST_DB_PATH, agentId, 'not-a-uuid') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('convId')
  })

  it('accepts a valid UUID', async () => {
    const agentId = await insertAgent('agent-setconvid-valid')
    const result = await handlers['session:setConvId'](null, TEST_DB_PATH, agentId, '550e8400-e29b-41d4-a716-446655440000') as { success: boolean }
    // No started session → updated=false, but not an error
    expect(result.success).toBe(true)
  })
})

// ── Tests: session:collectTokens zod validation (T1227) ──────────────────────

describe('session:collectTokens — zod validation (T1227)', () => {
  it('returns { success: false, error } for oversized agentName (> 200 chars)', async () => {
    const result = await handlers['session:collectTokens'](null, TEST_DB_PATH, 'a'.repeat(201)) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('agentName')
  })
})
