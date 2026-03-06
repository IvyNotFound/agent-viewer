/**
 * Shared test utilities for IPC integration tests — T985
 *
 * Provides:
 * - Shared in-memory DB buffer (dbBuffer, dbMtime)
 * - buildSchema(): sql.js Database with full schema
 * - insertAgent(), insertSession(), insertTask() helpers
 * - TEST_DB_PATH, TEST_PROJECT_PATH constants
 *
 * Usage: import from this module AFTER all vi.mock() calls in each spec file.
 */

import { getSqlJs, queryLive, writeDb } from '../db'

export const TEST_DB_PATH = '/test/ipc-integration-test.db'
export const TEST_PROJECT_PATH = '/test/project'

// ── Shared in-memory buffer (exported for mock closures) ──────────────────────
export let dbBuffer: Buffer = Buffer.alloc(0)
export let dbMtime = 1000

export function setDbBuffer(buf: Buffer): void {
  dbBuffer = buf
}

export function setDbMtime(t: number): void {
  dbMtime = t
}

export function incrementDbMtime(): void {
  dbMtime += 1
}

export function getDbBuffer(): Buffer {
  return dbBuffer
}

export function getDbMtime(): number {
  return dbMtime
}

// ── Schema builder ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildSchema(): Promise<any> {
  const sqlJs = await getSqlJs()
  const db = new sqlJs.Database()

  db.run(`CREATE TABLE agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT,
    perimetre TEXT,
    system_prompt TEXT,
    system_prompt_suffix TEXT,
    thinking_mode TEXT,
    allowed_tools TEXT,
    auto_launch INTEGER NOT NULL DEFAULT 1,
    permission_mode TEXT DEFAULT 'default',
    max_sessions INTEGER NOT NULL DEFAULT 3,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT,
    description TEXT,
    statut TEXT DEFAULT 'todo',
    agent_createur_id INTEGER,
    agent_assigne_id INTEGER,
    agent_valideur_id INTEGER,
    parent_task_id INTEGER,
    session_id INTEGER,
    perimetre TEXT,
    effort INTEGER,
    priority TEXT DEFAULT 'normal',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    validated_at TEXT
  )`)

  db.run(`CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    statut TEXT DEFAULT 'started',
    summary TEXT,
    claude_conv_id TEXT,
    cost_usd REAL,
    duration_ms INTEGER,
    num_turns INTEGER,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    tokens_cache_read INTEGER DEFAULT 0,
    tokens_cache_write INTEGER DEFAULT 0
  )`)

  db.run(`CREATE TABLE task_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    agent_id INTEGER,
    contenu TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE task_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_task INTEGER,
    to_task INTEGER,
    type TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fichier TEXT,
    agent_id INTEGER,
    session_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    released_at TEXT
  )`)

  db.run(`CREATE TABLE agent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    agent_id INTEGER,
    niveau TEXT,
    action TEXT,
    detail TEXT,
    fichiers TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
  )`)

  db.run(`CREATE TABLE perimetres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    dossier TEXT,
    techno TEXT,
    description TEXT,
    actif INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE task_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    role TEXT CHECK(role IN ('primary', 'support', 'reviewer')),
    assigned_at TEXT DEFAULT (datetime('now')),
    UNIQUE(task_id, agent_id)
  )`)

  db.run(`CREATE TABLE agent_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    parent_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE agent_group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES agent_groups(id),
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(agent_id)
  )`)

  return db
}

// ── Data helpers ──────────────────────────────────────────────────────────────

export async function insertAgent(
  name: string,
  extra?: { type?: string; perimetre?: string }
): Promise<number> {
  await writeDb<void>(TEST_DB_PATH, (db) => {
    db.run('INSERT INTO agents (name, type, perimetre) VALUES (?, ?, ?)', [
      name,
      extra?.type ?? 'test',
      extra?.perimetre ?? null,
    ])
  })
  const rows = (await queryLive(TEST_DB_PATH, 'SELECT id FROM agents WHERE name = ?', [
    name,
  ])) as Array<{ id: number }>
  return rows[0].id
}

export async function insertSession(
  agentId: number,
  opts?: {
    statut?: string
    convId?: string
    costUsd?: number
    startedAt?: string
  }
): Promise<number> {
  await writeDb<void>(TEST_DB_PATH, (db) => {
    db.run(
      'INSERT INTO sessions (agent_id, statut, claude_conv_id, cost_usd, started_at) VALUES (?, ?, ?, ?, ?)',
      [
        agentId,
        opts?.statut ?? 'started',
        opts?.convId ?? null,
        opts?.costUsd ?? null,
        opts?.startedAt ?? "datetime('now')",
      ]
    )
  })
  const rows = (await queryLive(
    TEST_DB_PATH,
    'SELECT id FROM sessions WHERE agent_id = ? ORDER BY id DESC LIMIT 1',
    [agentId]
  )) as Array<{ id: number }>
  return rows[0].id
}

export async function insertTask(
  titre: string,
  opts?: {
    statut?: string
    agentId?: number | null
    perimetre?: string | null
    description?: string
  }
): Promise<number> {
  await writeDb<void>(TEST_DB_PATH, (db) => {
    db.run(
      'INSERT INTO tasks (titre, statut, agent_assigne_id, perimetre, description) VALUES (?, ?, ?, ?, ?)',
      [
        titre,
        opts?.statut ?? 'todo',
        opts?.agentId ?? null,
        opts?.perimetre ?? null,
        opts?.description ?? null,
      ]
    )
  })
  const rows = (await queryLive(
    TEST_DB_PATH,
    'SELECT id FROM tasks WHERE titre = ? ORDER BY id DESC LIMIT 1',
    [titre]
  )) as Array<{ id: number }>
  return rows[0].id
}
