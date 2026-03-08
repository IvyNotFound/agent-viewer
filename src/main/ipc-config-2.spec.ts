/**
 * Tests for config/misc IPC handlers — update-agent, session:setConvId,
 * create-agent, agent:duplicate, task:getAssignees, task:setAssignees.
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

  // ── update-agent ──────────────────────────────────────────────────────────

  describe('update-agent handler', () => {
    it('should return { success, error? } shape', async () => {
      const result = await callHandler('update-agent', '/fake/project.db', 1, { name: 'new-name' }) as { success: boolean }
      expect(result).toHaveProperty('success')
    })

    it('should return { success: false, error } when dbPath is not registered (T282)', async () => {
      const result = await callHandler('update-agent', '/invalid/db', 1, { name: 'new-name' })
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('DB_PATH_NOT_ALLOWED') })
    })

    it('should return { success: true } when updates is empty (T477 — cols.length guard)', async () => {
      const result = await callHandler('update-agent', '/fake/project.db', 1, {}) as { success: boolean }
      expect(result).toMatchObject({ success: true })
    })

    it('should return { success: false, error } for invalid maxSessions (T477)', async () => {
      const result = await callHandler('update-agent', '/fake/project.db', 1, { maxSessions: 0 }) as { success: boolean; error?: string }
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('maxSessions') })
    })
  })

  // ── session:setConvId ─────────────────────────────────────────────────────

  describe('session:setConvId handler', () => {
    const validConvId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

    it('should return { success: false, error: Invalid arguments } when convId is empty', async () => {
      const result = await callHandler('session:setConvId', '/fake/db', 1, '')
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('Invalid arguments') })
    })

    it('should return { success: false, error: Invalid arguments } when agentId is not a number', async () => {
      const result = await callHandler('session:setConvId', '/fake/db', 'not-a-number', validConvId)
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('Invalid arguments') })
    })

    it('should return { success: false, error: Invalid arguments } when dbPath is falsy', async () => {
      const result = await callHandler('session:setConvId', '', 1, validConvId)
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('Invalid arguments') })
    })

    it('should return { success, error? } shape for valid args', async () => {
      const result = await callHandler('session:setConvId', '/fake/project.db', 1, validConvId) as { success: boolean }
      expect(result).toHaveProperty('success')
    })

    it('should return { success: false, error } when dbPath is not registered (T282)', async () => {
      const result = await callHandler('session:setConvId', '/invalid/db', 1, validConvId)
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('DB_PATH_NOT_ALLOWED') })
    })
  })

  // ── create-agent ──────────────────────────────────────────────────────────

  describe('create-agent handler', () => {
    const dbPath = '/fake/project.db'
    const projectPath = '/fake/project'
    const agentData = {
      name: 'my-new-agent',
      type: 'dev',
      scope: 'back-electron',
      thinkingMode: 'auto',
      systemPrompt: 'Be helpful',
      description: 'Mon agent de test'
    }

    it('should return { success, error? } shape', async () => {
      const result = await callHandler('create-agent', dbPath, projectPath, agentData) as { success: boolean }
      expect(result).toHaveProperty('success')
    })

    it('should return { success: false, error } when readFile throws (ENOENT)', async () => {
      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'))
      const result = await callHandler('create-agent', dbPath, projectPath, agentData)
      expect(result).toMatchObject({ success: false })
    })
  })

  // ── agent:duplicate ───────────────────────────────────────────────────────

  describe('agent:duplicate handler', () => {
    it('should return { success: false, error: "Invalid agentId" } when agentId is a string (T473)', async () => {
      const result = await callHandler('agent:duplicate', '/fake/project.db', 'not-a-number') as { success: boolean; error?: string }
      expect(result).toMatchObject({ success: false, error: 'Invalid agentId' })
    })

    it('should return { success: false, error: "Invalid agentId" } when agentId is a float (T473)', async () => {
      const result = await callHandler('agent:duplicate', '/fake/project.db', 1.5) as { success: boolean; error?: string }
      expect(result).toMatchObject({ success: false, error: 'Invalid agentId' })
    })

    it('should return { success: false, error } when dbPath is not registered (T473)', async () => {
      const result = await callHandler('agent:duplicate', '/invalid/db', 1)
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('DB_PATH_NOT_ALLOWED') })
    })
  })

  // ── task:getAssignees ─────────────────────────────────────────────────────

  describe('task:getAssignees handler', () => {
    it('should return { success: false, assignees: [], error } when taskId is not an integer', async () => {
      const result = await callHandler('task:getAssignees', '/fake/project.db', 'abc') as {
        success: boolean; assignees: unknown[]; error?: string
      }
      expect(result).toMatchObject({ success: false, assignees: [], error: 'Invalid taskId' })
    })

    it('should return { success: false, assignees: [], error } when taskId is a float', async () => {
      const result = await callHandler('task:getAssignees', '/fake/project.db', 1.5) as {
        success: boolean; assignees: unknown[]; error?: string
      }
      expect(result).toMatchObject({ success: false, assignees: [], error: 'Invalid taskId' })
    })

    it('should return { success: false, assignees: [] } when dbPath does not exist (DB error)', async () => {
      const result = await callHandler('task:getAssignees', '/nonexistent/db.sqlite', 1) as {
        success: boolean; assignees: unknown[]
      }
      expect(result.success).toBe(false)
      expect(Array.isArray(result.assignees)).toBe(true)
      expect(result.assignees).toHaveLength(0)
    })

    it('should always return { success, assignees } shape', async () => {
      const result = await callHandler('task:getAssignees', '/nonexistent/db.sqlite', 99) as Record<string, unknown>
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('assignees')
    })
  })

  // ── task:setAssignees ─────────────────────────────────────────────────────

  describe('task:setAssignees handler', () => {
    it('should return { success: false, error: Invalid taskId } when taskId is not an integer', async () => {
      const result = await callHandler('task:setAssignees', '/fake/project.db', 'xyz', []) as {
        success: boolean; error?: string
      }
      expect(result).toMatchObject({ success: false, error: 'Invalid taskId' })
    })

    it('should return { success: false, error: Invalid taskId } when taskId is a float', async () => {
      const result = await callHandler('task:setAssignees', '/fake/project.db', 2.7, []) as {
        success: boolean; error?: string
      }
      expect(result).toMatchObject({ success: false, error: 'Invalid taskId' })
    })

    it('should return { success: false, error } when assignees is not an array', async () => {
      const result = await callHandler('task:setAssignees', '/fake/project.db', 1, 'not-array') as {
        success: boolean; error?: string
      }
      expect(result).toMatchObject({ success: false, error: 'assignees must be an array' })
    })

    it('should return { success: false, error } when assignees is null', async () => {
      const result = await callHandler('task:setAssignees', '/fake/project.db', 1, null) as {
        success: boolean; error?: string
      }
      expect(result).toMatchObject({ success: false, error: 'assignees must be an array' })
    })

    it('should return { success: false, error: Invalid role } when role is not allowed', async () => {
      const result = await callHandler('task:setAssignees', '/fake/project.db', 1, [
        { agentId: 1, role: 'admin' }
      ]) as { success: boolean; error?: string }
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('Invalid role') })
      expect(result.error).toContain('admin')
    })

    it('should return { success: false, error: Invalid agentId } when agentId is not an integer', async () => {
      const result = await callHandler('task:setAssignees', '/fake/project.db', 1, [
        { agentId: 'foo', role: 'primary' }
      ]) as { success: boolean; error?: string }
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('Invalid agentId') })
    })

    it('should accept null role without validation error', async () => {
      const result = await callHandler('task:setAssignees', '/fake/project.db', 1, [
        { agentId: 1, role: null }
      ]) as { success: boolean }
      expect(result).toHaveProperty('success')
    })

    it('should return { success: false, error } when dbPath is not registered (T282)', async () => {
      const result = await callHandler('task:setAssignees', '/invalid/db', 1, []) as {
        success: boolean; error?: string
      }
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('DB_PATH_NOT_ALLOWED') })
    })

    it('should return { success, error? } shape for valid args (registered dbPath)', async () => {
      const result = await callHandler('task:setAssignees', '/fake/project.db', 1, []) as { success: boolean }
      expect(result).toHaveProperty('success')
    })

    it('should accept valid roles: primary, support, reviewer', async () => {
      for (const role of ['primary', 'support', 'reviewer'] as const) {
        const result = await callHandler('task:setAssignees', '/fake/project.db', 1, [
          { agentId: 1, role }
        ]) as { success: boolean; error?: string }
        if (!result.success && result.error) {
          expect(result.error).not.toContain('Invalid role')
        }
      }
    })
  })

})
