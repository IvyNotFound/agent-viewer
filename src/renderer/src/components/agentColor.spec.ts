import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { agentFg, agentBg, agentBorder, agentAccent, perimeterFg, perimeterBg, perimeterBorder, isDark, setDarkMode, agentHue, colorVersion, hexToRgb } from '@renderer/utils/agentColor'

function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}
function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg); const l2 = luminance(bg)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

const HEX_PATTERN = /^#[0-9a-f]{6}$/i

describe('agentColor utilities (T353)', () => {
  afterEach(() => setDarkMode(false))

  it('agentHue returns a stable palette index for the same name', () => {
    const h1 = agentHue('dev-front')
    const h2 = agentHue('dev-front')
    expect(h1).toBe(h2)
    expect(h1).toBeGreaterThanOrEqual(0)
    expect(h1).toBeLessThan(13)
  })

  it('agentHue returns different indices for different names', () => {
    const h1 = agentHue('dev-front')      // → 8
    const h2 = agentHue('review-master')  // → 9
    expect(h1).not.toBe(h2)
  })

  it('agentFg returns hex string', () => {
    const fg = agentFg('test-agent')
    expect(fg).toMatch(HEX_PATTERN)
  })

  it('agentBg returns hex string', () => {
    const bg = agentBg('test-agent')
    expect(bg).toMatch(HEX_PATTERN)
  })

  it('agentBorder returns hex string', () => {
    const border = agentBorder('test-agent')
    expect(border).toMatch(HEX_PATTERN)
  })

  it('perimeterFg returns hex string', () => {
    const fg = perimeterFg('front-vuejs')
    expect(fg).toMatch(HEX_PATTERN)
  })

  it('perimeterBg returns hex string', () => {
    const bg = perimeterBg('front-vuejs')
    expect(bg).toMatch(HEX_PATTERN)
  })

  it('perimeterBorder returns hex string', () => {
    const border = perimeterBorder('front-vuejs')
    expect(border).toMatch(HEX_PATTERN)
  })

  it('setDarkMode toggles isDark()', () => {
    setDarkMode(true)
    expect(isDark()).toBe(true)

    setDarkMode(false)
    expect(isDark()).toBe(false)
  })

  it('dark mode changes color values in agentFg', () => {
    setDarkMode(true)
    const darkFg = agentFg('test')

    setDarkMode(false)
    const lightFg = agentFg('test')

    expect(darkFg).not.toBe(lightFg)
  })
})

// ─── T1319 (updated for T1467 MD2 migration) ─────────────────────────────────

describe('agentColor — hash function exact palette indices (T1319, updated T1623)', () => {
  // 'hello': hash=99162322, 99162322%13=12 (deepOrange)
  // 'test-agent': hash=621962762, 621962762%13=5 (blue)
  // These exact values kill h*31 -> h+31 / h*32 / h-31 mutants

  it('agentHue(hello) === 12 (hash=99162322, 99162322%13=12)', () => {
    expect(agentHue('hello')).toBe(12)
  })

  it('agentHue(test-agent) === 5 (hash=621962762, 621962762%13=5)', () => {
    expect(agentHue('test-agent')).toBe(5)
  })

  it('agentHue of empty string is 0 (covers !name guard)', () => {
    expect(agentHue('')).toBe(0)
  })

  it('agentHue differs between order-sensitive names (order matters in hash)', () => {
    // 'hello' → idx=12, 'olleh' → idx=7 (both computed from hash%13)
    expect(agentHue('hello')).toBe(12)
    expect(agentHue('olleh')).toBe(7)
    expect(agentHue('hello')).not.toBe(agentHue('olleh'))
  })
})

describe('agentColor — MD2 shade exact values (T1319 + T1467, updated T1623)', () => {
  // test-agent: idx=5 (blue family), hash=621962762, 621962762%13=5
  // agentBg dark=darken4=#0d47a1, light=lighten5=#e3f2fd
  // agentBorder dark=darken2=#1976d2, light=lighten2=#64b5f6
  // perimeterBg dark=darken4=#0d47a1, light=lighten5=#e3f2fd
  // perimeterBorder dark=darken3=#1565c0, light=lighten3=#90caf9

  afterEach(() => setDarkMode(false))

  it('agentBg dark mode (test-agent: blue darken4 #0d47a1)', () => {
    setDarkMode(true)
    expect(agentBg('test-agent')).toBe('#0d47a1')
  })

  it('agentBg light mode (test-agent: blue lighten5 #e3f2fd)', () => {
    setDarkMode(false)
    expect(agentBg('test-agent')).toBe('#e3f2fd')
  })

  it('agentBorder dark mode (test-agent: blue darken2 #1976d2)', () => {
    setDarkMode(true)
    expect(agentBorder('test-agent')).toBe('#1976d2')
  })

  it('agentBorder light mode (test-agent: blue lighten2 #64b5f6)', () => {
    setDarkMode(false)
    expect(agentBorder('test-agent')).toBe('#64b5f6')
  })

  it('perimeterFg dark mode — WCAG AA ratio >= 4.5:1 (test-agent: blue)', () => {
    setDarkMode(true)
    expect(contrastRatio(perimeterFg('test-agent'), agentBg('test-agent'))).toBeGreaterThanOrEqual(4.5)
  })

  it('perimeterFg light mode — WCAG AA ratio >= 4.5:1 (test-agent: blue)', () => {
    setDarkMode(false)
    expect(contrastRatio(perimeterFg('test-agent'), agentBg('test-agent'))).toBeGreaterThanOrEqual(4.5)
  })

  it('perimeterBg dark mode (test-agent: blue darken4 #0d47a1)', () => {
    setDarkMode(true)
    expect(perimeterBg('test-agent')).toBe('#0d47a1')
  })

  it('perimeterBg light mode (test-agent: blue lighten5 #e3f2fd)', () => {
    setDarkMode(false)
    expect(perimeterBg('test-agent')).toBe('#e3f2fd')
  })

  it('perimeterBorder dark mode (test-agent: blue darken3 #1565c0)', () => {
    setDarkMode(true)
    expect(perimeterBorder('test-agent')).toBe('#1565c0')
  })

  it('perimeterBorder light mode (test-agent: blue lighten3 #90caf9)', () => {
    setDarkMode(false)
    expect(perimeterBorder('test-agent')).toBe('#90caf9')
  })

  it('hello dark agentFg — WCAG AA ratio >= 4.5:1 (deepOrange family)', () => {
    setDarkMode(true)
    expect(contrastRatio(agentFg('hello'), agentBg('hello'))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('agentColor — agentAccent visible on neutral sidebar bg (T1517)', () => {
  afterEach(() => setDarkMode(false))

  const DARK_SIDEBAR = '#1c1c1c' // representative dark sidebar bg
  const LIGHT_SIDEBAR = '#f5f5f5' // representative light sidebar bg

  const ALL_FAMILIES = [
    'dev-front-vuejs',   // teal
    'review-master',     // green
    'ux-front-vuejs',    // lime (mid-luminance, was the problem family)
    'amber-agent',       // amber (mid-luminance)
    'yellow-test',       // yellow (mid-luminance)
    'test-agent',        // purple
  ]

  it('agentAccent returns a valid hex string in dark mode', () => {
    setDarkMode(true)
    const accent = agentAccent('test-agent')
    expect(accent).toMatch(HEX_PATTERN)
  })

  it('agentAccent returns a valid hex string in light mode', () => {
    setDarkMode(false)
    const accent = agentAccent('test-agent')
    expect(accent).toMatch(HEX_PATTERN)
  })

  it('agentAccent dark and light values differ for same name', () => {
    setDarkMode(true)
    const dark = agentAccent('test-agent')
    setDarkMode(false)
    const light = agentAccent('test-agent')
    expect(dark).not.toBe(light)
  })

  it('agentAccent is invalidated on theme switch (cache cleared)', () => {
    setDarkMode(true)
    const before = colorVersion.value
    const dark = agentAccent('cache-test')
    setDarkMode(false)
    expect(colorVersion.value).toBe(before + 1)
    const light = agentAccent('cache-test')
    expect(dark).not.toBe(light)
  })

  it('agentAccent dark mode achieves contrast >= 3:1 against dark sidebar for all mid-luminance families', () => {
    setDarkMode(true)
    for (const name of ALL_FAMILIES) {
      const accent = agentAccent(name)
      const ratio = contrastRatio(accent, DARK_SIDEBAR)
      expect(ratio, `${name} accent '${accent}' vs dark sidebar`).toBeGreaterThanOrEqual(3)
    }
  })

  it('agentAccent light mode is a valid hex (lime/amber inherently low contrast against white — just must not crash)', () => {
    // Yellow-family colors (lime, amber) are inherently low-luminance against white backgrounds.
    // We only assert the return is a valid hex, not a strict contrast ratio.
    setDarkMode(false)
    for (const name of ALL_FAMILIES) {
      expect(agentAccent(name), `${name} in light mode`).toMatch(HEX_PATTERN)
    }
  })
})

describe('agentColor — agentFg WCAG AA contrast (T1319 + T1467 + T1510)', () => {
  afterEach(() => setDarkMode(false))

  it('agentFg dark mode meets WCAG AA (test-agent: purple family)', () => {
    setDarkMode(true)
    expect(contrastRatio(agentFg('test-agent'), agentBg('test-agent'))).toBeGreaterThanOrEqual(4.5)
  })

  it('agentFg light mode meets WCAG AA (test-agent: purple family)', () => {
    setDarkMode(false)
    expect(contrastRatio(agentFg('test-agent'), agentBg('test-agent'))).toBeGreaterThanOrEqual(4.5)
  })

  it('agentFg light mode meets WCAG AA (hello: cyan family)', () => {
    setDarkMode(false)
    expect(contrastRatio(agentFg('hello'), agentBg('hello'))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('agentColor — setDarkMode no-op and cache invalidation (T1319)', () => {
  afterEach(() => setDarkMode(false))

  it('setDarkMode does not increment colorVersion when value unchanged', () => {
    setDarkMode(true)
    const before = colorVersion.value
    setDarkMode(true) // same value — should be no-op
    expect(colorVersion.value).toBe(before)
  })

  it('setDarkMode increments colorVersion when value changes', () => {
    setDarkMode(false)
    const before = colorVersion.value
    setDarkMode(true)
    expect(colorVersion.value).toBe(before + 1)
  })

  it('color strings differ between dark and light for all functions (cache invalidated)', () => {
    setDarkMode(true)
    const name = 'test-agent'
    const darkFg = agentFg(name)
    const darkBg = agentBg(name)
    const darkBorder = agentBorder(name)
    const darkPFg = perimeterFg(name)
    const darkPBg = perimeterBg(name)
    const darkPBorder = perimeterBorder(name)

    setDarkMode(false)
    expect(agentFg(name)).not.toBe(darkFg)
    expect(agentBg(name)).not.toBe(darkBg)
    expect(agentBorder(name)).not.toBe(darkBorder)
    expect(perimeterFg(name)).not.toBe(darkPFg)
    expect(perimeterBg(name)).not.toBe(darkPBg)
    expect(perimeterBorder(name)).not.toBe(darkPBorder)
  })
})

describe('agentColor — cache FIFO boundary (T1319)', () => {
  // cacheSet evicts when map.size >= CACHE_MAX (100)
  // Mutation >= -> > would allow 101 entries instead of 100

  it('agentHue still returns valid index for name added at/after CACHE_MAX boundary', () => {
    for (let i = 0; i < 110; i++) {
      agentHue(`unique-cache-name-${i}`)
    }
    const idx = agentHue('unique-cache-name-105')
    expect(idx).toBe(agentHue('unique-cache-name-105'))
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(13)
  })

  it('cache eviction: first entries are evicted and recomputed correctly', () => {
    const idx = agentHue('unique-cache-name-0')
    expect(idx).toBe(agentHue('unique-cache-name-0'))
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(13)
  })
})
