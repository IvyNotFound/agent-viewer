import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runTaskStatutI18nMigration, runRemoveThinkingModeBudgetTokensMigration } from './migration'

// Mock Database for MigrationDb adapter
interface MockDatabase {
  exec: ReturnType<typeof vi.fn>
  run: ReturnType<typeof vi.fn>
  getRowsModified: ReturnType<typeof vi.fn>
}

function createMockDb(execResults: Array<{ columns: string[]; values: unknown[][] }> = []): MockDatabase {
  return {
    exec: vi.fn().mockImplementation((query: string) => {
      // db.exec() in MigrationDb adapter always returns an array of QueryExecResult:
      //   - rows found    → [{ columns: [...], values: [[row1], [row2], ...] }]
      //   - no rows found → [] (empty array, not an array with an empty-values object)
      if (query.includes("COUNT(*) as count FROM tasks WHERE statut = 'terminé'")) {
        const r = execResults[0]
        return r ? [r] : [{ columns: ['count'], values: [[0]] }]
      }
      if (query.includes("COUNT(*) as count FROM tasks WHERE statut = 'validé'")) {
        const r = execResults[1]
        return r ? [r] : [{ columns: ['count'], values: [[0]] }]
      }
      if (query.includes("sqlite_master") && !query.includes('COUNT(*)')) {
        // For sqlite_master: return [] when no table found (values is empty array)
        // return [result] only when values has at least one row
        const r = execResults[2]
        if (r && r.values.length > 0) return [r]
        return []
      }
      return []
    }),
    run: vi.fn(),
    getRowsModified: vi.fn().mockReturnValue(0)
  }
}

// ── runTaskStatutI18nMigration ──────────────────────────────────────────────────

describe('runTaskStatutI18nMigration', () => {
  let mockDb: MockDatabase

  function createI18nMockDb(opts: {
    schema?: string
    frenchCount?: number
    oldColNames?: string[]
  }): MockDatabase {
    const { schema = '', frenchCount = 0, oldColNames = ['id', 'titre', 'description', 'statut', 'perimetre', 'effort', 'created_at', 'updated_at'] } = opts

    const pragmaValues = oldColNames.map((name, idx) => [idx, name, 'TEXT', 0, null, 0])

    return {
      exec: vi.fn().mockImplementation((query: string) => {
        if (query.includes('sqlite_master') && !query.includes('COUNT(*)')) {
          if (schema) return [{ columns: ['sql'], values: [[schema]] }]
          return []
        }
        if (query.includes('COUNT(*)') && query.includes("IN ('a_faire'")) {
          return [{ columns: ['count'], values: [[frenchCount]] }]
        }
        if (query.includes('PRAGMA table_info')) {
          return [{ columns: ['cid','name','type','notnull','dflt_value','pk'], values: pragmaValues }]
        }
        return []
      }),
      run: vi.fn(),
      getRowsModified: vi.fn().mockReturnValue(0)
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 0 when schema is already English and no French values', () => {
    const englishSchema = `CREATE TABLE tasks (statut TEXT DEFAULT 'todo' CHECK(statut IN ('todo','in_progress','done','archived')))`
    mockDb = createI18nMockDb({ schema: englishSchema, frenchCount: 0 })

    const result = runTaskStatutI18nMigration(mockDb as unknown as import('./migration-db-adapter').MigrationDb)

    expect(result).toBe(0)
    expect(mockDb.run).not.toHaveBeenCalled()
  })

  it('should return 0 when tasks table does not exist', () => {
    mockDb = createI18nMockDb({ schema: '', frenchCount: 0 })

    const result = runTaskStatutI18nMigration(mockDb as unknown as import('./migration-db-adapter').MigrationDb)

    expect(result).toBe(0)
    expect(mockDb.run).not.toHaveBeenCalled()
  })

  it('should recreate table and return frenchCount when French values exist', () => {
    const frenchSchema = `CREATE TABLE tasks (statut TEXT DEFAULT 'a_faire' CHECK(statut IN ('a_faire','en_cours','terminé','archivé')))`
    mockDb = createI18nMockDb({ schema: frenchSchema, frenchCount: 7 })

    const result = runTaskStatutI18nMigration(mockDb as unknown as import('./migration-db-adapter').MigrationDb)

    expect(result).toBe(7)
    // Should call ALTER TABLE RENAME TO ...
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE tasks RENAME TO tasks_backup_i18n')
    )
    // Should create new table with English CHECK
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining("'todo','in_progress','done','archived'")
    )
    // Should create priority column in new table
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining("'low','normal','high','critical'")
    )
    // Should INSERT SELECT with CASE expression
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('CASE COALESCE(statut')
    )
    // Should DROP backup table
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('DROP TABLE tasks_backup_i18n')
    )
  })

  it('should recreate table with English schema even when no French data but schema is French', () => {
    const frenchSchema = `CREATE TABLE tasks (statut TEXT DEFAULT 'a_faire' CHECK(statut IN ('a_faire','en_cours','terminé','archivé')))`
    // No French data (frenchCount=0) but schema is not English (no 'todo')
    mockDb = createI18nMockDb({ schema: frenchSchema, frenchCount: 0 })

    const result = runTaskStatutI18nMigration(mockDb as unknown as import('./migration-db-adapter').MigrationDb)

    // Should still recreate the table (schema upgrade needed)
    expect(result).toBe(0)
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE tasks RENAME TO tasks_backup_i18n')
    )
  })

  it('should include terminé → done in CASE mapping', () => {
    const frenchSchema = `CREATE TABLE tasks (statut TEXT DEFAULT 'a_faire' CHECK(statut IN ('a_faire','en_cours','terminé','archivé')))`
    mockDb = createI18nMockDb({ schema: frenchSchema, frenchCount: 3 })

    runTaskStatutI18nMigration(mockDb as unknown as import('./migration-db-adapter').MigrationDb)

    const insertCall = (mockDb.run as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO tasks')
    )
    expect(insertCall).toBeDefined()
    const insertSql = insertCall![0] as string
    expect(insertSql).toContain("WHEN 'terminé'  THEN 'done'")
    expect(insertSql).toContain("WHEN 'archivé'  THEN 'archived'")
    expect(insertSql).toContain("WHEN 'validé'   THEN 'archived'")
  })

  it('should use existing priority values when column already present', () => {
    const frenchSchema = `CREATE TABLE tasks (statut TEXT DEFAULT 'a_faire' CHECK(statut IN ('a_faire','en_cours','terminé','archivé')))`
    const colNames = ['id', 'titre', 'statut', 'priority', 'created_at', 'updated_at']
    mockDb = createI18nMockDb({ schema: frenchSchema, frenchCount: 2, oldColNames: colNames })

    runTaskStatutI18nMigration(mockDb as unknown as import('./migration-db-adapter').MigrationDb)

    const insertCall = (mockDb.run as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO tasks')
    )
    expect(insertCall).toBeDefined()
    const insertSql = insertCall![0] as string
    // priority should be copied from old table (not defaulted)
    expect(insertSql).toContain('priority,')
    // The SELECT clause should use 'priority' as a column reference, not the default literal "'normal'"
    // Extract only the column list between SELECT and FROM to avoid false positives
    const betweenSelectAndFrom = insertSql.split('SELECT ')[1]?.split(' FROM ')[0] ?? ''
    expect(betweenSelectAndFrom).toMatch(/\bpriority\b/) // priority = column ref, not literal
    expect(betweenSelectAndFrom).not.toContain("'normal'") // not using the default literal value
  })
})

// ── runRemoveThinkingModeBudgetTokensMigration ──────────────────────────────────

describe('runRemoveThinkingModeBudgetTokensMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createAgentsMockDb(schema: string, colNames: string[] = ['id', 'name', 'type', 'perimetre', 'system_prompt', 'system_prompt_suffix', 'thinking_mode', 'allowed_tools', 'created_at']) {
    const pragmaValues = colNames.map((name, idx) => [idx, name, 'TEXT', 0, null, 0])
    return {
      exec: vi.fn().mockImplementation((query: string) => {
        if (query.includes('sqlite_master')) {
          if (schema) return [{ columns: ['sql'], values: [[schema]] }]
          return []
        }
        if (query.includes('PRAGMA table_info')) {
          return [{ columns: ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'], values: pragmaValues }]
        }
        return []
      }),
      run: vi.fn(),
      getRowsModified: vi.fn().mockReturnValue(0),
    }
  }

  it('should return false when agents table does not exist', () => {
    const mockDb = {
      exec: vi.fn().mockReturnValue([]),
      run: vi.fn(),
      getRowsModified: vi.fn().mockReturnValue(0),
    }

    const result = runRemoveThinkingModeBudgetTokensMigration(mockDb as unknown as import('./migration-db-adapter').MigrationDb)

    expect(result).toBe(false)
    expect(mockDb.run).not.toHaveBeenCalled()
  })

  it('should return false when budget_tokens is NOT in the schema (already migrated)', () => {
    const modernSchema = `CREATE TABLE agents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, type TEXT NOT NULL, thinking_mode TEXT CHECK(thinking_mode IN ('auto', 'disabled')))`
    const mockDb = createAgentsMockDb(modernSchema)

    const result = runRemoveThinkingModeBudgetTokensMigration(mockDb as unknown as import('./migration-db-adapter').MigrationDb)

    expect(result).toBe(false)
    expect(mockDb.run).not.toHaveBeenCalled()
  })

  it('should return true and recreate table when budget_tokens IS in the schema', () => {
    const oldSchema = `CREATE TABLE agents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, type TEXT NOT NULL, thinking_mode TEXT CHECK(thinking_mode IN ('auto', 'disabled', 'budget_tokens')))`
    const mockDb = createAgentsMockDb(oldSchema)

    const result = runRemoveThinkingModeBudgetTokensMigration(mockDb as unknown as import('./migration-db-adapter').MigrationDb)

    expect(result).toBe(true)
    // Should rename old table
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE agents RENAME TO agents_backup_thinking')
    )
    // Should create new table with updated CHECK constraint
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining("CHECK(thinking_mode IN ('auto', 'disabled'))")
    )
    // New schema must NOT contain budget_tokens
    const createCall = (mockDb.run as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('CREATE TABLE agents')
    )
    expect(createCall).toBeDefined()
    expect(createCall![0] as string).not.toContain('budget_tokens')
    // Should drop backup table
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('DROP TABLE agents_backup_thinking')
    )
  })

  it('should convert budget_tokens values to NULL in the INSERT SELECT', () => {
    const oldSchema = `CREATE TABLE agents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, type TEXT NOT NULL, thinking_mode TEXT CHECK(thinking_mode IN ('auto', 'disabled', 'budget_tokens')))`
    const mockDb = createAgentsMockDb(oldSchema)

    runRemoveThinkingModeBudgetTokensMigration(mockDb as unknown as import('./migration-db-adapter').MigrationDb)

    const insertCall = (mockDb.run as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents')
    )
    expect(insertCall).toBeDefined()
    const insertSql = insertCall![0] as string
    expect(insertSql).toContain("WHEN 'budget_tokens' THEN NULL")
  })

  it('should be idempotent: running twice returns false on second call', () => {
    // First call: schema has budget_tokens → returns true, recreates table
    // Second call mock: schema is already clean → returns false
    const oldSchema = `CREATE TABLE agents (thinking_mode TEXT CHECK(thinking_mode IN ('auto', 'disabled', 'budget_tokens')))`
    const newSchema = `CREATE TABLE agents (thinking_mode TEXT CHECK(thinking_mode IN ('auto', 'disabled')))`

    let callCount = 0
    const mockDb = {
      exec: vi.fn().mockImplementation((query: string) => {
        if (query.includes('sqlite_master')) {
          callCount++
          const schema = callCount === 1 ? oldSchema : newSchema
          return [{ columns: ['sql'], values: [[schema]] }]
        }
        if (query.includes('PRAGMA table_info')) {
          return [{ columns: ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'], values: [[0, 'thinking_mode', 'TEXT', 0, null, 0]] }]
        }
        return []
      }),
      run: vi.fn(),
      getRowsModified: vi.fn().mockReturnValue(0),
    }

    const first = runRemoveThinkingModeBudgetTokensMigration(mockDb as unknown as import('./migration-db-adapter').MigrationDb)
    expect(first).toBe(true)

    const second = runRemoveThinkingModeBudgetTokensMigration(mockDb as unknown as import('./migration-db-adapter').MigrationDb)
    expect(second).toBe(false)
  })

  it('should use SAVEPOINT for atomicity', () => {
    const oldSchema = `CREATE TABLE agents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, type TEXT NOT NULL, thinking_mode TEXT CHECK(thinking_mode IN ('auto', 'disabled', 'budget_tokens')))`
    const mockDb = createAgentsMockDb(oldSchema)

    runRemoveThinkingModeBudgetTokensMigration(mockDb as unknown as import('./migration-db-adapter').MigrationDb)

    const calls = (mockDb.run as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0] as string)
    expect(calls.some(s => s.includes('SAVEPOINT remove_budget_tokens'))).toBe(true)
    expect(calls.some(s => s.includes('RELEASE SAVEPOINT remove_budget_tokens'))).toBe(true)
    // ROLLBACK should NOT have been called on success
    expect(calls.some(s => s.includes('ROLLBACK TO SAVEPOINT'))).toBe(false)
  })
})
