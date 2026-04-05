/**
 * Language color palette — MD3-harmonized tonal palette for code telemetry.
 *
 * Colors are defined per-theme (dark/light) using MD3 tonal values:
 * dark tones ~68–75 for good contrast on dark surfaces,
 * light tones ~30–42 for legibility on light surfaces.
 *
 * Unlisted languages receive a deterministic HSL color derived from a
 * djb2-style hash of the language name:
 *   dark:  hsl(hue, 60%, 72%) — good contrast on dark surfaces
 *   light: hsl(hue, 70%, 32%) — readable on light surfaces
 *
 * Usage:
 *   import { getLangColor } from '@renderer/utils/lang-colors'
 *   import { useSettingsStore } from '@renderer/stores/settings'
 *   const settings = useSettingsStore()
 *   // in template: :style="{ backgroundColor: getLangColor(lang.name, settings.theme === 'dark') }"
 */

const LANG_COLORS: Record<string, { light: string; dark: string }> = {
  // Core web / scripting
  TypeScript:  { dark: '#7cacf8', light: '#1a56db' },
  Vue:         { dark: '#6edba7', light: '#1a8a5a' },
  JavaScript:  { dark: '#f0c060', light: '#7a4f00' },
  CSS:         { dark: '#c084fc', light: '#6d28d9' },
  HTML:        { dark: '#f97066', light: '#b91c1c' },
  // Systems / backend
  Python:      { dark: '#60a5fa', light: '#1d4ed8' },
  Go:          { dark: '#67e8f9', light: '#0e7490' },
  Rust:        { dark: '#fdba74', light: '#9a3412' },
  Java:        { dark: '#fcd34d', light: '#78350f' },
  // Data / config / docs
  JSON:        { dark: '#a3a3a3', light: '#404040' },
  Markdown:    { dark: '#86efac', light: '#15803d' },
  Shell:       { dark: '#bef264', light: '#3f6212' },
  SQL:         { dark: '#fda4af', light: '#be123c' },
  // Extended — common languages not in the original list
  'C':         { dark: '#93c5fd', light: '#1e40af' },
  'C++':       { dark: '#a5b4fc', light: '#3730a3' },
  'C#':        { dark: '#818cf8', light: '#4338ca' },
  Ruby:        { dark: '#fca5a5', light: '#991b1b' },
  PHP:         { dark: '#c4b5fd', light: '#5b21b6' },
  Swift:       { dark: '#fb923c', light: '#9a3412' },
  Kotlin:      { dark: '#a78bfa', light: '#5b21b6' },
  YAML:        { dark: '#d1d5db', light: '#374151' },
  TOML:        { dark: '#fbbf24', light: '#92400e' },
  Dockerfile:  { dark: '#38bdf8', light: '#075985' },
  Svelte:      { dark: '#fb7185', light: '#9f1239' },
  SCSS:        { dark: '#f9a8d4', light: '#9d174d' },
}

/**
 * Deterministic hash of a language name (djb2-style).
 * Returns a stable non-negative 32-bit integer.
 */
function hashLangName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0
  }
  return h
}

/** Return the MD3-harmonized color for a language name, adapted to the current theme. */
export function getLangColor(name: string, isDark: boolean): string {
  const entry = LANG_COLORS[name]
  if (entry) return isDark ? entry.dark : entry.light
  const hue = hashLangName(name) % 360
  return isDark
    ? `hsl(${hue}, 60%, 72%)`
    : `hsl(${hue}, 70%, 32%)`
}
