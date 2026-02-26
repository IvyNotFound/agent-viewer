# Workflow tickets — SQL complet

> Statuts : `todo` → `in_progress` → `done` → `archived` (rejeté → retour `todo`)
> Résumé rapide → `CLAUDE.md` · Input session → `sessions.summary`

---

## Schéma (project.db)

> **Consulter avant d'écrire du SQL.** Ne jamais deviner les noms de colonnes.

```
agents          (id PK, name, type, perimetre, system_prompt, system_prompt_suffix, thinking_mode, allowed_tools, created_at)
sessions        (id PK, agent_id→agents, started_at, ended_at, updated_at, statut, summary, claude_conv_id)
tasks           (id PK, titre, description, statut, agent_createur_id→agents, agent_assigne_id→agents, agent_valideur_id→agents, parent_task_id→tasks, session_id→sessions, perimetre, effort, priority, created_at, updated_at, started_at, completed_at, validated_at)
task_comments   (id PK, task_id→tasks, agent_id→agents, contenu, created_at)
task_links      (id PK, from_task→tasks, to_task→tasks, type, created_at)
locks           (id PK, fichier, agent_id→agents, session_id→sessions, created_at, released_at)
agent_logs      (id PK, session_id→sessions, agent_id→agents, niveau, action, detail, fichiers, created_at)
perimetres      (id PK, name, dossier, techno, description, actif, created_at)
config          (key PK, value, updated_at)
```

> **Pièges :** `tasks` n'a **pas** `agent_id` → utiliser `agent_assigne_id`. `task_comments.agent_id` (pas `auteur_agent_id`).

---

## Exécution

```bash
node scripts/dbq.js "<SQL>"   # lecture (sql.js + fs.readFile, bypass lock)
node scripts/dbw.js "<SQL>"   # écriture
```

---

## Primitives SQL réutilisables

```sql
-- Commenter un ticket
INSERT INTO task_comments (task_id, agent_id, contenu) VALUES (:task_id, :agent_id, '<contenu>');

-- Locker un fichier (AVANT modification)
INSERT OR REPLACE INTO locks (fichier, agent_id, session_id) VALUES ('<fichier>', :agent_id, :session_id);

-- Libérer tous les locks
UPDATE locks SET released_at = CURRENT_TIMESTAMP WHERE agent_id = :agent_id AND session_id = :session_id AND released_at IS NULL;

-- Log (optionnel, omettre si contexte limité)
INSERT INTO agent_logs (session_id, agent_id, niveau, action, detail) VALUES (:session_id, :agent_id, 'info', '<action>', '<detail>');
```

---

## Étapes

### 1. Review crée le ticket

```sql
INSERT INTO tasks (titre, description, statut, agent_createur_id, agent_assigne_id, perimetre)
VALUES ('<titre>', '<description complète : contexte, symptômes, critères acceptation>', 'todo',
  (SELECT id FROM agents WHERE name = '<review>'),
  (SELECT id FROM agents WHERE name = '<agent-cible>'), '<perimetre>');
-- + commentaire (risques, dépendances) via primitive
```

> Description max verbeuse — un agent sans contexte doit pouvoir réaliser le ticket seul.

### 2. L'agent démarre sa session

```bash
node scripts/dbstart.js <agent> [type] [perimetre]
```

> Fait tout en un appel : enregistre l'agent, crée la session, affiche `agent_id` + `session_id`, session précédente, tâches assignées, locks actifs.
> Tâches trouvées → commencer immédiatement. Questions seulement si aucune tâche ET type non inférable.

### 3. L'agent prend le ticket

```sql
SELECT titre, description FROM tasks WHERE id = :task_id;
SELECT tc.contenu, a.name, tc.created_at FROM task_comments tc
  JOIN agents a ON a.id = tc.agent_id WHERE tc.task_id = :task_id ORDER BY tc.created_at DESC LIMIT 5;
UPDATE tasks SET statut = 'in_progress', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :task_id;
-- + lock fichiers via primitive
```

> Lock posé **avant** toute modification.

### 4. L'agent termine le ticket

```sql
UPDATE tasks SET statut = 'done', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :task_id;
-- + commentaire de sortie OBLIGATOIRE : fichiers:lignes · fait · choix · reste · à valider
-- + libérer locks via primitive
```

> Après `done` → consulter backlog. Tâches restantes → prendre la suivante. Sinon → étape 5.

### 5. L'agent termine sa session

```sql
-- Libérer locks via primitive
UPDATE sessions SET statut = 'terminé', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
  summary = 'Done:<accompli>. Pending:<tickets>. Next:<action>.' WHERE id = :session_id;
```

> `summary` autosuffisant (max 200 chars) — un agent reprenant sans contexte doit savoir où il en est.

### 6. Review valide ou rejette

```sql
-- OK : archiver
UPDATE tasks SET statut = 'archived', agent_valideur_id = (SELECT id FROM agents WHERE name = '<review>'),
  validated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :task_id;
-- + commentaire 'ARCHIVÉ — <observations>'

-- KO : rejeter
UPDATE tasks SET statut = 'todo', updated_at = CURRENT_TIMESTAMP WHERE id = :task_id;
-- + commentaire 'REJETÉ — <motif précis, corrections attendues, critères re-validation>'
```
