/**
 * IPC handler for CLI model registry (T1802).
 *
 * Exposes `cli:get-models` — returns available models for a given CLI type.
 * Static models come from `CLI_STATIC_MODELS`; OpenCode models are detected
 * dynamically by reading the user's opencode config file.
 *
 * @module ipc-cli-models
 */
import { ipcMain } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import type { CliType } from '../shared/cli-types'
import { CLI_STATIC_MODELS, type CliModelDef } from '../shared/cli-models'

/**
 * Detect OpenCode models from user config file.
 *
 * Reads `~/.config/opencode/config.json` (Linux/macOS) or
 * `%APPDATA%/opencode/config.json` (Windows).
 *
 * Extracts provider/model pairs and converts to CliModelDef[].
 * Returns empty array on any error (file not found, parse error, etc.).
 */
async function detectOpenCodeModels(): Promise<CliModelDef[]> {
  const configPaths: string[] = []

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
    configPaths.push(join(appData, 'opencode', 'config.json'))
  }
  // Always try XDG path (works on Linux/macOS and WSL)
  configPaths.push(join(homedir(), '.config', 'opencode', 'config.json'))

  for (const configPath of configPaths) {
    try {
      const raw = await readFile(configPath, 'utf-8')
      const config = JSON.parse(raw) as Record<string, unknown>
      const models: CliModelDef[] = []

      // OpenCode config structure: { provider: { <name>: { models: { <modelId>: {...} } } } }
      const providers = config.provider as Record<string, Record<string, unknown>> | undefined
      if (providers && typeof providers === 'object') {
        for (const [providerName, providerConfig] of Object.entries(providers)) {
          const providerModels = providerConfig.models as Record<string, Record<string, unknown>> | undefined
          if (providerModels && typeof providerModels === 'object') {
            for (const modelId of Object.keys(providerModels)) {
              models.push({
                id: `${providerName}/${modelId}`,
                label: `${providerName}/${modelId}`,
                modelId: `${providerName}/${modelId}`,
              })
            }
          }
        }
      }

      if (models.length > 0) return models
    } catch {
      // File not found or parse error — try next path
    }
  }

  return []
}

/**
 * Register the `cli:get-models` IPC handler.
 *
 * @param cli - Optional CLI type filter. If omitted, returns models for all CLIs.
 * @returns `CliModelDef[]` for the requested CLI, or `Record<string, CliModelDef[]>` for all.
 */
export function registerCliModelsHandlers(): void {
  ipcMain.handle('cli:get-models', async (_event, cli?: CliType) => {
    if (cli) {
      // Single CLI requested
      const staticModels = CLI_STATIC_MODELS[cli] ?? []
      if (cli === 'opencode') {
        const detected = await detectOpenCodeModels()
        return detected.length > 0 ? detected : staticModels
      }
      return staticModels
    }

    // All CLIs: return a map
    const result: Partial<Record<CliType, CliModelDef[]>> = {}
    const clis: CliType[] = ['claude', 'codex', 'gemini', 'opencode', 'aider', 'goose']
    for (const c of clis) {
      const staticModels = CLI_STATIC_MODELS[c] ?? []
      if (c === 'opencode') {
        const detected = await detectOpenCodeModels()
        result[c] = detected.length > 0 ? detected : staticModels
      } else {
        result[c] = staticModels
      }
    }
    return result
  })
}

// Export for testing
export const _testing = { detectOpenCodeModels }
