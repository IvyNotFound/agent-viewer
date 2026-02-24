import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.ivynotfound.agent-viewer',
  productName: 'agent-viewer',
  directories: {
    buildResources: 'build',
    output: 'dist'
  },
  files: ['out/**/*'],
  mac: { target: 'dmg' },
  win: { target: 'nsis' },
  linux: { target: 'AppImage' }
}

export default config
