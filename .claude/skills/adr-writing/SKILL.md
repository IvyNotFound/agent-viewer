---
name: adr-writing
description: Write an Architecture Decision Record (ADR) for KanbAgent following the project's existing format. Activates when a structural decision needs to be documented, when agent arch completes a design decision, or when user says "ADR", "architecture decision", "document this choice".
---

# ADR Writing Skill

Creates a well-structured ADR following the format used in `.claude/ADRS-*.md`.

## When to Use

- Agent `arch` makes a structural decision (IPC contract, DB schema, Electron config)
- A decision will affect multiple agents or future contributors
- User says "write an ADR", "document this architecture decision"
- Before implementing any change touching multiple layers or scopes

## File Naming

Check existing ADR files first:
```bash
ls .claude/ADRS*.md
```

ADRs are grouped by number range. Add to the latest group file or create a new one:
- `.claude/ADRS.md` — index
- `.claude/ADRS-001-003.md` — decisions 001 to 003
- etc.

## ADR Format

```markdown
## ADR-<NNN> — <Short title>

**Date:** YYYY-MM-DD
**Status:** Accepted | Superseded by ADR-NNN | Deprecated
**Decider:** arch
**Ticket:** T<id>

### Context

[What situation prompted this decision? What problem are we solving?
Be factual — describe the current state and constraints.]

### Decision

[What was decided, precisely. One clear sentence ideally.
Then explain the implementation if needed.]

### Rejected alternatives

| Alternative | Reason for rejection |
|---|---|
| Option A | [Why not] |
| Option B | [Why not] |

### Consequences

**Positives:**
- [Benefit 1]
- [Benefit 2]

**Negatives / trade-offs:**
- [Tradeoff 1]
- [Constraint introduced]

### Agent impact

| Agent | Impact |
|---|---|
| `dev-back-electron` | [What changes for this agent] |
| `dev-front-vuejs` | [What changes for this agent] |
| *(others if relevant)* | |
```

## Update the Index

After writing the ADR, add a line to `.claude/ADRS.md`:

```markdown
| ADR-NNN | Short title | Accepted | T<id> |
```

## Rules

- Language: English (conv & code)
- Be specific — vague ADRs are useless 6 months later
- Always list at least 2 rejected alternatives
- "Negative consequences" is mandatory — no decision is perfect
- One ADR per structural decision — don't bundle unrelated choices
