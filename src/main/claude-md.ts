/**
 * Pure helpers for CLAUDE.md manipulation.
 *
 * Extracted from ipc-agents.ts to allow direct unit-testing
 * without mocking Electron internals.
 *
 * @module claude-md
 */

const SCOPED_TYPES = new Set(['dev', 'test', 'ux'])

/**
 * Insert a new agent row into the correct section of a CLAUDE.md file.
 *
 * Scoped types (dev, test, ux) go into "### Scopés par périmètre".
 * All other types go into "### Globaux".
 *
 * Returns the content unchanged when the target section or its table is missing.
 */
export function insertAgentIntoClaudeMd(
  content: string,
  agentType: string,
  agentName: string,
  agentDescription: string
): string {
  const isScoped = SCOPED_TYPES.has(agentType)
  const sectionHeader = isScoped ? '### Scopés par périmètre' : '### Globaux'
  const newRow = isScoped
    ? `| **${agentType}** | \`${agentName}\` | ${agentDescription} |`
    : `| **${agentName}** | ${agentDescription} |`

  const sectionIdx = content.indexOf(sectionHeader)
  if (sectionIdx === -1) return content

  const afterSection = content.slice(sectionIdx)
  const lines = afterSection.split('\n')
  let lastTableLineIdx = -1
  let inTable = false
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('|')) {
      inTable = true
      lastTableLineIdx = i
    } else if (inTable && lines[i].trim() === '') {
      break
    }
  }
  if (lastTableLineIdx === -1) return content
  lines.splice(lastTableLineIdx + 1, 0, newRow)
  return content.slice(0, sectionIdx) + lines.join('\n')
}
