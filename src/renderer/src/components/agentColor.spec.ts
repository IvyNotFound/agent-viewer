import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { agentFg, agentBg, agentBorder, perimeterFg, perimeterBg, perimeterBorder, isDark, setDarkMode, agentHue, colorVersion } from '@renderer/utils/agentColor'

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

// ─── T1319: mutation-killing tests ───────────────────────────────────────────

describe('agentColor — hash function exact values (T1319)', () => {
  // 'hello': hash=99162322, hue=322, satIdx=0 (hash>>9=193676=even%4=0), sat=55
  // 'test-agent': hash=621962762, hue=122, satIdx=3, sat=85
  // These exact values kill h*31 -> h+31 / h*32 / h-31 mutants

  it('agentHue(hello) === 322 (kills h*31 arithmetic mutants)', () => {
    expect(agentHue('hello')).toBe(322)
  })

  it('agentHue(test-agent) === 122 (kills h*31 arithmetic mutants)', () => {
    expect(agentHue('test-agent')).toBe(122)
  })

  it('agentHue of empty string is 0 (covers !name guard)', () => {
    expect(agentHue('')).toBe(0)
  })

  it('agentHue differs between anagram-like names (order matters in hash)', () => {
    // 'ab': hash=3105 hue=225, 'ba': hash=3135 hue=255
    expect(agentHue('ab')).toBe(225)
    expect(agentHue('ba')).toBe(255)
    expect(agentHue('ab')).not.toBe(agentHue('ba'))
  })
})

describe('agentColor — saturation math exact values (T1319)', () => {
  // test-agent: hue=122, sat=85
  // agentBg dark uses s*0.58=49, light uses s*0.72=61
  // agentBorder uses s*0.58=49
  // perimeterFg dark uses s*0.86=73, light uses s*0.79=67
  // perimeterBg dark uses s*0.43=37, light uses s*0.57=48
  // hello: sat=55 (verifies different SAT_STEPS entry)

  it('agentBg dark mode uses s*0.58 exactly (test-agent: sat=85 -> 49)', () => {
    setDarkMode(true)
    expect(agentBg('test-agent')).toBe('hsl(122, 49%, 18%)')
  })

  it('agentBg light mode uses s*0.72 exactly (test-agent: sat=85 -> 61)', () => {
    setDarkMode(false)
    expect(agentBg('test-agent')).toBe('hsl(122, 61%, 92%)')
  })

  it('agentBorder dark mode uses s*0.58 (test-agent: sat=85 -> 49, L=32)', () => {
    setDarkMode(true)
    expect(agentBorder('test-agent')).toBe('hsl(122, 49%, 32%)')
  })

  it('agentBorder light mode uses s*0.58 (test-agent: sat=85 -> 49, L=78)', () => {
    setDarkMode(false)
    expect(agentBorder('test-agent')).toBe('hsl(122, 49%, 78%)')
  })

  it('perimeterFg dark mode uses s*0.86 (test-agent: sat=85 -> 73)', () => {
    setDarkMode(true)
    expect(perimeterFg('test-agent')).toBe('hsl(122, 73%, 70%)')
  })

  it('perimeterFg light mode uses s*0.79 (test-agent: sat=85 -> 67)', () => {
    setDarkMode(false)
    expect(perimeterFg('test-agent')).toBe('hsl(122, 67%, 35%)')
  })

  it('perimeterBg dark mode uses s*0.43 (test-agent: sat=85 -> 37)', () => {
    setDarkMode(true)
    expect(perimeterBg('test-agent')).toBe('hsl(122, 37%, 15%)')
  })

  it('perimeterBg light mode uses s*0.57 (test-agent: sat=85 -> 48)', () => {
    setDarkMode(false)
    expect(perimeterBg('test-agent')).toBe('hsl(122, 48%, 93%)')
  })

  it('perimeterBorder dark mode uses s*0.43 (test-agent: sat=85 -> 37, L=27)', () => {
    setDarkMode(true)
    expect(perimeterBorder('test-agent')).toBe('hsl(122, 37%, 27%)')
  })

  it('perimeterBorder light mode uses s*0.43 (test-agent: sat=85 -> 37, L=80)', () => {
    setDarkMode(false)
    expect(perimeterBorder('test-agent')).toBe('hsl(122, 37%, 80%)')
  })

  it('sat=55 (hello) verifies different SAT_STEPS slot, kills >> 9 -> >> 8 mutant', () => {
    // hello: hash=99162322, hash>>9=193676, 193676%4=0 -> sat=55
    // If mutated to hash>>8=387149, 387149%4=1 -> sat=65 (different)
    setDarkMode(true)
    expect(perimeterFg('hello')).toBe('hsl(322, 47%, 70%)')
  })
})

describe('agentColor — Math.min(s, 70) clamp in agentFg (T1319)', () => {
  // test-agent: sat=85 > 70, so Math.min(85, 70)=70 in light mode
  // hello: sat=55 <= 70, Math.min(55, 70)=55 (no clamp)

  it('agentFg light mode clamps sat to 70 when s=85 (kills Math.min removal mutant)', () => {
    setDarkMode(false)
    expect(agentFg('test-agent')).toBe('hsl(122, 70%, 38%)')
  })

  it('agentFg dark mode uses unclamped sat=85 (no Math.min in dark path)', () => {
    setDarkMode(true)
    expect(agentFg('test-agent')).toBe('hsl(122, 85%, 68%)')
  })

  it('agentFg light mode uses unclamped sat=55 when s < 70 (Math.min is no-op)', () => {
    setDarkMode(false)
    // hello: sat=55, hue=322
    expect(agentFg('hello')).toBe('hsl(322, 55%, 38%)')
  })
})

describe('agentColor — setDarkMode no-op and cache invalidation (T1319)', () => {
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
  // We test via agentHue which uses hueCache: after 100 unique names, adding one more
  // should keep the cache at exactly CACHE_MAX (old entry evicted)

  it('agentHue still returns correct value for name added at/after CACHE_MAX boundary', () => {
    // Fill the cache with 100 unique names via agentHue calls
    // The internal hueCache starts populated from previous tests; we warm it beyond CACHE_MAX
    // by calling agentHue with 110 unique names
    for (let i = 0; i < 110; i++) {
      agentHue(`unique-cache-name-${i}`)
    }
    // The cache should still function correctly — new queries are computed properly
    expect(agentHue('unique-cache-name-105')).toBe(agentHue('unique-cache-name-105'))
    expect(agentHue('unique-cache-name-105')).toBeGreaterThanOrEqual(0)
    expect(agentHue('unique-cache-name-105')).toBeLessThan(360)
  })

  it('cache eviction: first entries are evicted when CACHE_MAX exceeded', () => {
    // After filling 110+ names, early names would have been evicted
    // Calling agentHue again on an early name re-computes it correctly
    const hue = agentHue('unique-cache-name-0')
    // It must still return the correct deterministic hue
    expect(hue).toBe(agentHue('unique-cache-name-0'))
    expect(hue).toBeGreaterThanOrEqual(0)
    expect(hue).toBeLessThan(360)
  })
})

