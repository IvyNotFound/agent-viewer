/**
 * IPC handlers — multi-CLI detection (T1011)
 *
 * Detects installed coding-agent CLIs (claude, codex, gemini, opencode, aider, goose)
 * in the local environment and across WSL distros.
 *
 * Strategy:
 * - Windows local : execFile loop (where + --version per CLI)
 * - Linux/macOS   : bash one-liner (1 spawn for all CLIs)
 * - WSL distros   : bash login-shell one-liner per distro (CONCURRENCY=2)
 *
 * Single source of truth: CLI_REGISTRY — add a CLI by adding one entry here.
 *
 * @module ipc-cli-detect
 */

import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { CliType, CliInstance } from '../../shared/cli-types'
import { enrichWindowsPath, getWslDistros } from './ipc-wsl'

const execPromise = promisify(execFile)

const WSL_TIMEOUT = 10_000
const LOCAL_TIMEOUT = 5_000
const CONCURRENCY = 2

// ── Single source of truth ────────────────────────────────────────────────────
// To add a CLI: one line here, nothing else.

const CLI_REGISTRY: Record<CliType, { binary: string }> = {
  claude:   { binary: 'claude'   },
  codex:    { binary: 'codex'    },
  gemini:   { binary: 'gemini'   },
  opencode: { binary: 'opencode' },
  aider:    { binary: 'aider'    },
  goose:    { binary: 'goose'    },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract a version string from raw `--version` output.
 * Handles: "2.1.58", "2.1.58 (Claude Code)", "v0.1.2", "opencode v0.1.2".
 */
function parseVersion(raw: string): string {
  const line = raw.split('\n')[0].trim()
  const match = line.match(/v?(\d+\.\d+[\d.]*)/)
  return match ? match[1] : line.split(' ')[0]
}

function getEntries(filterClis?: CliType[]): [CliType, { binary: string }][] {
  const all = Object.entries(CLI_REGISTRY) as [CliType, { binary: string }][]
  return filterClis ? all.filter(([cli]) => filterClis.includes(cli)) : all
}

// ── Local detection ───────────────────────────────────────────────────────────

/**
 * Detect locally-installed CLIs.
 *
 * - Windows : execFile loop — `where <bin>` then `<bin> --version` per CLI
 * - Linux/macOS : bash one-liner — 1 spawn for all CLIs
 */
export async function detectLocalClis(filterClis?: CliType[]): Promise<CliInstance[]> {
  const entries = getEntries(filterClis)

  if (process.platform === 'win32') {
    await enrichWindowsPath()
    const results: CliInstance[] = []
    for (const [cli, { binary }] of entries) {
      try {
        await execPromise('where', [binary], { timeout: LOCAL_TIMEOUT })
        const { stdout } = await execPromise(binary, ['--version'], {
          timeout: LOCAL_TIMEOUT,
          shell: true,
        })
        const raw = stdout.trim()
        if (!raw) continue
        results.push({
          cli,
          distro: 'local',
          version: parseVersion(raw),
          isDefault: true,
          type: 'local',
        })
      } catch { /* binary not in PATH */ }
    }
    return results
  }

  // Linux/macOS: single bash one-liner
  const binaries = entries.map(([, { binary }]) => binary).join(' ')
  const script = `for c in ${binaries}; do v=$($c --version 2>/dev/null | head -1); [ -n "$v" ] && echo "$c:$v"; done`
  try {
    const { stdout } = await execPromise('bash', ['-c', script], { timeout: LOCAL_TIMEOUT })
    const results: CliInstance[] = []
    for (const line of stdout.split('\n').map(l => l.trim()).filter(Boolean)) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const cli = line.slice(0, colonIdx) as CliType
      if (!(cli in CLI_REGISTRY)) continue
      if (filterClis && !filterClis.includes(cli)) continue
      const version = parseVersion(line.slice(colonIdx + 1))
      results.push({
        cli,
        distro: 'local',
        version,
        isDefault: true,
        type: 'local',
      })
    }
    return results
  } catch {
    return []
  }
}

// ── WSL detection ─────────────────────────────────────────────────────────────

/**
 * Detect CLIs installed in a single WSL distro via bash login-shell one-liner.
 */
export async function detectWslClis(
  distro: string,
  isDefault: boolean,
  filterClis?: CliType[],
): Promise<CliInstance[]> {
  const entries = getEntries(filterClis)
  const binaries = entries.map(([, { binary }]) => binary).join(' ')
  const script = `for c in ${binaries}; do v=$($c --version 2>/dev/null | head -1); [ -n "$v" ] && echo "$c:$v"; done`
  try {
    const { stdout } = await execPromise(
      'wsl.exe',
      ['-d', distro, '--', 'bash', '-lc', script],
      { timeout: WSL_TIMEOUT },
    )
    const results: CliInstance[] = []
    const clean = stdout.replace(/\0/g, '')
    for (const line of clean.split('\n').map(l => l.trim()).filter(Boolean)) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const cli = line.slice(0, colonIdx) as CliType
      if (!(cli in CLI_REGISTRY)) continue
      if (filterClis && !filterClis.includes(cli)) continue
      const version = parseVersion(line.slice(colonIdx + 1))
      results.push({
        cli,
        distro,
        version,
        isDefault,
        type: 'wsl',
      })
    }
    return results
  } catch {
    return []
  }
}

// ── IPC handler ───────────────────────────────────────────────────────────────

/**
 * Register the `wsl:get-cli-instances` IPC handler.
 *
 * Params: `{ clis?: CliType[] }` — optional filter (default: all CLIs)
 * Returns: `CliInstance[]` — local first, then WSL distros
 *
 * Platform behavior:
 * - Linux/macOS : local only
 * - Windows     : local + WSL distros (CONCURRENCY=2)
 */
export function registerCliDetectHandlers(): void {
  ipcMain.handle(
    'wsl:get-cli-instances',
    async (_event, args?: { clis?: CliType[] }): Promise<CliInstance[]> => {
      const filterClis = Array.isArray(args?.clis) ? args.clis : undefined
      const platform = process.platform

      if (platform === 'linux' || platform === 'darwin') {
        try {
          return await detectLocalClis(filterClis)
        } catch {
          return []
        }
      }

      // Windows: local + WSL
      const results: CliInstance[] = []

      try {
        const local = await detectLocalClis(filterClis)
        results.push(...local)
      } catch { /* local detection failed — continue with WSL */ }

      try {
        const distros = await getWslDistros()
        for (let i = 0; i < distros.length; i += CONCURRENCY) {
          const batch = distros.slice(i, i + CONCURRENCY)
          const batchResults = await Promise.all(
            batch.map(({ distro, isDefault }) => detectWslClis(distro, isDefault, filterClis)),
          )
          results.push(...batchResults.flat())
        }
      } catch { /* WSL not available */ }

      return results
    },
  )
}
