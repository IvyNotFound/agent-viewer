import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/renderer/**/*.{vue,ts,html}'],
  theme: {
    extend: {
      colors: {
        brand: {
          violet: '#8b5cf6',
          emerald: '#10b981',
          amber: '#f59e0b',
          zinc: '#71717a'
        }
      }
    }
  },
  plugins: []
}

export default config
