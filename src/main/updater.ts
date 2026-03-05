/**
 * Auto-updater module for agent-viewer.
 *
 * Handles update checks from GitHub Releases (private repo) with a
 * Personal Access Token stored encrypted via electron.safeStorage.
 *
 * Token is never sent to the renderer — only its presence is confirmed.
 * Auto-update is silently disabled if no token is configured or if
 * safeStorage is unavailable (e.g. Linux headless).
 *
 * @module updater
 */

import { app, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const TOKEN_FILE = join(app.getPath('userData'), 'gh_token.enc')

/**
 * Load the GitHub token from encrypted storage.
 * Returns null if no token is saved or decryption fails.
 */
export function loadToken(): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    if (!existsSync(TOKEN_FILE)) return null
    const encrypted = readFileSync(TOKEN_FILE)
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

/**
 * Save the GitHub token encrypted to disk.
 * No-op if safeStorage is unavailable.
 */
export function saveToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) return
  const encrypted = safeStorage.encryptString(token)
  writeFileSync(TOKEN_FILE, encrypted)
}

/**
 * Initialize autoUpdater with the stored token and wire up events.
 * Only runs in packaged app — no-op in dev to avoid spurious errors.
 */
export function setupAutoUpdater(win: BrowserWindow): void {
  if (!app.isPackaged) return

  const token = loadToken()
  if (!token) return

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'IvyNotFound',
    repo: 'agent-viewer',
    private: true,
    token,
  })

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update:available', info)
  })

  autoUpdater.on('update-not-available', () => {
    win.webContents.send('update:not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    win.webContents.send('update:progress', progress)
  })

  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update:downloaded', info)
  })

  autoUpdater.on('error', (err) => {
    win.webContents.send('update:error', err.message)
  })

  autoUpdater.checkForUpdates().catch(() => {
    // Ignore network errors at startup (offline, firewall, etc.)
  })
}

/**
 * Register IPC handlers for the updater.
 * Must be called before the window is created.
 */
export function registerUpdaterIpc(): void {
  ipcMain.handle('updater:get-token', () => {
    return loadToken() ? '****' : null
  })

  ipcMain.handle('updater:set-token', (_e, token: unknown) => {
    if (typeof token !== 'string' || token.trim() === '') return false
    saveToken(token.trim())
    return true
  })

  ipcMain.handle('updater:check', () => {
    if (!app.isPackaged) return null
    return autoUpdater.checkForUpdates()
  })

  ipcMain.handle('updater:download', () => {
    if (!app.isPackaged) return null
    return autoUpdater.downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })
}
