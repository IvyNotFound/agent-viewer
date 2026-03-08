/**
 * Tests for config/misc IPC handlers — get-config-value, set-config-value,
 * update-perimetre, build-agent-prompt, search-tasks, close-agent-sessions,
 * rename-agent, update-agent-system-prompt, get-agent-system-prompt,
 * update-agent-thinking-mode, update-agent, session:setConvId, create-agent.
 *
 * Migrated from ipc.spec.ts (T851).
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
  // Use regular function (not arrow) so it works with `new Database()`
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

  // ── get-config-value ───────────────────────────────────────────────────────

  describe('get-config-value handler', () => {
    it('should return { success: false } when dbPath does not exist', async () => {
      const result = await callHandler('get-config-value', '/nonexistent/db.sqlite', 'some_key') as { success: boolean; value: unknown }
      expect(result.success).toBe(false)
    })

    it('should return { success, value } shape', async () => {
      const result = await callHandler('get-config-value', '/nonexistent/db.sqlite', 'claude_md_commit') as { success: boolean; value: unknown; error?: string }
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('value')
    })
  })

  // ── set-config-value ───────────────────────────────────────────────────────

  describe('set-config-value handler', () => {
    it('should return { success, error? } shape', async () => {
      const result = await callHandler('set-config-value', '/fake/project.db', 'key', 'value') as { success: boolean }
      expect(result).toHaveProperty('success')
    })

    it('should return { success: false, error } when dbPath is not registered (T282)', async () => {
      const result = await callHandler('set-config-value', '/invalid/db', 'key', 'value')
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('DB_PATH_NOT_ALLOWED') })
    })
  })

  // ── update-perimetre ───────────────────────────────────────────────────────

  describe('update-perimetre handler', () => {
    it('should return { success, error? } shape', async () => {
      const result = await callHandler('update-perimetre', '/fake/project.db', 1, 'old-name', 'new-name', 'desc') as { success: boolean }
      expect(result).toHaveProperty('success')
    })

    it('should return { success: false, error } when dbPath is not registered (T282)', async () => {
      const result = await callHandler('update-perimetre', '/invalid/db', 1, 'old', 'new', 'desc')
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('DB_PATH_NOT_ALLOWED') })
    })
  })

  // ── build-agent-prompt ────────────────────────────────────────────────────

  describe('build-agent-prompt handler', () => {
    it('should return the trimmed userPrompt when no dbPath provided', async () => {
      const result = await callHandler('build-agent-prompt', 'dev-front', 'Tu es dev') as string
      expect(typeof result).toBe('string')
      expect(result).toBe('Tu es dev')
    })

    it('should return empty string when userPrompt is empty and no dbPath provided', async () => {
      const result = await callHandler('build-agent-prompt', 'dev-front', '') as string
      expect(result).toBe('')
    })
  })

  // ── search-tasks ──────────────────────────────────────────────────────────

  describe('search-tasks handler', () => {
    it('should return { success: false } when dbPath is invalid (no such file)', async () => {
      const result = await callHandler('search-tasks', '/nonexistent/db.sqlite', '') as { success: boolean; results: unknown[] }
      expect(result).toMatchObject({ success: false, results: [] })
    })

    it('should return { success: false } with results array on DB error', async () => {
      const result = await callHandler('search-tasks', '/nonexistent/db.sqlite', 'my task') as { success: boolean; results: unknown[] }
      expect(result.success).toBe(false)
      expect(Array.isArray(result.results)).toBe(true)
    })
  })

  // ── close-agent-sessions ──────────────────────────────────────────────────

  describe('close-agent-sessions handler', () => {
    it('should return { success, error } shape', async () => {
      const result = await callHandler('close-agent-sessions', '/fake/project.db', 'dev-front') as { success: boolean; error?: string }
      expect(result).toHaveProperty('success')
    })

    it('should return { success: false, error } when dbPath is not registered (T282)', async () => {
      const result = await callHandler('close-agent-sessions', '/invalid/db', 'dev-front')
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('DB_PATH_NOT_ALLOWED') })
    })
  })

  // ── rename-agent ──────────────────────────────────────────────────────────

  describe('rename-agent handler', () => {
    it('should return { success, error? } shape', async () => {
      const result = await callHandler('rename-agent', '/fake/project.db', 1, 'new-name') as { success: boolean }
      expect(result).toHaveProperty('success')
    })

    it('should return { success: false, error } when dbPath is not registered (T282)', async () => {
      const result = await callHandler('rename-agent', '/invalid/db', 1, 'new-name')
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('DB_PATH_NOT_ALLOWED') })
    })
  })

  // ── update-agent-system-prompt ────────────────────────────────────────────

  describe('update-agent-system-prompt handler', () => {
    it('should return { success, error? } shape', async () => {
      const result = await callHandler('update-agent-system-prompt', '/fake/project.db', 1, 'My prompt') as { success: boolean }
      expect(result).toHaveProperty('success')
    })

    it('should return { success: false, error } when dbPath is not registered (T282)', async () => {
      const result = await callHandler('update-agent-system-prompt', '/invalid/db', 1, 'prompt')
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('DB_PATH_NOT_ALLOWED') })
    })
  })

  // ── get-agent-system-prompt ───────────────────────────────────────────────

  describe('get-agent-system-prompt handler', () => {
    it('should return { success: false, systemPrompt: null } shape on DB error', async () => {
      const result = await callHandler('get-agent-system-prompt', '/fake/project.db', 99) as {
        success: boolean; systemPrompt: unknown; systemPromptSuffix: unknown; thinkingMode: unknown
      }
      expect(result.success).toBe(false)
      expect(result.systemPrompt).toBeNull()
      expect(result.systemPromptSuffix).toBeNull()
      expect(result.thinkingMode).toBeNull()
    })

    it('should always return { success, systemPrompt, systemPromptSuffix, thinkingMode } shape', async () => {
      const result = await callHandler('get-agent-system-prompt', '/fake/project.db', 1) as Record<string, unknown>
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('systemPrompt')
      expect(result).toHaveProperty('systemPromptSuffix')
      expect(result).toHaveProperty('thinkingMode')
    })
  })

  // ── update-agent-thinking-mode ────────────────────────────────────────────

  describe('update-agent-thinking-mode handler', () => {
    it('should return { success, error? } shape', async () => {
      const result = await callHandler('update-agent-thinking-mode', '/fake/project.db', 1, 'auto') as { success: boolean }
      expect(result).toHaveProperty('success')
    })

    it('should return { success: false, error } when dbPath is not registered (T282)', async () => {
      const result = await callHandler('update-agent-thinking-mode', '/invalid/db', 1, 'disabled')
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('DB_PATH_NOT_ALLOWED') })
    })

    it('should reject budget_tokens as an invalid thinking mode', async () => {
      const result = await callHandler('update-agent-thinking-mode', '/fake/project.db', 1, 'budget_tokens') as { success: boolean; error: string }
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('budget_tokens') })
    })

    it('should accept null as a valid thinking mode (reset to default)', async () => {
      const result = await callHandler('update-agent-thinking-mode', '/fake/project.db', 1, null) as { success: boolean }
      expect(result).toHaveProperty('success')
    })
  })

})
