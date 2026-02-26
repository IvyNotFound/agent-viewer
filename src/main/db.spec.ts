/**
 * Tests for DB cache layer — src/main/db.ts
 *
 * Tests getDbBuffer cache behavior (hit/miss/TTL/max entries)
 * and clearDbCacheEntry cleanup.
 *
 * Strategy: mock fs/promises (stat + readFile) and verify call counts
 * to distinguish cache hits from misses.
 *
 * Framework: Vitest (node environment)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
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

// ── Import after mocks ────────────────────────────────────────────────────────

import { getDbBuffer, clearDbCacheEntry } from './db'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DB cache — getDbBuffer (T228)', () => {
  const dbPath = '/test/project.db'
  const fakeBuffer = Buffer.from('fake-db-content')

  beforeEach(() => {
    vi.clearAllMocks()
    // Clear internal cache between tests by evicting known paths
    clearDbCacheEntry(dbPath)
    clearDbCacheEntry('/test/db1.db')
    clearDbCacheEntry('/test/db2.db')
    clearDbCacheEntry('/test/db3.db')
    clearDbCacheEntry('/test/db4.db')
    mockStat.mockResolvedValue({ mtimeMs: 1000 })
    mockReadFile.mockResolvedValue(fakeBuffer)
  })

  it('should read file on first call (cache miss)', async () => {
    const buf = await getDbBuffer(dbPath)
    expect(mockStat).toHaveBeenCalledWith(dbPath)
    expect(mockReadFile).toHaveBeenCalledWith(dbPath)
    expect(buf).toEqual(fakeBuffer)
  })

  it('should return cached buffer on second call with same mtime (cache hit)', async () => {
    // First call — cache miss
    await getDbBuffer(dbPath)
    expect(mockReadFile).toHaveBeenCalledTimes(1)

    // Second call — same mtime → cache hit
    const buf2 = await getDbBuffer(dbPath)
    expect(mockStat).toHaveBeenCalledTimes(2) // stat always called
    expect(mockReadFile).toHaveBeenCalledTimes(1) // readFile NOT called again
    expect(buf2).toEqual(fakeBuffer)
  })

  it('should re-read file when mtime changes (cache invalidation)', async () => {
    // First call
    await getDbBuffer(dbPath)
    expect(mockReadFile).toHaveBeenCalledTimes(1)

    // mtime changes
    mockStat.mockResolvedValue({ mtimeMs: 2000 })
    const newBuffer = Buffer.from('updated-content')
    mockReadFile.mockResolvedValue(newBuffer)

    const buf2 = await getDbBuffer(dbPath)
    expect(mockReadFile).toHaveBeenCalledTimes(2)
    expect(buf2).toEqual(newBuffer)
  })

  it('should evict stale entries after CACHE_TTL_MS (60s)', async () => {
    vi.useFakeTimers()

    // First call — populate cache
    await getDbBuffer(dbPath)
    expect(mockReadFile).toHaveBeenCalledTimes(1)

    // Advance time past TTL (60s + margin)
    vi.advanceTimersByTime(70000)

    // Second call — stale entry evicted → re-read
    await getDbBuffer(dbPath)
    expect(mockReadFile).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('should enforce MAX_CACHE_ENTRIES=3 by evicting oldest', async () => {
    // Populate 3 entries
    for (let i = 1; i <= 3; i++) {
      mockStat.mockResolvedValue({ mtimeMs: i * 1000 })
      mockReadFile.mockResolvedValue(Buffer.from(`db${i}`))
      await getDbBuffer(`/test/db${i}.db`)
    }
    // readFile called 3 times (one per unique path)
    expect(mockReadFile).toHaveBeenCalledTimes(3)

    // Add 4th entry — should evict oldest (db1)
    mockStat.mockResolvedValue({ mtimeMs: 4000 })
    mockReadFile.mockResolvedValue(Buffer.from('db4'))
    await getDbBuffer('/test/db4.db')
    expect(mockReadFile).toHaveBeenCalledTimes(4)

    // Now access db1 again — it was evicted, so readFile should be called
    mockStat.mockResolvedValue({ mtimeMs: 1000 })
    mockReadFile.mockResolvedValue(Buffer.from('db1'))
    await getDbBuffer('/test/db1.db')
    expect(mockReadFile).toHaveBeenCalledTimes(5) // re-read after eviction
  })

  it('should handle stat failure gracefully (fallback to readFile)', async () => {
    mockStat.mockRejectedValueOnce(new Error('ENOENT'))
    // The catch block in getDbBuffer falls back to plain readFile
    const buf = await getDbBuffer(dbPath)
    expect(mockReadFile).toHaveBeenCalled()
    expect(buf).toEqual(fakeBuffer)
  })
})

describe('clearDbCacheEntry', () => {
  it('should force cache miss on next getDbBuffer call', async () => {
    const dbPath = '/test/clear-test.db'
    clearDbCacheEntry(dbPath)
    vi.clearAllMocks()
    mockStat.mockResolvedValue({ mtimeMs: 1000 })
    mockReadFile.mockResolvedValue(Buffer.from('content'))

    await getDbBuffer(dbPath)
    expect(mockReadFile).toHaveBeenCalledTimes(1)

    // Clear cache entry
    clearDbCacheEntry(dbPath)

    // Next call should re-read
    await getDbBuffer(dbPath)
    expect(mockReadFile).toHaveBeenCalledTimes(2)
  })
})
