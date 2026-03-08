/**
 * Tests for DB-related IPC handlers — fs:writeFile, fs:readFile, fs:listDir,
 * and addDefaultLimit utility.
 *
 * Continuation of ipc-db.spec.ts (split for file size).
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

// ── Import addDefaultLimit for unit testing ───────────────────────────────────
import { addDefaultLimit } from './ipc-db'

// ── Import ipc.ts AFTER mocks ─────────────────────────────────────────────────
import { registerIpcHandlers, registerDbPath, registerProjectPath } from './ipc'

// Helper to call a captured handler
async function callHandler(channel: string, ...args: unknown[]) {
  const handler = handlers[channel]
  if (!handler) throw new Error(`Handler not found: ${channel}. Available: ${Object.keys(handlers).join(', ')}`)
  return handler(null, ...args)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('IPC DB handlers — fs security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mockedQueryLive).mockRejectedValue(new Error('file is not a database'))
    registerIpcHandlers()
    registerDbPath('/fake/project.db')
    registerDbPath('/fake/db')
    registerProjectPath('/fake/project')
    registerProjectPath('/empty/project')
    registerProjectPath('/my/project')
    registerProjectPath('/home/user/project')
    registerProjectPath('/allowed')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── fs:writeFile — path security (isPathAllowed) ──────────────────────────

  describe('fs:writeFile — path security (isPathAllowed)', () => {
    const allowedDir = '/home/user/project'

    it('should allow writing a file within allowedDir', async () => {
      const filePath = '/home/user/project/src/file.ts'
      const result = await callHandler('fs:writeFile', filePath, 'content', allowedDir)
      expect(result).toMatchObject({ success: true })
    })

    it('should block path traversal via ..', async () => {
      const filePath = '/home/user/project/../../../etc/passwd'
      const result = await callHandler('fs:writeFile', filePath, 'content', allowedDir)
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('Path traversal') })
    })

    it('should block path outside allowedDir', async () => {
      const filePath = '/home/other-user/secret.txt'
      const result = await callHandler('fs:writeFile', filePath, 'content', allowedDir)
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('not in allowed directory') })
    })

    it('should block prefix bypass (T318: /project-evil vs /project)', async () => {
      const filePath = '/home/user/project-evil/exploit.sh'
      const result = await callHandler('fs:writeFile', filePath, 'content', allowedDir)
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('not in allowed directory') })
    })

    it('should block writing to .ssh directory (T531: extension whitelist)', async () => {
      const filePath = '/home/user/project/.ssh/authorized_keys'
      const result = await callHandler('fs:writeFile', filePath, 'content', allowedDir)
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('File type not allowed') })
    })

    it('should block writing to .bashrc (T531: extension whitelist)', async () => {
      const filePath = '/home/user/project/.bashrc'
      const result = await callHandler('fs:writeFile', filePath, 'content', allowedDir)
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('File type not allowed') })
    })

    it('should block writing to /etc/ paths', async () => {
      const filePath = '/etc/hosts'
      const result = await callHandler('fs:writeFile', filePath, 'content', allowedDir)
      expect(result).toMatchObject({ success: false })
    })

    it('T531: should block .npmrc (previously uncovered by blacklist)', async () => {
      const filePath = '/home/user/project/.npmrc'
      const result = await callHandler('fs:writeFile', filePath, 'content', allowedDir)
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('File type not allowed') })
    })

    it('T531: should block .gitconfig (previously uncovered by blacklist)', async () => {
      const filePath = '/home/user/project/.gitconfig'
      const result = await callHandler('fs:writeFile', filePath, 'content', allowedDir)
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('File type not allowed') })
    })

    it('T531: should allow writing .ts files within allowedDir', async () => {
      const filePath = '/home/user/project/src/component.ts'
      const result = await callHandler('fs:writeFile', filePath, 'content', allowedDir)
      expect(result).toMatchObject({ success: true })
    })

    it('should reject write when allowedDir is missing (undefined)', async () => {
      const filePath = 'relative/path/file.txt'
      const result = await callHandler('fs:writeFile', filePath, 'content', undefined)
      expect(result).toMatchObject({ success: false })
    })
  })

  // ── fs:readFile ───────────────────────────────────────────────────────────

  describe('fs:readFile — path security', () => {
    it('should block path traversal via ..', async () => {
      const result = await callHandler('fs:readFile', '../../../etc/passwd', '/allowed')
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('Path traversal') })
    })

    it('should block file outside allowedDir', async () => {
      const result = await callHandler('fs:readFile', '/etc/passwd', '/home/user/project')
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('not in allowed directory') })
    })

    it('should return file content on success', async () => {
      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockResolvedValueOnce('file content' as unknown as Buffer<ArrayBuffer>)
      const result = await callHandler('fs:readFile', '/allowed/file.txt', '/allowed') as { success: boolean; content: string }
      expect(result.success).toBe(true)
      expect(result.content).toBe('file content')
    })

    it('should return error object when file does not exist', async () => {
      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT: no such file'))
      const result = await callHandler('fs:readFile', '/allowed/missing.txt', '/allowed')
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('ENOENT') })
    })
  })

  // ── fs:listDir ────────────────────────────────────────────────────────────

  describe('fs:listDir — path security', () => {
    it('should block path traversal via ..', async () => {
      const result = await callHandler('fs:listDir', '../../../etc', '/allowed')
      expect(result).toEqual([])
    })

    it('should block directory outside allowedDir', async () => {
      const result = await callHandler('fs:listDir', '/other/path', '/allowed/project')
      expect(result).toEqual([])
    })
  })
})

// ── addDefaultLimit (T1136) ─────────────────────────────────────────────────

describe('addDefaultLimit', () => {
  it('should append LIMIT 1000 to SELECT without LIMIT', () => {
    expect(addDefaultLimit('SELECT * FROM tasks')).toBe('SELECT * FROM tasks LIMIT 1000')
  })

  it('should not modify queries that already have LIMIT', () => {
    expect(addDefaultLimit('SELECT * FROM tasks LIMIT 50')).toBe('SELECT * FROM tasks LIMIT 50')
  })

  it('should be case-insensitive for existing LIMIT', () => {
    expect(addDefaultLimit('SELECT * FROM tasks limit 10')).toBe('SELECT * FROM tasks limit 10')
  })

  it('should strip trailing semicolons before appending', () => {
    expect(addDefaultLimit('SELECT * FROM tasks;')).toBe('SELECT * FROM tasks LIMIT 1000')
  })

  it('should not modify non-SELECT statements', () => {
    expect(addDefaultLimit('PRAGMA user_version')).toBe('PRAGMA user_version')
  })

  it('should accept a custom limit value', () => {
    expect(addDefaultLimit('SELECT id FROM logs', 500)).toBe('SELECT id FROM logs LIMIT 500')
  })

  it('should not add LIMIT to SELECT with subquery containing LIMIT', () => {
    const sql = 'SELECT * FROM tasks WHERE id IN (SELECT id FROM logs LIMIT 5)'
    expect(addDefaultLimit(sql)).toBe(sql)
  })
})
