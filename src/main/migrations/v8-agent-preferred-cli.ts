import type { MigrationDb } from '../migration-db-adapter'
type Database = MigrationDb

/**
 * Migration: Add preferred_cli column to agents table (T1802).
 *
 * Stores the preferred CLI tool for a given agent (e.g. "claude", "aider").
 * Used by the model registry to resolve available models per agent.
 *
 * Nullable, no DEFAULT — any CliType string value is valid.
 *
 * Idempotent: returns false if the column already exists.
 *
 * @returns true if the column was added, false if already present.
 */
export function runAddPreferredCliToAgentsMigration(db: Database): boolean {
  const colResult = db.exec('PRAGMA table_info(agents)')
  if (colResult.length === 0 || colResult[0].values.length === 0) return false

  const cols = new Set(colResult[0].values.map((r: unknown[]) => r[1] as string))
  if (cols.has('preferred_cli')) return false

  db.run('ALTER TABLE agents ADD COLUMN preferred_cli TEXT')
  return true
}
