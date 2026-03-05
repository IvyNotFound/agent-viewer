/**
 * Tests for window-control IPC handlers — window-minimize, window-close,
 * window-is-maximized, window-maximize, show-confirm-dialog.
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

describe('IPC window handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registerIpcHandlers()
    registerDbPath('/fake/project.db')
    registerProjectPath('/fake/project')
    registerProjectPath('/my/project')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── window controls (minimize, close, is-maximized) ───────────────────────

  describe('window controls', () => {
    it('should handle window-minimize gracefully when no focused window', async () => {
      const { BrowserWindow } = await import('electron')
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
      await expect(callHandler('window-minimize')).resolves.not.toThrow()
    })

    it('should handle window-close gracefully when no focused window', async () => {
      const { BrowserWindow } = await import('electron')
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
      await expect(callHandler('window-close')).resolves.not.toThrow()
    })

    it('should return false for window-is-maximized when no focused window', async () => {
      const { BrowserWindow } = await import('electron')
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
      const result = await callHandler('window-is-maximized')
      expect(result).toBe(false)
    })
  })

  // ── window-maximize toggle ────────────────────────────────────────────────

  describe('window-maximize handler', () => {
    it('should unmaximize when window is already maximized', async () => {
      const { BrowserWindow } = await import('electron')
      const mockUnmaximize = vi.fn()
      const mockMaximize = vi.fn()
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue({
        isMaximized: () => true,
        unmaximize: mockUnmaximize,
        maximize: mockMaximize,
      } as unknown as BrowserWindow)
      await callHandler('window-maximize')
      expect(mockUnmaximize).toHaveBeenCalled()
      expect(mockMaximize).not.toHaveBeenCalled()
    })

    it('should maximize when window is not maximized', async () => {
      const { BrowserWindow } = await import('electron')
      const mockUnmaximize = vi.fn()
      const mockMaximize = vi.fn()
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue({
        isMaximized: () => false,
        unmaximize: mockUnmaximize,
        maximize: mockMaximize,
      } as unknown as BrowserWindow)
      await callHandler('window-maximize')
      expect(mockMaximize).toHaveBeenCalled()
      expect(mockUnmaximize).not.toHaveBeenCalled()
    })

    it('should not throw when no focused window', async () => {
      const { BrowserWindow } = await import('electron')
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
      await expect(callHandler('window-maximize')).resolves.not.toThrow()
    })
  })

  // ── show-confirm-dialog ───────────────────────────────────────────────────

  describe('show-confirm-dialog handler', () => {
    it('should return true when user confirms (response=0)', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 0, checkboxChecked: false })
      const result = await callHandler('show-confirm-dialog', { title: 'Test', message: 'Confirm?' })
      expect(result).toBe(true)
    })

    it('should return false when user cancels (response=1)', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 1, checkboxChecked: false })
      const result = await callHandler('show-confirm-dialog', { title: 'Test', message: 'Confirm?' })
      expect(result).toBe(false)
    })
  })
})
