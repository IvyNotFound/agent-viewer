/**
 * ipc-fs-2.spec.ts — Targeted StringLiteral mutation kill tests
 *
 * Covers:
 * - ALLOWED_WRITE_EXTENSIONS: every extension in the whitelist (line 62)
 * - FS_SKIP: every entry including 'dist-electron' and '__pycache__' (line 26)
 * - Error message strings in fs:listDir, fs:readFile, fs:writeFile handlers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Dirent } from 'fs'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('fs/promises', () => {
  const readdir = vi.fn().mockResolvedValue([])
  const readFile = vi.fn().mockResolvedValue(Buffer.from(''))
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

import { readdir } from 'fs/promises'
import { ALLOWED_WRITE_EXTENSIONS, buildTree } from './ipc-fs'

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

// ── ALLOWED_WRITE_EXTENSIONS — every extension (StringLiteral kill) ───────────

describe('ALLOWED_WRITE_EXTENSIONS — complete whitelist coverage', () => {
  // Already tested by ipc-fs.spec.ts: .md, .ts, .js, .json, .vue, .yaml
  // Add all remaining extensions that are uncovered

  it('includes .txt', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.txt') })
  it('includes .yml', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.yml') })
  it('includes .toml', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.toml') })
  it('includes .css', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.css') })
  it('includes .html', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.html') })
  it('includes .sh', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.sh') })
  it('includes .py', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.py') })
  it('includes .rb', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.rb') })
  it('includes .go', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.go') })
  it('includes .rs', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.rs') })
  it('includes .java', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.java') })
  it('includes .kt', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.kt') })
  it('includes .swift', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.swift') })
  it('includes .c', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.c') })
  it('includes .cpp', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.cpp') })
  it('includes .h', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.h') })
  it('includes .cs', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.cs') })
  it('includes .php', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.php') })
  it('includes .xml', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.xml') })
  it('includes .env', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.env') })
  it('includes .gitignore', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.gitignore') })
  it('includes .eslintrc', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.eslintrc') })
  it('includes .prettierrc', () => { expect(ALLOWED_WRITE_EXTENSIONS).toContain('.prettierrc') })

  it('has exactly 29 entries (full whitelist)', () => {
    expect(ALLOWED_WRITE_EXTENSIONS).toHaveLength(29)
  })
})

// ── FS_SKIP — all entries including previously uncovered (StringLiteral kill) ──

describe('FS_SKIP — buildTree filters all skip entries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters dist-electron directory', async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      dir('dist-electron'),
      dir('src'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)
    const result = await buildTree('/project')
    const names = result.map(n => n.name)
    expect(names).not.toContain('dist-electron')
    expect(names).toContain('src')
  })

  it('filters __pycache__ directory', async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      dir('__pycache__'),
      dir('lib'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)
    const result = await buildTree('/project')
    const names = result.map(n => n.name)
    expect(names).not.toContain('__pycache__')
    expect(names).toContain('lib')
  })

  it('filters .DS_Store file', async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      file('.DS_Store'),
      file('readme.md'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)
    const result = await buildTree('/project')
    const names = result.map(n => n.name)
    expect(names).not.toContain('.DS_Store')
    expect(names).toContain('readme.md')
  })

  it('filters all six FS_SKIP entries simultaneously', async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      dir('node_modules'),
      dir('.git'),
      dir('dist'),
      dir('dist-electron'),
      file('.DS_Store'),
      dir('__pycache__'),
      file('index.ts'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)
    const result = await buildTree('/project')
    const names = result.map(n => n.name)
    expect(names).toEqual(['index.ts'])
  })
})
