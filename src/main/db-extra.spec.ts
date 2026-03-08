/** Mutation-coverage tests for src/main/db.ts (T1102) — Vitest node environment */

import { describe, it, expect } from 'vitest'
import { resolve } from 'path'

// ── Import ───────────────────────────────────────────────────────────────────

import {
  registerProjectPath,
  getAllowedProjectPaths,
} from './db'

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

// Tests for writeDb EPERM fallback, evictStaleCacheEntries, queryLive buffer cache,
// migrateDb tmp-file rename, and WASM module recycling were removed during
// sql.js → better-sqlite3 migration (T1157).
// See db.spec.ts and db-funcs-2.spec.ts for current coverage.
