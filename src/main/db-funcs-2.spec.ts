/**
 * Tests for DB infrastructure — src/main/db.ts (T1157) — part 2
 *
 * Covers: queryLive with params, migrateDb backup/restore, FORBIDDEN_WRITE_PATTERN edge cases.
 *
 * Framework: Vitest (node environment)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

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

// Mock migration module
const mockApplyMigrations = vi.fn(() => 0)
const MOCK_CURRENT_SCHEMA_VERSION = 19

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
  queryLive,
  migrateDb,
  FORBIDDEN_WRITE_PATTERN,
} from './db'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('queryLive — params handling', () => {
  const dbPath = '/test/query-params.db'

  beforeEach(() => {
    vi.clearAllMocks()
    clearDbCacheEntry(dbPath)
  })

  it('should call stmt.all() without args when params is empty', async () => {
    const mockAll = vi.fn().mockReturnValue([])
    mockPrepare.mockReturnValue({ all: mockAll })

    await queryLive(dbPath, 'SELECT 1', [])
    expect(mockAll).toHaveBeenCalledWith()
  })

  it('should spread multiple params', async () => {
    const mockAll = vi.fn().mockReturnValue([{ id: 1 }])
    mockPrepare.mockReturnValue({ all: mockAll })

    await queryLive(dbPath, 'SELECT * FROM t WHERE id = ? AND name = ?', [42, 'test'])
    expect(mockAll).toHaveBeenCalledWith(42, 'test')
  })
})

describe('migrateDb — backup lifecycle', () => {
  const dbPath = '/test/migrate-lifecycle.db'

  beforeEach(() => {
    vi.clearAllMocks()
    clearDbCacheEntry(dbPath)
    mockApplyMigrations.mockReturnValue(0)
    mockAcquireWriteLock.mockResolvedValue(dbPath + '.wlock')
    // Set user_version to 0 so migration proceeds
    mockPragma.mockReturnValue(0)
  })

  it('should create backup before migration', async () => {
    await migrateDb(dbPath)

    expect(mockAcquireWriteLock).toHaveBeenCalledWith(dbPath)
    expect(mockCopyFile).toHaveBeenCalledWith(dbPath, `${dbPath}.bak`)
  })

  it('should delegate to migration.migrateDb', async () => {
    await migrateDb(dbPath)
    expect(mockApplyMigrations).toHaveBeenCalledWith(expect.any(Object))
  })

  it('should delete backup on success', async () => {
    await migrateDb(dbPath)
    expect(mockUnlink).toHaveBeenCalledWith(`${dbPath}.bak`)
  })

  it('should keep backup on failure', async () => {
    mockApplyMigrations.mockImplementation(() => { throw new Error('migration failed') })

    await expect(migrateDb(dbPath)).rejects.toThrow('migration failed')
    expect(mockUnlink).not.toHaveBeenCalled()
  })

  it('should return migrated count from migration.migrateDb', async () => {
    mockApplyMigrations.mockReturnValue(7)

    const result = await migrateDb(dbPath)
    expect(result).toEqual({ migrated: 7 })
  })

  it('should skip migration when user_version is current', async () => {
    mockPragma.mockReturnValue(MOCK_CURRENT_SCHEMA_VERSION)

    const result = await migrateDb(dbPath)
    expect(result).toEqual({ migrated: 0 })
    expect(mockCopyFile).not.toHaveBeenCalled()
    expect(mockApplyMigrations).not.toHaveBeenCalled()
  })
})

describe('FORBIDDEN_WRITE_PATTERN — edge cases', () => {
  it('should match write SQL keywords', () => {
    expect(FORBIDDEN_WRITE_PATTERN.test('INSERT INTO foo')).toBe(true)
    expect(FORBIDDEN_WRITE_PATTERN.test('UPDATE foo SET')).toBe(true)
    expect(FORBIDDEN_WRITE_PATTERN.test('DELETE FROM foo')).toBe(true)
    expect(FORBIDDEN_WRITE_PATTERN.test('DROP TABLE foo')).toBe(true)
    expect(FORBIDDEN_WRITE_PATTERN.test('ALTER TABLE foo')).toBe(true)
    expect(FORBIDDEN_WRITE_PATTERN.test('CREATE TABLE foo')).toBe(true)
    expect(FORBIDDEN_WRITE_PATTERN.test('TRUNCATE foo')).toBe(true)
    expect(FORBIDDEN_WRITE_PATTERN.test('REPLACE INTO foo')).toBe(true)
  })

  it('should match case-insensitively', () => {
    expect(FORBIDDEN_WRITE_PATTERN.test('insert into foo')).toBe(true)
    expect(FORBIDDEN_WRITE_PATTERN.test('Insert Into Foo')).toBe(true)
  })

  it('should not match SELECT queries', () => {
    expect(FORBIDDEN_WRITE_PATTERN.test('SELECT * FROM foo')).toBe(false)
    expect(FORBIDDEN_WRITE_PATTERN.test('SELECT count(*) FROM bar')).toBe(false)
  })

  it('should match ATTACH/DETACH/VACUUM', () => {
    expect(FORBIDDEN_WRITE_PATTERN.test('ATTACH DATABASE')).toBe(true)
    expect(FORBIDDEN_WRITE_PATTERN.test('DETACH DATABASE')).toBe(true)
    expect(FORBIDDEN_WRITE_PATTERN.test('VACUUM')).toBe(true)
  })
})
