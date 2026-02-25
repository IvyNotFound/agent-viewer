/**
 * Vue I18n plugin setup for agent-viewer.
 *
 * Supports: 'fr' (default) and 'en'.
 * Language is persisted in localStorage under the key 'language'.
 * Fallback locale: 'en'.
 *
 * @module plugins/i18n
 */

import { createI18n } from 'vue-i18n'
import fr from '../locales/fr.json'
import en from '../locales/en.json'

export type AppLocale = 'fr' | 'en'

const savedLocale = (localStorage.getItem('language') as AppLocale | null) ?? 'fr'

const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'en',
  messages: {
    fr,
    en,
  },
})

export default i18n
