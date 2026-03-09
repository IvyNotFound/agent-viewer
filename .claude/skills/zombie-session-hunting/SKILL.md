---
name: zombie-session-hunting
description: Diagnose and clean up zombie sessions in KanbAgent. Activates when sessions are stuck, dbstart returns unexpected errors, or user says "sessions bloquées", "nettoyer la DB", "kill zombie sessions", "sessions stuck".
---

# Zombie Session Hunting Skill

Diagnose and manually clean zombie sessions in project.db.

## When to Use

- dbstart exits with code 2 (session limit) but sessions look inactive
- User suspects stale sessions after a crash or forced kill
- Routine maintenance before a multi-agent parallel session

## Step 1 — Diagnose

### Active sessions (started, never closed)
  node scripts/dbq.js "SELECT s.id, a.name, s.started_at, s.summary FROM sessions s JOIN agents a ON a.id = s.agent_id WHERE s.status = 'started' ORDER BY s.started_at DESC"

### Zombie sessions (started >60min ago, auto-handled by dbstart but check manually)
  node scripts/dbq.js "SELECT s.id, a.name, s.started_at FROM sessions s JOIN agents a ON a.id = s.agent_id WHERE s.status = 'started' AND s.ended_at IS NULL AND s.started_at < datetime('now', '-60 minutes')"

## Step 2 — Clean

### Close a specific zombie session manually
  node scripts/dbw.js <<SQL
  UPDATE sessions SET status = 'completed', ended_at = datetime('now'), summary = 'Manually closed: zombie session' WHERE id = <id>;
  SQL

### Nuke all zombies >60min (nuclear option — use only if dbstart auto-cleanup failed)
  node scripts/dbw.js <<SQL
  UPDATE sessions SET status = 'completed', ended_at = datetime('now'), summary = 'Force-closed: zombie >60min'
  WHERE status = 'started' AND started_at < datetime('now', '-60 minutes');
  SQL

## Step 3 — Verify

  node scripts/dbq.js "SELECT COUNT(*) as active_sessions FROM sessions WHERE status = 'started'"

active_sessions should return 0 if cleanup was total.

## Decision Tree

  dbstart exit code 2?
  ├─ Check active sessions → some are >60min? → nuclear option
  ├─ All sessions recent → Real parallel limit → close one voluntarily
  └─ max_sessions = -1 in DB? → No limit, shouldn't happen

## Prevention

After any forced kill of a Claude Code session:
1. Close the dangling session manually
2. Verify before starting new sessions