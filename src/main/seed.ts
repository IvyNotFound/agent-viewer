/**
 * Seed script: inserts demo data into .claude/project.db.
 *
 * Creates sample agents, sessions, tasks, and locks for local development.
 * Intended for development/testing only — not executed at runtime.
 *
 * @example
 * ```bash
 * npx tsx src/main/seed.ts .claude/project.db
 * ```
 *
 * @module seed
 */
import { Database } from 'node-sqlite3-wasm'
import { join } from 'path'

const dbPath = process.argv[2] ?? join(process.cwd(), '.claude/project.db')
const db = new Database(dbPath)

db.exec(`
INSERT OR IGNORE INTO agents (name, type, perimetre) VALUES
  ('dev-front-vuejs', 'dev', 'front-vuejs'),
  ('dev-back-electron', 'dev', 'back-electron'),
  ('review', 'review', NULL),
  ('git', 'git', NULL);

INSERT INTO sessions (agent_id, statut) VALUES
  ((SELECT id FROM agents WHERE name = 'dev-front-vuejs'), 'started'),
  ((SELECT id FROM agents WHERE name = 'dev-back-electron'), 'completed');

UPDATE sessions SET ended_at = CURRENT_TIMESTAMP, summary = 'Done: IPC handlers. Next: renderer store.'
WHERE agent_id = (SELECT id FROM agents WHERE name = 'dev-back-electron') AND statut = 'completed';

INSERT INTO tasks (titre, description, statut, agent_createur_id, agent_assigne_id, perimetre) VALUES
  ('Setup Electron + Vite config', 'Configurer electron-vite, tsconfig, tailwind', 'archived',
    (SELECT id FROM agents WHERE name = 'dev-back-electron'),
    (SELECT id FROM agents WHERE name = 'dev-back-electron'), 'back-electron'),
  ('IPC handlers better-sqlite3', 'query-db, select-db-file, window controls', 'done',
    (SELECT id FROM agents WHERE name = 'dev-back-electron'),
    (SELECT id FROM agents WHERE name = 'dev-back-electron'), 'back-electron'),
  ('Composant BoardView', 'Board Trello 4 colonnes statut', 'in_progress',
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'),
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'), 'front-vuejs'),
  ('Composant TaskCard', 'Carte tâche avec badges agent et périmètre', 'in_progress',
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'),
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'), 'front-vuejs'),
  ('Store Pinia + polling', 'Auto-refresh toutes les 5s', 'todo',
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'),
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'), 'front-vuejs'),
  ('Dark mode Tailwind', 'Palette zinc + violet, classe dark permanente', 'todo',
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'),
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'), 'front-vuejs');

INSERT INTO locks (fichier, agent_id) VALUES
  ('src/renderer/src/components/BoardView.vue',
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'));
`)

console.log('Seed OK —', dbPath)
db.close()
