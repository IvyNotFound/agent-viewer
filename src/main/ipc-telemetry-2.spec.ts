/**
 * Tests for ipc-telemetry.ts — registerTelemetryHandlers / telemetry:scan — Part 2
 *
 * Framework: Vitest (node environment — configured via environmentMatchGlobs)
 *
 * Strategy: mock fs/promises (readdir + readFile) and ipcMain so the scanner
 * runs without touching the real filesystem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Dirent } from 'fs'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('fs/promises', () => {
  const readdir = vi.fn().mockResolvedValue([])
  const readFile = vi.fn().mockResolvedValue('')
  return { default: { readdir, readFile }, readdir, readFile }
})

vi.mock('./db', () => ({
  assertProjectPathAllowed: vi.fn(),
}))

vi.mock('worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('worker_threads')>()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('events')
  class MockWorker extends EventEmitter {
    constructor(_p: string, opts: { workerData: { projectPath: string } }) {
      super()
      import('./telemetry-scanner').then(({ scanProject }) =>
        scanProject(opts.workerData.projectPath).then(
          (r) => { this.emit('message', { data: r }); this.emit('exit', 0) },
          (e: unknown) => { this.emit('message', { error: (e as Error).message }); this.emit('exit', 1) },
        ),
      )
    }
  }
  return { ...actual, Worker: MockWorker, default: { ...actual, Worker: MockWorker } }
})

// Capture the handler registered via ipcMain.handle so tests can invoke it.
type IpcHandler = (_event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown
const registeredHandlers: Record<string, IpcHandler> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      registeredHandlers[channel] = handler
    }),
  },
}))

import { readdir, readFile } from 'fs/promises'
import { registerTelemetryHandlers } from './ipc-telemetry'

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

/** Queue a .gitignore readFile result. No arg = ENOENT (fallback exclusions). */
function mockGitignore(content?: string): void {
  if (content !== undefined) {
    vi.mocked(readFile).mockResolvedValueOnce(content)
  } else {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'))
  }
}

// Fake IPC event (unused by implementation but required by ipcMain.handle signature)
const fakeEvent = {} as Electron.IpcMainInvokeEvent

// ── Setup ─────────────────────────────────────────────────────────────────────

// Register handlers once before all tests.
registerTelemetryHandlers()

const scan = (projectPath: string) => registeredHandlers['telemetry:scan'](fakeEvent, projectPath)

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('telemetry:scan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── 12. Test file detection by .test. name ────────────────────────────────

  it('detects .test.js files as test files', async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      file('utils.test.js'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)

    mockGitignore()
    vi.mocked(readFile).mockResolvedValueOnce('a\nb')

    const result = await scan('/project')

    expect(result.totalTestFiles).toBe(1)
    expect(result.totalSourceFiles).toBe(0)
    expect(result.totalTestLines).toBe(2)
    expect(result.totalSourceLines).toBe(0)
  })

  // ── 13. Test file detection by __tests__ directory ────────────────────────

  it('detects files in __tests__ directory as test files', async () => {
    vi.mocked(readdir)
      .mockResolvedValueOnce([
        dir('__tests__'),
        file('main.ts'),
      ] as unknown as Awaited<ReturnType<typeof readdir>>)
      .mockResolvedValueOnce([
        file('helper.ts'),
      ] as unknown as Awaited<ReturnType<typeof readdir>>)

    // __tests__ dir is iterated first → helper.ts read before main.ts
    mockGitignore()
    vi.mocked(readFile)
      .mockResolvedValueOnce('x\ny')     // __tests__/helper.ts → test (2 lines)
      .mockResolvedValueOnce('a\nb\nc')  // main.ts → source (3 lines)

    const result = await scan('/project')

    expect(result.totalSourceFiles).toBe(1)
    expect(result.totalTestFiles).toBe(1)
    expect(result.totalSourceLines).toBe(3)
    expect(result.totalTestLines).toBe(2)
  })

  // ── 14. Blank and comment line counting ───────────────────────────────────

  it('counts blank and comment lines correctly', async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      file('app.ts'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)

    // 1 blank, 2 comment, 2 code lines
    mockGitignore()
    vi.mocked(readFile).mockResolvedValueOnce(
      'const x = 1\n// comment\n\n/* block */\nconst y = 2',
    )

    const result = await scan('/project')

    expect(result.totalBlankLines).toBe(1)
    expect(result.totalCommentLines).toBe(2)
    expect(result.totalCodeLines).toBe(2)
    expect(result.totalLines).toBe(5)

    const ts = result.languages.find((l: { name: string }) => l.name === 'TypeScript')
    expect(ts!.blankLines).toBe(1)
    expect(ts!.commentLines).toBe(2)
    expect(ts!.codeLines).toBe(2)
  })

  // ── 15. testRatio = 0 when no test files ──────────────────────────────────

  it('returns testRatio = 0 when there are no test files', async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      file('main.ts'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)

    mockGitignore()
    vi.mocked(readFile).mockResolvedValueOnce('a\nb\nc')

    const result = await scan('/project')

    expect(result.testRatio).toBe(0)
    expect(result.totalTestFiles).toBe(0)
    expect(result.totalSourceFiles).toBe(1)
  })

  // ── 16. per-language source/test breakdown ────────────────────────────────

  it('tracks source/test breakdown per language', async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      file('a.ts'),
      file('a.spec.ts'),
      file('b.vue'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)

    mockGitignore()
    vi.mocked(readFile)
      .mockResolvedValueOnce('a\nb\nc\nd\ne')  // a.ts → 5 source
      .mockResolvedValueOnce('x\ny')            // a.spec.ts → 2 test
      .mockResolvedValueOnce('1\n2\n3')         // b.vue → 3 source

    const result = await scan('/project')

    const ts = result.languages.find((l: { name: string }) => l.name === 'TypeScript')
    expect(ts!.sourceFiles).toBe(1)
    expect(ts!.testFiles).toBe(1)
    expect(ts!.sourceLines).toBe(5)
    expect(ts!.testLines).toBe(2)

    const vue = result.languages.find((l: { name: string }) => l.name === 'Vue')
    expect(vue!.sourceFiles).toBe(1)
    expect(vue!.testFiles).toBe(0)
  })

  // ── 17. Security: assertProjectPathAllowed rejects disallowed paths ─────

  it('rejects when assertProjectPathAllowed throws', async () => {
    const { assertProjectPathAllowed } = await import('./db')
    vi.mocked(assertProjectPathAllowed).mockImplementationOnce(() => {
      throw new Error('PROJECT_PATH_NOT_ALLOWED: /evil')
    })

    await expect(scan('/evil')).rejects.toThrow('PROJECT_PATH_NOT_ALLOWED')
  })

  // ── 18. .gitignore patterns are respected ─────────────────────────────────

  it('ignores directories listed in .gitignore', async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      dir('.claude'),
      dir('src'),
      file('index.ts'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)
    // src/ subdir
    vi.mocked(readdir).mockResolvedValueOnce([
      file('app.ts'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)

    mockGitignore('.claude/worktrees/\nnode_modules\ndist\n')
    vi.mocked(readFile)
      .mockResolvedValueOnce('a\nb')     // index.ts
      .mockResolvedValueOnce('x\ny\nz')  // src/app.ts

    const result = await scan('/project')

    // .claude/ is NOT fully ignored — only .claude/worktrees/ is
    // But .claude itself has no matching files (readdir not mocked for it)
    // src/ is not ignored → recurses
    expect(result.totalFiles).toBe(2)
    expect(result.totalLines).toBe(5)
  })

  // ── 19. .claude/worktrees/ ignored via .gitignore ─────────────────────────

  it('ignores .claude/worktrees/ when listed in .gitignore', async () => {
    vi.mocked(readdir)
      .mockResolvedValueOnce([
        dir('.claude'),
        file('main.ts'),
      ] as unknown as Awaited<ReturnType<typeof readdir>>)
      .mockResolvedValueOnce([
        dir('worktrees'),
        file('config.yaml'),  // not in LANGUAGE_MAP → skipped
      ] as unknown as Awaited<ReturnType<typeof readdir>>)
      // worktrees/ should NOT be entered — no further readdir needed

    mockGitignore('.claude/worktrees/\n')
    vi.mocked(readFile)
      .mockResolvedValueOnce('line1')   // main.ts

    const result = await scan('/project')

    // main.ts counted, config.yaml not in LANGUAGE_MAP → skipped, worktrees/ ignored
    expect(result.totalFiles).toBe(1)
    expect(result.totalLines).toBe(1)
    // readdir: root + .claude/ = 2 (worktrees/ never entered)
    expect(readdir).toHaveBeenCalledTimes(2)
  })

  // ── 20. Fallback exclusions when no .gitignore ────────────────────────────

  it('falls back to default exclusions when .gitignore is missing', async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      dir('node_modules'),
      dir('dist'),
      dir('src'),
      file('main.ts'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)
    vi.mocked(readdir).mockResolvedValueOnce([
      file('app.ts'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)

    // No .gitignore → fallback
    mockGitignore()
    vi.mocked(readFile)
      .mockResolvedValueOnce('a')     // main.ts
      .mockResolvedValueOnce('b\nc')  // src/app.ts

    const result = await scan('/project')

    // node_modules and dist are in fallback exclusions → skipped
    // src/ is not → recursed
    expect(result.totalFiles).toBe(2)
    expect(result.totalLines).toBe(3)
  })

  // ── 21. node_modules ignored via .gitignore ───────────────────────────────

  it('ignores node_modules when listed in .gitignore', async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      dir('node_modules'),
      file('app.ts'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)

    mockGitignore('node_modules\n')
    vi.mocked(readFile).mockResolvedValueOnce('code')  // app.ts

    const result = await scan('/project')

    expect(readdir).toHaveBeenCalledTimes(1)
    expect(result.totalFiles).toBe(1)
  })

  // ── 22. Non-ignored file is counted (regression guard) ────────────────────

  it('counts files not matching any ignore pattern', async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      dir('src'),
      file('README.md'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)
    vi.mocked(readdir).mockResolvedValueOnce([
      file('index.ts'),
      file('utils.py'),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)

    mockGitignore('node_modules\ndist\n')
    vi.mocked(readFile)
      .mockResolvedValueOnce('# readme')    // README.md
      .mockResolvedValueOnce('const a = 1') // src/index.ts
      .mockResolvedValueOnce('x = 1')       // src/utils.py

    const result = await scan('/project')

    expect(result.totalFiles).toBe(3)
    expect(result.languages).toHaveLength(3)
    expect(result.languages.map((l: { name: string }) => l.name).sort())
      .toEqual(['Markdown', 'Python', 'TypeScript'])
  })
})
