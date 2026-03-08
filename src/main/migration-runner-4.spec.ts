import { describe, it, expect, vi, beforeEach } from 'vitest'
import { migrateDb } from './migration'

// ── Helpers (duplicate-free, minimal) ─────────────────────────────────────────

function makeMockDb({
  userVersion = 0,
  hasConfigTable = false,
  colMap = {} as Record<string, string[]>,
  tableMap = {} as Record<string, boolean>,
  taskLinksSql = '',
}: {
  userVersion?: number
  hasConfigTable?: boolean
  colMap?: Record<string, string[]>
  tableMap?: Record<string, boolean>
  taskLinksSql?: string
} = {}) {
  let currentVersion = userVersion

  const exec = vi.fn().mockImplementation((query: string) => {
    if (query.includes('PRAGMA user_version')) {
      return [{ columns: ['user_version'], values: [[currentVersion]] }]
    }
    if (query.includes("key = 'schema_version'")) {
      return hasConfigTable ? [{ columns: ['value'], values: [['23']] }] : []
    }
    const tiMatch = query.match(/PRAGMA table_info\((\w+)\)/)
    if (tiMatch) {
      const tableName = tiMatch[1]
      const cols = colMap[tableName]
      if (!cols || cols.length === 0) return []
      return [{ columns: ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'], values: cols.map((n, i) => [i, n, 'TEXT', 0, null, 0]) }]
    }
    if (query.includes('COUNT(*)') && query.includes('sqlite_master')) {
      const nameMatch = query.match(/name='(\w+)'/)
      if (nameMatch) {
        const exists = tableMap[nameMatch[1]] ?? false
        return [{ columns: ['COUNT(*)'], values: [[exists ? 1 : 0]] }]
      }
    }
    if (query.includes('sqlite_master') && query.includes("type='table'")) {
      if (query.includes("name='task_links'") && query.includes('sql')) {
        return taskLinksSql ? [{ columns: ['sql'], values: [[taskLinksSql]] }] : []
      }
      const nameMatch = query.match(/name='(\w+)'/)
      if (nameMatch) {
        const exists = tableMap[nameMatch[1]] ?? false
        return exists ? [{ columns: ['name'], values: [[nameMatch[1]]] }] : []
      }
    }
    return []
  })

  const run = vi.fn().mockImplementation((sql: string) => {
    const m = sql.match(/PRAGMA user_version\s*=\s*(\d+)/)
    if (m) currentVersion = Number(m[1])
  })

  return { exec, run, _getVersion: () => currentVersion }
}

// ── migrateDb v25 — hasTable COUNT(*) > 0 ────────────────────────────────────

describe('migrateDb v25 — hasTable() guard (COUNT(*) > 0)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renames perimetres → scopes when perimetres table exists and scopes does not', () => {
    const db = makeMockDb({
      userVersion: 24,
      tableMap: { perimetres: true, scopes: false },
      colMap: {
        perimetres: ['id', 'name', 'dossier', 'actif'],
        agents: ['id', 'name', 'perimetre'],
        sessions: ['id', 'statut'],
        tasks: ['id', 'titre', 'statut', 'agent_createur_id', 'agent_assigne_id', 'agent_valideur_id', 'perimetre'],
        task_comments: ['id', 'task_id', 'contenu'],
        locks: ['id', 'fichier'],
        agent_logs: ['id', 'niveau', 'fichiers'],
      },
    })
    migrateDb(db as unknown as import('./migration-db-adapter').MigrationDb)
    const calls = db.run.mock.calls.map((c: string[]) => c[0])
    expect(calls.some((s: string) => s.includes('ALTER TABLE perimetres RENAME TO scopes'))).toBe(true)
  })

  it('skips perimetres rename when scopes already exists', () => {
    const db = makeMockDb({
      userVersion: 24,
      tableMap: { perimetres: true, scopes: true },
      colMap: {
        perimetres: ['id', 'name', 'dossier', 'actif'],
        agents: ['id', 'name', 'scope'],
        sessions: ['id', 'status'],
        tasks: ['id', 'title', 'status'],
        task_comments: ['id', 'task_id', 'content'],
        locks: ['id', 'file'],
        agent_logs: ['id', 'level', 'files'],
      },
    })
    migrateDb(db as unknown as import('./migration-db-adapter').MigrationDb)
    const calls = db.run.mock.calls.map((c: string[]) => c[0])
    expect(calls.every((s: string) => !s.includes('RENAME TO scopes'))).toBe(true)
  })

  it('skips perimetres rename when perimetres table does not exist', () => {
    const db = makeMockDb({
      userVersion: 24,
      tableMap: { perimetres: false, scopes: false },
      colMap: {
        agents: ['id', 'name', 'scope'],
        sessions: ['id', 'status'],
        tasks: ['id', 'title', 'status'],
        task_comments: ['id', 'task_id', 'content'],
        locks: ['id', 'file'],
        agent_logs: ['id', 'level', 'files'],
      },
    })
    migrateDb(db as unknown as import('./migration-db-adapter').MigrationDb)
    const calls = db.run.mock.calls.map((c: string[]) => c[0])
    expect(calls.every((s: string) => !s.includes('RENAME TO scopes'))).toBe(true)
  })
})

// ── migrateDb v25 — French columns renamed to English ────────────────────────

describe('migrateDb v25 — French column rename', () => {
  beforeEach(() => vi.clearAllMocks())

  function createFrenchDb() {
    return makeMockDb({
      userVersion: 24,
      tableMap: { perimetres: true, scopes: false },
      colMap: {
        perimetres: ['id', 'name', 'dossier', 'actif'],
        agents: ['id', 'name', 'perimetre'],
        sessions: ['id', 'statut'],
        tasks: ['id', 'titre', 'statut', 'agent_createur_id', 'agent_assigne_id', 'agent_valideur_id', 'perimetre'],
        task_comments: ['id', 'task_id', 'contenu'],
        locks: ['id', 'fichier'],
        agent_logs: ['id', 'niveau', 'fichiers'],
      },
    })
  }

  it('renames agents.perimetre → scope', () => {
    const db = createFrenchDb()
    migrateDb(db as unknown as import('./migration-db-adapter').MigrationDb)
    const calls = db.run.mock.calls.map((c: string[]) => c[0])
    expect(calls.some((s: string) => s.includes('RENAME COLUMN perimetre TO scope'))).toBe(true)
  })

  it('renames sessions.statut → status', () => {
    const db = createFrenchDb()
    migrateDb(db as unknown as import('./migration-db-adapter').MigrationDb)
    const calls = db.run.mock.calls.map((c: string[]) => c[0])
    expect(calls.some((s: string) => s.includes('RENAME COLUMN statut TO status'))).toBe(true)
  })

  it('renames tasks French columns (titre, statut, agent_createur_id, etc.)', () => {
    const db = createFrenchDb()
    migrateDb(db as unknown as import('./migration-db-adapter').MigrationDb)
    const calls = db.run.mock.calls.map((c: string[]) => c[0])
    expect(calls.some((s: string) => s.includes('RENAME COLUMN titre TO title'))).toBe(true)
    expect(calls.some((s: string) => s.includes('RENAME COLUMN agent_createur_id TO agent_creator_id'))).toBe(true)
    expect(calls.some((s: string) => s.includes('RENAME COLUMN agent_assigne_id TO agent_assigned_id'))).toBe(true)
    expect(calls.some((s: string) => s.includes('RENAME COLUMN agent_valideur_id TO agent_validator_id'))).toBe(true)
  })

  it('renames task_comments.contenu → content', () => {
    const db = createFrenchDb()
    migrateDb(db as unknown as import('./migration-db-adapter').MigrationDb)
    const calls = db.run.mock.calls.map((c: string[]) => c[0])
    expect(calls.some((s: string) => s.includes('RENAME COLUMN contenu TO content'))).toBe(true)
  })

  it('renames locks.fichier → file', () => {
    const db = createFrenchDb()
    migrateDb(db as unknown as import('./migration-db-adapter').MigrationDb)
    const calls = db.run.mock.calls.map((c: string[]) => c[0])
    expect(calls.some((s: string) => s.includes('RENAME COLUMN fichier TO file'))).toBe(true)
  })

  it('renames agent_logs.niveau → level and fichiers → files', () => {
    const db = createFrenchDb()
    migrateDb(db as unknown as import('./migration-db-adapter').MigrationDb)
    const calls = db.run.mock.calls.map((c: string[]) => c[0])
    expect(calls.some((s: string) => s.includes('RENAME COLUMN niveau TO level'))).toBe(true)
    expect(calls.some((s: string) => s.includes('RENAME COLUMN fichiers TO files'))).toBe(true)
  })

  it('is idempotent — skips all renames when columns already in English', () => {
    const db = makeMockDb({
      userVersion: 24,
      tableMap: { perimetres: false, scopes: true },
      colMap: {
        scopes: ['id', 'name', 'folder', 'active'],
        agents: ['id', 'name', 'scope'],
        sessions: ['id', 'status'],
        tasks: ['id', 'title', 'status', 'agent_creator_id', 'agent_assigned_id', 'agent_validator_id', 'scope'],
        task_comments: ['id', 'task_id', 'content'],
        locks: ['id', 'file'],
        agent_logs: ['id', 'level', 'files'],
      },
    })
    migrateDb(db as unknown as import('./migration-db-adapter').MigrationDb)
    const calls = db.run.mock.calls.map((c: string[]) => c[0])
    const renameRuns = calls.filter((s: string) => s.includes('RENAME COLUMN') && !s.includes('tasks_fts'))
    expect(renameRuns).toHaveLength(0)
  })
})

// ── migrateDb v25 — task_links recreation ────────────────────────────────────

describe('migrateDb v25 — task_links French constraint recreation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('recreates task_links when schema contains French constraint names', () => {
    const frenchTaskLinksSchema = `CREATE TABLE task_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_task INTEGER NOT NULL REFERENCES tasks(id),
      to_task INTEGER NOT NULL REFERENCES tasks(id),
      type TEXT NOT NULL CHECK(type IN ('bloque','dépend_de','lié_à','duplique')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
    const db = makeMockDb({
      userVersion: 24,
      taskLinksSql: frenchTaskLinksSchema,
      tableMap: { perimetres: false },
      colMap: {
        agents: ['id', 'name', 'scope'],
        sessions: ['id', 'status'],
        tasks: ['id', 'title', 'status'],
        task_comments: ['id', 'content'],
        locks: ['id', 'file'],
        agent_logs: ['id', 'level', 'files'],
      },
    })
    migrateDb(db as unknown as import('./migration-db-adapter').MigrationDb)
    const calls = db.run.mock.calls.map((c: string[]) => c[0])
    expect(calls.some((s: string) => s.includes('task_links_new'))).toBe(true)
    expect(calls.some((s: string) => s.includes('DROP TABLE task_links'))).toBe(true)
  })

  it('skips task_links recreation when schema already uses English constraint', () => {
    const englishTaskLinksSchema = `CREATE TABLE task_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_task INTEGER NOT NULL,
      to_task INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('blocks','depends_on','related_to','duplicates')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
    const db = makeMockDb({
      userVersion: 24,
      taskLinksSql: englishTaskLinksSchema,
      tableMap: { perimetres: false },
      colMap: {
        agents: ['id', 'name', 'scope'],
        sessions: ['id', 'status'],
        tasks: ['id', 'title', 'status'],
        task_comments: ['id', 'content'],
        locks: ['id', 'file'],
        agent_logs: ['id', 'level', 'files'],
      },
    })
    migrateDb(db as unknown as import('./migration-db-adapter').MigrationDb)
    const calls = db.run.mock.calls.map((c: string[]) => c[0])
    expect(calls.every((s: string) => !s.includes('task_links_new'))).toBe(true)
  })
})
