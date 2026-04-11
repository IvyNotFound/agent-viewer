# ADRs — Architecture Decision Records (ADR-013)

> Continuation of `.claude/ADRS.md` · ADR-001 to ADR-003 → `ADRS.md` · ADR-004 to ADR-006 → `ADRS-004-006.md` · ADR-007 → `ADRS-007.md` · ADR-008 to ADR-009 → `ADRS-008-009.md` · ADR-010 → `ADRS-010.md` · ADR-011 → `ADRS-011.md` · ADR-012 → `ADRS-012.md`

---

## ADR-013 — Multi-Instance Hook Server (Port Range + Additive Injection)

**Date:** 2026-04-11
**Status:** Accepted
**Decider:** arch
**Ticket:** T1907
**Dependencies:** T1905 (dual-listen), T1906 (cross-platform injection)

### Context

The hook server listens on a fixed port (27182, constant `HOOK_PORT`). If a second KanbAgent instance starts, `server.listen()` fails with `EADDRINUSE` and hooks are silently disabled for that instance.

**Current behavior on port conflict:**
```typescript
if (err.code === 'EADDRINUSE') {
  console.warn(`Port ${HOOK_PORT} already in use — hook server disabled.`)
}
```

This is a hard limitation: only one KanbAgent instance can receive hooks at a time.

**Use case:** a user opens two KanbAgent instances managing different projects. Each instance needs to receive hook events from its own Claude Code sessions.

**Constraints discovered during analysis:**

1. **Claude Code settings.json is global** (`~/.claude/settings.json`). All hooks apply to all sessions regardless of project.
2. **Hook groups are fired in parallel.** Claude Code fires every group in the event array — if two http entries exist for the same event, both receive the POST.
3. **Event filtering already exists.** `handleStop` and `handleLifecycleEvent` call `assertProjectPathAllowed(cwd)` — events from unmanaged projects are silently discarded. Each instance naturally processes only its own projects' events.
4. **WSL dual-listen** (T1905) binds a secondary server on the WSL gateway IP. Multi-instance must also handle the WSL server on the same port range.
5. **Gemini/Codex adapters** use `HOOK_PORT` in shell stub scripts. These need the actual bound port, not the constant.

### Decision

**Option A — Port Range + Additive Hook Entries** (chosen).

#### 1. Port allocation: try 27182-27189

Replace the fixed `HOOK_PORT` bind with a sequential port scan:

```
HOOK_PORT_BASE = 27182
HOOK_PORT_MAX  = 27189  (8 slots)
```

`startHookServer()` tries `HOOK_PORT_BASE` first. On `EADDRINUSE`, increments and retries up to `HOOK_PORT_MAX`. After a successful bind, the effective port is stored as a runtime value.

**WSL server:** uses the same effective port on the WSL gateway IP. If that port is also in use on the WSL interface (unlikely but possible), WSL listener is disabled for this instance (existing fallback behavior).

#### 2. Lockfile protocol: one file per instance

Each instance writes a lockfile at startup:

```
{userData}/hookserver-{port}.lock
```

Content (JSON):
```json
{ "pid": 12345, "port": 27183, "startedAt": "2026-04-11T10:30:00Z" }
```

**Startup cleanup:** before port scanning, read all `hookserver-*.lock` files. For each:
- Check if PID is alive (`process.kill(pid, 0)` or platform-specific check)
- If dead: delete the lockfile (stale from crash)
- If alive: port is occupied, skip it during scan

**Shutdown:** delete own lockfile in `app.on('window-all-closed')`.

#### 3. Settings injection: additive, not replacement

The current `injectHookUrls()` replaces the host:port in ALL http hook URLs — second instance overwrites first. **This must change.**

New behavior:
- Each instance manages only its own hook entries, identified by port number
- On injection: scan existing http entries, skip those on other KanbAgent ports (recognized by URL pattern `http://<ip>:<27182-27189>/hooks/`)
- Add own entry if not present; update own entry's URL/headers if present
- Never touch non-KanbAgent hooks (command-type, http hooks to other URLs)

**Stale entry cleanup at startup:**
- After lockfile cleanup (dead PIDs identified), remove settings.json entries for ports whose lockfiles were deleted
- This handles crash recovery: instance dies, next startup cleans orphaned hook entries

**Example resulting settings.json with 2 instances:**
```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "http", "url": "http://127.0.0.1:27182/hooks/stop", "headers": { "Authorization": "Bearer <secret>" } }] },
      { "hooks": [{ "type": "http", "url": "http://127.0.0.1:27183/hooks/stop", "headers": { "Authorization": "Bearer <secret>" } }] }
    ]
  }
}
```

Claude Code fires both groups. Each instance receives all events. `assertProjectPathAllowed` filters out events for unmanaged projects.

#### 4. Shared auth secret

All instances on the same machine use the **same** auth secret (persisted in `{userData}/hook-secret`). This is correct because:
- They share the same `userData` directory (Electron per-app, not per-instance)
- A single secret simplifies settings.json management (no per-port header divergence)
- The secret authenticates "from this machine" not "from this instance"

#### 5. Gemini/Codex adapters: bound port, not constant

`generateHookStub()` already takes a `port` parameter but callers pass `HOOK_PORT` (constant). After this change, callers must pass the **effective bound port** instead.

Each instance generates its own stub scripts (already stored in `{userData}/hooks/`). Since `userData` is shared, the stubs are overwritten by the last-starting instance. This is acceptable: stubs are regenerated on every startup, and the last instance's port is always correct for current stubs.

If this becomes a problem (two instances with stubs pointing to different ports), stub filenames can be namespaced by port: `gemini-stop-27183.sh`. **Defer this until needed.**

#### 6. PermissionRequest: add project allowlist check

`handlePermissionRequest` currently does NOT check `assertProjectPathAllowed(cwd)`. With multi-instance, this means all instances show the permission dialog for any session.

**Fix:** add `assertProjectPathAllowed` check at the top of `handlePermissionRequest`. If the project is not in the allowlist, deny immediately with reason `"Project not managed by this instance"`. This ensures only the correct instance's UI shows the dialog.

#### 7. Effective port exposure

The bound port must be visible:
- **Logs:** already done — `console.log` shows the bound address/port
- **IPC:** add `hookServer:getPort` handler returning the effective port (useful for status bar / debug panel in the renderer)
- **HookServerHandle:** add `port: number` field to the returned handle

### Rejected alternatives

| Alternative | Reason for rejection |
|---|---|
| **B — Broker/multiplexer on port 27182** | First instance becomes a single point of failure. If it crashes, all instances lose hooks. More complex (WebSocket/IPC forwarding). No benefit over additive entries since Claude Code natively fires multiple hook groups. |
| **C — Port per project (hash-derived)** | Does not solve the settings.json problem — global settings cannot have per-project URLs. Would require project-level settings.json only, losing global hooks. |
| **D — Random/OS-assigned port (port 0)** | Unpredictable port — harder to debug, harder to write stable tests. Port range is small and deterministic. |
| **E — Single instance + IPC relay** | Forces a primary/secondary model. Primary crash = total failure. Adds inter-process IPC complexity for no benefit over parallel HTTP entries. |
| **Atomic file locking (proper-lockfile npm)** | Adds a dependency. The read-modify-write race window is tiny: instances start seconds apart (human-initiated), worst case is a duplicate entry cleaned up next startup. Revisit if real corruption is observed. |

### Consequences

**Positives:**
- Up to 8 KanbAgent instances can run simultaneously, each receiving hooks
- Zero event loss: Claude Code fires all registered hook groups
- Existing project filtering (`assertProjectPathAllowed`) ensures each instance processes only its own projects
- Crash recovery via lockfile + startup cleanup — no manual intervention needed
- No new npm dependencies

**Negatives / trade-offs:**
- Each instance receives ALL hook events (including for other instances' projects) — HTTP request overhead. Negligible: events are small, `assertProjectPathAllowed` rejects in O(1)
- Settings.json grows with N instances (8 entries per event x 8 events = 64 entries max). Acceptable: file stays under 10 KB
- Shared `userData/hooks/` stubs: last instance wins. Acceptable for Gemini/Codex (regenerated on startup). Namespace by port if needed later
- Small race window on settings.json write during near-simultaneous startup. Self-healing: next startup cleans duplicates

### Agent impact

| Agent | Impact |
|---|---|
| `dev-back-electron` | Implement port scan, lockfile protocol, additive injection, PermissionRequest guard, `hookServer:getPort` IPC, adapter port passthrough. Update all `HOOK_PORT` references. |
| `dev-front-vuejs` | Consume `hookServer:getPort` IPC to display effective port in status bar or debug panel. |
| `test-back-electron` | Update `hookServer-*.spec.ts` — use `HOOK_PORT_BASE`, test port fallback, additive injection, lockfile lifecycle, stale entry removal. |
| `arch` | This ADR. Update ADRS.md index. |

### Implementation order

1. **Lockfile protocol** — write/read/cleanup functions in `hookServer-inject.ts`
2. **Port scan** — replace fixed bind in `hookServer.ts`
3. **Additive injection** — refactor `injectHookUrls` + new cleanup/remove functions
4. **PermissionRequest guard** — add `assertProjectPathAllowed` to handler
5. **Adapter port passthrough** — update Gemini/Codex callers
6. **IPC exposure** — `hookServer:getPort` handler
7. **Tests** — cover port fallback, additive injection, lockfile cleanup, stale entry removal

### Migration

**Non-breaking.** No DB schema change. Existing settings.json with single-entry hooks continue to work (the additive injection adds entries, never removes working ones). First startup after update writes a lockfile and adds port tagging — transparent to the user.
