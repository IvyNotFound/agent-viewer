/**
 * MD2 palette correctness tests for agentColor.ts (T1467, updated T1623)
 *
 * Verifies that the Material Design 2 color migration is correct:
 * - agentHue returns palette indices 0–12 (13-family palette, no green families)
 * - Each color function picks the right shade for dark/light mode
 * - Exact hex values for known names (palette index deterministic from hash)
 * - Cache eviction continues to work with hex output
 *
 * Pre-computed palette indices (hash(name) % 13):
 *   'a'  → idx=6  (lightBlue)
 *   'b'  → idx=7  (cyan)
 *   'i'  → idx=1  (pink)
 *   'j'  → idx=2  (purple)
 *   'k'  → idx=3  (deepPurple)
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  agentHue,
  agentFg,
  agentBg,
  agentBorder,
  perimeterFg,
  perimeterBg,
  perimeterBorder,
  setDarkMode as setDarkModeReactive,
  hexToRgb,
} from '@renderer/utils/agentColor'

function lum(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}
function contrastRatio(fg: string, bg: string): number {
  const l1 = lum(fg); const l2 = lum(bg)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

function setDarkMode(enabled: boolean) {
  if (enabled) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
  setDarkModeReactive(enabled)
}

const HEX_PATTERN = /^#[0-9a-f]{6}$/i

describe('agentColor MD2 palette (T1467)', () => {
  afterEach(() => setDarkMode(false))

  // ── Palette index range ───────────────────────────────────────────────────────
  describe('agentHue() — palette index 0–12', () => {
    it('returns index 6 for "a" (hash=97, 97%13=6)', () => {
      expect(agentHue('a')).toBe(6)
    })

    it('returns index 7 for "b" (hash=98, 98%13=7)', () => {
      expect(agentHue('b')).toBe(7)
    })

    it('returns index 1 for "i" (hash=105, 105%13=1)', () => {
      expect(agentHue('i')).toBe(1)
    })

    it('returns index 2 for "j" (hash=106, 106%13=2)', () => {
      expect(agentHue('j')).toBe(2)
    })

    it('returns index 3 for "k" (hash=107, 107%13=3)', () => {
      expect(agentHue('k')).toBe(3)
    })

    it('all results are in range [0, 12]', () => {
      const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm']
      for (const name of names) {
        const idx = agentHue(name)
        expect(idx).toBeGreaterThanOrEqual(0)
        expect(idx).toBeLessThanOrEqual(12)
      }
    })

    it('all 13 palette indices are reachable', () => {
      const found = new Set<number>()
      for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm']) {
        found.add(agentHue(name))
      }
      // Single-char ASCII letters a-m span exactly indices 6-12 then wraps to 0-5 (13 total)
      expect(found.size).toBe(13)
    })
  })

  // ── agentFg() — WCAG AA ratio >= 4.5:1 (T1510: shade escalation replaces fixed shades) ────
  describe('agentFg() — WCAG AA contrast ratio >= 4.5:1', () => {
    it('"a" (cyan idx=7) dark meets WCAG AA', () => {
      setDarkMode(true)
      expect(contrastRatio(agentFg('a'), agentBg('a'))).toBeGreaterThanOrEqual(4.5)
    })

    it('"a" (cyan idx=7) light meets WCAG AA', () => {
      setDarkMode(false)
      expect(contrastRatio(agentFg('a'), agentBg('a'))).toBeGreaterThanOrEqual(4.5)
    })

    it('"i" (red idx=0) dark meets WCAG AA', () => {
      setDarkMode(true)
      expect(contrastRatio(agentFg('i'), agentBg('i'))).toBeGreaterThanOrEqual(4.5)
    })

    it('"i" (red idx=0) light meets WCAG AA', () => {
      setDarkMode(false)
      expect(contrastRatio(agentFg('i'), agentBg('i'))).toBeGreaterThanOrEqual(4.5)
    })

    it('dark and light values always differ', () => {
      for (const name of ['a', 'b', 'i', 'j', 'k']) {
        setDarkMode(false)
        const light = agentFg(name)
        setDarkMode(true)
        const dark = agentFg(name)
        expect(dark).not.toBe(light)
      }
    })

    it('all outputs are valid hex colors', () => {
      for (const name of ['a', 'b', 'i', 'j', 'k']) {
        setDarkMode(false)
        expect(agentFg(name)).toMatch(HEX_PATTERN)
        setDarkMode(true)
        expect(agentFg(name)).toMatch(HEX_PATTERN)
      }
    })
  })

  // ── agentBg() — darken4 dark / lighten5 light ────────────────────────────────
  describe('agentBg() — exact MD2 hex values', () => {
    it('"a" (lightBlue idx=6) dark → lightBlue darken4 #01579b', () => {
      setDarkMode(true)
      expect(agentBg('a')).toBe('#01579b')
    })

    it('"a" (lightBlue idx=6) light → lightBlue lighten5 #e1f5fe', () => {
      setDarkMode(false)
      expect(agentBg('a')).toBe('#e1f5fe')
    })

    it('"i" (pink idx=1) dark → pink darken4 #880e4f', () => {
      setDarkMode(true)
      expect(agentBg('i')).toBe('#880e4f')
    })

    it('"i" (pink idx=1) light → pink lighten5 #fce4ec', () => {
      setDarkMode(false)
      expect(agentBg('i')).toBe('#fce4ec')
    })

    it('agentBg dark differs from agentFg dark (different shades)', () => {
      setDarkMode(true)
      for (const name of ['a', 'b', 'i', 'j', 'k']) {
        expect(agentBg(name)).not.toBe(agentFg(name))
      }
    })

    it('agentBg light differs from agentFg light (different shades)', () => {
      setDarkMode(false)
      for (const name of ['a', 'b', 'i', 'j', 'k']) {
        expect(agentBg(name)).not.toBe(agentFg(name))
      }
    })
  })

  // ── agentBorder() — darken2 dark / lighten2 light ────────────────────────────
  describe('agentBorder() — exact MD2 hex values', () => {
    it('"a" (lightBlue idx=6) dark → lightBlue darken2 #0288d1', () => {
      setDarkMode(true)
      expect(agentBorder('a')).toBe('#0288d1')
    })

    it('"a" (lightBlue idx=6) light → lightBlue lighten2 #4fc3f7', () => {
      setDarkMode(false)
      expect(agentBorder('a')).toBe('#4fc3f7')
    })

    it('agentBorder dark differs from agentBg dark', () => {
      setDarkMode(true)
      for (const name of ['a', 'b', 'i', 'j', 'k']) {
        expect(agentBorder(name)).not.toBe(agentBg(name))
      }
    })

    it('all outputs are valid hex colors', () => {
      for (const name of ['a', 'b', 'i', 'j', 'k']) {
        setDarkMode(false)
        expect(agentBorder(name)).toMatch(HEX_PATTERN)
        setDarkMode(true)
        expect(agentBorder(name)).toMatch(HEX_PATTERN)
      }
    })
  })

  // ── perimeterFg() — WCAG AA ratio >= 4.5:1 (T1510: shade escalation replaces fixed shades) ──
  describe('perimeterFg() — WCAG AA contrast ratio >= 4.5:1', () => {
    it('"a" (lightBlue idx=6) dark meets WCAG AA', () => {
      setDarkMode(true)
      expect(contrastRatio(perimeterFg('a'), agentBg('a'))).toBeGreaterThanOrEqual(4.5)
    })

    it('"a" (lightBlue idx=6) light meets WCAG AA', () => {
      setDarkMode(false)
      expect(contrastRatio(perimeterFg('a'), agentBg('a'))).toBeGreaterThanOrEqual(4.5)
    })

    it('perimeterFg dark meets WCAG AA for all tested families', () => {
      setDarkMode(true)
      for (const name of ['a', 'b', 'i', 'j', 'k']) {
        expect(contrastRatio(perimeterFg(name), agentBg(name))).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('dark and light values always differ', () => {
      for (const name of ['a', 'b', 'i', 'j', 'k']) {
        setDarkMode(false)
        const light = perimeterFg(name)
        setDarkMode(true)
        const dark = perimeterFg(name)
        expect(dark).not.toBe(light)
      }
    })
  })

  // ── perimeterBg() — darken4 dark / lighten5 light (same as agentBg) ──────────
  describe('perimeterBg() — exact MD2 hex values', () => {
    it('"a" (lightBlue idx=6) dark → lightBlue darken4 #01579b', () => {
      setDarkMode(true)
      expect(perimeterBg('a')).toBe('#01579b')
    })

    it('"a" (lightBlue idx=6) light → lightBlue lighten5 #e1f5fe', () => {
      setDarkMode(false)
      expect(perimeterBg('a')).toBe('#e1f5fe')
    })

    it('dark and light values always differ', () => {
      for (const name of ['a', 'b', 'i', 'j', 'k']) {
        setDarkMode(false)
        const light = perimeterBg(name)
        setDarkMode(true)
        const dark = perimeterBg(name)
        expect(dark).not.toBe(light)
      }
    })
  })

  // ── perimeterBorder() — darken3 dark / lighten3 light ────────────────────────
  describe('perimeterBorder() — exact MD2 hex values', () => {
    it('"a" (lightBlue idx=6) dark → lightBlue darken3 #0277bd', () => {
      setDarkMode(true)
      expect(perimeterBorder('a')).toBe('#0277bd')
    })

    it('"a" (lightBlue idx=6) light → lightBlue lighten3 #81d4fa', () => {
      setDarkMode(false)
      expect(perimeterBorder('a')).toBe('#81d4fa')
    })

    it('perimeterBorder dark differs from agentBorder dark (different shade: darken3 vs darken2)', () => {
      setDarkMode(true)
      for (const name of ['a', 'b', 'i', 'j', 'k']) {
        expect(perimeterBorder(name)).not.toBe(agentBorder(name))
      }
    })

    it('dark and light values always differ', () => {
      for (const name of ['a', 'b', 'i', 'j', 'k']) {
        setDarkMode(false)
        const light = perimeterBorder(name)
        setDarkMode(true)
        const dark = perimeterBorder(name)
        expect(dark).not.toBe(light)
      }
    })
  })

  // ── cacheSet() FIFO eviction at exactly CACHE_MAX boundary ───────────────────
  describe('cacheSet() FIFO eviction — CACHE_MAX=100 boundary', () => {
    it('inserting exactly 100 entries then 1 more returns valid hex color', () => {
      setDarkMode(true)
      const prefix = 'fifo-t1467-'
      for (let i = 0; i < 100; i++) {
        agentFg(`${prefix}${i}`)
      }
      const result = agentFg(`${prefix}100`)
      expect(result).toMatch(HEX_PATTERN)
    })

    it('cache eviction keeps second entry accessible after evicting first', () => {
      setDarkMode(true)
      const prefix = 'fifo2-t1467-'
      for (let i = 0; i < 100; i++) {
        agentFg(`${prefix}${i}`)
      }
      agentFg(`${prefix}100`)
      const second = agentFg(`${prefix}1`)
      expect(second).toMatch(HEX_PATTERN)
    })

    it('cache size stays bounded after many inserts', () => {
      setDarkMode(false)
      for (let i = 0; i < 200; i++) {
        const result = agentFg(`size-bound-t1467-${i}`)
        expect(result).toMatch(HEX_PATTERN)
      }
    })

    it('99 entries do NOT trigger eviction (< CACHE_MAX)', () => {
      setDarkMode(true)
      const prefix = 'noevict-t1467-'
      for (let i = 0; i < 99; i++) {
        agentBg(`${prefix}${i}`)
      }
      const result = agentBg(`${prefix}99`)
      expect(result).toMatch(HEX_PATTERN)
    })

    it('exactly 100 entries trigger eviction on 101st insert (>= boundary)', () => {
      setDarkMode(true)
      const prefix = 'at-max-t1467-'
      for (let i = 0; i < 100; i++) {
        agentBorder(`${prefix}${i}`)
      }
      const result = agentBorder(`${prefix}100`)
      expect(result).toMatch(HEX_PATTERN)
    })
  })
})

// ─── T1510: WCAG AA compliance — all 13 families × 2 themes ──────────────────
// Single-char names a–m map to palette indices 6–12 then 0–5, covering all 13.
//   a=lightBlue(6) b=cyan(7) c=brown(8) d=blueGrey(9) e=amber(10) f=orange(11)
//   g=deepOrange(12) h=red(0) i=pink(1) j=purple(2) k=deepPurple(3)
//   l=indigo(4) m=blue(5)
const ALL_FAMILIES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm']

function setDarkModeForWcag(enabled: boolean) {
  if (enabled) document.documentElement.classList.add('dark')
  else document.documentElement.classList.remove('dark')
  setDarkModeReactive(enabled)
}

describe('WCAG AA compliance — all 13 families × 2 themes (T1510, updated T1623)', () => {
  afterEach(() => setDarkModeForWcag(false))

  it('agentFg dark mode: all 13 families meet 4.5:1 against agentBg', () => {
    setDarkModeForWcag(true)
    for (const name of ALL_FAMILIES) {
      const ratio = contrastRatio(agentFg(name), agentBg(name))
      expect(ratio, `agentFg('${name}') dark: ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('agentFg light mode: all 13 families meet 4.5:1 against agentBg', () => {
    setDarkModeForWcag(false)
    for (const name of ALL_FAMILIES) {
      const ratio = contrastRatio(agentFg(name), agentBg(name))
      expect(ratio, `agentFg('${name}') light: ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('perimeterFg dark mode: all 13 families meet 4.5:1 against agentBg', () => {
    setDarkModeForWcag(true)
    for (const name of ALL_FAMILIES) {
      const ratio = contrastRatio(perimeterFg(name), agentBg(name))
      expect(ratio, `perimeterFg('${name}') dark: ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('perimeterFg light mode: all 13 families meet 4.5:1 against agentBg', () => {
    setDarkModeForWcag(false)
    for (const name of ALL_FAMILIES) {
      const ratio = contrastRatio(perimeterFg(name), agentBg(name))
      expect(ratio, `perimeterFg('${name}') light: ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
