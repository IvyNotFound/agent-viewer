/**
 * Dynamic CLI model detection (T1806).
 *
 * Detects available models for OpenCode (cache file) and Aider (CLI spawn).
 * Claude/Gemini have no CLI listing — static models only.
 *
 * Provides a memory cache with 5-minute TTL to avoid repeated I/O.
 *
 * @module cli-model-detect
 */
import { readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { CliType } from '../shared/cli-types'
import { CLI_STATIC_MODELS, type CliModelDef } from '../shared/cli-models'

const execFileAsync = promisify(execFile)

/** Cache TTL: 5 minutes. */
const MODEL_CACHE_TTL = 5 * 60 * 1000

/** Spawn timeout per CLI command: 5 seconds. */
const SPAWN_TIMEOUT_MS = 5_000

/** In-memory model cache per CLI. */
const modelCache = new Map<CliType, { models: CliModelDef[]; timestamp: number }>()

// ── OpenCode detection ───────────────────────────────────────────────────────

/**
 * OpenCode models.json entry shape (subset of fields we care about).
 */
interface OpenCodeModelEntry {
  id: string
  providerID?: string
  name?: string
  context_length?: number
}

/**
 * Detect OpenCode models by reading the models cache file.
 *
 * Paths tried in order:
 * - Windows: `%LOCALAPPDATA%/opencode/models.json`, `%APPDATA%/opencode/models.json`
 * - All platforms: `~/.cache/opencode/models.json`
 *
 * Falls back to spawning `opencode models` with a 5s timeout.
 * Returns [] on any failure.
 */
export async function detectOpenCodeModels(): Promise<CliModelDef[]> {
  // 1. Try reading the cache file
  const models = await readOpenCodeCacheFile()
  if (models.length > 0) return models

  // 2. Fallback: spawn `opencode models`
  return spawnOpenCodeModels()
}

async function readOpenCodeCacheFile(): Promise<CliModelDef[]> {
  const paths = buildOpenCodeCachePaths()

  for (const filePath of paths) {
    try {
      const raw = await readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as { models?: OpenCodeModelEntry[] }
      if (!Array.isArray(parsed.models)) continue

      const models: CliModelDef[] = parsed.models
        .filter((m): m is OpenCodeModelEntry & { id: string } => typeof m.id === 'string')
        .map((m) => ({
          id: m.id,
          label: m.name ?? m.id,
          modelId: m.id,
          provider: m.providerID,
          contextLength: typeof m.context_length === 'number' ? m.context_length : undefined,
          dynamic: true,
        }))

      if (models.length > 0) return models
    } catch {
      // File not found or parse error — try next
    }
  }

  return []
}

function buildOpenCodeCachePaths(): string[] {
  const paths: string[] = []

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
    paths.push(join(localAppData, 'opencode', 'models.json'))

    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
    paths.push(join(appData, 'opencode', 'models.json'))
  }

  // XDG cache path (Linux/macOS/WSL)
  paths.push(join(homedir(), '.cache', 'opencode', 'models.json'))

  return paths
}

async function spawnOpenCodeModels(): Promise<CliModelDef[]> {
  try {
    const { stdout } = await execFileAsync('opencode', ['models'], {
      timeout: SPAWN_TIMEOUT_MS,
      windowsHide: true,
    })

    // opencode models outputs JSON
    const parsed = JSON.parse(stdout) as { models?: OpenCodeModelEntry[] }
    if (!Array.isArray(parsed.models)) return []

    return parsed.models
      .filter((m): m is OpenCodeModelEntry & { id: string } => typeof m.id === 'string')
      .map((m) => ({
        id: m.id,
        label: m.name ?? m.id,
        modelId: m.id,
        provider: m.providerID,
        contextLength: typeof m.context_length === 'number' ? m.context_length : undefined,
        dynamic: true,
      }))
  } catch {
    return []
  }
}

// ── Aider detection ──────────────────────────────────────────────────────────

/** Providers to query when detecting Aider models. */
const AIDER_PROVIDERS = ['anthropic/', 'openai/', 'google/']

/**
 * Detect Aider models by spawning `aider --list-models <provider>` in parallel.
 *
 * Parses output lines matching `^- (.+)$` pattern.
 * Returns the static fallback list on any failure.
 */
export async function detectAiderModels(): Promise<CliModelDef[]> {
  const results = await Promise.allSettled(
    AIDER_PROVIDERS.map((provider) => spawnAiderListModels(provider)),
  )

  const models: CliModelDef[] = []
  const seen = new Set<string>()

  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const model of result.value) {
      if (seen.has(model.id)) continue
      seen.add(model.id)
      models.push(model)
    }
  }

  // If detection produced nothing, return static fallback
  if (models.length === 0) {
    return (CLI_STATIC_MODELS.aider ?? []).map((m) => ({ ...m }))
  }

  return models
}

async function spawnAiderListModels(provider: string): Promise<CliModelDef[]> {
  try {
    const { stdout } = await execFileAsync('aider', ['--list-models', provider], {
      timeout: SPAWN_TIMEOUT_MS,
      windowsHide: true,
    })

    return parseAiderOutput(stdout)
  } catch {
    return []
  }
}

/**
 * Parse `aider --list-models` output.
 * Lines matching `^- (.+)$` are model IDs.
 */
export function parseAiderOutput(stdout: string): CliModelDef[] {
  const models: CliModelDef[] = []
  for (const line of stdout.split('\n')) {
    const match = line.match(/^- (.+)$/)
    if (!match) continue
    const modelId = match[1].trim()
    if (!modelId) continue

    const slashIdx = modelId.indexOf('/')
    const provider = slashIdx > 0 ? modelId.slice(0, slashIdx) : undefined

    models.push({
      id: modelId,
      label: modelId,
      modelId,
      provider,
      dynamic: true,
    })
  }
  return models
}

// ── Cache + public API ───────────────────────────────────────────────────────

/**
 * Get models for a CLI, using cache when available.
 *
 * @param cli - CLI type to get models for
 * @param forceRefresh - If true, ignore cache and re-detect
 * @returns Array of model definitions
 */
export async function getModelsForCli(
  cli: CliType,
  forceRefresh?: boolean,
): Promise<CliModelDef[]> {
  // Check cache
  if (!forceRefresh) {
    const cached = modelCache.get(cli)
    if (cached && Date.now() - cached.timestamp < MODEL_CACHE_TTL) {
      return cached.models
    }
  }

  let models: CliModelDef[]

  switch (cli) {
    case 'opencode':
      models = await detectOpenCodeModels()
      // Fallback to static from T1802 config detection if dynamic is empty
      if (models.length === 0) {
        models = (CLI_STATIC_MODELS.opencode ?? []).map((m) => ({ ...m }))
      }
      break
    case 'aider':
      models = await detectAiderModels()
      break
    default:
      // claude, gemini, codex, goose — static only
      models = (CLI_STATIC_MODELS[cli] ?? []).map((m) => ({ ...m }))
      break
  }

  // Store in cache
  modelCache.set(cli, { models, timestamp: Date.now() })
  return models
}

/**
 * Pre-warm model cache for CLIs with dynamic detection.
 * Fire & forget — called at app startup.
 */
export function warmupModelDetection(): void {
  for (const cli of ['opencode', 'aider'] as CliType[]) {
    getModelsForCli(cli).catch(() => {})
  }
}

/**
 * Clear the model cache. Exposed for testing.
 */
export function clearModelCache(): void {
  modelCache.clear()
}

// Export internals for testing
export const _testing = {
  modelCache,
  MODEL_CACHE_TTL,
  buildOpenCodeCachePaths,
  readOpenCodeCacheFile,
  spawnOpenCodeModels,
  spawnAiderListModels,
  parseAiderOutput,
  AIDER_PROVIDERS,
}
