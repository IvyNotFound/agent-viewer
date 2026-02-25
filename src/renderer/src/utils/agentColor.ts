function hash(name: string): number {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) & 0xffffffff
  return Math.abs(h)
}

export function agentHue(name: string): number {
  return hash(name) % 360
}

/** Couleur principale (texte / pastille) */
export function agentFg(name: string): string {
  return `hsl(${agentHue(name)}, 70%, 68%)`
}

/** Fond léger pour badge */
export function agentBg(name: string): string {
  return `hsl(${agentHue(name)}, 40%, 18%)`
}

/** Bordure pour badge */
export function agentBorder(name: string): string {
  return `hsl(${agentHue(name)}, 40%, 32%)`
}

/** Couleur texte pour badge périmètre (légèrement plus doux que agentFg) */
export function perimeterFg(name: string): string {
  return `hsl(${agentHue(name)}, 60%, 70%)`
}

/** Fond léger pour badge périmètre */
export function perimeterBg(name: string): string {
  return `hsl(${agentHue(name)}, 30%, 15%)`
}

/** Bordure pour badge périmètre */
export function perimeterBorder(name: string): string {
  return `hsl(${agentHue(name)}, 30%, 27%)`
}
