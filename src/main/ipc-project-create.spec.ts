/**
 * Tests for ipc-project-create.ts
 *
 * Covers: AGENT_SCRIPTS contents, createProjectDb schema creation, default agent
 * insertion by language, scripts copy, return values, and error handling.
 *
 * Framework: Vitest (node environment)
 * Mocks: electron (app), fs/promises, better-sqlite3, ./db, ./db-daemon
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const mockMkdir = vi.hoisted(() => vi.fn())
const mockCopyFile = vi.hoisted(() => vi.fn())

const mockStmtRun = vi.hoisted(() => vi.fn())
const mockDbPrepare = vi.hoisted(() => vi.fn())
const mockDbExec = vi.hoisted(() => vi.fn())
const mockDbPragma = vi.hoisted(() => vi.fn())
const mockDbClose = vi.hoisted(() => vi.fn())
const MockDatabase = vi.hoisted(() => vi.fn())

const mockRegisterDbPath = vi.hoisted(() => vi.fn())
const mockStartDbDaemon = vi.hoisted(() => vi.fn())
const mockGetAppPath = vi.hoisted(() => vi.fn())

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('fs/promises', () => ({
  mkdir: mockMkdir,
  copyFile: mockCopyFile,
  default: { mkdir: mockMkdir, copyFile: mockCopyFile },
}))

vi.mock('better-sqlite3', () => ({
  default: MockDatabase,
}))

vi.mock('./db', () => ({
  registerDbPath: mockRegisterDbPath,
}))

vi.mock('./db-daemon', () => ({
  startDbDaemon: mockStartDbDaemon,
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: mockGetAppPath,
  },
}))

// ── Import module under test ───────────────────────────────────────────────────

const { AGENT_SCRIPTS, createProjectDb } = await import('./ipc-project-create')

// ── Helper: default mock setup ─────────────────────────────────────────────────

function setupDefaultMocks() {
  mockMkdir.mockResolvedValue(undefined)
  mockCopyFile.mockResolvedValue(undefined)
  mockStmtRun.mockReturnValue(undefined)
  mockDbPrepare.mockReturnValue({ run: mockStmtRun })
  MockDatabase.mockImplementation(function () {
    return {
      pragma: mockDbPragma,
      exec: mockDbExec,
      prepare: mockDbPrepare,
      close: mockDbClose,
    }
  })
  mockRegisterDbPath.mockReturnValue(undefined)
  mockStartDbDaemon.mockResolvedValue(undefined)
  mockGetAppPath.mockReturnValue('/fake/app')
}

// ── AGENT_SCRIPTS ──────────────────────────────────────────────────────────────

describe('AGENT_SCRIPTS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(AGENT_SCRIPTS)).toBe(true)
    expect(AGENT_SCRIPTS.length).toBeGreaterThan(0)
  })

  it('contains dbq.js', () => {
    expect(AGENT_SCRIPTS).toContain('dbq.js')
  })

  it('contains dbw.js', () => {
    expect(AGENT_SCRIPTS).toContain('dbw.js')
  })

  it('contains dbstart.js', () => {
    expect(AGENT_SCRIPTS).toContain('dbstart.js')
  })
})

// ── createProjectDb ────────────────────────────────────────────────────────────

describe('createProjectDb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  // ── Directory creation ─────────────────────────────────────────────────────

  it('creates .claude/ directory with recursive:true', async () => {
    await createProjectDb('/my/project', 'en')
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('.claude'),
      { recursive: true }
    )
  })

  it('creates scripts/ target directory with recursive:true', async () => {
    await createProjectDb('/my/project', 'en')
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('scripts'),
      { recursive: true }
    )
  })

  // ── DB initialization ──────────────────────────────────────────────────────

  it('sets pragma journal_mode = WAL', async () => {
    await createProjectDb('/my/project', 'en')
    expect(mockDbPragma).toHaveBeenCalledWith('journal_mode = WAL')
  })

  it('sets pragma foreign_keys = ON', async () => {
    await createProjectDb('/my/project', 'en')
    expect(mockDbPragma).toHaveBeenCalledWith('foreign_keys = ON')
  })

  it('executes schema SQL once', async () => {
    await createProjectDb('/my/project', 'en')
    expect(mockDbExec).toHaveBeenCalledOnce()
  })

  it('schema SQL contains CREATE TABLE agents', async () => {
    await createProjectDb('/my/project', 'en')
    const sql: string = mockDbExec.mock.calls[0][0]
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agents')
  })

  it('schema SQL contains CREATE TABLE sessions', async () => {
    await createProjectDb('/my/project', 'en')
    const sql: string = mockDbExec.mock.calls[0][0]
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS sessions')
  })

  it('schema SQL contains CREATE TABLE tasks', async () => {
    await createProjectDb('/my/project', 'en')
    const sql: string = mockDbExec.mock.calls[0][0]
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS tasks')
  })

  it('schema SQL contains CREATE TABLE agent_logs', async () => {
    await createProjectDb('/my/project', 'en')
    const sql: string = mockDbExec.mock.calls[0][0]
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_logs')
  })

  it('schema SQL contains CREATE TABLE task_comments', async () => {
    await createProjectDb('/my/project', 'en')
    const sql: string = mockDbExec.mock.calls[0][0]
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS task_comments')
  })

  it('schema SQL contains CREATE TABLE config', async () => {
    await createProjectDb('/my/project', 'en')
    const sql: string = mockDbExec.mock.calls[0][0]
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS config')
  })

  it('closes the DB after schema creation', async () => {
    await createProjectDb('/my/project', 'en')
    expect(mockDbClose).toHaveBeenCalledOnce()
  })

  it('calls registerDbPath with the project.db path', async () => {
    await createProjectDb('/my/project', 'en')
    expect(mockRegisterDbPath).toHaveBeenCalledOnce()
    expect(mockRegisterDbPath).toHaveBeenCalledWith(
      expect.stringContaining('project.db')
    )
  })

  // ── Default agent insertion ────────────────────────────────────────────────

  it('inserts default agents for language "en"', async () => {
    const { GENERIC_AGENTS_BY_LANG } = await import('./default-agents')
    await createProjectDb('/my/project', 'en')
    expect(mockStmtRun).toHaveBeenCalledTimes(GENERIC_AGENTS_BY_LANG['en'].length)
  })

  it('inserts default agents for language "fr"', async () => {
    const { GENERIC_AGENTS_BY_LANG } = await import('./default-agents')
    await createProjectDb('/my/project', 'fr')
    expect(mockStmtRun).toHaveBeenCalledTimes(GENERIC_AGENTS_BY_LANG['fr'].length)
  })

  it('inserts default agents for language "es"', async () => {
    const { GENERIC_AGENTS_BY_LANG } = await import('./default-agents')
    await createProjectDb('/my/project', 'es')
    expect(mockStmtRun).toHaveBeenCalledTimes(GENERIC_AGENTS_BY_LANG['es'].length)
  })

  // ── Scripts copy ───────────────────────────────────────────────────────────

  it('copies all AGENT_SCRIPTS files', async () => {
    await createProjectDb('/my/project', 'en')
    expect(mockCopyFile).toHaveBeenCalledTimes(AGENT_SCRIPTS.length)
  })

  it('copies each script by name', async () => {
    await createProjectDb('/my/project', 'en')
    for (const script of AGENT_SCRIPTS) {
      expect(mockCopyFile).toHaveBeenCalledWith(
        expect.stringContaining(script),
        expect.stringContaining(script)
      )
    }
  })

  it('copies scripts to <projectPath>/scripts/', async () => {
    await createProjectDb('/my/project', 'en')
    const destPaths = mockCopyFile.mock.calls.map((c) => c[1] as string)
    for (const dest of destPaths) {
      // Use path-agnostic check (Windows uses backslashes)
      expect(dest).toContain('project')
      expect(dest).toContain('scripts')
    }
  })

  // ── Return values ──────────────────────────────────────────────────────────

  it('returns success:true on happy path', async () => {
    const result = await createProjectDb('/my/project', 'en')
    expect(result.success).toBe(true)
  })

  it('returns dbPath pointing to .claude/project.db', async () => {
    const result = await createProjectDb('/my/project', 'en')
    expect(result.dbPath).toContain('.claude')
    expect(result.dbPath).toContain('project.db')
  })

  it('returns scriptsCopied equal to AGENT_SCRIPTS.length', async () => {
    const result = await createProjectDb('/my/project', 'en')
    expect(result.scriptsCopied).toBe(AGENT_SCRIPTS.length)
  })

  it('does not include scriptsError on happy path', async () => {
    const result = await createProjectDb('/my/project', 'en')
    expect(result.scriptsError).toBeUndefined()
  })

  // ── Error handling ─────────────────────────────────────────────────────────

  it('returns success:false and error string when mkdir for .claude/ fails', async () => {
    mockMkdir.mockRejectedValueOnce(new Error('ENOENT: no such directory'))
    const result = await createProjectDb('/invalid/path', 'en')
    expect(result.success).toBe(false)
    expect(result.error).toContain('ENOENT')
    expect(result.dbPath).toBe('')
  })

  it('returns success:false and error string when Database constructor throws', async () => {
    MockDatabase.mockImplementationOnce(function () {
      throw new Error('SQLITE_CANTOPEN: unable to open database')
    })
    const result = await createProjectDb('/my/project', 'en')
    expect(result.success).toBe(false)
    expect(result.error).toContain('SQLITE_CANTOPEN')
    expect(result.dbPath).toBe('')
  })

  it('returns success:true + scriptsError when copyFile fails, DB creation succeeds', async () => {
    mockCopyFile.mockRejectedValue(new Error('EPERM: operation not permitted'))
    const result = await createProjectDb('/my/project', 'en')
    expect(result.success).toBe(true)
    expect(result.scriptsError).toContain('EPERM')
  })

  it('returns success:true + scriptsCopied:0 when first copyFile fails immediately', async () => {
    mockCopyFile.mockRejectedValue(new Error('EPERM: copy failed'))
    const result = await createProjectDb('/my/project', 'en')
    expect(result.success).toBe(true)
    expect(result.scriptsCopied).toBe(0)
  })
})
