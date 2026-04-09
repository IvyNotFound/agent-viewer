/**
 * IPC handler for CLI model registry (T1802, T1806).
 *
 * Exposes `cli:get-models` — returns available models for a given CLI type.
 * OpenCode and Aider models are detected dynamically (T1806);
 * Claude/Gemini use static lists from `CLI_STATIC_MODELS`.
 *
 * @module ipc-cli-models
 */
import { ipcMain } from 'electron'
import type { CliType } from '../shared/cli-types'
import type { CliModelDef } from '../shared/cli-models'
import { getModelsForCli } from './cli-model-detect'

/** CLIs that support model selection. */
const MODEL_CLIS: CliType[] = ['claude', 'codex', 'gemini', 'opencode', 'aider', 'goose']

/**
 * Register the `cli:get-models` IPC handler.
 *
 * Params (optional object):
 * - `cli?: CliType` — return models for a single CLI
 * - `forceRefresh?: boolean` — invalidate cache and re-detect
 *
 * Returns:
 * - Single CLI: `CliModelDef[]`
 * - All CLIs (no `cli` param): `Partial<Record<CliType, CliModelDef[]>>`
 */
export function registerCliModelsHandlers(): void {
  ipcMain.handle(
    'cli:get-models',
    async (_event, args?: { cli?: CliType; forceRefresh?: boolean }) => {
      const cli = args?.cli
      const forceRefresh = args?.forceRefresh ?? false

      if (cli) {
        return getModelsForCli(cli, forceRefresh)
      }

      // All CLIs: return a map
      const result: Partial<Record<CliType, CliModelDef[]>> = {}
      const tasks = MODEL_CLIS.map(async (c) => {
        result[c] = await getModelsForCli(c, forceRefresh)
      })
      await Promise.all(tasks)
      return result
    },
  )
}
