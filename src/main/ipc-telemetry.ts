/**
 * IPC Handlers — Project telemetry (language statistics)
 *
 * Provides `telemetry:scan` which delegates filesystem scanning to a
 * worker thread to avoid blocking the main Electron process (T1854).
 *
 * @module ipc-telemetry
 */
import { ipcMain } from 'electron'
import { Worker } from 'worker_threads'
import path from 'path'
import { assertProjectPathAllowed } from './db'
import type { TelemetryResult } from './telemetry-scanner'

/** Register telemetry IPC handlers. */
export function registerTelemetryHandlers(): void {
  /**
   * Recursively scan `projectPath` and return per-language statistics.
   * Build directories (`dist`, `node_modules`, `.git`, etc.) are skipped.
   * Heavy I/O runs in a worker thread to keep the main thread responsive.
   * @param projectPath - Absolute path to the project root
   * @returns {TelemetryResult} Language breakdown, total counts, and scan timestamp
   */
  ipcMain.handle(
    'telemetry:scan',
    async (_event, projectPath: string): Promise<TelemetryResult> => {
      if (typeof projectPath !== 'string' || !projectPath) {
        return {
          languages: [],
          totalFiles: 0,
          totalLines: 0,
          scannedAt: new Date().toISOString(),
          totalSourceLines: 0,
          totalTestLines: 0,
          testRatio: 0,
          totalBlankLines: 0,
          totalCommentLines: 0,
          totalCodeLines: 0,
          totalSourceFiles: 0,
          totalTestFiles: 0,
        }
      }
      assertProjectPathAllowed(projectPath)
      const workerPath = path.join(__dirname, 'telemetry-worker.js')
      return new Promise<TelemetryResult>((resolve, reject) => {
        const worker = new Worker(workerPath, {
          workerData: { projectPath },
        })
        worker.on('message', (msg: { data?: TelemetryResult; error?: string }) => {
          if (msg.error) {
            reject(new Error(msg.error))
          } else {
            resolve(msg.data!)
          }
        })
        worker.on('error', reject)
        worker.on('exit', (code) => {
          if (code !== 0) reject(new Error(`Telemetry worker exited with code ${code}`))
        })
      })
    },
  )
}
