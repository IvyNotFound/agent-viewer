/**
 * Language color palette — MD3-harmonized tonal palette for code telemetry.
 *
 * Colors are defined per-theme (dark/light) using MD3 tonal values:
 * dark tones ~68–75 for good contrast on dark surfaces,
 * light tones ~30–42 for legibility on light surfaces.
 *
 * Usage:
 *   import { getLangColor } from '@renderer/utils/lang-colors'
 *   import { useSettingsStore } from '@renderer/stores/settings'
 *   const settings = useSettingsStore()
 *   // in template: :style="{ backgroundColor: getLangColor(lang.name, settings.theme === 'dark') }"
 */

const LANG_COLORS: Record<string, { light: string; dark: string }> = {
  TypeScript:  { dark: '#7cacf8', light: '#1a56db' },
  Vue:         { dark: '#6edba7', light: '#1a8a5a' },
  JavaScript:  { dark: '#f0c060', light: '#7a4f00' },
  CSS:         { dark: '#c084fc', light: '#6d28d9' },
  HTML:        { dark: '#f97066', light: '#b91c1c' },
  Python:      { dark: '#60a5fa', light: '#1d4ed8' },
  Go:          { dark: '#67e8f9', light: '#0e7490' },
  Rust:        { dark: '#fdba74', light: '#9a3412' },
  Java:        { dark: '#fcd34d', light: '#78350f' },
  JSON:        { dark: '#a3a3a3', light: '#404040' },
  Markdown:    { dark: '#86efac', light: '#15803d' },
  Shell:       { dark: '#bef264', light: '#3f6212' },
  SQL:         { dark: '#fda4af', light: '#be123c' },
}

/** Return the MD3-harmonized color for a language name, adapted to the current theme. */
export function getLangColor(name: string, isDark: boolean): string {
  const entry = LANG_COLORS[name]
  if (!entry) return isDark ? '#9ca3af' : '#6b7280'
  return isDark ? entry.dark : entry.light
}
