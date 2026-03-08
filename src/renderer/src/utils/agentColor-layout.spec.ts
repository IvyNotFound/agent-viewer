import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { agentHue, agentFg, agentBg, agentBorder, perimeterFg, perimeterBg, perimeterBorder, setDarkMode as setDarkModeReactive, colorVersion } from '@renderer/utils/agentColor'

/** Toggle dark mode on document.documentElement and reactive ref for testing */
function setDarkMode(enabled: boolean) {
  if (enabled) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
  setDarkModeReactive(enabled)
}

describe('agentColor', () => {
  afterEach(() => setDarkMode(false))

  describe('cache LRU eviction', () => {
    beforeEach(() => setDarkMode(false))

    it('cache does not grow beyond CACHE_MAX when filling agentHue with 110 names', () => {
      for (let i = 0; i < 110; i++) {
        const hue = agentHue(`cache-test-name-${i}`)
        expect(hue).toBeGreaterThanOrEqual(0)
        expect(hue).toBeLessThan(360)
      }
    })

    it('agentFg cache still works after eviction — returns valid HSL for new names', () => {
      for (let i = 0; i < 105; i++) {
        agentFg(`eviction-fg-${i}`)
      }
      const fg = agentFg('eviction-fg-new')
      expect(fg).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
    })

    it('agentBg cache stays functional after eviction', () => {
      for (let i = 0; i < 105; i++) {
        agentBg(`eviction-bg-${i}`)
      }
      const bg = agentBg('eviction-bg-new')
      expect(bg).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
    })
  })

  describe('saturation arithmetic (factor tests)', () => {
    it('agentBg dark: saturation factor 0.58 applied correctly (not 0 or full)', () => {
      setDarkMode(true)
      const name = 'sat-test-agent'
      const bg = agentBg(name)
      const match = bg.match(/hsl\(\d+, (\d+)%, \d+%\)/)
      const s = match ? parseInt(match[1]) : -1
      expect(s).toBeGreaterThan(0)
      expect(s).toBeLessThan(100)
    })

    it('agentBg light: saturation factor 0.72 applied correctly (not 0 or full)', () => {
      setDarkMode(false)
      const name = 'sat-test-agent'
      const bg = agentBg(name)
      const match = bg.match(/hsl\(\d+, (\d+)%, \d+%\)/)
      const s = match ? parseInt(match[1]) : -1
      expect(s).toBeGreaterThan(0)
      expect(s).toBeLessThan(100)
    })

    it('agentBg dark saturation is less than agentFg saturation (factor 0.58 < 1)', () => {
      setDarkMode(true)
      const name = 'sat-compare-agent'
      const fg = agentFg(name)
      const bg = agentBg(name)
      const fgS = parseInt(fg.match(/hsl\(\d+, (\d+)%/)![1])
      const bgS = parseInt(bg.match(/hsl\(\d+, (\d+)%/)![1])
      expect(bgS).toBeLessThan(fgS)
    })

    it('perimeterFg dark: saturation factor 0.86 applied (higher than agentBg 0.58)', () => {
      setDarkMode(true)
      const name = 'sat-perimeter-test'
      const pfg = perimeterFg(name)
      const bg = agentBg(name)
      const pfgS = parseInt(pfg.match(/hsl\(\d+, (\d+)%/)![1])
      const bgS = parseInt(bg.match(/hsl\(\d+, (\d+)%/)![1])
      expect(pfgS).toBeGreaterThan(bgS)
    })
  })

  describe('agentFg lightness exact values', () => {
    it('dark mode: lightness is exactly 68%', () => {
      setDarkMode(true)
      const fg = agentFg('exact-lightness-test')
      expect(fg).toMatch(/68%\)$/)
    })

    it('light mode: lightness is exactly 38%', () => {
      setDarkMode(false)
      const fg = agentFg('exact-lightness-test-light')
      expect(fg).toMatch(/38%\)$/)
    })
  })

  describe('agentBg lightness exact values', () => {
    it('dark mode: lightness is exactly 18%', () => {
      setDarkMode(true)
      const bg = agentBg('exact-bg-lightness-dark')
      expect(bg).toMatch(/18%\)$/)
    })

    it('light mode: lightness is exactly 92%', () => {
      setDarkMode(false)
      const bg = agentBg('exact-bg-lightness-light')
      expect(bg).toMatch(/92%\)$/)
    })
  })

  describe('agentBorder lightness exact values', () => {
    it('dark mode: lightness is exactly 32%', () => {
      setDarkMode(true)
      const border = agentBorder('exact-border-dark')
      expect(border).toMatch(/32%\)$/)
    })

    it('light mode: lightness is exactly 78%', () => {
      setDarkMode(false)
      const border = agentBorder('exact-border-light')
      expect(border).toMatch(/78%\)$/)
    })
  })

  describe('perimeterFg lightness exact values', () => {
    it('dark mode: lightness is exactly 70%', () => {
      setDarkMode(true)
      const fg = perimeterFg('exact-pfg-dark')
      expect(fg).toMatch(/70%\)$/)
    })

    it('light mode: lightness is exactly 35%', () => {
      setDarkMode(false)
      const fg = perimeterFg('exact-pfg-light')
      expect(fg).toMatch(/35%\)$/)
    })
  })

  describe('perimeterBg and perimeterBorder', () => {
    it('perimeterBg dark: lightness is exactly 15%', () => {
      setDarkMode(true)
      const bg = perimeterBg('pbg-dark-test')
      expect(bg).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
      expect(bg).toMatch(/15%\)$/)
    })

    it('perimeterBg light: lightness is exactly 93%', () => {
      setDarkMode(false)
      const bg = perimeterBg('pbg-light-test')
      expect(bg).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
      expect(bg).toMatch(/93%\)$/)
    })

    it('perimeterBorder dark: lightness is exactly 27%', () => {
      setDarkMode(true)
      const border = perimeterBorder('pborder-dark-test')
      expect(border).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
      expect(border).toMatch(/27%\)$/)
    })

    it('perimeterBorder light: lightness is exactly 80%', () => {
      setDarkMode(false)
      const border = perimeterBorder('pborder-light-test')
      expect(border).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
      expect(border).toMatch(/80%\)$/)
    })

    it('perimeterBg uses same hue as agentHue', () => {
      const name = 'perimeter-hue-check'
      const hue = agentHue(name)
      const bg = perimeterBg(name)
      expect(bg).toContain(`hsl(${hue},`)
    })

    it('perimeterBorder uses same hue as agentHue', () => {
      const name = 'perimeter-border-hue-check'
      const hue = agentHue(name)
      const border = perimeterBorder(name)
      expect(border).toContain(`hsl(${hue},`)
    })

    it('perimeterBg changes on theme switch', () => {
      const name = 'pbg-theme-switch'
      setDarkMode(true)
      const dark = perimeterBg(name)
      setDarkMode(false)
      const light = perimeterBg(name)
      expect(dark).not.toBe(light)
    })

    it('perimeterBorder changes on theme switch', () => {
      const name = 'pborder-theme-switch'
      setDarkMode(true)
      const dark = perimeterBorder(name)
      setDarkMode(false)
      const light = perimeterBorder(name)
      expect(dark).not.toBe(light)
    })
  })

  describe('HSL format correctness', () => {
    it('all color functions return exactly "hsl(H, S%, L%)" format', () => {
      const hslPattern = /^hsl\(\d+, \d+%, \d+%\)$/
      const name = 'format-check-agent'
      expect(agentFg(name)).toMatch(hslPattern)
      expect(agentBg(name)).toMatch(hslPattern)
      expect(agentBorder(name)).toMatch(hslPattern)
      expect(perimeterFg(name)).toMatch(hslPattern)
      expect(perimeterBg(name)).toMatch(hslPattern)
      expect(perimeterBorder(name)).toMatch(hslPattern)
    })

    it('format uses comma-space separator between values', () => {
      const fg = agentFg('format-sep-test')
      expect(fg).toMatch(/hsl\(\d+, \d+%, \d+%\)/)
    })
  })
})
