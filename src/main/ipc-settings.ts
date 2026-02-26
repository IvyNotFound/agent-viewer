/**
 * IPC handlers — Settings, config & GitHub operations
 *
 * Handles config values, master.md sync, GitHub connection testing,
 * and update checks.
 *
 * @module ipc-settings
 */

import { ipcMain } from 'electron'
import { writeFile, rename } from 'fs/promises'
import { join } from 'path'
import { assertDbPathAllowed, assertProjectPathAllowed, queryLive, writeDb, encryptToken, decryptToken } from './db'

// ── Handler registration ─────────────────────────────────────────────────────

export function registerSettingsHandlers(): void {
  ipcMain.handle('get-config-value', async (_event, dbPath: string, key: string) => {
    try {
      const rows = await queryLive(dbPath, 'SELECT value FROM config WHERE key = ?', [key])
      return { success: true, value: rows.length > 0 ? (rows[0] as { value: string }).value : null }
    } catch (err) {
      console.error('[IPC get-config-value]', err)
      return { success: false, value: null, error: String(err) }
    }
  })

  ipcMain.handle('set-config-value', async (_event, dbPath: string, key: string, value: string) => {
    try {
      assertDbPathAllowed(dbPath)
      const storedValue = key === 'github_token' ? encryptToken(value) : value

      await writeDb(dbPath, (db) => {
        db.run(
          'INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, storedValue]
        )
      })
      return { success: true }
    } catch (err) {
      console.error('[IPC set-config-value]', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('check-master-md', async (_event, dbPath: string) => {
    try {
      const tokenRows = await queryLive(dbPath, "SELECT value FROM config WHERE key = 'github_token'", [])
      const encryptedToken = tokenRows.length > 0 ? (tokenRows[0] as { value: string }).value : null
      const token = encryptedToken ? decryptToken(encryptedToken) : null

      const shaRows = await queryLive(dbPath, "SELECT value FROM config WHERE key = 'claude_md_commit'", [])
      const localSha = shaRows.length > 0 ? (shaRows[0] as { value: string }).value : ''

      const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
      if (token) headers['Authorization'] = `token ${token}`

      // T304: 10s timeout prevents UI freeze when GitHub is unreachable
      const response = await fetch(
        'https://api.github.com/repos/IvyNotFound/master.md/contents/CLAUDE.md',
        { headers, signal: AbortSignal.timeout(10_000) }
      )
      if (!response.ok) {
        return { success: false, error: `GitHub API: HTTP ${response.status}` }
      }
      const data = await response.json() as { sha: string; content: string }
      const remoteSha: string = data.sha
      const content = Buffer.from(data.content, 'base64').toString('utf-8')
      const upToDate = localSha !== '' && localSha === remoteSha

      return { success: true, sha: remoteSha, content, upToDate, localSha }
    } catch (err) {
      console.error('[IPC check-master-md]', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('apply-master-md', async (_event, dbPath: string, projectPath: string, content: string, sha: string) => {
    try {
      assertDbPathAllowed(dbPath)
      assertProjectPathAllowed(projectPath)
      const claudeMdPath = join(projectPath, 'CLAUDE.md')
      const tmpPath = claudeMdPath + '.tmp'

      await writeFile(tmpPath, content, 'utf-8')
      await rename(tmpPath, claudeMdPath)
      console.log('[IPC apply-master-md] CLAUDE.md written atomically:', claudeMdPath)

      await writeDb(dbPath, (db) => {
        db.run(
          "INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('claude_md_commit', ?, CURRENT_TIMESTAMP)",
          [sha]
        )
      })

      return { success: true }
    } catch (err) {
      console.error('[IPC apply-master-md]', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('test-github-connection', async (_event, dbPath: string, repoUrl: string) => {
    try {
      const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
      if (!match) return { connected: false, error: 'URL invalide' }
      const owner = match[1]
      const repo = match[2].replace(/\.git$/, '')

      const tokenRows = await queryLive(dbPath, "SELECT value FROM config WHERE key = 'github_token'", [])
      const encryptedToken = tokenRows.length > 0 ? (tokenRows[0] as { value: string }).value : null
      const token = encryptedToken ? decryptToken(encryptedToken) : null

      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `token ${token}`

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })
      return { connected: response.ok }
    } catch (err) {
      console.error('[IPC test-github-connection]', err)
      return { connected: false, error: String(err) }
    }
  })

  ipcMain.handle('check-for-updates', async (_event, dbPath: string, repoUrl: string, currentVersion: string) => {
    try {
      const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
      if (!match) return { hasUpdate: false, latestVersion: '', error: 'URL invalide' }
      const owner = match[1]
      const repo = match[2].replace(/\.git$/, '')

      const tokenRows = await queryLive(dbPath, "SELECT value FROM config WHERE key = 'github_token'", [])
      const encryptedToken = tokenRows.length > 0 ? (tokenRows[0] as { value: string }).value : null
      const token = encryptedToken ? decryptToken(encryptedToken) : null

      const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
      if (token) headers['Authorization'] = `token ${token}`

      // T304: 10s timeout prevents UI freeze when GitHub is unreachable
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers, signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json() as { tag_name?: string }
      const latestVersion = data.tag_name?.replace(/^v/, '') || ''
      const hasUpdate = !!latestVersion && latestVersion > currentVersion
      return { hasUpdate, latestVersion }
    } catch (err) {
      console.error('[IPC check-for-updates]', err)
      return { hasUpdate: false, latestVersion: '', error: String(err) }
    }
  })
}
