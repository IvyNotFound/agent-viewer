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

// Injected at build time by Vite define (GH_TOKEN_UPDATER secret from GitHub Actions).
// Empty string when building locally — falls back to safeStorage or GH_TOKEN env var.
declare const __GH_TOKEN__: string

const TOKEN_FILE = join(app.getPath('userData'), 'gh_token.enc')

/**
 * Load the GitHub token using priority order:
 * 0. Build-time injected token (works on any machine, set via GH_TOKEN_UPDATER secret)
 * 1. safeStorage encrypted file
 * 2. GH_TOKEN environment variable (fallback for local dev)
 * Returns null if no token is available.
 */
export function loadToken(): string | null {
  // Priority 0: build-time injected token
  if (typeof __GH_TOKEN__ !== 'undefined' && __GH_TOKEN__) {
    return __GH_TOKEN__
  }

  // Priority 1: safeStorage encrypted file
  try {
    if (safeStorage.isEncryptionAvailable() && existsSync(TOKEN_FILE)) {
      const encrypted = readFileSync(TOKEN_FILE)
      return safeStorage.decryptString(encrypted)
    }
  } catch {
    // fall through
  }

  // Priority 2: GH_TOKEN env var
  return process.env.GH_TOKEN ?? null
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
