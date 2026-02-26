/**
 * Tests for insertAgentIntoClaudeMd — src/main/claude-md.ts
 *
 * Pure function — no mocks needed.
 * Covers: scoped agent, global agent, non-scoped type, missing section,
 * duplicate row, empty content, positional assertions.
 *
 * Framework: Vitest (node environment)
 */

import { describe, it, expect } from 'vitest'
import { insertAgentIntoClaudeMd } from './claude-md'

// ── Fixtures ────────────────────────────────────────────────────────────────

const CLAUDE_MD_WITH_BOTH_SECTIONS = `# Agents

### Globaux
| **Nom** | Description |
|---------|-------------|
| **review-master** | Audit global |

### Scopés par périmètre
| **Type** | Nom | Description |
|----------|-----|-------------|
| **dev** | \`dev-front-vuejs\` | Vue frontend |
`

const CLAUDE_MD_GLOBALS_ONLY = `# Agents

### Globaux
| **Nom** | Description |
|---------|-------------|
| **review-master** | Audit global |
`

const CLAUDE_MD_SCOPED_ONLY = `# Agents

### Scopés par périmètre
| **Type** | Nom | Description |
|----------|-----|-------------|
| **dev** | \`dev-front-vuejs\` | Vue frontend |
`

// ── Tests ───────────────────────────────────────────────────────────────────

describe('insertAgentIntoClaudeMd', () => {
  it('should insert a global agent row in Globaux section (before Scopés)', () => {
    const result = insertAgentIntoClaudeMd(
      CLAUDE_MD_WITH_BOTH_SECTIONS,
      'review',
      'review-new',
      'Nouveau reviewer'
    )
    const newRow = '| **review-new** | Nouveau reviewer |'
    expect(result).toContain(newRow)
    // Original row still present
    expect(result).toContain('| **review-master** | Audit global |')
    // Positional: new row must appear before Scopés section
    const scopedIdx = result.indexOf('### Scopés par périmètre')
    expect(result.indexOf(newRow)).toBeLessThan(scopedIdx)
  })

  it('should insert a scoped agent row in Scopés section (after Globaux)', () => {
    const result = insertAgentIntoClaudeMd(
      CLAUDE_MD_WITH_BOTH_SECTIONS,
      'dev',
      'dev-back-electron',
      'IPC/SQLite backend'
    )
    const newRow = '| **dev** | `dev-back-electron` | IPC/SQLite backend |'
    expect(result).toContain(newRow)
    // Original scoped row still present
    expect(result).toContain('| **dev** | `dev-front-vuejs` | Vue frontend |')
    // Positional: new row must appear after Scopés header
    const scopedIdx = result.indexOf('### Scopés par périmètre')
    expect(result.indexOf(newRow)).toBeGreaterThan(scopedIdx)
    // And after Globaux section
    const globauxIdx = result.indexOf('### Globaux')
    expect(result.indexOf(newRow)).toBeGreaterThan(globauxIdx)
  })

  it('should insert a test-type agent into the Scopés section (not Globaux)', () => {
    const result = insertAgentIntoClaudeMd(
      CLAUDE_MD_WITH_BOTH_SECTIONS,
      'test',
      'test-front-vuejs',
      'Tests frontend'
    )
    const newRow = '| **test** | `test-front-vuejs` | Tests frontend |'
    expect(result).toContain(newRow)
    // Positional: must be in Scopés, not Globaux
    const scopedIdx = result.indexOf('### Scopés par périmètre')
    expect(result.indexOf(newRow)).toBeGreaterThan(scopedIdx)
  })

  it('should insert a ux-type agent into the Scopés section (not Globaux)', () => {
    const result = insertAgentIntoClaudeMd(
      CLAUDE_MD_WITH_BOTH_SECTIONS,
      'ux',
      'ux-front-vuejs',
      'UX audit'
    )
    const newRow = '| **ux** | `ux-front-vuejs` | UX audit |'
    expect(result).toContain(newRow)
    // Positional: must be in Scopés, not Globaux
    const scopedIdx = result.indexOf('### Scopés par périmètre')
    expect(result.indexOf(newRow)).toBeGreaterThan(scopedIdx)
  })

  it('should insert a non-scoped type (arch) into the Globaux section', () => {
    const result = insertAgentIntoClaudeMd(
      CLAUDE_MD_WITH_BOTH_SECTIONS,
      'arch',
      'arch',
      'ADR & architecture'
    )
    const newRow = '| **arch** | ADR & architecture |'
    expect(result).toContain(newRow)
    // Positional: must be in Globaux, before Scopés
    const scopedIdx = result.indexOf('### Scopés par périmètre')
    expect(result.indexOf(newRow)).toBeLessThan(scopedIdx)
  })

  it('should return content unchanged when target section is missing', () => {
    // Try to insert a scoped agent, but only Globaux section exists
    const result = insertAgentIntoClaudeMd(
      CLAUDE_MD_GLOBALS_ONLY,
      'dev',
      'dev-back-electron',
      'Backend'
    )
    expect(result).toBe(CLAUDE_MD_GLOBALS_ONLY)
  })

  it('should return content unchanged when global section is missing', () => {
    const result = insertAgentIntoClaudeMd(
      CLAUDE_MD_SCOPED_ONLY,
      'review',
      'review-new',
      'Reviewer'
    )
    expect(result).toBe(CLAUDE_MD_SCOPED_ONLY)
  })

  it('should return empty string unchanged', () => {
    const result = insertAgentIntoClaudeMd('', 'dev', 'agent', 'desc')
    expect(result).toBe('')
  })

  it('should return content unchanged when no table rows exist under the section', () => {
    const noTableContent = `# Agents

### Globaux

Some text but no table here.

### Scopés par périmètre

Also no table.
`
    const result = insertAgentIntoClaudeMd(noTableContent, 'review', 'review-new', 'Desc')
    expect(result).toBe(noTableContent)
  })

  it('should handle duplicate insertion (inserts again — no dedup)', () => {
    // insertAgentIntoClaudeMd does not check for duplicates
    const result = insertAgentIntoClaudeMd(
      CLAUDE_MD_WITH_BOTH_SECTIONS,
      'dev',
      'dev-front-vuejs',
      'Vue frontend'
    )
    // Count occurrences of the row — should appear twice (original + inserted)
    const matches = result.match(/dev-front-vuejs/g)
    expect(matches).toHaveLength(2)
  })

  it('should preserve content before and after the target section', () => {
    const withSurrounding = `# Header

Some intro text.

### Globaux
| **Nom** | Description |
|---------|-------------|
| **review-master** | Audit |

### Scopés par périmètre
| **Type** | Nom | Description |
|----------|-----|-------------|
| **dev** | \`dev-front\` | Frontend |

## Footer

More content here.
`
    const result = insertAgentIntoClaudeMd(withSurrounding, 'review', 'arch', 'Architecture')
    expect(result).toContain('# Header')
    expect(result).toContain('Some intro text.')
    expect(result).toContain('## Footer')
    expect(result).toContain('More content here.')
    expect(result).toContain('| **arch** | Architecture |')
  })
})
