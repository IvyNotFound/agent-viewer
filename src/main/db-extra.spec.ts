/** Mutation-coverage tests for src/main/db.ts (T1102) — Vitest node environment */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve } from 'path'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAcquireWriteLock = vi.fn().mockResolvedValue('/test/project.db.wlock')
const mockReleaseWriteLock = vi.fn().mockResolvedValue(undefined)

vi.mock('./db-lock', () => ({
  acquireWriteLock: (...args: unknown[]) => mockAcquireWriteLock(...args),
  releaseWriteLock: (...args: unknown[]) => mockReleaseWriteLock(...args),
}))

const mockStat = vi.fn()
const mockReadFile = vi.fn()
const mockWriteFile = vi.fn().mockResolvedValue(undefined)
const mockRename = vi.fn().mockResolvedValue(undefined)
const mockCopyFile = vi.fn().mockResolvedValue(undefined)
const mockUnlink = vi.fn().mockResolvedValue(undefined)

vi.mock('fs/promises', () => ({
  default: {
    stat: (...args: unknown[]) => mockStat(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    rename: (...args: unknown[]) => mockRename(...args),
    copyFile: (...args: unknown[]) => mockCopyFile(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
  stat: (...args: unknown[]) => mockStat(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rename: (...args: unknown[]) => mockRename(...args),
  copyFile: (...args: unknown[]) => mockCopyFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}))

const mockApplyMigrations = vi.fn(() => 0)

vi.mock('./migration', () => ({
  migrateDb: (...args: unknown[]) => mockApplyMigrations(...args),
  CURRENT_SCHEMA_VERSION: 19,
}))

vi.mock('sql.js', () => ({
  default: (...args: unknown[]) => vi.fn()(...args),
  __esModule: true,
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import {
  getDbBuffer,
  clearDbCacheEntry,
  registerProjectPath,
  getAllowedProjectPaths,
  getSqlJs,
  writeDb,
  queryLive,
  migrateDb,
} from './db'

// ── Shared helper ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildDbBuffer(setup?: (db: any) => void) {
  const sqlJs = await getSqlJs()
  const db = new sqlJs.Database()
  if (setup) setup(db)
  const buf = Buffer.from(db.export())
  db.close()
  return buf
}

// ── getAllowedProjectPaths ────────────────────────────────────────────────────

describe('getAllowedProjectPaths', () => {
  it('should return registered project paths', () => {
    const p = '/tmp/extra-test-project-paths-' + Date.now()
    registerProjectPath(p)
    const paths = getAllowedProjectPaths()
    expect(paths).toContain(resolve(p))
  })

  it('should return an array (not a set)', () => {
    const paths = getAllowedProjectPaths()
    expect(Array.isArray(paths)).toBe(true)
  })
})

// ── writeDb — EPERM fallback and cache entry branches ────────────────────────

describe('writeDb — EPERM fallback and cache entry', () => {
  const dbPath = '/test/extra-write-eperm.db'
  const fakeBuffer = Buffer.from('fake-db-eperm')

  beforeEach(() => {
    vi.clearAllMocks()
    clearDbCacheEntry(dbPath)
    mockStat.mockResolvedValue({ mtimeMs: 1000 })
    mockReadFile.mockResolvedValue(fakeBuffer)
    mockAcquireWriteLock.mockResolvedValue(dbPath + '.wlock')
    mockReleaseWriteLock.mockResolvedValue(undefined)
  })

  it('should use copyFile+unlink when rename throws EPERM', async () => {
    const epermErr = Object.assign(new Error('EPERM'), { code: 'EPERM' })
    mockRename.mockRejectedValueOnce(epermErr)
    mockCopyFile.mockResolvedValue(undefined)
    mockUnlink.mockResolvedValue(undefined)

    const result = await writeDb(dbPath, () => 'ok')
    expect(result).toBe('ok')
    expect(mockCopyFile).toHaveBeenCalledWith(dbPath + '.tmp', dbPath)
    expect(mockUnlink).toHaveBeenCalledWith(dbPath + '.tmp')
  })

  it('should rethrow non-EPERM rename errors', async () => {
    const eaccessErr = Object.assign(new Error('EACCES'), { code: 'EACCES' })
    mockRename.mockRejectedValueOnce(eaccessErr)

    await expect(writeDb(dbPath, () => 'ok')).rejects.toThrow('EACCES')
    expect(mockCopyFile).not.toHaveBeenCalled()
  })

  it('should write to dbPath + ".tmp" before rename', async () => {
    await writeDb(dbPath, () => 'ok')
    expect(mockWriteFile).toHaveBeenCalledWith(dbPath + '.tmp', expect.any(Buffer))
    expect(mockRename).toHaveBeenCalledWith(dbPath + '.tmp', dbPath)
  })

  it('should create new cache entry when none exists after write', async () => {
    await writeDb(dbPath, () => 'new-entry')
    const readCount = mockReadFile.mock.calls.length
    mockStat.mockResolvedValue({ mtimeMs: 1000 })
    await getDbBuffer(dbPath)
    expect(mockReadFile).toHaveBeenCalledTimes(readCount)
  })

  it('should update existing cache entry after write', async () => {
    await getDbBuffer(dbPath)
    const readAfterFirst = mockReadFile.mock.calls.length
    await writeDb(dbPath, () => 'update-entry')
    await getDbBuffer(dbPath)
    expect(mockReadFile).toHaveBeenCalledTimes(readAfterFirst)
  })

  it('should release write lock even if fn throws', async () => {
    const fn = vi.fn(() => { throw new Error('fn-failed') })
    await expect(writeDb(dbPath, fn)).rejects.toThrow('fn-failed')
    expect(mockReleaseWriteLock).toHaveBeenCalledWith(dbPath + '.wlock')
  })
})

// ── writeDb — mutex cleanup ───────────────────────────────────────────────────

describe('writeDb — mutex cleanup', () => {
  const dbPath = '/test/extra-write-mutex.db'
  const fakeBuffer = Buffer.from('mutex-test-db')

  beforeEach(() => {
    vi.clearAllMocks()
    clearDbCacheEntry(dbPath)
    mockStat.mockResolvedValue({ mtimeMs: 1000 })
    mockReadFile.mockResolvedValue(fakeBuffer)
    mockAcquireWriteLock.mockResolvedValue(dbPath + '.wlock')
    mockReleaseWriteLock.mockResolvedValue(undefined)
  })

  it('should allow a second sequential write after the first completes', async () => {
    const r1 = await writeDb(dbPath, () => 'first')
    const r2 = await writeDb(dbPath, () => 'second')
    expect(r1).toBe('first')
    expect(r2).toBe('second')
  })

  it('should serialize concurrent writes on same path', async () => {
    const calls: string[] = []
    const p1 = writeDb(dbPath, () => { calls.push('A'); return 'a' })
    const p2 = writeDb(dbPath, () => { calls.push('B'); return 'b' })
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe('a')
    expect(r2).toBe('b')
    expect(calls).toEqual(['A', 'B'])
  })
})

// ── evictStaleCacheEntries — db TTL + buf TTL ────────────────────────────────

describe('evictStaleCacheEntries — TTL branches', () => {
  const dbPath = '/test/extra-evict-ttl.db'

  beforeEach(() => {
    vi.clearAllMocks()
    clearDbCacheEntry(dbPath)
  })

  it('should free db instance after 10s TTL but keep buffer', async () => {
    vi.useFakeTimers()
    try {
      const buf = await buildDbBuffer(db => {
        db.run('CREATE TABLE t (v TEXT)')
        db.run("INSERT INTO t VALUES ('x')")
      })
      mockStat.mockResolvedValue({ mtimeMs: 5000 })
      mockReadFile.mockResolvedValue(buf)

      // T=0: populate buffer + DB instance
      await queryLive(dbPath, 'SELECT * FROM t', [])
      expect(mockReadFile).toHaveBeenCalledTimes(1)

      // T=5s: touch buffer (refreshes lastAccess, not dbCreatedAt)
      vi.advanceTimersByTime(5_000)
      await getDbBuffer(dbPath)

      // T=12s: dbCreatedAt=12s old (>10s → evict DB), lastAccess=7s old (<10s → keep buffer)
      vi.advanceTimersByTime(7_000)

      await queryLive(dbPath, 'SELECT * FROM t', [])
      expect(mockReadFile).toHaveBeenCalledTimes(1) // buffer not re-read
    } finally {
      vi.useRealTimers()
    }
  })

  it('should evict buffer after 10s CACHE_TTL_MS', async () => {
    vi.useFakeTimers()
    try {
      const buf = await buildDbBuffer(db => { db.run('CREATE TABLE t (v TEXT)') })
      mockStat.mockResolvedValue({ mtimeMs: 7000 })
      mockReadFile.mockResolvedValue(buf)

      await queryLive(dbPath, 'SELECT * FROM t', [])
      expect(mockReadFile).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(15_000) // past CACHE_TTL_MS=10s

      await queryLive(dbPath, 'SELECT * FROM t', [])
      expect(mockReadFile).toHaveBeenCalledTimes(2) // forced re-read
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── queryLive — db instance reuse + params ───────────────────────────────────

describe('queryLive — additional branches', () => {
  const dbPath = '/test/extra-query-live-5678.db'

  beforeEach(() => {
    vi.clearAllMocks()
    clearDbCacheEntry(dbPath)
    // Clear other paths to avoid eviction interfering
    clearDbCacheEntry('/test/extra-evict-ttl.db')
    clearDbCacheEntry('/test/extra-write-eperm.db')
    clearDbCacheEntry('/test/extra-write-mutex.db')
  })

  it('should reuse cached db instance on second query (same mtime)', async () => {
    const buf = await buildDbBuffer(db => {
      db.run('CREATE TABLE items (id INTEGER)')
      db.run('INSERT INTO items VALUES (10)')
    })

    mockStat.mockResolvedValue({ mtimeMs: 88888 })
    mockReadFile.mockResolvedValue(buf)

    const rows1 = await queryLive(dbPath, 'SELECT * FROM items', [])
    expect(rows1).toEqual([{ id: 10 }])
    const readCount = mockReadFile.mock.calls.length

    const rows2 = await queryLive(dbPath, 'SELECT * FROM items', [])
    expect(rows2).toEqual([{ id: 10 }])
    expect(mockReadFile).toHaveBeenCalledTimes(readCount) // no extra read
  })

  it('should return empty array for SELECT with no matching rows', async () => {
    const buf = await buildDbBuffer(db => { db.run('CREATE TABLE empty (id INTEGER)') })
    mockStat.mockResolvedValue({ mtimeMs: Date.now() })
    mockReadFile.mockResolvedValue(buf)

    const rows = await queryLive(dbPath, 'SELECT * FROM empty', [])
    expect(rows).toEqual([])
  })

  it('should pass bind params to query', async () => {
    const buf = await buildDbBuffer(db => {
      db.run('CREATE TABLE params (id INTEGER, name TEXT)')
      db.run("INSERT INTO params VALUES (1, 'alice')")
      db.run("INSERT INTO params VALUES (2, 'bob')")
    })

    mockStat.mockResolvedValue({ mtimeMs: Date.now() + 2 })
    mockReadFile.mockResolvedValue(buf)

    const rows = await queryLive(dbPath, 'SELECT * FROM params WHERE id = ?', [1])
    expect(rows).toEqual([{ id: 1, name: 'alice' }])
  })
})

// ── migrateDb — additional branches ──────────────────────────────────────────

describe('migrateDb — additional branches', () => {
  const dbPath = '/test/extra-migrate-branches.db'

  beforeEach(() => {
    vi.clearAllMocks()
    clearDbCacheEntry(dbPath)
    mockAcquireWriteLock.mockResolvedValue(dbPath + '.wlock')
    mockReleaseWriteLock.mockResolvedValue(undefined)
  })

  it('should write exported DB to .migrate.tmp then rename when migrations applied', async () => {
    mockReadFile.mockResolvedValue(await buildDbBuffer())
    mockApplyMigrations.mockReturnValue(3)

    await migrateDb(dbPath)

    expect(mockWriteFile).toHaveBeenCalledWith(dbPath + '.migrate.tmp', expect.any(Buffer))
    expect(mockRename).toHaveBeenCalledWith(dbPath + '.migrate.tmp', dbPath)
  })

  it('should skip write when migrated === 0', async () => {
    mockReadFile.mockResolvedValue(await buildDbBuffer())
    mockApplyMigrations.mockReturnValue(0)

    await migrateDb(dbPath)

    expect(mockWriteFile).not.toHaveBeenCalled()
    expect(mockRename).not.toHaveBeenCalled()
  })

  it('should use copyFile+unlink for .migrate.tmp when rename throws EPERM', async () => {
    mockReadFile.mockResolvedValue(await buildDbBuffer())
    mockApplyMigrations.mockReturnValue(2)
    const epermErr = Object.assign(new Error('EPERM'), { code: 'EPERM' })
    mockRename.mockRejectedValueOnce(epermErr)
    mockCopyFile.mockResolvedValue(undefined)
    mockUnlink.mockResolvedValue(undefined)

    await migrateDb(dbPath)

    expect(mockCopyFile).toHaveBeenCalledWith(dbPath + '.migrate.tmp', dbPath)
    expect(mockUnlink).toHaveBeenCalledWith(dbPath + '.migrate.tmp')
  })

  it('should rethrow non-EPERM rename errors in migrateDb', async () => {
    mockReadFile.mockResolvedValue(await buildDbBuffer())
    mockApplyMigrations.mockReturnValue(1)
    const eaccessErr = Object.assign(new Error('EACCES'), { code: 'EACCES' })
    mockRename.mockRejectedValueOnce(eaccessErr)

    await expect(migrateDb(dbPath)).rejects.toThrow('EACCES')
  })

  it('should proceed to full migration when DB buffer is unreadable', async () => {
    mockStat.mockRejectedValueOnce(new Error('ENOENT'))
    mockReadFile.mockResolvedValue(await buildDbBuffer())
    mockApplyMigrations.mockReturnValue(1)

    const result = await migrateDb(dbPath)
    expect(result).toEqual({ migrated: 1 })
    expect(mockApplyMigrations).toHaveBeenCalledTimes(1)
  })

  it('should release lock even when migration throws', async () => {
    mockReadFile.mockResolvedValue(await buildDbBuffer())
    mockApplyMigrations.mockImplementation(() => { throw new Error('migration-err') })

    await expect(migrateDb(dbPath)).rejects.toThrow('migration-err')
    expect(mockReleaseWriteLock).toHaveBeenCalledWith(dbPath + '.wlock')
  })

  it('should create backup at dbPath + ".bak"', async () => {
    mockReadFile.mockResolvedValue(await buildDbBuffer())
    mockApplyMigrations.mockReturnValue(0)

    await migrateDb(dbPath)

    expect(mockCopyFile).toHaveBeenCalledWith(dbPath, dbPath + '.bak')
  })

  it('should warn (not throw) when backup deletion fails', async () => {
    mockReadFile.mockResolvedValue(await buildDbBuffer())
    mockApplyMigrations.mockReturnValue(0)
    mockUnlink.mockRejectedValueOnce(new Error('EBUSY'))

    const result = await migrateDb(dbPath)
    expect(result).toEqual({ migrated: 0 })
  })

  it('should return exact migrated count', async () => {
    mockReadFile.mockResolvedValue(await buildDbBuffer())
    mockApplyMigrations.mockReturnValue(5)

    const result = await migrateDb(dbPath)
    expect(result).toEqual({ migrated: 5 })
  })
})
