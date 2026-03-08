/**
 * Tests for config/misc IPC handlers — tasks:getArchived, tasks:updateStatus,
 * sessions:statsCost, session:updateResult.
 *
 * Continuation of ipc-config.spec.ts (split for file size).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Electron mock ──────────────────────────────────────────────────────────────
const handlers: Record<string, (event: unknown, ...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showMessageBox: vi.fn(),
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
  app: {
    getVersion: vi.fn(() => '0.3.0'),
    isPackaged: false,
    getAppPath: vi.fn(() => '/fake/app'),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
    showItemInFolder: vi.fn(),
  },
}))

// ── better-sqlite3 mock ─────────────────────────────────────────────────────
vi.mock('better-sqlite3', () => ({
  default: function MockDatabase() {
    return {
      pragma: vi.fn(),
      prepare: vi.fn(() => ({ run: vi.fn(), all: vi.fn(() => []), get: vi.fn() })),
      exec: vi.fn(),
      close: vi.fn(),
    }
  },
}))

// ── fs mock ────────────────────────────────────────────────────────────────────
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

vi.mock('fs/promises', () => {
  const readFile = vi.fn().mockResolvedValue(Buffer.from('file content', 'utf-8'))
  const writeFile = vi.fn().mockResolvedValue(undefined)
  const mkdir = vi.fn().mockResolvedValue(undefined)
  const rename = vi.fn().mockResolvedValue(undefined)
  const stat = vi.fn().mockResolvedValue({ mtimeMs: 1000 })
  const access = vi.fn().mockResolvedValue(undefined)
  const readdir = vi.fn().mockResolvedValue([] as string[])
  const copyFile = vi.fn().mockResolvedValue(undefined)
  return {
    default: { readFile, writeFile, mkdir, rename, stat, access, readdir, copyFile },
    readFile,
    writeFile,
    mkdir,
    rename,
    stat,
    access,
    readdir,
    copyFile,
  }
})

// ── child_process mock ────────────────────────────────────────────────────────
vi.mock('child_process', () => ({
  default: { execSync: vi.fn(), execFile: vi.fn(), spawn: vi.fn(() => ({ unref: vi.fn() })) },
  execSync: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}))

// ── T552: mock ./db to intercept queryLive ────────────────────────────────────
vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>()
  return {
    ...actual,
    queryLive: vi.fn().mockRejectedValue(new Error('file is not a database')),
  }
})
import { queryLive as mockedQueryLive } from './db'

// ── Import ipc.ts AFTER mocks ─────────────────────────────────────────────────
import { registerIpcHandlers, registerDbPath, registerProjectPath } from './ipc'

// Helper to call a captured handler
async function callHandler(channel: string, ...args: unknown[]) {
  const handler = handlers[channel]
  if (!handler) throw new Error(`Handler not found: ${channel}. Available: ${Object.keys(handlers).join(', ')}`)
  return handler(null, ...args)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('IPC config/misc handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mockedQueryLive).mockRejectedValue(new Error('file is not a database'))
    registerIpcHandlers()
    registerDbPath('/fake/project.db')
    registerDbPath('/fake/db')
    registerProjectPath('/fake/project')
    registerProjectPath('/home/user/project')
    registerProjectPath('/allowed')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── tasks:getArchived ─────────────────────────────────────────────────────

  describe('tasks:getArchived handler', () => {
    it('should throw DB_PATH_NOT_ALLOWED when dbPath is not registered', async () => {
      await expect(
        callHandler('tasks:getArchived', '/unregistered/evil.db', { page: 0, pageSize: 10 })
      ).rejects.toThrow('DB_PATH_NOT_ALLOWED')
    })

    it('should throw when dbPath is registered but DB buffer is invalid (queryLive)', async () => {
      await expect(
        callHandler('tasks:getArchived', '/fake/project.db', { page: 0, pageSize: 10 })
      ).rejects.toThrow()
    })

    it('should throw when agentId filter is provided', async () => {
      await expect(
        callHandler('tasks:getArchived', '/fake/project.db', { page: 0, pageSize: 10, agentId: 42 })
      ).rejects.toThrow()
    })

    it('should throw when perimetre filter is provided', async () => {
      await expect(
        callHandler('tasks:getArchived', '/fake/project.db', { page: 0, pageSize: 10, perimetre: 'back-electron' })
      ).rejects.toThrow()
    })
  })

  // ── tasks:updateStatus ────────────────────────────────────────────────────

  describe('tasks:updateStatus handler', () => {
    it('should throw DB_PATH_NOT_ALLOWED when dbPath is not registered', async () => {
      await expect(
        callHandler('tasks:updateStatus', '/unregistered/evil.db', 1, 'done')
      ).rejects.toThrow('DB_PATH_NOT_ALLOWED')
    })

    it('should return { success: false, error } for unknown status', async () => {
      const result = await callHandler('tasks:updateStatus', '/fake/project.db', 1, 'invalid-status') as {
        success: boolean; error?: string
      }
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('Invalid status: invalid-status') })
    })

    it('should return { success: false, error } for empty string status', async () => {
      const result = await callHandler('tasks:updateStatus', '/fake/project.db', 1, '') as {
        success: boolean; error?: string
      }
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('Invalid status:') })
    })

    it('should return { success: false } for null status (not in ALLOWED list)', async () => {
      const result = await callHandler('tasks:updateStatus', '/fake/project.db', 1, null) as {
        success: boolean
      }
      expect(result.success).toBe(false)
    })

    it('should accept all four valid statuses without validation error', async () => {
      const validStatuses = ['todo', 'in_progress', 'done', 'archived'] as const
      for (const status of validStatuses) {
        const result = await callHandler('tasks:updateStatus', '/fake/project.db', 1, status) as {
          success: boolean; error?: string
        }
        if (!result.success && result.error) {
          expect(result.error).not.toContain('Invalid status')
        }
      }
    })

    it('T552: should return TASK_BLOCKED when unresolved blockers exist (type bloque)', async () => {
      vi.mocked(mockedQueryLive).mockResolvedValueOnce([
        { id: 42, title: 'Blocker task', status: 'in_progress' },
      ])
      const result = await callHandler('tasks:updateStatus', '/fake/project.db', 10, 'in_progress') as {
        success: boolean; error?: string; blockers?: Array<{ id: number; title: string; status: string }>
      }
      expect(result).toMatchObject({ success: false, error: 'TASK_BLOCKED' })
      expect(result.blockers).toHaveLength(1)
      expect(result.blockers?.[0]).toMatchObject({ id: 42, title: 'Blocker task', status: 'in_progress' })
    })

    it('T552: should allow in_progress when no blockers exist', async () => {
      vi.mocked(mockedQueryLive).mockResolvedValueOnce([])
      const result = await callHandler('tasks:updateStatus', '/fake/project.db', 10, 'in_progress') as {
        success: boolean; error?: string
      }
      if (!result.success && result.error) {
        expect(result.error).not.toBe('TASK_BLOCKED')
      }
    })

    it('T552: should return TASK_BLOCKED with multiple blockers', async () => {
      vi.mocked(mockedQueryLive).mockResolvedValueOnce([
        { id: 10, title: 'Dep A', status: 'todo' },
        { id: 11, title: 'Dep B', status: 'in_progress' },
      ])
      const result = await callHandler('tasks:updateStatus', '/fake/project.db', 20, 'in_progress') as {
        success: boolean; error?: string; blockers?: Array<{ id: number; title: string; status: string }>
      }
      expect(result).toMatchObject({ success: false, error: 'TASK_BLOCKED' })
      expect(result.blockers).toHaveLength(2)
    })

    it('T552: should not check blockers for status other than in_progress', async () => {
      const qSpy = vi.mocked(mockedQueryLive)
      await callHandler('tasks:updateStatus', '/fake/project.db', 10, 'done')
      expect(qSpy).not.toHaveBeenCalled()
    })
  })

  // ── sessions:statsCost ────────────────────────────────────────────────────

  describe('sessions:statsCost handler (T768)', () => {
    it('should throw DB_PATH_NOT_ALLOWED for unregistered dbPath', async () => {
      await expect(
        callHandler('sessions:statsCost', '/unregistered/evil.db', { period: 'day' })
      ).rejects.toThrow('DB_PATH_NOT_ALLOWED')
    })

    it('should return { success: false, error: INVALID_PERIOD } for unknown period', async () => {
      const result = await callHandler('sessions:statsCost', '/fake/project.db', { period: 'hour' }) as { success: boolean; error?: string }
      expect(result).toMatchObject({ success: false, error: 'INVALID_PERIOD' })
    })

    it('should return { success: false, error: INVALID_PERIOD } when period is missing', async () => {
      const result = await callHandler('sessions:statsCost', '/fake/project.db', {}) as { success: boolean; error?: string }
      expect(result).toMatchObject({ success: false, error: 'INVALID_PERIOD' })
    })

    it('should return { success: true, rows } when queryLive succeeds for day period', async () => {
      const mockRows = [
        { agent_name: 'dev-back-electron', agent_id: 3, period: '2026-03-04', session_count: 2, total_cost: 0.0025, avg_duration_s: 30.5, total_turns: 10, total_tokens: 5000, cache_read: 1200, cache_write: 300 },
      ]
      vi.mocked(mockedQueryLive).mockResolvedValueOnce(mockRows)
      const result = await callHandler('sessions:statsCost', '/fake/project.db', { period: 'day' }) as { success: boolean; rows: unknown[] }
      expect(result).toMatchObject({ success: true, rows: mockRows })
    })

    it('should return { success: true, rows } for week and month periods', async () => {
      for (const period of ['week', 'month'] as const) {
        vi.mocked(mockedQueryLive).mockResolvedValueOnce([])
        const result = await callHandler('sessions:statsCost', '/fake/project.db', { period }) as { success: boolean; rows: unknown[] }
        expect(result).toMatchObject({ success: true, rows: [] })
      }
    })

    it('should return { success: false, error } when queryLive throws', async () => {
      const result = await callHandler('sessions:statsCost', '/fake/project.db', { period: 'day' }) as { success: boolean; error?: string }
      expect(result).toMatchObject({ success: false, error: expect.any(String) })
    })
  })

  // ── session:updateResult ──────────────────────────────────────────────────

  describe('session:updateResult handler (T777)', () => {
    it('should return INVALID_SESSION_ID for sessionId = 0', async () => {
      const result = await callHandler('session:updateResult', '/fake/project.db', 0, {}) as { success: boolean; error?: string }
      expect(result).toMatchObject({ success: false, error: 'INVALID_SESSION_ID' })
    })

    it('should return INVALID_SESSION_ID for sessionId = -1', async () => {
      const result = await callHandler('session:updateResult', '/fake/project.db', -1, {}) as { success: boolean; error?: string }
      expect(result).toMatchObject({ success: false, error: 'INVALID_SESSION_ID' })
    })

    it('should return INVALID_SESSION_ID for sessionId = 1.5 (float)', async () => {
      const result = await callHandler('session:updateResult', '/fake/project.db', 1.5, {}) as { success: boolean; error?: string }
      expect(result).toMatchObject({ success: false, error: 'INVALID_SESSION_ID' })
    })

    it('should return INVALID_SESSION_ID for sessionId = NaN', async () => {
      const result = await callHandler('session:updateResult', '/fake/project.db', NaN, {}) as { success: boolean; error?: string }
      expect(result).toMatchObject({ success: false, error: 'INVALID_SESSION_ID' })
    })

    it('should throw DB_PATH_NOT_ALLOWED for unregistered dbPath', async () => {
      await expect(
        callHandler('session:updateResult', '/unregistered/evil.db', 1, {})
      ).rejects.toThrow('DB_PATH_NOT_ALLOWED')
    })

    it('should return { success: false, error } when writeDb throws (mock better-sqlite3 buffer)', async () => {
      const result = await callHandler('session:updateResult', '/fake/project.db', 1, { cost_usd: 0.01 }) as { success: boolean; error?: string }
      expect(result).toHaveProperty('success')
      if (!result.success) {
        expect(result.error).toBeDefined()
      }
    })
  })

})
