# ADRs — Architecture Decision Records (ADR-010)

> Continuation of `.claude/ADRS.md` · ADR-001 to ADR-003 → `ADRS.md` · ADR-004 to ADR-006 → `ADRS-004-006.md` · ADR-007 → `ADRS-007.md` · ADR-008 to ADR-009 → `ADRS-008-009.md`

---

## ADR-010 — Multi-CLI Support: CliAdapter Architecture

**Date:** 2026-03-06 | **Status:** accepted | **Author:** arch

### Context

agent-viewer currently supports only Claude Code (`claude` CLI) for agent sessions. The multi-CLI coding agent ecosystem has matured significantly (2025–2026), making it practical to support additional CLIs with the same integration level: auto-detection, launch from modal, stdout streaming, system prompt injection, and session tracking.

**Coding agent CLI landscape (2026-03-06):**

| CLI | Maintainer | Stars | Headless mode | Binary |
|-----|-----------|-------|---------------|--------|
| Claude Code | Anthropic | — | `--output-format stream-json` | `claude` |
| OpenAI Codex CLI | OpenAI | — | `--approval-mode full-auto` | `codex` |
| Gemini CLI | Google | — | headless mode documented | `gemini` |
| OpenCode | SST | 95K+ | terminal agent | `opencode` |
| Aider | Paul Gauthier | 39K+ | headless, multi-LLM | `aider` |
| Goose | Block | — | CLI + ACP protocol (stdio) | `goose` |
| Amp | Sourcegraph | — | composable tools, agent mode | `amp` |
| GitHub Copilot | GitHub | — | no true agent mode | `gh copilot` |
| Cursor | Anysphere | — | IDE only, no CLI agent | — |

**Phase 1 (this ADR):** Claude, Codex, Gemini, OpenCode, Aider, Goose.
**Phase 2 (future):** Amp — pending headless mode confirmation.
**Excluded:** GitHub Copilot (no true agent mode), Cursor (IDE only — no CLI).

**Evaluated and rejected: `coder/agentapi` as universal wrapper.** This library acts as an HTTP server wrapping any CLI, but it would degrade Claude Code integration: loss of JSONL structured output, session_id, and tool call events (ADR-009). Adapters call CLIs directly via spawn. `agentapi` may be revisited as an optional adapter implementation detail for a specific CLI if that CLI provides no other headless interface.

### Decision

#### 1. Wrapper-first architecture: CliAdapter per CLI

Each CLI has a dedicated `CliAdapter` implementation in `src/main/adapters/<cli>.ts`. The adapter is responsible for:

- Building the spawn command (`buildCommand`)
- Writing the system prompt to a temp file (`prepareSystemPrompt`)
- Parsing stdout lines into normalized `StreamEvent` objects (`parseLine`)
- Extracting conversation IDs from events (`extractConvId` — optional)

`agent-stream.ts` calls the adapter's methods and wraps the `SpawnSpec` in `wsl.exe` for WSL environments. No third-party binary or HTTP layer is involved.

**Rationale:**
- Full control over parsing and output format
- No additional binary to distribute or update
- Claude Code integration unchanged (JSONL stream-json — ADR-009)
- Each adapter is independently testable

#### 2. Shared types: `src/shared/cli-types.ts`

```typescript
export type CliType =
  | 'claude' | 'codex' | 'gemini' | 'opencode' | 'aider' | 'goose'

export interface CliInstance {
  cli: CliType
  distro: string      // WSL distro name or "local" for native installs
  version: string
  isDefault: boolean
  profiles: string[]  // wrapper scripts in ~/bin/ (e.g. ["claude", "claude-pro2"])
  type: 'wsl' | 'local'
}

// Backward compat — no import changes needed in existing code
export type ClaudeInstance = CliInstance
```

`src/shared/` is the canonical location for types shared between main and renderer. Both processes import from this path without coupling to each other's internal modules.

#### 3. IPC channels

**New channel: `wsl:getCliInstances`**
- Returns `CliInstance[]` — all CLIs detected across all environments (WSL distros + local)
- Detection runs in parallel (bounded concurrency) with per-CLI timeout
- Each CLI adapter provides its `binaries` list for `which`/`wsl.exe which` probing

**Backward-compatible alias: `wsl:getClaudeInstances`** (existing channel — kept as-is)
- Now returns `CliInstance[]` filtered to `cli === 'claude'`
- Existing callers (LaunchSessionModal, preload) continue to work unchanged

**Extended: `agent:create`**
- Adds optional `cli?: CliType` parameter (default: `'claude'`)
- The main process selects the appropriate adapter based on `cli`
- All existing calls without `cli` continue to spawn Claude Code (no behavior change)

**Signature update:**
```typescript
// agent:create — full opts (all fields remain optional)
{
  cli?: CliType          // NEW — default: 'claude'
  cols?: number
  rows?: number
  projectPath?: string
  wslDistro?: string
  systemPrompt?: string
  thinkingMode?: string
  claudeCommand?: string  // renamed binaryName at adapter level; still 'claudeCommand' on IPC
  convId?: string
  permissionMode?: string
  dbPath?: string
  sessionId?: number
}
```

#### 4. System prompt injection per CLI

Each adapter defines its own system prompt mechanism via `prepareSystemPrompt` + `buildCommand`. The temp-file approach (ADR-009) is the baseline for all CLIs:

| CLI | Injection mechanism | Notes |
|-----|--------------------|----|
| `claude` | `--append-system-prompt "$(cat /tmp/sp.txt)"` (WSL bash) or `--append-system-prompt $(Get-Content ...)` (PS1) | Current behavior unchanged |
| `codex` | `--instructions "$(cat /tmp/sp.txt)"` | `--approval-mode full-auto` for headless |
| `gemini` | `--system-prompt /tmp/sp.txt` (file path) or stdin | To be confirmed during adapter implementation |
| `opencode` | `--message` or config file | To be confirmed — opencode is session-based |
| `aider` | `--read /tmp/sp.txt` or `--system-prompt` flag | Multiple injection points available |
| `goose` | ACP stdio protocol — inject in session init | Goose uses a structured init message |

**Rule:** if a CLI does not support direct system prompt injection, the adapter writes the prompt as a context file and references it from the launch arguments. Direct shell interpolation is never used — always file-based to avoid escaping issues (T705).

#### 5. Windows / WSL detection strategy

Detection is resilient: each failure is isolated, never blocking others.

```
wsl:getCliInstances
  ├── detectLocal()         — which/where on host (timeout: 5s per CLI)
  └── detectWsl(distros)    — wsl.exe -d <distro> which <binary> (timeout: 10s per CLI)
        └── concurrency: 2 distros at a time (existing WSL_TIMEOUT pattern)
```

**Per-CLI detection:**
1. `ipc-wsl.ts` calls `adapter.binaries` to get the list of binaries to probe
2. On Linux/macOS host: `which <binary>`
3. On Windows host for WSL: `wsl.exe -d <distro> -- which <binary>`
4. On Windows host for native: `where.exe <binary>`
5. Version: `<binary> --version` (fallback: `<binary> version`)
6. Profiles: scan `~/bin/<binary>-*` wrapper scripts (existing pattern from ADR-003)

**Timeout strategy:** if a CLI binary is not found or times out, the distro entry for that CLI is silently omitted — no error propagated to the renderer. `wsl:getCliInstances` always returns a (possibly empty) array.

#### 6. Binary validation

Each adapter defines its own regex for validating the custom binary name (equivalent to `CLAUDE_CMD_REGEX` for Claude):

```typescript
// Examples — implemented per adapter, not in shared types
const CLAUDE_CMD_REGEX  = /^claude(-[a-z0-9-]+)?$/
const CODEX_CMD_REGEX   = /^codex(-[a-z0-9-]+)?$/
const GEMINI_CMD_REGEX  = /^gemini(-[a-z0-9-]+)?$/
const OPENCODE_CMD_REGEX = /^opencode(-[a-z0-9-]+)?$/
const AIDER_CMD_REGEX   = /^aider(-[a-z0-9-]+)?$/
const GOOSE_CMD_REGEX   = /^goose(-[a-z0-9-]+)?$/
```

Validation is enforced in `agent:create` before spawn. Any non-conforming value → IPC error (same pattern as current Claude Code validation).

### Implementation Order

| Step | Owner | Ticket |
|------|-------|--------|
| 1. `src/shared/cli-types.ts` + ADR | `arch` | T1010 (this task) |
| 2. `ipc-wsl.ts` — `wsl:getCliInstances` handler + alias | `dev-back-electron` | to be created |
| 3. `agent-stream.ts` — `cli?` param + adapter dispatch | `dev-back-electron` | to be created |
| 4. `src/main/adapters/codex.ts` | `dev-back-electron` | to be created |
| 5. `src/main/adapters/gemini.ts` | `dev-back-electron` | to be created |
| 6. `src/main/adapters/opencode.ts` | `dev-back-electron` | to be created |
| 7. `src/main/adapters/aider.ts` | `dev-back-electron` | to be created |
| 8. `src/main/adapters/goose.ts` | `dev-back-electron` | to be created |
| 9. `LaunchSessionModal.vue` — CLI selector | `dev-front-vuejs` | to be created |
| 10. Tests per adapter | `test-back-electron` | to be created |

**Note:** steps 4–8 are implementation details — each adapter can be implemented and tested independently. Steps 2–3 are the integration points that unlock the full feature.

### Known Risks

| Risk | Probability | Mitigation |
|------|------------|------------|
| Aider headless mode incomplete | Medium | `--mcp-server` flag under discussion; fallback to `--message` prompt injection |
| Goose ACP protocol requires extra framing | Medium | Confirm whether `child_process.spawn` + stdin is sufficient or if ACP handshake is needed |
| Gemini CLI headless interface changes | Low | Pin to a tested version; adapter version-checks at detection time |
| Non-Claude CLIs don't expose stable session IDs | Medium | `extractConvId` is optional; session resume not supported for these CLIs in phase 1 |
| `which`/`where` timeouts on slow WSL distros | Low | Existing WSL_TIMEOUT + concurrency limit already handles this pattern |

### Out of Scope (phase 1)

- Session resume (`--resume`) for non-Claude CLIs — no stable conversation ID exposed
- GitHub Copilot (`gh copilot`) — not a true agent runner; excluded from all phases
- Cursor — IDE only; no CLI agent mode
- Amp — phase 2; headless mode to be confirmed
- Model selection per CLI — left to each CLI's own config mechanism
- Parallel multi-CLI sessions on the same task — handled by ADR-006 (worktree isolation)

### Consequences

- `src/shared/cli-types.ts` is the canonical type source — main and renderer both import from it
- `ClaudeInstance = CliInstance` alias ensures zero changes to existing renderer code
- `wsl:getClaudeInstances` kept as alias — no renderer refactor required before adapters are ready
- `agent:create` `cli` param is optional with default `'claude'` — all existing calls unchanged
- MAJOR version bump not required: `CliInstance` replaces `ClaudeInstance` via alias (no breaking change in IPC shape)
- Implementation tickets to be created by `review`: one per adapter + one for ipc-wsl extension + one for LaunchSessionModal CLI selector
