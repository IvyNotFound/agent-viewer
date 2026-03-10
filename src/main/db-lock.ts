/**
 * Advisory OS-level write lock for cross-process DB concurrency.
 *
 * Async counterpart of scripts/dblock.js — same protocol, non-blocking event loop.
 * Lock file: <dbPath>.wlock  (contains PID of holder)
 * Stale detection: lock older than LOCK_STALE_MS is removed and retried.
 * Timeout: throws after LOCK_TIMEOUT_MS if lock cannot be acquired.
 *
 * @module db-lock
 */

import { writeFile, unlink, stat } from 'fs/promises'

const LOCK_STALE_MS = 30_000   // lock older than 30s → assumed stale (holder crashed)
const LOCK_TIMEOUT_MS = 15_000 // give up after 15s
const LOCK_RETRY_MIN = 50      // min wait between retries (ms)
const LOCK_RETRY_MAX = 200     // max wait between retries (ms)

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Acquire an exclusive write lock on a DB file.
 * Uses atomic O_EXCL file creation (wx flag) — same advisory protocol as dblock.js.
 *
 * @param dbPath - Absolute path to the SQLite DB file
 * @returns lockPath - Path of the lock file (pass to releaseWriteLock)
 * @throws if timeout exceeded or unexpected FS error
 */
export async function acquireWriteLock(dbPath: string): Promise<string> {
  const lockPath = dbPath + '.wlock'
  const start = Date.now()

  while (true) {
    try {
      // O_EXCL atomic creation — EEXIST if lock is already held
      await writeFile(lockPath, String(process.pid), { flag: 'wx' })
      return lockPath
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err.code !== 'EEXIST') throw e

      // Check if the existing lock is stale (holder process likely crashed)
      try {
        const s = await stat(lockPath)
        if (Date.now() - s.mtimeMs > LOCK_STALE_MS) {
          await unlink(lockPath).catch(() => { /* already removed */ })
          continue // retry immediately after removing stale lock
        }
      } catch {
        // Lock was released between EEXIST and stat — retry immediately
        continue
      }

      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        throw new Error(`db-lock: write lock timeout after ${LOCK_TIMEOUT_MS}ms (${lockPath})`, { cause: e })
      }

      await sleep(LOCK_RETRY_MIN + Math.random() * (LOCK_RETRY_MAX - LOCK_RETRY_MIN))
    }
  }
}

/**
 * Release the write lock acquired by acquireWriteLock.
 * @param lockPath - Value returned by acquireWriteLock()
 */
export async function releaseWriteLock(lockPath: string): Promise<void> {
  try { await unlink(lockPath) } catch { /* lock already gone */ }
}
