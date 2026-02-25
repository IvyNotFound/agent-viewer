import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
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
    plugins: [
      vue(),
      VueI18nPlugin({
        include: resolve(__dirname, 'src/renderer/src/locales/**'),
        strictMessage: false,
        runtimeOnly: false,
      }),
    ],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
      // Tree-shake the runtime message compiler from the bundle (smaller build)
      // Safe because @intlify/unplugin-vue-i18n pre-compiles all JSON messages at build time (AOT)
      __INTLIFY_DROP_MESSAGE_COMPILER__: true
    }
  }
})
