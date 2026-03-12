/**
 * ipc-fs-3.spec.ts — Security & handler coverage
 *
 * Kills critical surviving mutants from T1315:
 * - L58 ConditionalExpression: `isPathAllowed()` guard
 * - L75-161 NoCoverage: `fs:listDir` and `fs:readFile` handlers
 *
 * Framework: Vitest (node environment)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Dirent } from 'fs'
import { sep } from 'path'

// ── Mocks (must come before any imports from the module under test) ────────────

vi.mock('fs/promises', () => {
  const readdir = vi.fn().mockResolvedValue([])
  const readFile = vi.fn().mockResolvedValue('file content')
  const writeFile = vi.fn().mockResolvedValue(undefined)
  return {
    default: { readdir, readFile, writeFile },
    readdir,
    readFile,
    writeFile,
  }
})

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

vi.mock('./db', () => ({
  assertProjectPathAllowed: vi.fn(),
}))

import { readdir, readFile } from 'fs/promises'
import { ipcMain } from 'electron'
import { assertProjectPathAllowed } from './db'
import { isPathAllowed, registerFsHandlers } from './ipc-fs'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDirent(name: string, isDirectory: boolean): Dirent {
  return {
    name,
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: '/mock',
    parentPath: '/mock',
  } as unknown as Dirent
}

function dir(name: string) { return makeDirent(name, true) }
function file(name: string) { return makeDirent(name, false) }

/**
 * Extract a registered IPC handler by channel name.
 * ipcMain.handle is mocked; each call registers a handler.
 * We call registerFsHandlers() once and capture them.
 */
function getHandlers(): Record<string, Function> {
  const handlers: Record<string, Function> = {}
  vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn: Function) => {
    handlers[channel] = fn
    return undefined as any
  })
  registerFsHandlers()
  return handlers
}

// ── isPathAllowed — ConditionalExpression mutation kill (L58) ─────────────────

describe('isPathAllowed — path boundary security (kills L58 mutant)', () => {
  it('returns true for path exactly equal to allowedDir', () => {
    expect(isPathAllowed('/project', '/project')).toBe(true)
  })

  it('returns true for path inside allowedDir (subdir)', () => {
    expect(isPathAllowed('/project/src', '/project')).toBe(true)
  })

  it('returns true for deeply nested path inside allowedDir', () => {
    expect(isPathAllowed('/project/src/main/ipc.ts', '/project')).toBe(true)
  })

  it('returns false for path outside allowedDir', () => {
    expect(isPathAllowed('/etc/passwd', '/project')).toBe(false)
  })

  it('returns false for path with ../ traversal resolved outside allowedDir', () => {
    // resolve() normalizes so /project/../etc/passwd => /etc/passwd
    expect(isPathAllowed('/project/../etc/passwd', '/project')).toBe(false)
  })

  it('returns false for sibling directory sharing a prefix (separator boundary — T318)', () => {
    // /project-evil must NOT match allowedDir=/project
    expect(isPathAllowed('/project-evil', '/project')).toBe(false)
  })

  it('returns false for sibling directory sharing prefix with file separator', () => {
    // e.g. /projects/foo must NOT be allowed if allowedDir=/project
    expect(isPathAllowed('/projects/foo', '/project')).toBe(false)
  })

  it('returns true for path containing allowedDir as exact prefix with sep', () => {
    // Ensure sep boundary: /project/x is allowed when allowedDir=/project
    const allowed = '/project'
    const subPath = '/project' + sep + 'x'
    expect(isPathAllowed(subPath, allowed)).toBe(true)
  })
})

// ── fs:listDir handler — NoCoverage kill (L75-92) ─────────────────────────────

describe('fs:listDir handler — security & error paths', () => {
  let handlers: Record<string, Function>
  const fakeEvent = {}

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(assertProjectPathAllowed).mockReturnValue(undefined) // allow by default
    handlers = getHandlers()
  })

  it('returns [] when allowedDir is missing (empty string)', async () => {
    const result = await handlers['fs:listDir'](fakeEvent, '/project/src', '')
    expect(result).toEqual([])
  })

  it('returns [] when assertProjectPathAllowed throws (dir not in allowlist)', async () => {
    vi.mocked(assertProjectPathAllowed).mockImplementation(() => { throw new Error('not allowed') })
    const result = await handlers['fs:listDir'](fakeEvent, '/project/src', '/project')
    expect(result).toEqual([])
  })

  it('returns [] when dirPath contains .. (path traversal)', async () => {
    const result = await handlers['fs:listDir'](fakeEvent, '/project/../etc', '/project')
    expect(result).toEqual([])
  })

  it('returns [] when dirPath is outside allowedDir (sandbox violation)', async () => {
    const result = await handlers['fs:listDir'](fakeEvent, '/etc/passwd', '/project')
    expect(result).toEqual([])
  })

  it('returns directory entries for valid path inside allowedDir', async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      dir('components'),
      file('main.ts'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)

    const result = await handlers['fs:listDir'](fakeEvent, '/project/src', '/project')

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ name: 'components', isDir: true })
    expect(result[1]).toMatchObject({ name: 'main.ts', isDir: false })
  })

  it('returns [] when dirPath does not exist (readdir error)', async () => {
    vi.mocked(readdir).mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    const result = await handlers['fs:listDir'](fakeEvent, '/project/nonexistent', '/project')

    expect(result).toEqual([])
  })

  it('blocks sibling path sharing a prefix (separator boundary)', async () => {
    // /project-evil is NOT inside /project
    const result = await handlers['fs:listDir'](fakeEvent, '/project-evil', '/project')
    expect(result).toEqual([])
  })
})

// ── fs:readFile handler — NoCoverage kill (L100-123) ─────────────────────────

describe('fs:readFile handler — security & error paths', () => {
  let handlers: Record<string, Function>
  const fakeEvent = {}

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(assertProjectPathAllowed).mockReturnValue(undefined)
    handlers = getHandlers()
  })

  it('returns error when allowedDir is missing', async () => {
    const result = await handlers['fs:readFile'](fakeEvent, '/project/README.md', '')
    expect(result).toMatchObject({ success: false })
    expect(result.error).toBeDefined()
  })

  it('returns error when assertProjectPathAllowed throws', async () => {
    vi.mocked(assertProjectPathAllowed).mockImplementation(() => { throw new Error('not allowed') })
    const result = await handlers['fs:readFile'](fakeEvent, '/project/README.md', '/project')
    expect(result).toMatchObject({ success: false })
  })

  it('returns error when filePath contains .. (path traversal)', async () => {
    const result = await handlers['fs:readFile'](fakeEvent, '/project/../etc/passwd', '/project')
    expect(result).toMatchObject({ success: false, error: 'Path traversal not allowed' })
  })

  it('returns error when filePath is outside allowedDir (sandbox violation)', async () => {
    const result = await handlers['fs:readFile'](fakeEvent, '/etc/passwd', '/project')
    expect(result).toMatchObject({ success: false, error: 'Path not in allowed directory' })
  })

  it('returns success with content for valid file inside allowedDir', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('hello world' as any)

    const result = await handlers['fs:readFile'](fakeEvent, '/project/README.md', '/project')

    expect(result).toMatchObject({ success: true, content: 'hello world' })
  })

  it('returns error when readFile throws (file does not exist)', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }))

    const result = await handlers['fs:readFile'](fakeEvent, '/project/missing.ts', '/project')

    expect(result).toMatchObject({ success: false })
    expect(result.error).toContain('ENOENT')
  })

  it('blocks sibling path sharing a prefix (separator boundary — T318)', async () => {
    const result = await handlers['fs:readFile'](fakeEvent, '/project-evil/secret.ts', '/project')
    expect(result).toMatchObject({ success: false, error: 'Path not in allowed directory' })
  })
})
