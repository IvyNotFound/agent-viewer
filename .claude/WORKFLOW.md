# Ticket Workflow — Full SQL Reference

> Statuses: `todo` → `in_progress` → `done` → `archived` (rejected → back to `todo`)
> Quick summary → `CLAUDE.md` · Session input → `sessions.summary`

---

## Schema (project.db)

> **Consult before writing SQL.** Never guess column names.

```
agents          (id PK, name, type, scope, system_prompt, system_prompt_suffix, thinking_mode, allowed_tools, created_at)
sessions        (id PK, agent_id→agents, started_at, ended_at, updated_at, status CHECK(status IN ('started','completed','blocked')), summary, claude_conv_id, tokens_in, tokens_out, tokens_cache_read, tokens_cache_write)
tasks           (id PK, title, description, status, agent_creator_id→agents, agent_assigned_id→agents, agent_validator_id→agents, parent_task_id→tasks, session_id→sessions, scope, effort, priority, created_at, updated_at, started_at, completed_at, validated_at)
task_comments   (id PK, task_id→tasks, agent_id→agents, content, created_at)
task_links      (id PK, from_task→tasks, to_task→tasks, type CHECK(type IN ('blocks','depends_on','related_to','duplicates')), created_at)
agent_logs      (id PK, session_id→sessions, agent_id→agents, level, action, detail, files, created_at)
scopes          (id PK, name, folder, techno, description, active, created_at)
config          (key PK, value, updated_at)
```

> **Pitfalls:** `tasks` does **not** have `agent_id` → use `agent_assigned_id`. `task_comments.agent_id` (not `auteur_agent_id`).

---

## Execution

```bash
node scripts/dbq.js "<SQL>"   # read (better-sqlite3, WAL mode)
node scripts/dbw.js "<SQL>"   # write
```

> **⚠ SQL containing backticks, `$()` or quotes**: do NOT pass as a positional argument.
> Use **stdin mode (heredoc)** to prevent bash from interpreting special characters:
>
> ```bash
> node scripts/dbw.js <<'SQL'
> INSERT INTO tasks (title, description, status, agent_creator_id, scope, effort, priority)
> VALUES ('fix(terminal): my title', 'Description with backticks `code` and $(variables) and ''single quotes''', 'todo', (SELECT id FROM agents WHERE name = 'review'), 'back-electron', 1, 'normal');
> SQL
> ```
>
> The `<<'SQL'` heredoc (quotes around delimiter) disables **all** shell interpretation.
> Same syntax for `dbq.js` reads.

---

## Reusable SQL Primitives

```sql
-- Add a comment to a ticket
INSERT INTO task_comments (task_id, agent_id, content) VALUES (:task_id, :agent_id, '<content>');

-- Log (optional, omit if context is limited)
INSERT INTO agent_logs (session_id, agent_id, level, action, detail) VALUES (:session_id, :agent_id, 'info', '<action>', '<detail>');
```

---

## Steps

### 1. Review creates the ticket

```sql
INSERT INTO tasks (title, description, status, agent_creator_id, agent_assigned_id, scope)
VALUES ('<title>', '<full description: context, symptoms, acceptance criteria>', 'todo',
  (SELECT id FROM agents WHERE name = '<review>'),
  (SELECT id FROM agents WHERE name = '<target-agent>'), '<scope>');
-- + comment (risks, dependencies) via primitive
```

> Description should be as verbose as possible — an agent with no context must be able to complete the ticket alone.

### 2. Agent starts their session

```bash
node scripts/dbstart.js <agent> [type] [scope]
```

> Does everything in one call: registers the agent, creates the session, displays `agent_id` + `session_id`, previous session, assigned tasks.
> Tasks found → start immediately. Questions only if no tasks AND type cannot be inferred.

> **⚠ Parallel session limit**: max 3 active sessions per agent — enforced by `dbstart.js` (exit code 2 if limit reached).

**Multi-instance only — worktree creation:**

Branch naming convention: `agent/<agent-name>/s<session-id>` · Worktree path: `.claude/worktrees/s<session-id>`

```bash
# Create a dedicated git worktree for this session (isolates from other instances)
git worktree add .claude/worktrees/s<session_id> -b agent/<agent-name>/s<session_id>
# Then all work is done inside that worktree directory
```

> Solo agents continue working on `main` directly — worktree isolation is opt-in. Orphaned worktrees are cleaned at startup via `git worktree prune`. (ADR-006)

### 3. Agent takes the ticket

**Read the ticket:**

```sql
SELECT title, description FROM tasks WHERE id = :task_id;
SELECT tc.content, a.name, tc.created_at FROM task_comments tc
  JOIN agents a ON a.id = tc.agent_id WHERE tc.task_id = :task_id ORDER BY tc.created_at DESC LIMIT 5;
```

**Claim-and-verify (atomic claim — required for multi-instance, backward-compatible for solo):**

```bash
# Step 1 — Claim: write in_progress with this session_id, only if still todo
node scripts/dbw.js "UPDATE tasks SET status='in_progress', session_id=<MY_SESSION>, started_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=<TASK_ID> AND status='todo'"

# Step 2 — Verify: confirm we won the race
node scripts/dbq.js "SELECT session_id FROM tasks WHERE id=<TASK_ID> AND status='in_progress'"
# If session_id ≠ MY_SESSION → task was claimed by another instance → move to next ticket
```

> The `writeFileSync` in `dbw.js` serializes concurrent writes at OS level. The post-write verify detects any race loss: if another instance wrote after, its `session_id` will be present. (ADR-006)

### 4. Agent completes the ticket

> **⚠ Mandatory order: comment FIRST, then `done`.**
> If the session expires between the two calls, the comment is already persisted. Reversing the order risks `done` with no comment (cf. T430, T437, T438).

```bash
# Recommended: a single heredoc to reduce required turns
node scripts/dbw.js <<'SQL'
INSERT INTO task_comments (task_id, agent_id, content)
  VALUES (:task_id, :agent_id, 'files:lines · done · choices · remaining · to validate');
UPDATE tasks SET status = 'done', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :task_id;
SQL
```

> After `done` → check backlog. Remaining tasks → **chain without closing the session** (`/clear` + PTY reset, then take the next one). Only close the session (step 5) **if**: no remaining tasks, or task is blocked (dependency, waiting for review).

### 5. Agent closes their session

```sql
-- 1. Record consumed tokens (REQUIRED before closing)
--    Source: summary displayed by Claude Code at end of conversation
--    Line "Tokens: X in, Y cache_read, Z cache_write, W out"
UPDATE sessions SET tokens_in=X, tokens_out=Y, tokens_cache_read=Z, tokens_cache_write=W WHERE id=:session_id;

-- 2. Close the session
UPDATE sessions SET status = 'completed', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
  summary = 'Done:<accomplished>. Pending:<tickets>. Next:<action>.' WHERE id = :session_id;
```

**Multi-instance only — worktree commit (before cleanup):**

Before removing the worktree, commit all work:

```bash
cd .claude/worktrees/s<session_id>
git add -A && git commit -m "chore: work done — T<task_id>"
```

> Branch is kept for merge by review — do not push directly to main.
> The agent **MUST** include the commit hash in their exit comment so review can identify the work without reconstructing the branch name:
> `commit <sha> — <short description>`

**Multi-instance only — worktree cleanup:**

```bash
# Remove the worktree (branch is kept for merge/review)
git worktree remove .claude/worktrees/s<session_id>
```

> `summary` must be self-contained (max 200 chars) — an agent resuming without context must know where things stand.
>
> **⚠ Tokens required**: record tokens BEFORE closing (`tokens_in`, `tokens_out`, `tokens_cache_read`, `tokens_cache_write`). Values are displayed by Claude Code at the end of each conversation. If the value is unknown (interrupted session), set to 0.

### 6. Review validates or rejects

**Worktree tickets — find and validate the agent branch, then merge if OK:**

The agent branch name is derived from the task's `session_id`:
`branch = agent/<agent-name>/s<session_id>`

```bash
# Step 1: retrieve session_id and agent name from the task
node scripts/dbq.js "SELECT t.session_id, a.name AS agent, t.id FROM tasks t JOIN agents a ON a.id = t.agent_assigned_id WHERE t.id = <TASK_ID>"

# Step 2: inspect changed files on the agent branch vs main (without checking out)
git diff --name-only main...agent/<agent-name>/s<session_id>

# Step 3: review specific files from the agent branch
git show agent/<agent-name>/s<session_id>:src/path/to/file.ts

# Alternatively: if the exit comment includes the commit hash (recommended), use it directly
git show <sha>:src/path/to/file.ts
git diff main..<sha> --name-only

# Step 4a: validation OK — cherry-pick to main, then archive
git checkout main
git cherry-pick <commit-hash>
# If cherry-pick fails (complex history): git merge --squash agent/<agent-name>/s<session_id> && git commit
git push origin main
# then archive the task (SQL below)

# Step 4b: validation KO — reject only (SQL below, DO NOT merge)
```

> **Note**: if `session_id` is NULL on the task (agent didn't record it), use the commit hash from the exit comment: `git show <sha> --stat`.

```sql
-- OK: archive
UPDATE tasks SET status = 'archived', agent_validator_id = (SELECT id FROM agents WHERE name = '<review>'),
  validated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :task_id;
-- + comment 'ARCHIVED — <observations>'

-- KO: reject
UPDATE tasks SET status = 'todo', updated_at = CURRENT_TIMESTAMP WHERE id = :task_id;
-- + comment 'REJECTED — <precise reason, expected corrections, re-validation criteria>'
```
