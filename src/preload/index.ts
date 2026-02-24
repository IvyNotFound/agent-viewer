import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectProjectDir: (): Promise<{ projectPath: string; dbPath: string | null; error: string | null } | null> =>
    ipcRenderer.invoke('select-project-dir'),

  queryDb: (dbPath: string, query: string, params?: unknown[]): Promise<unknown[]> =>
    ipcRenderer.invoke('query-db', dbPath, query, params ?? []),

  watchDb: (dbPath: string): Promise<void> =>
    ipcRenderer.invoke('watch-db', dbPath),

  unwatchDb: (): Promise<void> =>
    ipcRenderer.invoke('unwatch-db'),

  onDbChanged: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on('db-changed', handler)
    return () => ipcRenderer.off('db-changed', handler)
  },

  windowMinimize: (): Promise<void> => ipcRenderer.invoke('window-minimize'),
  windowMaximize: (): Promise<void> => ipcRenderer.invoke('window-maximize'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('window-close'),

  // Terminal
  terminalCreate: (cols: number, rows: number, projectPath?: string): Promise<string> =>
    ipcRenderer.invoke('terminal:create', cols, rows, projectPath),

  terminalWrite: (id: string, data: string): Promise<void> =>
    ipcRenderer.invoke('terminal:write', id, data),

  terminalResize: (id: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke('terminal:resize', id, cols, rows),

  terminalKill: (id: string): Promise<void> =>
    ipcRenderer.invoke('terminal:kill', id),

  onTerminalData: (id: string, cb: (data: string) => void): (() => void) => {
    const channel = `terminal:data:${id}`
    const handler = (_: unknown, data: string) => cb(data)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.off(channel, handler)
  },

  onTerminalExit: (id: string, cb: () => void): (() => void) => {
    const channel = `terminal:exit:${id}`
    const handler = () => cb()
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.off(channel, handler)
  },
})
