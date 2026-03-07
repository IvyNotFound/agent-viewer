/**
 * Tests for db-lock.ts — cross-process advisory write lock (T1053)
 *
 * Covers: immediate acquire, retry on EEXIST, stale lock removal,
 * timeout, release, release tolerates missing file.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockWriteFile = vi.fn()
const mockUnlink = vi.fn()
const mockStat = vi.fn()

vi.mock('fs/promises', () => ({
  default: {
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
    stat: (...args: unknown[]) => mockStat(...args),
  },
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
  stat: (...args: unknown[]) => mockStat(...args),
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import { acquireWriteLock, releaseWriteLock } from './db-lock'

// ── Helpers ───────────────────────────────────────────────────────────────────

function eexistError(): NodeJS.ErrnoException {
  return Object.assign(new Error('EEXIST'), { code: 'EEXIST' })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('acquireWriteLock', () => {
  const dbPath = '/test/project.db'
  const lockPath = dbPath + '.wlock'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should acquire lock immediately when no contention', async () => {
    mockWriteFile.mockResolvedValueOnce(undefined)

    const result = await acquireWriteLock(dbPath)

    expect(result).toBe(lockPath)
    expect(mockWriteFile).toHaveBeenCalledWith(lockPath, expect.any(String), { flag: 'wx' })
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
  })

  it('should write process PID to lock file', async () => {
    mockWriteFile.mockResolvedValueOnce(undefined)

    await acquireWriteLock(dbPath)

    expect(mockWriteFile).toHaveBeenCalledWith(lockPath, String(process.pid), { flag: 'wx' })
  })

  it('should retry on EEXIST (fresh lock) and succeed on second attempt', async () => {
    vi.useFakeTimers()
    mockWriteFile
      .mockRejectedValueOnce(eexistError())
      .mockResolvedValueOnce(undefined)
    // Fresh lock (100ms old, well below LOCK_STALE_MS=30s)
    mockStat.mockResolvedValue({ mtimeMs: Date.now() - 100 })

    const promise = acquireWriteLock(dbPath)
    await vi.advanceTimersByTimeAsync(300)
    const result = await promise

    expect(result).toBe(lockPath)
    expect(mockWriteFile).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('should remove stale lock and acquire immediately', async () => {
    mockWriteFile
      .mockRejectedValueOnce(eexistError())
      .mockResolvedValueOnce(undefined)
    // Stale: 40s old > LOCK_STALE_MS=30s
    mockStat.mockResolvedValue({ mtimeMs: Date.now() - 40_000 })
    mockUnlink.mockResolvedValue(undefined)

    const result = await acquireWriteLock(dbPath)

    expect(mockUnlink).toHaveBeenCalledWith(lockPath)
    expect(result).toBe(lockPath)
  })

  it('should retry immediately if lock disappears between EEXIST and stat', async () => {
    mockWriteFile
      .mockRejectedValueOnce(eexistError())
      .mockResolvedValueOnce(undefined)
    // stat throws ENOENT — lock was released between EEXIST and stat
    mockStat.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    const result = await acquireWriteLock(dbPath)

    expect(result).toBe(lockPath)
    expect(mockWriteFile).toHaveBeenCalledTimes(2)
  })

  it('should throw on unexpected FS errors (not EEXIST)', async () => {
    mockWriteFile.mockRejectedValueOnce(
      Object.assign(new Error('EPERM'), { code: 'EPERM' })
    )

    await expect(acquireWriteLock(dbPath)).rejects.toThrow('EPERM')
  })

  it('should throw after LOCK_TIMEOUT_MS when lock is held continuously', async () => {
    vi.useFakeTimers()

    mockWriteFile.mockRejectedValue(eexistError())
    // Always fresh lock — never stale
    mockStat.mockImplementation(async () => ({ mtimeMs: Date.now() - 100 }))

    const promise = acquireWriteLock(dbPath)
    // Attach assertion handler before advancing — prevents "unhandled rejection"
    const assertion = expect(promise).rejects.toThrow(/db-lock: write lock timeout/)
    // Advance past LOCK_TIMEOUT_MS=15s
    await vi.advanceTimersByTimeAsync(16_000)
    await assertion

    vi.useRealTimers()
  })
})

describe('releaseWriteLock', () => {
  const lockPath = '/test/project.db.wlock'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should unlink the lock file', async () => {
    mockUnlink.mockResolvedValue(undefined)

    await releaseWriteLock(lockPath)

    expect(mockUnlink).toHaveBeenCalledWith(lockPath)
  })

  it('should not throw if lock file does not exist', async () => {
    mockUnlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    await expect(releaseWriteLock(lockPath)).resolves.not.toThrow()
  })
})
