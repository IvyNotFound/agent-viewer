// Tests removed during sql.js → better-sqlite3 migration (T1157).
// The behaviors tested here (tmp-file writeDb, buffer-cache queryLive, WASM-based migrateDb)
// no longer exist. See db.spec.ts and db-funcs-2.spec.ts for current coverage.
//
// FORBIDDEN_WRITE_PATTERN tests were kept — they moved to db.spec.ts.
import { describe, it, expect } from 'vitest'
import { FORBIDDEN_WRITE_PATTERN } from './db'

// ── FORBIDDEN_WRITE_PATTERN ───────────────────────────────────────────────────

describe('FORBIDDEN_WRITE_PATTERN', () => {
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
})
