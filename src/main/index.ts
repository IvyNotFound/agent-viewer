import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { registerTerminalHandlers } from './terminal'

function getIconPath(): string | undefined {
  // In packaged app, resources are in process.resourcesPath
  // In development, icons are in the project root build/ folder
  if (app.isPackaged) {
    return join(process.resourcesPath || '', '../build/icon.png')
  }
  return join(__dirname, '../../build/icon.png')
}

function createWindow(): void {
  const iconPath = getIconPath()

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#18181b',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())

  win.on('maximize', () => win.webContents.send('window-state-changed', true))
  win.on('unmaximize', () => win.webContents.send('window-state-changed', false))

  registerIpcHandlers()
  registerTerminalHandlers()

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
