/**
 * Tests for project-management IPC handlers — select-project-dir,
 * init-new-project, select-new-project-dir, create-project-db, project:exportZip.
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
import { registerIpcHandlers, registerDbPath, registerProjectPath, AGENT_SCRIPTS } from './ipc'

// Helper to call a captured handler
async function callHandler(channel: string, ...args: unknown[]) {
  const handler = handlers[channel]
  if (!handler) throw new Error(`Handler not found: ${channel}. Available: ${Object.keys(handlers).join(', ')}`)
  return handler(null, ...args)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('IPC project handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registerIpcHandlers()
    registerDbPath('/fake/project.db')
    registerProjectPath('/fake/project')
    registerProjectPath('/my/project')
    registerProjectPath('/empty/project')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── select-project-dir ────────────────────────────────────────────────────

  describe('select-project-dir handler', () => {
    it('should return null when dialog is canceled', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: true, filePaths: [] })
      const result = await callHandler('select-project-dir')
      expect(result).toBeNull()
    })

    it('should return project info when dialog returns a path', async () => {
      const { dialog } = await import('electron')
      const { access, readdir } = await import('fs/promises')
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths: ['/my/project'] })
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(readdir as (path: string) => Promise<string[]>).mockResolvedValue([])
      const result = await callHandler('select-project-dir') as {
        projectPath: string; dbPath: string | null; error: null; hasCLAUDEmd: boolean
      }
      expect(result).toMatchObject({ projectPath: '/my/project', dbPath: null, error: null })
      expect(result).toHaveProperty('hasCLAUDEmd')
    })

    it('should auto-detect project.db via findProjectDb', async () => {
      const { dialog } = await import('electron')
      const { access, readdir } = await import('fs/promises')
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths: ['/my/project'] })
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readdir as (path: string) => Promise<string[]>).mockResolvedValue(['project.db'])
      const result = await callHandler('select-project-dir') as {
        projectPath: string; dbPath: string | null
      }
      expect(result.projectPath).toBe('/my/project')
      expect(result.dbPath).toContain('project.db')
    })
  })

  // ── select-project-dir — hasCLAUDEmd ─────────────────────────────────────

  describe('select-project-dir — hasCLAUDEmd', () => {
    it('should return hasCLAUDEmd: true when CLAUDE.md exists', async () => {
      const { dialog } = await import('electron')
      const { access, readdir } = await import('fs/promises')
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/my/project'],
      })
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readdir as (path: string) => Promise<string[]>).mockResolvedValue(['project.db'])
      const result = await callHandler('select-project-dir') as {
        projectPath: string; hasCLAUDEmd: boolean
      }
      expect(result.hasCLAUDEmd).toBe(true)
    })

    it('should return hasCLAUDEmd: false when CLAUDE.md does not exist', async () => {
      const { dialog } = await import('electron')
      const { access, readdir } = await import('fs/promises')
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/my/project'],
      })
      vi.mocked(access)
        .mockResolvedValueOnce(undefined) // .claude dir exists
        .mockRejectedValueOnce(new Error('ENOENT')) // CLAUDE.md doesn't exist
      vi.mocked(readdir as (path: string) => Promise<string[]>).mockResolvedValue(['project.db'])
      const result = await callHandler('select-project-dir') as {
        projectPath: string; hasCLAUDEmd: boolean
      }
      expect(result.hasCLAUDEmd).toBe(false)
    })
  })

  // ── select-new-project-dir ────────────────────────────────────────────────

  describe('select-new-project-dir handler', () => {
    it('should return null when dialog is canceled', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: true, filePaths: [] })
      const result = await callHandler('select-new-project-dir')
      expect(result).toBeNull()
    })

    it('should return the selected path when dialog returns a path', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/my/new/project'],
      })
      const result = await callHandler('select-new-project-dir')
      expect(result).toBe('/my/new/project')
    })
  })

  // ── init-new-project ──────────────────────────────────────────────────────

  describe('init-new-project handler', () => {
    it('should return { success: true } on nominal path', async () => {
      const { writeFile, mkdir } = await import('fs/promises')
      vi.mocked(mkdir).mockResolvedValueOnce(undefined)
      vi.mocked(writeFile).mockResolvedValueOnce(undefined)
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce('# CLAUDE.md content'),
      })
      try {
        const result = await callHandler('init-new-project', '/fake/project') as { success: boolean }
        expect(result).toMatchObject({ success: true })
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should return { success: false, error } when fetch fails', async () => {
      const { mkdir } = await import('fs/promises')
      vi.mocked(mkdir).mockResolvedValueOnce(undefined)
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      try {
        const result = await callHandler('init-new-project', '/fake/project') as { success: boolean; error?: string }
        expect(result.success).toBe(false)
        expect(typeof result.error).toBe('string')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should return { success: false, error } when mkdir fails (EACCES)', async () => {
      const { mkdir } = await import('fs/promises')
      vi.mocked(mkdir).mockRejectedValueOnce(new Error('EACCES: permission denied'))
      const result = await callHandler('init-new-project', '/fake/project') as { success: boolean; error?: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('EACCES')
    })
  })

  // ── create-project-db ─────────────────────────────────────────────────────

  describe('create-project-db handler', () => {
    it('should return { success: true, dbPath } on success path', async () => {
      const { mkdir, writeFile } = await import('fs/promises')
      vi.mocked(mkdir).mockResolvedValueOnce(undefined)
      vi.mocked(writeFile).mockResolvedValueOnce(undefined)
      const result = await callHandler('create-project-db', '/fake/project') as {
        success: boolean; dbPath: string
      }
      expect(result.success).toBe(true)
      expect(result.dbPath).toContain('project.db')
      expect(result.dbPath).toContain('.claude')
    })

    it('should create .claude directory via mkdir recursive', async () => {
      const { mkdir, writeFile } = await import('fs/promises')
      vi.mocked(mkdir).mockResolvedValueOnce(undefined)
      vi.mocked(writeFile).mockResolvedValueOnce(undefined)
      await callHandler('create-project-db', '/fake/project')
      expect(mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.claude'),
        { recursive: true }
      )
    })

    it('should write the DB file to .claude/project.db', async () => {
      const { mkdir, writeFile } = await import('fs/promises')
      vi.mocked(mkdir).mockResolvedValueOnce(undefined)
      vi.mocked(writeFile).mockResolvedValueOnce(undefined)
      await callHandler('create-project-db', '/fake/project')
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('project.db'),
        expect.any(Buffer)
      )
    })

    it('should return { success: false, error } when mkdir throws', async () => {
      const { mkdir } = await import('fs/promises')
      vi.mocked(mkdir).mockRejectedValueOnce(new Error('EACCES'))
      const result = await callHandler('create-project-db', '/fake/project') as {
        success: boolean; error?: string
      }
      expect(result.success).toBe(false)
      expect(result.error).toContain('EACCES')
    })

    it('T528: should throw when projectPath is not in allowed list', async () => {
      await expect(callHandler('create-project-db', '/unregistered/path')).rejects.toThrow('PROJECT_PATH_NOT_ALLOWED')
    })

    it('T687: GENERIC_AGENTS contains expected generic agents and no av-specific agents', async () => {
      const { GENERIC_AGENTS } = await import('./default-agents')
      const names = GENERIC_AGENTS.map((a) => a.name)
      expect(names).toContain('dev')
      expect(names).toContain('review')
      expect(names).toContain('test')
      expect(names).toContain('doc')
      expect(names).toContain('task-creator')
      expect(names).not.toContain('dev-front-vuejs')
      expect(names).not.toContain('dev-back-electron')
      expect(names).not.toContain('ux-front-vuejs')
    })

    it('T688: should copy agent scripts to <projectPath>/scripts/ on success', async () => {
      const { mkdir, writeFile, copyFile } = await import('fs/promises')
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(copyFile).mockResolvedValue(undefined)
      const result = await callHandler('create-project-db', '/fake/project') as {
        success: boolean; dbPath: string; scriptsCopied: number
      }
      expect(result.success).toBe(true)
      expect(result.scriptsCopied).toBe(5)
      expect(copyFile).toHaveBeenCalledTimes(5)
    })

    it('T688: should include scriptsCopied=5 in success response', async () => {
      const { mkdir, writeFile, copyFile } = await import('fs/promises')
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(copyFile).mockResolvedValue(undefined)
      const result = await callHandler('create-project-db', '/fake/project') as Record<string, unknown>
      expect(result).toHaveProperty('scriptsCopied', 5)
      expect(result).not.toHaveProperty('scriptsError')
    })

    it('T688: should return scriptsError (not fail) when script copy fails (permission denied)', async () => {
      const { mkdir, writeFile, copyFile } = await import('fs/promises')
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(copyFile).mockRejectedValueOnce(new Error('EACCES: permission denied'))
      const result = await callHandler('create-project-db', '/fake/project') as {
        success: boolean; dbPath: string; scriptsError?: string; scriptsCopied: number
      }
      expect(result.success).toBe(true)
      expect(result.dbPath).toContain('project.db')
      expect(result.scriptsError).toBeDefined()
      expect(result.scriptsError).toContain('EACCES')
    })

    it('T688: should use dev scripts path (app.isPackaged=false)', async () => {
      const { mkdir, writeFile, copyFile } = await import('fs/promises')
      const { app } = await import('electron')
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(copyFile).mockResolvedValue(undefined)
      vi.mocked(app.getAppPath).mockReturnValue('/fake/app')
      await callHandler('create-project-db', '/fake/project')
      const calls = vi.mocked(copyFile).mock.calls
      expect(calls.length).toBeGreaterThan(0)
      expect(String(calls[0][0])).toContain('scripts')
    })

    it('T688: AGENT_SCRIPTS exports exactly the 5 expected scripts', () => {
      expect(AGENT_SCRIPTS).toEqual([
        'dbq.js', 'dbw.js', 'dbstart.js', 'dblock.js', 'capture-tokens-hook.js'
      ])
    })
  })

  // ── project:exportZip ─────────────────────────────────────────────────────

  describe('project:exportZip handler (T771)', () => {
    it('should throw DB_PATH_NOT_ALLOWED for unregistered dbPath', async () => {
      await expect(
        callHandler('project:exportZip', '/unregistered/evil.db')
      ).rejects.toThrow('DB_PATH_NOT_ALLOWED')
    })

    it('should return { success: boolean } shape for registered dbPath (mocked fs)', async () => {
      const result = await callHandler('project:exportZip', '/fake/project.db') as { success: boolean; error?: string; path?: string }
      expect(result).toHaveProperty('success')
      expect(typeof result.success).toBe('boolean')
    })
  })
})
