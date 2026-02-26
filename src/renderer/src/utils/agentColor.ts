/**
 * Agent color utilities for agent-viewer.
 *
 * Generates deterministic HSL colors from agent names using a hash function.
 * Each agent always gets the same hue, ensuring consistent visual identity
 * across the UI (badges, borders, sidebar dots).
 *
 * @module utils/agentColor
 */

/**
 * Simple hash function for strings.
 * @param name - Agent name to hash.
 * @returns Non-negative integer hash value.
 */
function hash(name: string): number {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) & 0xffffffff
  return Math.abs(h)
}

const hueCache = new Map<string, number>()

/**
 * Returns a deterministic hue (0–359) for a given agent name.
 * Results are cached for performance.
 * @param name - Agent name.
 * @returns Hue value in degrees.
 */
export function agentHue(name: string): number {
  let hue = hueCache.get(name)
  if (hue === undefined) {
    hue = hash(name) % 360
    hueCache.set(name, hue)
  }
  return hue
}

/**
 * Primary foreground color for an agent (text, dots).
 * @param name - Agent name.
 * @returns HSL color string.
 */
export function agentFg(name: string): string {
  return `hsl(${agentHue(name)}, 70%, 68%)`
}

/**
 * Light background color for agent badge.
 * @param name - Agent name.
 * @returns HSL color string.
 */
export function agentBg(name: string): string {
  return `hsl(${agentHue(name)}, 40%, 18%)`
}

/**
 * Border color for agent badge.
 * @param name - Agent name.
 * @returns HSL color string.
 */
export function agentBorder(name: string): string {
  return `hsl(${agentHue(name)}, 40%, 32%)`
}

/**
 * Foreground color for perimeter badge (softer than agentFg).
 * @param name - Perimeter name.
 * @returns HSL color string.
 */
export function perimeterFg(name: string): string {
  return `hsl(${agentHue(name)}, 60%, 70%)`
}

/**
 * Light background color for perimeter badge.
 * @param name - Perimeter name.
 * @returns HSL color string.
 */
export function perimeterBg(name: string): string {
  return `hsl(${agentHue(name)}, 30%, 15%)`
}

/**
 * Border color for perimeter badge.
 * @param name - Perimeter name.
 * @returns HSL color string.
 */
export function perimeterBorder(name: string): string {
  return `hsl(${agentHue(name)}, 30%, 27%)`
}
