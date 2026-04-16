/**
 * Tests for DB infrastructure — src/main/db.ts (T1157)
 *
 * Covers: connection pool, clearDbCacheEntry, registerDbPath/assertDbPathAllowed,
 * registerProjectPath/assertProjectPathAllowed, writeDb, queryLive,
 * migrateDb, FORBIDDEN_WRITE_PATTERN.
 *
 * Framework: Vitest (node environment)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve } from 'path'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAcquireWriteLock = vi.fn().mockResolvedValue('/test/project.db.wlock')
const mockReleaseWriteLock = vi.fn().mockResolvedValue(undefined)

vi.mock('./db-lock', () => ({
  acquireWriteLock: (...args: unknown[]) => mockAcquireWriteLock(...args),
  releaseWriteLock: (...args: unknown[]) => mockReleaseWriteLock(...args),
}))

const mockCopyFile = vi.fn().mockResolvedValue(undefined)
const mockUnlink = vi.fn().mockResolvedValue(undefined)

vi.mock('fs/promises', () => ({
  default: {
    copyFile: (...args: unknown[]) => mockCopyFile(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
  copyFile: (...args: unknown[]) => mockCopyFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}))

// Mock migration module — db.ts delegates all migration logic to migration.ts
const mockApplyMigrations = vi.fn(() => 0)

vi.mock('./migration', () => ({
  migrateDb: (...args: unknown[]) => mockApplyMigrations(...args),
  CURRENT_SCHEMA_VERSION: 19,
}))

// Mock better-sqlite3
const mockPragma = vi.fn().mockReturnValue('wal')
const mockPrepare = vi.fn()
const mockExec = vi.fn()
const mockClose = vi.fn()

const mockDbInstance = {
  pragma: mockPragma,
  prepare: mockPrepare,
  exec: mockExec,
  close: mockClose,
}

vi.mock('better-sqlite3', () => ({
  default: function MockDatabase() { return mockDbInstance },
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import {
  clearDbCacheEntry,
  registerDbPath,
  assertDbPathAllowed,
  registerProjectPath,
  assertProjectPathAllowed,
  assertTranscriptPathAllowed,
  writeDb,
  queryLive,
  FORBIDDEN_WRITE_PATTERN,
  MAX_POOL_SIZE,
} from './db'

// ── Tests ─────────────────────────────────────────────────────────────────────

// ── registerDbPath / assertDbPathAllowed ──────────────────────────────────────

describe('registerDbPath / assertDbPathAllowed (T282)', () => {
  it('should allow a registered path', () => {
    const p = '/tmp/test-register-db-' + Date.now() + '.db'
    registerDbPath(p)
    expect(() => assertDbPathAllowed(p)).not.toThrow()
  })

  it('should throw on unregistered path', () => {
    expect(() => assertDbPathAllowed('/never/registered.db'))
      .toThrow('DB_PATH_NOT_ALLOWED')
  })

  it('should resolve paths before comparing', () => {
    const p = '/tmp/./foo/../bar.db'
    registerDbPath(p)
    // resolve normalizes the path
    expect(() => assertDbPathAllowed(resolve(p))).not.toThrow()
  })

  it('should ignore null/undefined input to registerDbPath', () => {
    // Should not throw
    registerDbPath(null)
    registerDbPath(undefined)
  })

  it('should throw on empty string', () => {
    expect(() => assertDbPathAllowed('')).toThrow('DB_PATH_NOT_ALLOWED')
  })
})

// ── registerProjectPath / assertProjectPathAllowed ───────────────────────────

describe('registerProjectPath / assertProjectPathAllowed (T283)', () => {
  it('should allow a registered project path', () => {
    const p = '/tmp/test-project-' + Date.now()
    registerProjectPath(p)
    expect(() => assertProjectPathAllowed(p)).not.toThrow()
  })

  it('should throw on unregistered project path', () => {
    expect(() => assertProjectPathAllowed('/never/registered/project'))
      .toThrow('PROJECT_PATH_NOT_ALLOWED')
  })

  it('should resolve paths before comparing', () => {
    const p = '/tmp/./proj/../proj-resolved'
    registerProjectPath(p)
    expect(() => assertProjectPathAllowed(resolve(p))).not.toThrow()
  })

  it('should ignore null/undefined input to registerProjectPath', () => {
    registerProjectPath(null)
    registerProjectPath(undefined)
  })

  it('should throw on empty string', () => {
    expect(() => assertProjectPathAllowed('')).toThrow('PROJECT_PATH_NOT_ALLOWED')
  })
})

// ── assertTranscriptPathAllowed (T1871) ──────────────────────────────────────

describe('assertTranscriptPathAllowed (T1871)', () => {
  it('allows transcript within cwd', () => {
    expect(() => assertTranscriptPathAllowed('/project/transcripts/session.jsonl', '/project')).not.toThrow()
  })

  it('allows transcript within ~/.claude/', () => {
    const home = require('os').homedir()
    const claudePath = require('path').join(home, '.claude', 'projects', 'abc', 'transcript.jsonl')
    expect(() => assertTranscriptPathAllowed(claudePath, '/some/project')).not.toThrow()
  })

  it('rejects transcript outside cwd and ~/.claude/', () => {
    expect(() => assertTranscriptPathAllowed('/etc/passwd', '/project'))
      .toThrow('TRANSCRIPT_PATH_NOT_ALLOWED')
  })

  it('rejects path traversal via ..', () => {
    expect(() => assertTranscriptPathAllowed('/project/../etc/passwd', '/project'))
      .toThrow('TRANSCRIPT_PATH_NOT_ALLOWED')
  })

  it('rejects cwd prefix attack (cwd=/tmp matching /tmp-evil/file)', () => {
    expect(() => assertTranscriptPathAllowed('/tmp-evil/file.jsonl', '/tmp'))
      .toThrow('TRANSCRIPT_PATH_NOT_ALLOWED')
  })
})

// ── writeDb ──────────────────────────────────────────────────────────────────

describe('writeDb (T1157)', () => {
  const dbPath = '/test/write-test.db'

  beforeEach(() => {
    vi.clearAllMocks()
    clearDbCacheEntry(dbPath)
    mockAcquireWriteLock.mockResolvedValue(dbPath + '.wlock')
    mockReleaseWriteLock.mockResolvedValue(undefined)
  })

  it('should call fn with a MigrationDb adapter and return result', async () => {
    const fn = vi.fn(() => 'result-value')
    const result = await writeDb(dbPath, fn)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(result).toBe('result-value')
    // Should acquire cross-process lock before write
    expect(mockAcquireWriteLock).toHaveBeenCalledWith(dbPath)
    expect(mockReleaseWriteLock).toHaveBeenCalledWith(dbPath + '.wlock')
  })

  it('should execute concurrent writes sequentially (mutex)', async () => {
    const order: number[] = []
    const fn1 = vi.fn(() => {
      order.push(1)
      return 'first'
    })
    const fn2 = vi.fn(() => {
      order.push(2)
      return 'second'
    })

    const [r1, r2] = await Promise.all([
      writeDb(dbPath, fn1),
      writeDb(dbPath, fn2),
    ])

    expect(r1).toBe('first')
    expect(r2).toBe('second')
    expect(order).toEqual([1, 2])
  })

  it('should release lock if fn throws', async () => {
    const fn = vi.fn(() => { throw new Error('mutation-failed') })

    await expect(writeDb(dbPath, fn)).rejects.toThrow('mutation-failed')
    expect(mockReleaseWriteLock).toHaveBeenCalledWith(dbPath + '.wlock')
  })
})

// ── queryLive ─────────────────────────────────────────────────────────────────

describe('queryLive (T1157)', () => {
  const dbPath = '/test/query-test.db'

  beforeEach(() => {
    vi.clearAllMocks()
    clearDbCacheEntry(dbPath)
  })

  it('should call prepare().all() on the pooled connection', async () => {
    const mockAll = vi.fn().mockReturnValue([{ id: 1, name: 'test' }])
    mockPrepare.mockReturnValue({ all: mockAll })

    const result = await queryLive(dbPath, 'SELECT * FROM agents', [])
    expect(mockPrepare).toHaveBeenCalledWith('SELECT * FROM agents')
    expect(result).toEqual([{ id: 1, name: 'test' }])
  })

  it('should spread params when provided', async () => {
    const mockAll = vi.fn().mockReturnValue([])
    mockPrepare.mockReturnValue({ all: mockAll })

    await queryLive(dbPath, 'SELECT * FROM agents WHERE id = ?', [42])
    expect(mockAll).toHaveBeenCalledWith(42)
  })

  it('should catch SQLITE_CORRUPT, clear pool entry via db.close(), and rethrow with SQLITE_CORRUPT code (T1760)', async () => {
    clearDbCacheEntry(dbPath)
    mockClose.mockClear()

    const corruptErr = Object.assign(new Error('database disk image is malformed'), { code: 'SQLITE_CORRUPT' })
    mockPrepare.mockReturnValue({ all: vi.fn().mockImplementation(() => { throw corruptErr }) })

    await expect(queryLive(dbPath, 'SELECT * FROM tasks', [])).rejects.toMatchObject({ code: 'SQLITE_CORRUPT' })
    expect(mockClose).toHaveBeenCalled()
  })
})

// ── Connection pool LRU eviction (T1978) ─────────────────────────────────────

describe('dbPool LRU eviction (T1978)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Seed mockPrepare so queryLive calls don't throw
    mockPrepare.mockReturnValue({ all: vi.fn().mockReturnValue([]) })
  })

  it('MAX_POOL_SIZE is 5', () => {
    expect(MAX_POOL_SIZE).toBe(5)
  })

  it('evicts the LRU entry when pool exceeds MAX_POOL_SIZE', async () => {
    // Open MAX_POOL_SIZE + 1 distinct paths — the first one should be evicted
    const paths = Array.from({ length: MAX_POOL_SIZE + 1 }, (_, i) => `/lru/test-${i}.db`)

    for (const p of paths) {
      clearDbCacheEntry(p)
      await queryLive(p, 'SELECT 1', [])
    }

    // The first path was LRU — its connection must have been closed
    expect(mockClose).toHaveBeenCalled()
  })

  it('accessing an existing entry refreshes its LRU position', async () => {
    const paths = Array.from({ length: MAX_POOL_SIZE }, (_, i) => `/lru/refresh-${i}.db`)

    for (const p of paths) {
      clearDbCacheEntry(p)
      await queryLive(p, 'SELECT 1', [])
    }

    mockClose.mockClear()

    // Re-access paths[0] to move it to MRU position
    await queryLive(paths[0], 'SELECT 1', [])

    // Adding a new entry should evict paths[1] (now LRU), not paths[0]
    const newPath = '/lru/refresh-new.db'
    clearDbCacheEntry(newPath)
    await queryLive(newPath, 'SELECT 1', [])

    // close() was called once (for the evicted LRU entry)
    expect(mockClose).toHaveBeenCalledTimes(1)
  })
})

// ── FORBIDDEN_WRITE_PATTERN ─────────────────────────────────────────────────

describe('FORBIDDEN_WRITE_PATTERN', () => {
  it('should match write SQL keywords', () => {
    expect(FORBIDDEN_WRITE_PATTERN.test('INSERT INTO tasks')).toBe(true)
    expect(FORBIDDEN_WRITE_PATTERN.test('UPDATE tasks SET')).toBe(true)
    expect(FORBIDDEN_WRITE_PATTERN.test('DELETE FROM tasks')).toBe(true)
    expect(FORBIDDEN_WRITE_PATTERN.test('DROP TABLE tasks')).toBe(true)
  })

  it('should not match read-only SQL', () => {
    expect(FORBIDDEN_WRITE_PATTERN.test('SELECT * FROM tasks')).toBe(false)
    expect(FORBIDDEN_WRITE_PATTERN.test('PRAGMA table_info(tasks)')).toBe(false)
  })
})
