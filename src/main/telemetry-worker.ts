/**
 * Worker thread for telemetry scanning (T1854)
 *
 * Runs the heavy filesystem scanning off the main Electron thread.
 * Spawned by ipc-telemetry.ts via worker_threads.
 *
 * @module telemetry-worker
 */
import { parentPort, workerData } from 'worker_threads'
import { scanProject } from './telemetry-scanner'

interface WorkerInput {
  projectPath: string
}

async function main(): Promise<void> {
  const { projectPath } = workerData as WorkerInput
  try {
    const result = await scanProject(projectPath)
    parentPort?.postMessage({ data: result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    parentPort?.postMessage({ error: message })
  }
}

main()
