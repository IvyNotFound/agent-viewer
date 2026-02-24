import { ipcMain, dialog, BrowserWindow } from 'electron'
import { watch, type FSWatcher, readdirSync, existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SQL: any = null
let watcher: FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function getSqlJs() {
  if (!SQL) {
    // sql.js: loads SQLite as WASM, reads DB from a Buffer — bypasses all file locking
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const initSqlJs = require('sql.js')
    const wasmDir = dirname(require.resolve('sql.js'))
    SQL = await initSqlJs({
      locateFile: (file: string) => join(wasmDir, file)
    })
  }
  return SQL
}

async function queryLive(dbPath: string, query: string, params: unknown[]): Promise<unknown[]> {
  const sqlJs = await getSqlJs()
  // fs.readFile uses ReadFile() on Windows — NOT subject to SQLite byte-range locks
  const buf = await readFile(dbPath)
  const db = new sqlJs.Database(buf)
  try {
    const stmt = db.prepare(query)
    const rows: Record<string, unknown>[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stmt.bind(params as any)
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows
  } finally {
    db.close()
  }
}

function findProjectDb(projectPath: string): string | null {
  const claudeDir = join(projectPath, '.claude')
  if (existsSync(claudeDir)) {
    try {
      const files = readdirSync(claudeDir).filter(f => f.endsWith('.db'))
      if (files.length > 0) {
        const found = join(claudeDir, files[0])
        console.log('[findProjectDb] found:', found)
        return found
      }
    } catch { /* ignore */ }
  }
  try {
    const files = readdirSync(projectPath).filter(f => f.endsWith('.db'))
    if (files.length > 0) return join(projectPath, files[0])
  } catch { /* ignore */ }
  return null
}

function notifyRenderer(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('db-changed')
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('select-project-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Sélectionner le répertoire du projet',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const projectPath = result.filePaths[0]
    const dbPath = findProjectDb(projectPath)
    if (!dbPath) return { projectPath, dbPath: null, error: 'Aucun fichier .db trouvé dans .claude/ ni à la racine' }
    return { projectPath, dbPath, error: null }
  })

  ipcMain.handle('query-db', async (_event, dbPath: string, query: string, params: unknown[] = []) => {
    try {
      return await queryLive(dbPath, query, params)
    } catch (err) {
      console.error('[IPC query-db]', err)
      throw err
    }
  })

  ipcMain.handle('watch-db', (_event, dbPath: string) => {
    if (watcher) { watcher.close(); watcher = null }
    try {
      watcher = watch(dbPath, () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => notifyRenderer(), 300)
      })
    } catch (err) {
      console.error('[IPC watch-db]', err)
    }
  })

  ipcMain.handle('unwatch-db', () => {
    if (watcher) { watcher.close(); watcher = null }
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
  })

  ipcMain.handle('show-confirm-dialog', async (_event, opts: { title: string; message: string; detail?: string }) => {
    const result = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Continuer', 'Annuler'],
      defaultId: 1,
      cancelId: 1,
      title: opts.title,
      message: opts.message,
      detail: opts.detail,
    })
    return result.response === 0
  })

  ipcMain.handle('window-minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })

  ipcMain.handle('window-maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })

  ipcMain.handle('window-close', () => {
    BrowserWindow.getFocusedWindow()?.close()
  })
}
