import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { agentFg, agentBg, agentBorder, perimeterFg, perimeterBg, perimeterBorder, isDark, setDarkMode, agentHue } from '@renderer/utils/agentColor'

describe('agentColor utilities (T353)', () => {
  it('agentHue returns a stable hue for the same name', () => {
    const h1 = agentHue('dev-front')
    const h2 = agentHue('dev-front')
    expect(h1).toBe(h2)
    expect(h1).toBeGreaterThanOrEqual(0)
    expect(h1).toBeLessThan(360)
  })

  it('agentHue returns different hues for different names', () => {
    const h1 = agentHue('dev-front')
    const h2 = agentHue('review-master')
    // Different names should (almost certainly) have different hues
    expect(h1).not.toBe(h2)
  })

  it('agentFg returns HSL string', () => {
    const fg = agentFg('test-agent')
    expect(fg).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
  })

  it('agentBg returns HSL string', () => {
    const bg = agentBg('test-agent')
    expect(bg).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
  })

  it('agentBorder returns HSL string', () => {
    const border = agentBorder('test-agent')
    expect(border).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
  })

  it('perimeterFg returns HSL string', () => {
    const fg = perimeterFg('front-vuejs')
    expect(fg).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
  })

  it('perimeterBg returns HSL string', () => {
    const bg = perimeterBg('front-vuejs')
    expect(bg).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
  })

  it('perimeterBorder returns HSL string', () => {
    const border = perimeterBorder('front-vuejs')
    expect(border).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
  })

  it('setDarkMode toggles isDark()', () => {
    setDarkMode(true)
    expect(isDark()).toBe(true)

    setDarkMode(false)
    expect(isDark()).toBe(false)
  })

  it('dark mode changes lightness values in agentFg', () => {
    setDarkMode(true)
    const darkFg = agentFg('test')

    setDarkMode(false)
    const lightFg = agentFg('test')

    expect(darkFg).not.toBe(lightFg)
  })

})

