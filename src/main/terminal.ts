import { ipcMain } from 'electron'
import { spawn, type IPty } from 'node-pty'

const ptys = new Map<string, IPty>()
let nextId = 1

function toWslPath(winPath: string): string {
  return winPath
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`)
}

export function registerTerminalHandlers(): void {
  ipcMain.handle('terminal:create', (event, cols: number, rows: number, projectPath?: string) => {
    const id = String(nextId++)
    const args = projectPath ? ['--cd', toWslPath(projectPath)] : []
    const pty = spawn('wsl.exe', args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: projectPath ?? (process.env.HOME ?? 'C:\\'),
      env: process.env as Record<string, string>
    })
    ptys.set(id, pty)

    pty.onData(data => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`terminal:data:${id}`, data)
      }
    })

    pty.onExit(() => {
      ptys.delete(id)
      if (!event.sender.isDestroyed()) {
        event.sender.send(`terminal:exit:${id}`)
      }
    })

    return id
  })

  ipcMain.handle('terminal:write', (_event, id: string, data: string) => {
    ptys.get(id)?.write(data)
  })

  ipcMain.handle('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    ptys.get(id)?.resize(cols, rows)
  })

  ipcMain.handle('terminal:kill', (_event, id: string) => {
    ptys.get(id)?.kill()
    ptys.delete(id)
  })

  ipcMain.handle('terminal:subscribe', (_event, _id: string) => {
    // Already subscribed via onData above, this is a no-op
    // but we expose it for re-subscription after hot-reload
  })
}
