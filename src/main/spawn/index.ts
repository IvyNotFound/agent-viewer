/**
 * Spawn strategy barrel and platform router.
 *
 * Routing:
 * - win32 + wslDistro='local' → spawnWindows (native PowerShell)
 * - win32 + other distro      → spawnWsl     (wsl.exe wrapper)
 * - other platform            → spawnUnix    (Linux/macOS)
 *
 * @module spawn
 */
import { spawnWindows } from './spawn-windows'
import { spawnWsl } from './spawn-wsl'
import { spawnUnix } from './spawn-unix'
import type { SpawnFn } from './types'

export { spawnWindows, spawnWsl, spawnUnix }
export type { SpawnInput, SpawnOutput, SpawnFn } from './types'

/** Select the appropriate spawn strategy based on platform and wslDistro. */
export function resolveSpawnFn(platform: string, wslDistro?: string): SpawnFn {
  if (platform === 'win32') {
    return wslDistro === 'local' ? spawnWindows : spawnWsl
  }
  return spawnUnix
}
