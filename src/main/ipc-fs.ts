/**
 * IPC handlers — File system operations
 *
 * Handles fs:listDir, fs:readFile, fs:writeFile for the renderer.
 *
 * @module ipc-fs
 */

import { ipcMain } from 'electron'
import { readdirSync, type Dirent } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join, resolve, isAbsolute, sep } from 'path'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const FS_SKIP = new Set(['node_modules', '.git', 'dist', 'dist-electron', '.DS_Store', '__pycache__'])

export function buildTree(dirPath: string, depth = 0): FileNode[] {
  if (depth > 4) return []
  let entries: Dirent[]
  try { entries = readdirSync(dirPath, { withFileTypes: true }) } catch { return [] }
  return entries
    .filter(e => !FS_SKIP.has(e.name) && (e.name[0] !== '.' || e.name === '.claude'))
    .map(e => {
      const fullPath = join(dirPath, e.name)
      const isDir = e.isDirectory()
      return { name: e.name, path: fullPath, isDir, children: isDir ? buildTree(fullPath, depth + 1) : undefined }
    })
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

export function isPathAllowed(filePath: string, allowedDir?: string): boolean {
  if (!allowedDir) {
    return !isAbsolute(filePath)
  }
  const resolved = resolve(filePath)
  const allowed = resolve(allowedDir)
  // T318: Require path separator boundary to prevent /project-evil matching /project
  return resolved === allowed || resolved.startsWith(allowed + sep)
}

// ── Handler registration ─────────────────────────────────────────────────────

export function registerFsHandlers(): void {
  ipcMain.handle('fs:listDir', (_event, dirPath: string, allowedDir?: string): FileNode[] => {
    if (dirPath.includes('..')) {
      console.warn('[IPC fs:listDir] Blocked path traversal attempt:', dirPath)
      return []
    }
    if (!isPathAllowed(dirPath, allowedDir)) {
      console.warn('[IPC fs:listDir] Path not in allowed directory:', dirPath, allowedDir)
      return []
    }
    return buildTree(dirPath)
  })

  ipcMain.handle('fs:readFile', async (_event, filePath: string, allowedDir?: string) => {
    if (filePath.includes('..')) {
      console.warn('[IPC fs:readFile] Blocked path traversal attempt:', filePath)
      return { success: false, error: 'Path traversal not allowed' }
    }
    if (!isPathAllowed(filePath, allowedDir)) {
      console.warn('[IPC fs:readFile] Path not in allowed directory:', filePath, allowedDir)
      return { success: false, error: 'Path not in allowed directory' }
    }
    try {
      const content = await readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string, allowedDir?: string): Promise<{ success: boolean; error?: string }> => {
    if (filePath.includes('..')) {
      console.warn('[IPC fs:writeFile] Blocked path traversal attempt:', filePath)
      return { success: false, error: 'Path traversal not allowed' }
    }
    if (!isPathAllowed(filePath, allowedDir)) {
      console.warn('[IPC fs:writeFile] Path not in allowed directory:', filePath, allowedDir)
      return { success: false, error: 'Path not in allowed directory. Write is only permitted within the project directory.' }
    }
    const sensitivePatterns = ['.ssh', '.bashrc', '.profile', '/etc/', '/.aws/']
    const isSensitive = sensitivePatterns.some(pattern => filePath.includes(pattern))
    if (isSensitive) {
      console.warn('[IPC fs:writeFile] Blocked attempt to write sensitive file:', filePath)
      return { success: false, error: 'Writing to sensitive system files is not allowed' }
    }
    try {
      await writeFile(filePath, content, 'utf-8')
      console.log('[IPC fs:writeFile] File written:', filePath)
      return { success: true }
    } catch (err) {
      console.error('[IPC fs:writeFile]', err)
      return { success: false, error: String(err) }
    }
  })
}
