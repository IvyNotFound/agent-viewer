import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default createVuetify({
  components,
  directives,
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
