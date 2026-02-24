# CLAUDE.md — Contexte du projet agent-viewer

> **IMPORTANT :** Ce fichier est en **lecture seule** sauf pour `setup`.
> État vivant (tâches, locks, sessions, logs) → **`.claude/project.db`** uniquement. Jamais dans ce fichier.

---

# PARTIE I — Référence quotidienne

## Configuration

```
MODE        : solo
LANG_CONV   : français
LANG_CODE   : english
```

Solo : pas de préfixe, `review` = `review-master`.

---

## Projet

**agent-viewer** — Interface desktop style Trello/Jira pour visualiser en temps réel les tâches des agents Claude depuis une base SQLite. L'utilisateur branche l'app sur un fichier `.claude/project.db` existant et obtient une vue board, dark mode. Déploiement : app desktop locale (Electron). Auth : aucune.

### Utilisateurs

| Identifiant | Rôle | Branche |
|---|---|---|
| IvyNotFound | lead | `main` |

### Périmètres

| Périmètre | Dossier | Techno | Fichiers clés | Conventions |
|---|---|---|---|---|
| `front-vuejs` | `renderer/` | Vue 3 + TypeScript + Tailwind CSS | `renderer/src/main.ts`, `renderer/src/App.vue`, `vite.config.ts` | ESLint Airbnb, Vitest, dark mode Tailwind |
| `back-electron` | `main/` | Electron + Node.js + better-sqlite3 | `main/index.ts`, `main/ipc.ts`, `electron-builder.config.ts` | ESLint, tests Jest, IPC typé |
| `.claude/` | `.claude/` | — | `settings.json`, `project.db` | ne jamais éditer `project.db` manuellement |

Conventions partagées : conversations **français** · code/logs **anglais** · tests obligatoires · 0 lint · Conventional Commits (`feat|fix|chore|docs|refactor|test|perf|style`)

**back-electron** — IPC handlers typés, accès SQLite en read-only sur le fichier cible, sécurité contextBridge obligatoire.
**front-vuejs** — Dark mode Tailwind, composants Trello/Jira (colonnes par statut, cartes tâches), pas de dépendances CSS lourdes, Tailwind suffit.

### État — 2026-02-24

| Version | Périmètres actifs | Tests | Lint | Build | Branche | Remote |
|---|---|---|---|---|---|---|
| `0.1.0` | front-vuejs, back-electron | 0 | non conf. | non conf. | `main` | non conf. |

> Tâches live : `SELECT statut, COUNT(*) FROM tasks GROUP BY statut;`

### Commandes

```bash
# install
npm install

# dev (Electron + Vite hot-reload)
npm run dev

# build desktop app
npm run build

# tests
npm test

# lint
npm run lint
```

### Variables d'environnement

| Variable | Périmètre | Requis | Exemple | Secret |
|---|---|---|---|---|
| aucune pour l'instant | — | Non | — | non |

### Fichiers protégés

`dist/` `dist-electron/` (générés) · `node_modules/` · `CLAUDE.md` (config stable) · `.claude/project.db` (jamais éditer manuellement)

---

## Agents

### Globaux

| Agent | Responsabilités |
|---|---|
| **review-master** | Audit global, arbitrage inter-périmètres, validation tâches. Solo = `review`. |
| **review** | Audit périmètre. Passe tâches à `terminé` ou `validé`. |
| **git** | Commits, push, branches, CI/CD, releases |
| **arch** | ADR, interfaces IPC Electron ↔ Vue |
| **doc** | README, CONTRIBUTING, JSDoc |
| **setup** | Initialisation uniquement. Usage unique. |

### Scopés par périmètre

| Type | Exemple solo | Rôle |
|---|---|---|
| **dev** | `dev-front-vuejs` | Implémentation Vue / composants |
| **dev** | `dev-back-electron` | IPC handlers, accès SQLite |
| **test** | `test-front-vuejs` | Tests Vitest composants |
| **test** | `test-back-electron` | Tests Jest main process |
| **ux** | `ux-front-vuejs` | UX/UI dark mode, board |

---

## Protocole de session

### Démarrage

Si type/périmètre non précisé → **AskUserQuestion** (voir Partie II § Questions de démarrage).

```bash
printf '\033]0;%s\007' "<agent>"
```

```sql
INSERT OR IGNORE INTO agents (name, type, perimetre) VALUES ('<agent>', '<type>', '<perimetre>');
INSERT INTO sessions (agent_id) VALUES ((SELECT id FROM agents WHERE name = '<agent>'));
-- → conserver le session_id

INSERT INTO agent_logs (session_id, agent_id, niveau, action, detail)
VALUES (:session_id, :agent_id, 'info', 'Session started', 'Perimetre: <perimetre>.');

-- Locks actifs
SELECT l.fichier, a.name FROM locks l JOIN agents a ON a.id = l.agent_id WHERE l.released_at IS NULL;

-- Dernière session
SELECT summary FROM sessions s JOIN agents a ON a.id = s.agent_id
WHERE a.name = '<agent>' AND s.statut = 'terminé' ORDER BY s.ended_at DESC LIMIT 1;

-- Tâches ouvertes
SELECT id, titre, statut FROM tasks
WHERE agent_assigne_id = (SELECT id FROM agents WHERE name = '<agent>')
AND statut IN ('a_faire', 'en_cours') ORDER BY updated_at DESC;
```

### Pendant

```sql
INSERT INTO agent_logs (session_id, agent_id, niveau, action, detail, fichiers)
VALUES (:session_id, :agent_id, 'info', '<titre>', '<détail>', '["fichier1"]');

INSERT OR REPLACE INTO locks (fichier, agent_id, session_id) VALUES ('<fichier>', :agent_id, :session_id);

INSERT INTO tasks (titre, description, statut, agent_createur_id, agent_assigne_id, perimetre, session_id)
VALUES ('<titre>', '<desc>', 'a_faire', :agent_id, :agent_id, '<perimetre>', :session_id);
UPDATE tasks SET statut = 'en_cours' WHERE id = :task_id;

INSERT INTO task_comments (task_id, agent_id, contenu) VALUES (:task_id, :agent_id, '<texte>');
INSERT INTO task_links (from_task, to_task, type) VALUES (:a, :b, 'bloque');
```

### Fin

```sql
UPDATE locks SET released_at = CURRENT_TIMESTAMP WHERE agent_id = :agent_id AND released_at IS NULL;
UPDATE sessions SET statut = 'terminé', ended_at = CURRENT_TIMESTAMP,
  summary = 'Done: <fait>. Pending: <restant>. Next: <suite>.' WHERE id = :session_id;
```

### Règles inter-agents

- Un agent = un périmètre — ne jamais déborder sans le signaler
- Vérifier les locks avant de modifier · Poser un lock immédiatement
- Interfaces IPC Electron ↔ Vue → passer par `arch` avant d'implémenter
- Jamais de push direct sur `main` en multi-user
- Actions production : validation humaine obligatoire

---

## Informations critiques

| Problème | Périmètre | Cause | Solution |
|---|---|---|---|
| *(à compléter au fil du projet)* | | | |

---

# PARTIE II — Setup & référence technique

> Consulter uniquement lors de l'initialisation ou pour référence sur l'infrastructure.

---

## Questions de démarrage

À poser via `AskUserQuestion` si le type ou le périmètre n'est pas précisé.

**Question 1 — Type d'agent :**
```json
{
  "questions": [{
    "question": "Quel type d'agent suis-je ?",
    "multiSelect": false,
    "options": [
      { "label": "review-master", "description": "Audit global (lead uniquement)" },
      { "label": "review",        "description": "Audit local de mon périmètre" },
      { "label": "dev",           "description": "Nouvelles fonctionnalités" },
      { "label": "test",          "description": "Tests & couverture" },
      { "label": "doc",           "description": "README, CONTRIBUTING, JSDoc" },
      { "label": "git",           "description": "Commits, push, CI/CD" },
      { "label": "ux",            "description": "Interface utilisateur & expérience" },
      { "label": "arch",          "description": "Architecture, ADR, choix de stack" }
    ]
  }]
}
```

**Question 2 — Périmètre** (pour `dev`, `test`, `ux`) :
```json
{
  "questions": [{
    "question": "Sur quel périmètre travailles-tu ?",
    "multiSelect": false,
    "options": [
      { "label": "front-vuejs",    "description": "Renderer Vue 3 + Tailwind" },
      { "label": "back-electron",  "description": "Main process Electron + SQLite" },
      { "label": "global",         "description": "Pas de périmètre spécifique" }
    ]
  }]
}
```

---

## Base de données MCP

> `mcp-server-sqlite` — source de vérité pour tâches, locks, sessions, logs.

### Configuration MCP

`.claude/settings.json` :
```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", ".claude/project.db"]
    }
  }
}
```

### Schéma SQL

```sql
CREATE TABLE IF NOT EXISTS agents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    type        TEXT NOT NULL,
    perimetre   TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id    INTEGER NOT NULL REFERENCES agents(id),
    started_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at    DATETIME,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    statut      TEXT NOT NULL DEFAULT 'en_cours'
                CHECK(statut IN ('en_cours', 'terminé', 'bloqué')),
    summary     TEXT
);

CREATE TABLE IF NOT EXISTS agent_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES sessions(id),
    agent_id    INTEGER NOT NULL REFERENCES agents(id),
    niveau      TEXT NOT NULL DEFAULT 'info'
                CHECK(niveau IN ('info', 'warn', 'error', 'debug')),
    action      TEXT NOT NULL,
    detail      TEXT,
    fichiers    TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    titre               TEXT NOT NULL,
    description         TEXT,
    commentaire         TEXT,
    statut              TEXT NOT NULL DEFAULT 'a_faire'
                        CHECK(statut IN ('a_faire', 'en_cours', 'terminé', 'validé')),
    agent_createur_id   INTEGER REFERENCES agents(id),
    agent_assigne_id    INTEGER REFERENCES agents(id),
    agent_valideur_id   INTEGER REFERENCES agents(id),
    parent_task_id      INTEGER REFERENCES tasks(id),
    session_id          INTEGER REFERENCES sessions(id),
    perimetre           TEXT,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at          DATETIME,
    completed_at        DATETIME,
    validated_at        DATETIME
);

CREATE TABLE IF NOT EXISTS task_links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    from_task   INTEGER NOT NULL REFERENCES tasks(id),
    to_task     INTEGER NOT NULL REFERENCES tasks(id),
    type        TEXT NOT NULL
                CHECK(type IN ('bloque', 'dépend_de', 'lié_à', 'duplique')),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     INTEGER NOT NULL REFERENCES tasks(id),
    agent_id    INTEGER REFERENCES agents(id),
    contenu     TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS locks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    fichier     TEXT NOT NULL UNIQUE,
    agent_id    INTEGER NOT NULL REFERENCES agents(id),
    session_id  INTEGER REFERENCES sessions(id),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    released_at DATETIME
);
```
