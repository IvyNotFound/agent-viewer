import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default createVuetify({
  components,
  directives,
  defaults: {
    VBtn: { variant: 'flat', density: 'comfortable', rounded: 'lg' },
    VTextField: { variant: 'outlined', density: 'compact', color: 'primary', hideDetails: 'auto' },
    VSelect: { variant: 'outlined', density: 'compact', color: 'primary', hideDetails: 'auto' },
    VTextarea: { variant: 'outlined', density: 'compact', color: 'primary', hideDetails: 'auto' },
    VSwitch: { color: 'primary', density: 'compact' },
    VCheckbox: { color: 'primary', density: 'compact' },
    VCard: { rounded: 'lg', variant: 'elevated' },
    VChip: { size: 'small', variant: 'tonal' },
    VList: { density: 'compact' },
    VDialog: { scrim: true, scrollable: true },
    VSnackbar: { timeout: 5000, location: 'bottom end' },
    VTab: { density: 'compact' },
    VMenu: { offset: 4 },
  },
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        dark: true,
        colors: {
          primary: '#8b5cf6',      // brand-violet
          secondary: '#10b981',    // brand-emerald
          warning: '#f59e0b',      // brand-amber
          surface: '#09090b',      // zinc-950
          background: '#18181b',   // zinc-900
          'on-surface': '#f4f4f5', // zinc-100
        },
      },
      light: {
        dark: false,
        colors: {
          primary: '#8b5cf6',
          secondary: '#10b981',
          warning: '#f59e0b',
          surface: '#ffffff',
          background: '#f4f4f5',
          'on-surface': '#18181b',
        },
      },
    },
  },
})
