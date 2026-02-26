import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      // Baked in at build time: GITHUB_TOKEN env var → constant in bundle
      // Build with: GITHUB_TOKEN=ghp_xxx npm run build
      // Without it, token is empty string and GitHub features degrade gracefully
      '__BUILT_IN_GITHUB_TOKEN__': JSON.stringify(process.env['GITHUB_TOKEN'] || '')
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
      // Enable JIT message compilation (interpreter-based, no new Function())
      // Required because Electron CSP blocks 'unsafe-eval' used by the default compiler
      __INTLIFY_JIT_COMPILATION__: true
    }
  }
})
