/**
 * Tests for shell IPC handlers — shell:openExternal.
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

// ── sql.js mock ────────────────────────────────────────────────────────────────
vi.mock('sql.js', () => ({
  default: vi.fn().mockResolvedValue({
    Database: vi.fn(() => ({
      prepare: vi.fn(() => ({ bind: vi.fn(), step: vi.fn(() => false), getAsObject: vi.fn(() => ({})), free: vi.fn() })),
      exec: vi.fn(() => []),
      run: vi.fn(),
      export: vi.fn(() => new Uint8Array([1, 2, 3])),
      close: vi.fn(),
      getRowsModified: vi.fn(() => 0),
    })),
  }),
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

// ── ./db mock ─────────────────────────────────────────────────────────────────
vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>()
  return {
    ...actual,
    queryLive: vi.fn().mockRejectedValue(new Error('file is not a database')),
  }
})

// ── Import ipc.ts AFTER mocks ─────────────────────────────────────────────────
import { registerIpcHandlers, registerDbPath, registerProjectPath } from './ipc'

// Helper to call a captured handler
async function callHandler(channel: string, ...args: unknown[]) {
  const handler = handlers[channel]
  if (!handler) throw new Error(`Handler not found: ${channel}. Available: ${Object.keys(handlers).join(', ')}`)
  return handler(null, ...args)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('IPC shell handlers', () => {
  let shellMock: { openExternal: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    vi.clearAllMocks()
    registerIpcHandlers()
    registerDbPath('/fake/project.db')
    registerProjectPath('/fake/project')
    const electron = await import('electron')
    shellMock = (electron as unknown as { shell: { openExternal: ReturnType<typeof vi.fn> } }).shell
    shellMock.openExternal.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── shell:openExternal ────────────────────────────────────────────────────

  describe('shell:openExternal handler (T777)', () => {
    it('should call shell.openExternal for https:// URL', async () => {
      await callHandler('shell:openExternal', 'https://example.com')
      expect(shellMock.openExternal).toHaveBeenCalledWith('https://example.com')
    })

    it('should call shell.openExternal for http:// URL', async () => {
      await callHandler('shell:openExternal', 'http://example.com')
      expect(shellMock.openExternal).toHaveBeenCalledWith('http://example.com')
    })

    it('should NOT call shell.openExternal for ftp:// URL', async () => {
      await callHandler('shell:openExternal', 'ftp://example.com')
      expect(shellMock.openExternal).not.toHaveBeenCalled()
    })

    it('should NOT call shell.openExternal for empty string', async () => {
      await callHandler('shell:openExternal', '')
      expect(shellMock.openExternal).not.toHaveBeenCalled()
    })

    it('should NOT call shell.openExternal for javascript: scheme (XSS guard)', async () => {
      await callHandler('shell:openExternal', 'javascript:alert(1)')
      expect(shellMock.openExternal).not.toHaveBeenCalled()
    })
  })
})
