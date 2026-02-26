/**
 * IPC Handlers for agent-viewer
 *
 * Barrel module: registers all IPC handlers from domain-specific modules.
 * Project, DB, and window handlers remain here; agents, settings, and
 * filesystem handlers are in dedicated modules.
 *
 * @module ipc
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { watch, type FSWatcher, readdirSync, existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { DEFAULT_AGENTS } from './default-agents'
import {
  registerDbPath,
  registerProjectPath,
  assertDbPathAllowed,
  assertProjectPathAllowed,
  getSqlJs,
  queryLive,
  migrateDb,
  FORBIDDEN_WRITE_PATTERN,
  clearDbCacheEntry
} from './db'
import { registerFsHandlers } from './ipc-fs'
import { registerAgentHandlers } from './ipc-agents'
import { registerSettingsHandlers } from './ipc-settings'

// Re-export for consumers (index.ts, tests)
export { registerDbPath, registerProjectPath } from './db'

// ── Helpers ──────────────────────────────────────────────────────────────────

let watcher: FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function notifyRenderer(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('db-changed')
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

// ── Handler registration ─────────────────────────────────────────────────────

export function registerIpcHandlers(): void {
  // ── Project selection / creation ──────────────────────────────────────────

  ipcMain.handle('select-project-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Sélectionner le répertoire du projet',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const projectPath = result.filePaths[0]
    const dbPath = findProjectDb(projectPath)
    registerDbPath(dbPath)
    registerProjectPath(projectPath)
    const hasCLAUDEmd = existsSync(join(projectPath, 'CLAUDE.md'))
    if (!dbPath) return { projectPath, dbPath: null, error: null, hasCLAUDEmd }
    return { projectPath, dbPath, error: null, hasCLAUDEmd }
  })

  ipcMain.handle('create-project-db', async (_event, projectPath: string) => {
    try {
      const claudeDir = join(projectPath, '.claude')
      await mkdir(claudeDir, { recursive: true })
      const dbPath = join(claudeDir, 'project.db')
      const sqlJs = await getSqlJs()
      const db = new sqlJs.Database()
      db.run(`
        CREATE TABLE IF NOT EXISTS agents (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL, perimetre TEXT, system_prompt TEXT,
          system_prompt_suffix TEXT,
          thinking_mode TEXT CHECK(thinking_mode IN ('auto', 'disabled')),
          allowed_tools TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_id INTEGER NOT NULL REFERENCES agents(id),
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP, ended_at DATETIME,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          statut TEXT NOT NULL DEFAULT 'started' CHECK(statut IN ('started','completed','blocked')),
          summary TEXT,
          claude_conv_id TEXT,
          tokens_in INTEGER DEFAULT 0,
          tokens_out INTEGER DEFAULT 0,
          tokens_cache_read INTEGER DEFAULT 0,
          tokens_cache_write INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS agent_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL REFERENCES sessions(id),
          agent_id INTEGER NOT NULL REFERENCES agents(id),
          niveau TEXT NOT NULL DEFAULT 'info' CHECK(niveau IN ('info','warn','error','debug')),
          action TEXT NOT NULL, detail TEXT, fichiers TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT, titre TEXT NOT NULL,
          description TEXT,
          statut TEXT NOT NULL DEFAULT 'todo'
            CHECK(statut IN ('todo','in_progress','done','archived')),
          agent_createur_id INTEGER REFERENCES agents(id),
          agent_assigne_id INTEGER REFERENCES agents(id),
          agent_valideur_id INTEGER REFERENCES agents(id),
          parent_task_id INTEGER REFERENCES tasks(id),
          session_id INTEGER REFERENCES sessions(id),
          perimetre TEXT, effort INTEGER CHECK(effort IN (1,2,3)),
          priority TEXT NOT NULL DEFAULT 'normal'
            CHECK(priority IN ('low','normal','high','critical')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          started_at DATETIME, completed_at DATETIME, validated_at DATETIME
        );
        CREATE TABLE IF NOT EXISTS task_links (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_task INTEGER NOT NULL REFERENCES tasks(id),
          to_task INTEGER NOT NULL REFERENCES tasks(id),
          type TEXT NOT NULL CHECK(type IN ('bloque','dépend_de','lié_à','duplique')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS task_comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL REFERENCES tasks(id),
          agent_id INTEGER REFERENCES agents(id),
          contenu TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS locks (
          id INTEGER PRIMARY KEY AUTOINCREMENT, fichier TEXT NOT NULL UNIQUE,
          agent_id INTEGER NOT NULL REFERENCES agents(id),
          session_id INTEGER REFERENCES sessions(id),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP, released_at DATETIME
        );
        CREATE TABLE IF NOT EXISTS config (
          key TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS perimetres (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
          dossier TEXT, techno TEXT, description TEXT,
          actif INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO config (key, value) VALUES ('claude_md_commit',''),('schema_version','2'),('github_token','');
        INSERT OR IGNORE INTO perimetres (name, dossier, techno, description) VALUES
          ('front-vuejs','renderer/','Vue 3 + TypeScript + Tailwind CSS','Interface utilisateur Electron'),
          ('back-electron','main/','Electron + Node.js + SQLite','Process principal, IPC, accès DB'),
          ('global','','—','Transversal, aucun périmètre spécifique');
        CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_id ON agent_logs(agent_id);
        CREATE INDEX IF NOT EXISTS idx_agent_logs_created_at ON agent_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_locks_released_at ON locks(released_at);
        CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_tasks_agent_assigne ON tasks(agent_assigne_id);
      `)
      for (const agent of DEFAULT_AGENTS) {
        db.run(
          `INSERT OR IGNORE INTO agents (name, type, perimetre, system_prompt, system_prompt_suffix)
           VALUES (?, ?, ?, ?, ?)`,
          [agent.name, agent.type, agent.perimetre ?? null, agent.system_prompt ?? null, agent.system_prompt_suffix ?? null]
        )
      }
      const exported = db.export()
      db.close()
      await writeFile(dbPath, Buffer.from(exported))
      registerDbPath(dbPath)
      console.log('[create-project-db] created:', dbPath)
      return { success: true, dbPath }
    } catch (err) {
      console.error('[IPC create-project-db]', err)
      return { success: false, error: String(err), dbPath: '' }
    }
  })

  // ── DB query / watch ─────────────────────────────────────────────────────

  ipcMain.handle('query-db', async (_event, dbPath: string, query: string, params: unknown[] = []) => {
    const matchedKeyword = FORBIDDEN_WRITE_PATTERN.exec(query)
    if (matchedKeyword) {
      console.warn('[IPC query-db] Blocked write keyword:', matchedKeyword[1], 'in query:', query.substring(0, 100))
      return { success: false, error: 'Write operations (INSERT/UPDATE/DELETE/DROP/etc.) are not allowed from the renderer. Use dedicated IPC handlers for write operations.', rows: [] }
    }
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

  ipcMain.handle('unwatch-db', (_event, dbPath?: string) => {
    if (watcher) { watcher.close(); watcher = null }
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
    if (dbPath) {
      clearDbCacheEntry(dbPath)
      console.log('[IPC unwatch-db] Cache cleared for:', dbPath)
    }
  })

  // ── Dialogs ──────────────────────────────────────────────────────────────

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

  ipcMain.handle('select-new-project-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Sélectionner le répertoire du nouveau projet',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const selectedPath = result.filePaths[0]
    registerProjectPath(selectedPath)
    return selectedPath
  })

  ipcMain.handle('init-new-project', async (_event, projectPath: string) => {
    try {
      assertProjectPathAllowed(projectPath)
      const claudeDir = join(projectPath, '.claude')
      await mkdir(claudeDir, { recursive: true })

      const response = await fetch('https://raw.githubusercontent.com/IvyNotFound/claude.md/main/CLAUDE.md')
      if (!response.ok) throw new Error(`HTTP ${response.status} lors du téléchargement de CLAUDE.md`)
      const content = await response.text()

      await writeFile(join(projectPath, 'CLAUDE.md'), content, 'utf-8')
      return { success: true }
    } catch (err) {
      console.error('[IPC init-new-project]', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('find-project-db', (_event, projectPath: string) => {
    const dbPath = findProjectDb(projectPath)
    registerDbPath(dbPath)
    return dbPath
  })

  // ── Window controls ──────────────────────────────────────────────────────

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

  ipcMain.handle('window-is-maximized', () => {
    return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false
  })

  // ── Locks ────────────────────────────────────────────────────────────────

  ipcMain.handle('get-locks', async (_event, dbPath: string) => {
    return queryLive(
      dbPath,
      `SELECT l.id, l.fichier, l.agent_id, a.name as agent_name,
              l.session_id, l.created_at, l.released_at
       FROM locks l
       JOIN agents a ON a.id = l.agent_id
       WHERE l.released_at IS NULL
       ORDER BY l.created_at DESC`,
      []
    )
  })

  ipcMain.handle('get-locks-count', async (_event, dbPath: string) => {
    const rows = await queryLive(
      dbPath,
      'SELECT COUNT(*) as count FROM locks WHERE released_at IS NULL',
      []
    )
    return (rows[0] as { count: number })?.count ?? 0
  })

  // ── Migration ────────────────────────────────────────────────────────────

  ipcMain.handle('migrate-db', async (_event, dbPath: string) => {
    try {
      assertDbPathAllowed(dbPath)
      const { migrated } = await migrateDb(dbPath)
      return { success: true, migrated }
    } catch (err) {
      console.error('[IPC migrate-db]', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Domain-specific handlers ─────────────────────────────────────────────

  registerFsHandlers()
  registerAgentHandlers()
  registerSettingsHandlers()
}
