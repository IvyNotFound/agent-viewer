import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.ivynotfound.agent-viewer',
  productName: 'agent-viewer',
  directories: {
    buildResources: 'build',
    output: 'dist'
  },
  files: ['out/**/*'],
  extraResources: [
    {
      from: 'resources/bin/',
      to: 'bin/',
      filter: ['**/*']
    }
  ],
  win: {
    target: 'nsis',
    icon: 'build/icon.ico'
  },
  mac: {
    icon: 'build/icon.icns'
  },
  linux: {
    icon: 'build/icon.png'
  },
  nsis: {
    // Adds $INSTDIR\resources\bin to the system PATH so sqlite3.exe is accessible
    // from PowerShell, CMD, and WSL terminals (via Windows interop).
    include: 'build/installer.nsh',
    artifactName: 'setup-${version}.exe'
  }
}

export default config
