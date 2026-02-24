/**
 * Seed script: inserts demo data into .claude/project.db
 * Run: npx tsx src/main/seed.ts .claude/project.db
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
  ((SELECT id FROM agents WHERE name = 'dev-front-vuejs'), 'en_cours'),
  ((SELECT id FROM agents WHERE name = 'dev-back-electron'), 'terminé');

UPDATE sessions SET ended_at = CURRENT_TIMESTAMP, summary = 'Done: IPC handlers. Next: renderer store.'
WHERE agent_id = (SELECT id FROM agents WHERE name = 'dev-back-electron') AND statut = 'terminé';

INSERT INTO tasks (titre, description, statut, agent_createur_id, agent_assigne_id, perimetre) VALUES
  ('Setup Electron + Vite config', 'Configurer electron-vite, tsconfig, tailwind', 'validé',
    (SELECT id FROM agents WHERE name = 'dev-back-electron'),
    (SELECT id FROM agents WHERE name = 'dev-back-electron'), 'back-electron'),
  ('IPC handlers better-sqlite3', 'query-db, select-db-file, window controls', 'terminé',
    (SELECT id FROM agents WHERE name = 'dev-back-electron'),
    (SELECT id FROM agents WHERE name = 'dev-back-electron'), 'back-electron'),
  ('Composant BoardView', 'Board Trello 4 colonnes statut', 'en_cours',
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'),
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'), 'front-vuejs'),
  ('Composant TaskCard', 'Carte tâche avec badges agent et périmètre', 'en_cours',
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'),
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'), 'front-vuejs'),
  ('Store Pinia + polling', 'Auto-refresh toutes les 5s', 'a_faire',
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'),
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'), 'front-vuejs'),
  ('Dark mode Tailwind', 'Palette zinc + violet, classe dark permanente', 'a_faire',
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'),
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'), 'front-vuejs');

INSERT INTO locks (fichier, agent_id) VALUES
  ('src/renderer/src/components/BoardView.vue',
    (SELECT id FROM agents WHERE name = 'dev-front-vuejs'));
`)

console.log('Seed OK —', dbPath)
db.close()
