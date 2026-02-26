#!/usr/bin/env node
/**
 * dblock.js — Advisory OS-level write lock for project.db
 *
 * Uses O_EXCL atomic file creation (wx flag) to prevent concurrent
 * read-modify-write races between agent processes.
 *
 * Lock file: <dbPath>.wlock  (contains PID of holder)
 * Stale detection: if lock file mtime > LOCK_STALE_MS, considered stale and removed.
 *
 * Usage:
 *   const { acquireLock, releaseLock } = require('./dblock')
 *   const lockPath = acquireLock(dbPath)          // blocks until acquired
 *   // ... do read-modify-write ...
 *   releaseLock(lockPath)
 */

const fs = require('fs')

const LOCK_STALE_MS = 30_000  // lock older than 30s is stale (process likely dead)
const LOCK_TIMEOUT_MS = 15_000 // give up and throw after 15s
const LOCK_RETRY_MIN = 50      // min wait between retries (ms)
const LOCK_RETRY_MAX = 200     // max wait between retries (ms)

/**
 * Busy-wait sleep — acceptable for short durations in CLI scripts.
 * @param {number} ms
 */
function sleep(ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {}
}

/**
 * Acquires an exclusive write lock on the database file.
 * Blocks synchronously until the lock is obtained or timeout is reached.
 *
 * @param {string} dbPath - Absolute path to the SQLite DB file
 * @returns {string} lockPath - Path of the lock file (pass to releaseLock)
 * @throws if timeout exceeded
 */
function acquireLock(dbPath) {
  const lockPath = dbPath + '.wlock'
  const start = Date.now()

  while (true) {
    try {
      // O_EXCL (wx): atomic creation — EEXIST if already exists
      fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' })
      return lockPath // lock acquired
    } catch (e) {
      if (e.code !== 'EEXIST') throw e

      // Check if the existing lock is stale (holder process likely crashed)
      try {
        const stat = fs.statSync(lockPath)
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(lockPath)
          continue // retry immediately after removing stale lock
        }
      } catch {
        // Lock was released between EEXIST and statSync — retry immediately
        continue
      }

      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        let holder = '?'
        try { holder = fs.readFileSync(lockPath, 'utf8').trim() } catch {}
        throw new Error(
          `dblock: write lock timeout after ${LOCK_TIMEOUT_MS}ms — held by PID ${holder} (${lockPath})`
        )
      }

      // Random backoff to avoid thundering herd
      sleep(LOCK_RETRY_MIN + Math.random() * (LOCK_RETRY_MAX - LOCK_RETRY_MIN))
    }
  }
}

/**
 * Releases the write lock.
 * @param {string} lockPath - Value returned by acquireLock()
 */
function releaseLock(lockPath) {
  try { fs.unlinkSync(lockPath) } catch {}
}

module.exports = { acquireLock, releaseLock }
