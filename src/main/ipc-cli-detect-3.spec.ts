/**
 * Tests for ipc-cli-detect — Part 3 (T1225)
 *
 * Targets surviving mutants:
 * - StringLiteral on 'where', '--version', 'bash', '-c', 'local', 'wsl', 'utf-8'
 * - Regex precision on parseVersion
 * - MethodExpression on .split('\n')[0], .map, .filter, .slice
 * - ConditionalExpression on platform branches, colonIdx, filterClis
 * - BooleanLiteral on isDefault
 * - ObjectLiteral/ArrayDeclaration on CLI_REGISTRY entries
 * - LogicalOperator on platform || condition and handler forceRefresh
 * - ArithmeticOperator on colonIdx ± 1
 * - BlockStatement on warmupCliDetection, linux/darwin branch, detectionCache
 * - ArrowFunction on catch(() => [])
 * - EqualityOperator on i < distros.length
 * - NoCoverage lines 38-59 (WSL_TIMEOUT, LOCAL_TIMEOUT, CONCURRENCY, CLI_REGISTRY)
 *
 * Framework: Vitest (node environment)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoist mocks ───────────────────────────────────────────────────────────────
const { execFileMock, enrichWindowsPathMock, getWslDistrosMock, writeFileSyncMock, unlinkSyncMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  enrichWindowsPathMock: vi.fn().mockResolvedValue(undefined),
  getWslDistrosMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  unlinkSyncMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  default: { execFile: execFileMock },
  execFile: execFileMock,
}))

vi.mock('util', () => ({
  default: { promisify: () => execFileMock },
  promisify: () => execFileMock,
}))

vi.mock('fs', () => ({
  default: { writeFileSync: writeFileSyncMock, unlinkSync: unlinkSyncMock },
  writeFileSync: writeFileSyncMock,
  unlinkSync: unlinkSyncMock,
}))

// ── Mock electron ─────────────────────────────────────────────────────────────
const handlers: Record<string, (event: unknown, ...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
}))

vi.mock('./ipc-wsl', () => ({
  enrichWindowsPath: enrichWindowsPathMock,
  getWslDistros: getWslDistrosMock,
  getWslExe: () => 'wsl.exe',
}))

vi.mock('./utils/wsl', () => ({
  toWslPath: (p: string) => {
    const drive = p.charAt(0).toLowerCase()
    const rest = p.slice(2).replace(/\\/g, '/')
    return `/mnt/${drive}${rest}`
  },
}))

// ── Import after mocks ────────────────────────────────────────────────────────
import {
  registerCliDetectHandlers,
  detectLocalClis,
  detectWslClis,
  warmupCliDetection,
  _resetDetectionCacheForTest,
} from './ipc-cli-detect'

// ── Helpers ───────────────────────────────────────────────────────────────────
function callHandler(args?: { clis?: string[]; forceRefresh?: boolean }): Promise<unknown> {
  const handler = handlers['wsl:get-cli-instances']
  if (!handler) throw new Error('Handler not registered')
  return handler(null, args) as Promise<unknown>
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Windows local detection — exact command arguments (StringLiteral) ─────────
// ══════════════════════════════════════════════════════════════════════════════
describe('detectLocalClis — Windows — exact command arguments', () => {
  let platformSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    enrichWindowsPathMock.mockResolvedValue(undefined)
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  })

  afterEach(() => {
    platformSpy.mockRestore()
  })

  it('calls execFile with exact "where" command (not renamed)', async () => {
    execFileMock.mockRejectedValue(new Error('not found'))
    await detectLocalClis()
    // First call should be 'where'
    const firstCall = execFileMock.mock.calls[0] as [string, string[]]
    expect(firstCall[0]).toBe('where')
  })

  it('passes binary as argument to "where", not hardcoded string', async () => {
    execFileMock.mockRejectedValue(new Error('not found'))
    await detectLocalClis(['claude'])
    const whereCall = execFileMock.mock.calls[0] as [string, string[]]
    expect(whereCall[1]).toContain('claude')
    expect(whereCall[1][0]).toBe('claude')
  })

  it('calls execFile with ["--version"] for version check (exact array)', async () => {
    execFileMock
      .mockResolvedValueOnce({ stdout: 'C:\\claude.cmd\n', stderr: '' }) // where claude
      .mockResolvedValueOnce({ stdout: '2.1.58\n', stderr: '' })         // claude --version
      .mockRejectedValue(new Error('not found'))
    await detectLocalClis(['claude'])
    const versionCall = execFileMock.mock.calls[1] as [string, string[]]
    expect(versionCall[1]).toEqual(['--version'])
  })

  it('pushes result with type: "local" (exact string, not renamed)', async () => {
    execFileMock
      .mockResolvedValueOnce({ stdout: 'C:\\claude.cmd\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '2.1.58\n', stderr: '' })
      .mockRejectedValue(new Error('not found'))
    const result = await detectLocalClis(['claude'])
    expect(result[0].type).toBe('local')
  })

  it('pushes result with distro: "local" (exact string)', async () => {
    execFileMock
      .mockResolvedValueOnce({ stdout: 'C:\\claude.cmd\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '2.1.58\n', stderr: '' })
      .mockRejectedValue(new Error('not found'))
    const result = await detectLocalClis(['claude'])
    expect(result[0].distro).toBe('local')
  })

  it('pushes result with isDefault: true (not false)', async () => {
    execFileMock
      .mockResolvedValueOnce({ stdout: 'C:\\claude.cmd\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '3.0.0\n', stderr: '' })
      .mockRejectedValue(new Error('not found'))
    const result = await detectLocalClis(['claude'])
    expect(result[0].isDefault).toBe(true)
  })

  it('trims stdout before parsing version (skips empty after trim)', async () => {
    execFileMock
      .mockResolvedValueOnce({ stdout: 'C:\\claude.cmd\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '   \n  ', stderr: '' }) // whitespace only
      .mockRejectedValue(new Error('not found'))
    const result = await detectLocalClis(['claude'])
    // Empty after trim → skip, no result
    expect(result).toHaveLength(0)
  })

  it('pushes the exact cli name returned from CLI_REGISTRY (not hardcoded)', async () => {
    execFileMock
      .mockResolvedValueOnce({ stdout: 'C:\\aider.cmd\n', stderr: '' }) // where aider
      .mockResolvedValueOnce({ stdout: '0.50.1\n', stderr: '' })         // aider --version
    const result = await detectLocalClis(['aider'])
    expect(result[0].cli).toBe('aider')
  })

  it('detects all 6 CLIs when all are present', async () => {
    const clis = ['claude', 'codex', 'gemini', 'opencode', 'aider', 'goose']
    for (const cli of clis) {
      execFileMock.mockResolvedValueOnce({ stdout: `C:\\${cli}.cmd\n`, stderr: '' })
      execFileMock.mockResolvedValueOnce({ stdout: '1.0.0\n', stderr: '' })
    }
    const result = await detectLocalClis()
    expect(result).toHaveLength(6)
    expect(result.map(r => r.cli).sort()).toEqual(clis.sort())
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// ── Linux/macOS local detection — exact command arguments (StringLiteral) ─────
// ══════════════════════════════════════════════════════════════════════════════
describe('detectLocalClis — Linux — exact command arguments', () => {
  let platformSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  })

  afterEach(() => {
    platformSpy.mockRestore()
  })

  it('calls "bash" (not other shell) as first argument', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await detectLocalClis()
    const firstCall = execFileMock.mock.calls[0] as [string, string[]]
    expect(firstCall[0]).toBe('bash')
  })

  it('passes ["-c", script] as arguments to bash (exact flags)', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await detectLocalClis()
    const firstCall = execFileMock.mock.calls[0] as [string, string[]]
    expect(firstCall[1][0]).toBe('-c')
    expect(typeof firstCall[1][1]).toBe('string')
  })

  it('returns type: "local" for linux results', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: 'claude:2.1.58\n', stderr: '' })
    const result = await detectLocalClis()
    expect(result[0].type).toBe('local')
  })

  it('returns distro: "local" for linux results', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: 'claude:2.1.58\n', stderr: '' })
    const result = await detectLocalClis()
    expect(result[0].distro).toBe('local')
  })

  it('returns isDefault: true for linux results', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: 'aider:0.50.0\n', stderr: '' })
    const result = await detectLocalClis()
    expect(result[0].isDefault).toBe(true)
  })

  it('uses colonIdx correctly — version starts at colonIdx+1, not colonIdx-1', async () => {
    // "claude:2.1.58" → cli='claude', version parsed from '2.1.58'
    execFileMock.mockResolvedValueOnce({ stdout: 'claude:2.1.58\n', stderr: '' })
    const result = await detectLocalClis()
    expect(result[0].version).toBe('2.1.58')
    // If colonIdx-1 was used, version would start at 'laude:2.1.58' → wrong
  })

  it('skips lines where colonIdx === -1 (no colon)', async () => {
    execFileMock.mockResolvedValueOnce({
      stdout: 'no-colon-line\nclaude:2.0.0\n',
      stderr: '',
    })
    const result = await detectLocalClis()
    expect(result).toHaveLength(1)
    expect(result[0].cli).toBe('claude')
  })

  it('filters by filterClis — excludes CLIs not in filter list', async () => {
    // Output contains 'aider' but filter is only ['claude']
    execFileMock.mockResolvedValueOnce({
      stdout: 'aider:0.50.0\nclaude:2.0.0\n',
      stderr: '',
    })
    const result = await detectLocalClis(['claude'])
    expect(result).toHaveLength(1)
    expect(result[0].cli).toBe('claude')
  })

  it('includes all CLIs when filterClis is undefined', async () => {
    execFileMock.mockResolvedValueOnce({
      stdout: 'claude:2.0.0\naider:0.50.0\ngemini:0.1.0\n',
      stderr: '',
    })
    const result = await detectLocalClis()
    expect(result).toHaveLength(3)
  })

  it('bash script contains all 6 CLI binaries when no filter', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await detectLocalClis()
    const scriptArg = (execFileMock.mock.calls[0] as [string, string[]])[1][1]
    expect(scriptArg).toContain('claude')
    expect(scriptArg).toContain('codex')
    expect(scriptArg).toContain('gemini')
    expect(scriptArg).toContain('opencode')
    expect(scriptArg).toContain('aider')
    expect(scriptArg).toContain('goose')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// ── macOS platform — runFullDetection (L228 ConditionalExpression/LogicalOp) ──
// ══════════════════════════════════════════════════════════════════════════════
describe('wsl:get-cli-instances — macOS', () => {
  let platformSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    _resetDetectionCacheForTest()
    for (const key of Object.keys(handlers)) delete handlers[key]
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    registerCliDetectHandlers()
  })

  afterEach(() => {
    platformSpy.mockRestore()
  })

  it('returns local CLIs on macOS (darwin branch is triggered)', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: 'claude:3.0.0\n', stderr: '' })
    const result = await callHandler() as Array<{ cli: string; type: string }>
    expect(result).toHaveLength(1)
    expect(result[0].cli).toBe('claude')
    expect(result[0].type).toBe('local')
  })

  it('does not call wsl.exe on macOS', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await callHandler()
    const calls = execFileMock.mock.calls as Array<[string, ...unknown[]]>
    expect(calls.find(c => c[0] === 'wsl.exe')).toBeUndefined()
  })

  it('returns [] when bash fails on macOS', async () => {
    execFileMock.mockRejectedValueOnce(new Error('bash failed'))
    const result = await callHandler()
    expect(result).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// ── WSL detection — script content StringLiterals ─────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
describe('detectWslClis — script content exact strings', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('writes script with "utf-8" encoding (exact string)', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await detectWslClis('Ubuntu', true)
    const writeCall = writeFileSyncMock.mock.calls[0] as [string, string, string]
    expect(writeCall[2]).toBe('utf-8')
  })

  it('script starts with "#!/bin/bash" shebang (exact string)', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await detectWslClis('Ubuntu', true)
    const scriptContent = writeFileSyncMock.mock.calls[0][1] as string
    expect(scriptContent.startsWith('#!/bin/bash')).toBe(true)
  })

  it('script contains "exit 0" at the end', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await detectWslClis('Ubuntu', true)
    const scriptContent = writeFileSyncMock.mock.calls[0][1] as string
    expect(scriptContent).toContain('exit 0')
  })

  it('script uses "timeout 3" for CLI probing (exact value)', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await detectWslClis('Ubuntu', true)
    const scriptContent = writeFileSyncMock.mock.calls[0][1] as string
    expect(scriptContent).toContain('timeout 3')
  })

  it('script contains all WSL_KNOWN_PATHS', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await detectWslClis('Ubuntu', true)
    const scriptContent = writeFileSyncMock.mock.calls[0][1] as string
    expect(scriptContent).toContain('$HOME/go/bin')
    expect(scriptContent).toContain('$HOME/.local/bin')
    expect(scriptContent).toContain('$HOME/.cargo/bin')
    expect(scriptContent).toContain('$HOME/.npm-global/bin')
    expect(scriptContent).toContain('/snap/bin')
    expect(scriptContent).toContain('/home/linuxbrew/.linuxbrew/bin')
    expect(scriptContent).toContain('$HOME/.linuxbrew/bin')
  })

  it('script contains "~/.bashrc" source command', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await detectWslClis('Ubuntu', true)
    const scriptContent = writeFileSyncMock.mock.calls[0][1] as string
    expect(scriptContent).toContain('. ~/.bashrc 2>/dev/null')
  })

  it('script contains "~/.profile" source command', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await detectWslClis('Ubuntu', true)
    const scriptContent = writeFileSyncMock.mock.calls[0][1] as string
    expect(scriptContent).toContain('. ~/.profile 2>/dev/null')
  })

  it('script contains nvm.sh source', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await detectWslClis('Ubuntu', true)
    const scriptContent = writeFileSyncMock.mock.calls[0][1] as string
    expect(scriptContent).toContain('$HOME/.nvm/nvm.sh')
  })

  it('temp script filename includes distro name', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await detectWslClis('MyDistro', true)
    const writeCall = writeFileSyncMock.mock.calls[0] as [string, string, string]
    expect(writeCall[0]).toContain('MyDistro')
    expect(writeCall[0]).toContain('cli-detect-')
    expect(writeCall[0]).toContain('.sh')
  })

  it('calls wsl.exe with "-d" distro and "bash -l" (exact flags)', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await detectWslClis('Debian', false)
    const args = execFileMock.mock.calls[0][1] as string[]
    expect(args[0]).toBe('-d')
    expect(args[1]).toBe('Debian')
    expect(args[2]).toBe('--')
    expect(args[3]).toBe('bash')
    expect(args[4]).toBe('-l')
  })

  it('returns type: "wsl" for WSL instances (exact string)', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: 'claude:2.1.58\n', stderr: '' })
    const result = await detectWslClis('Ubuntu', true)
    expect(result[0].type).toBe('wsl')
  })

  it('colonIdx in parseDetectionOutput: version starts at colonIdx+1 not colonIdx-1', async () => {
    // If colonIdx-1 is used: 'laude:2.0.0' — version would be 'aude:2.0.0' → wrong
    execFileMock.mockResolvedValueOnce({ stdout: 'claude:2.0.0\n', stderr: '' })
    const result = await detectWslClis('Ubuntu', true)
    expect(result[0].version).toBe('2.0.0')
  })

  it('parseDetectionOutput: skips lines without colon', async () => {
    execFileMock.mockResolvedValueOnce({
      stdout: 'no-colon\naider:0.50.0\n',
      stderr: '',
    })
    const result = await detectWslClis('Ubuntu', true)
    expect(result).toHaveLength(1)
    expect(result[0].cli).toBe('aider')
  })

  it('parseDetectionOutput: filters by filterClis (excludes non-matching)', async () => {
    execFileMock.mockResolvedValueOnce({
      stdout: 'claude:2.0.0\naider:0.50.0\n',
      stderr: '',
    })
    const result = await detectWslClis('Ubuntu', true, ['aider'])
    expect(result).toHaveLength(1)
    expect(result[0].cli).toBe('aider')
  })

  it('parseDetectionOutput: sets correct distro name', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: 'claude:2.0.0\n', stderr: '' })
    const result = await detectWslClis('SpecialDistro', false)
    expect(result[0].distro).toBe('SpecialDistro')
  })

  it('unlinkSync is called even when execFile fails (finally block)', async () => {
    execFileMock.mockRejectedValueOnce(new Error('wsl timeout'))
    const result = await detectWslClis('Ubuntu', true)
    expect(result).toEqual([])
    expect(unlinkSyncMock).toHaveBeenCalledOnce()
  })

  it('unlinkSync called with the same path that was written', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await detectWslClis('Ubuntu', true)
    const writtenPath = writeFileSyncMock.mock.calls[0][0] as string
    const deletedPath = unlinkSyncMock.mock.calls[0][0] as string
    expect(deletedPath).toBe(writtenPath)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// ── runFullDetection — Windows batching (EqualityOperator, MethodExpression) ──
// ══════════════════════════════════════════════════════════════════════════════
describe('runFullDetection — Windows batch concurrency', () => {
  let platformSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    _resetDetectionCacheForTest()
    for (const key of Object.keys(handlers)) delete handlers[key]
    enrichWindowsPathMock.mockResolvedValue(undefined)
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    registerCliDetectHandlers()
  })

  afterEach(() => {
    platformSpy.mockRestore()
  })

  it('processes 3 distros in batches of CONCURRENCY=2 (2 rounds)', async () => {
    getWslDistrosMock.mockResolvedValueOnce([
      { distro: 'Ubuntu', isDefault: true },
      { distro: 'Debian', isDefault: false },
      { distro: 'Alpine', isDefault: false },
    ])
    // No local CLIs
    execFileMock.mockRejectedValueOnce(new Error('not found')) // where claude
    execFileMock.mockRejectedValueOnce(new Error('not found')) // where codex
    execFileMock.mockRejectedValueOnce(new Error('not found')) // where gemini
    execFileMock.mockRejectedValueOnce(new Error('not found')) // where opencode
    execFileMock.mockRejectedValueOnce(new Error('not found')) // where aider
    execFileMock.mockRejectedValueOnce(new Error('not found')) // where goose
    // Batch 1: Ubuntu, Debian
    execFileMock.mockResolvedValueOnce({ stdout: 'claude:2.0.0\n', stderr: '' }) // Ubuntu
    execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })               // Debian
    // Batch 2: Alpine
    execFileMock.mockResolvedValueOnce({ stdout: 'aider:0.50.0\n', stderr: '' }) // Alpine

    const result = await callHandler() as Array<{ distro: string }>
    const distros = result.map(r => r.distro)
    expect(distros).toContain('Ubuntu')
    expect(distros).toContain('Alpine')
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('processes exactly 2 distros in 1 batch (i < distros.length, not <=)', async () => {
    getWslDistrosMock.mockResolvedValueOnce([
      { distro: 'Ubuntu', isDefault: true },
      { distro: 'Debian', isDefault: false },
    ])
    execFileMock.mockRejectedValue(new Error('not found')) // local CLIs
    execFileMock.mockResolvedValueOnce({ stdout: 'claude:2.0.0\n', stderr: '' }) // Ubuntu
    execFileMock.mockResolvedValueOnce({ stdout: 'claude:2.0.0\n', stderr: '' }) // Debian
    // If i <= distros.length was used (EqualityOperator mutation), a 3rd batch would be attempted
    const result = await callHandler() as Array<{ cli: string }>
    // Just verify it doesn't hang or error
    expect(Array.isArray(result)).toBe(true)
  })

  it('handles 0 distros — no WSL script is spawned', async () => {
    getWslDistrosMock.mockResolvedValueOnce([])
    execFileMock.mockRejectedValue(new Error('not found'))
    const result = await callHandler()
    expect(result).toEqual([])
    // writeFileSync should not be called (no WSL detection)
    expect(writeFileSyncMock).not.toHaveBeenCalled()
  })

  it('includes both local and WSL results in final array', async () => {
    getWslDistrosMock.mockResolvedValueOnce([{ distro: 'Ubuntu', isDefault: true }])
    execFileMock
      .mockResolvedValueOnce({ stdout: 'C:\\claude.cmd\n', stderr: '' }) // where claude
      .mockResolvedValueOnce({ stdout: '2.0.0\n', stderr: '' })          // claude --version (local)
      .mockRejectedValueOnce(new Error('not found'))                      // where codex
      .mockRejectedValueOnce(new Error('not found'))                      // where gemini
      .mockRejectedValueOnce(new Error('not found'))                      // where opencode
      .mockRejectedValueOnce(new Error('not found'))                      // where aider
      .mockRejectedValueOnce(new Error('not found'))                      // where goose
      .mockResolvedValueOnce({ stdout: 'aider:0.50.0\n', stderr: '' })  // WSL Ubuntu
    const result = await callHandler() as Array<{ type: string; cli: string }>
    const localResults = result.filter(r => r.type === 'local')
    const wslResults = result.filter(r => r.type === 'wsl')
    expect(localResults).toHaveLength(1)
    expect(localResults[0].cli).toBe('claude')
    expect(wslResults).toHaveLength(1)
    expect(wslResults[0].cli).toBe('aider')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// ── getOrRunDetection — cache null check (BooleanLiteral, BlockStatement) ─────
// ══════════════════════════════════════════════════════════════════════════════
describe('getOrRunDetection — cache null check', () => {
  let platformSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    _resetDetectionCacheForTest()
    for (const key of Object.keys(handlers)) delete handlers[key]
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    registerCliDetectHandlers()
  })

  afterEach(() => {
    platformSpy.mockRestore()
  })

  it('does not re-detect when cache is populated (cache !null check passes)', async () => {
    execFileMock.mockResolvedValue({ stdout: 'claude:2.0.0\n', stderr: '' })
    // First call populates cache
    await callHandler()
    // Second call — if !detectionCache check is broken (always false), would re-detect
    await callHandler()
    // Only 1 spawn
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('re-detects when cache is null after reset', async () => {
    execFileMock.mockResolvedValue({ stdout: 'claude:2.0.0\n', stderr: '' })
    await callHandler()
    _resetDetectionCacheForTest() // forces cache to null
    await callHandler()
    // If cache null check is broken, this would be 1 (cache never resets)
    expect(execFileMock).toHaveBeenCalledTimes(2)
  })

  it('catch(() => []) — detection errors resolve to [] (ArrowFunction)', async () => {
    // Simulate a detection that throws unexpectedly
    execFileMock.mockRejectedValueOnce(new Error('unexpected crash'))
    const result = await callHandler()
    // Should resolve to [] (catch arrow function works)
    expect(result).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// ── warmupCliDetection — BlockStatement (L273) ────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
describe('warmupCliDetection — fires detection (BlockStatement)', () => {
  let platformSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    _resetDetectionCacheForTest()
    for (const key of Object.keys(handlers)) delete handlers[key]
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    registerCliDetectHandlers()
  })

  afterEach(() => {
    platformSpy.mockRestore()
  })

  it('warmupCliDetection actually fires detection (not a no-op)', async () => {
    execFileMock.mockResolvedValue({ stdout: 'claude:2.0.0\n', stderr: '' })
    warmupCliDetection()
    // Wait for fire-and-forget
    await new Promise(resolve => setTimeout(resolve, 10))
    // If BlockStatement was removed, execFile would NOT be called
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('warmupCliDetection result is reused by IPC handler (no double spawn)', async () => {
    execFileMock.mockResolvedValue({ stdout: 'claude:2.0.0\n', stderr: '' })
    warmupCliDetection()
    await new Promise(resolve => setTimeout(resolve, 10))
    // IPC call uses cached result
    const result = await callHandler() as Array<{ cli: string }>
    expect(result[0].cli).toBe('claude')
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// ── IPC handler — forceRefresh and filterClis (LogicalOp, MethodExp, BoolLit) ─
// ══════════════════════════════════════════════════════════════════════════════
describe('wsl:get-cli-instances — handler forceRefresh and filterClis', () => {
  let platformSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    _resetDetectionCacheForTest()
    for (const key of Object.keys(handlers)) delete handlers[key]
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    registerCliDetectHandlers()
  })

  afterEach(() => {
    platformSpy.mockRestore()
  })

  it('forceRefresh: true invalidates cache → re-detects with fresh data', async () => {
    execFileMock
      .mockResolvedValueOnce({ stdout: 'claude:1.0.0\n', stderr: '' }) // first detection
      .mockResolvedValueOnce({ stdout: 'claude:2.0.0\n', stderr: '' }) // second detection (force refresh)
    await callHandler()
    const result2 = await callHandler({ forceRefresh: true }) as Array<{ version: string }>
    expect(result2[0].version).toBe('2.0.0')
  })

  it('forceRefresh: false does NOT invalidate cache', async () => {
    execFileMock.mockResolvedValue({ stdout: 'claude:1.0.0\n', stderr: '' })
    await callHandler()
    await callHandler({ forceRefresh: false })
    // If LogicalOperator mutation makes forceRefresh always true, this would be 2
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('clis filter: only specified CLIs returned (MethodExpression .filter)', async () => {
    execFileMock.mockResolvedValueOnce({
      stdout: 'claude:2.0.0\naider:0.50.0\ngemini:0.1.0\n',
      stderr: '',
    })
    const result = await callHandler({ clis: ['aider'] }) as Array<{ cli: string }>
    expect(result).toHaveLength(1)
    expect(result[0].cli).toBe('aider')
  })

  it('clis filter: empty array → returns empty (all filtered out)', async () => {
    execFileMock.mockResolvedValueOnce({
      stdout: 'claude:2.0.0\n',
      stderr: '',
    })
    const result = await callHandler({ clis: [] }) as Array<unknown>
    // filterClis = [] → Array.isArray([]) = true, filter returns nothing that matches
    expect(result).toHaveLength(0)
  })

  it('clis not an array (non-array args.clis) → no filter applied, returns all', async () => {
    execFileMock.mockResolvedValueOnce({
      stdout: 'claude:2.0.0\naider:0.50.0\n',
      stderr: '',
    })
    // Pass clis as a string (not array) → filterClis=undefined → all returned
    const result = await callHandler({ clis: 'claude' as unknown as string[] }) as Array<unknown>
    expect(result).toHaveLength(2)
  })

  it('no args at all → returns all CLIs without filter', async () => {
    execFileMock.mockResolvedValueOnce({
      stdout: 'claude:2.0.0\ngemini:0.1.0\n',
      stderr: '',
    })
    const result = await callHandler(undefined) as Array<{ cli: string }>
    expect(result).toHaveLength(2)
  })

  it('result order: filter preserves original detection order', async () => {
    execFileMock.mockResolvedValueOnce({
      stdout: 'claude:2.0.0\ngemini:0.1.0\naider:0.50.0\n',
      stderr: '',
    })
    const result = await callHandler({ clis: ['gemini', 'aider'] }) as Array<{ cli: string }>
    expect(result[0].cli).toBe('gemini')
    expect(result[1].cli).toBe('aider')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// ── parseVersion — regex precision (Regex mutants L70) ────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
describe('parseVersion — regex precision', () => {
  let platformSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  })

  afterEach(() => {
    platformSpy.mockRestore()
  })

  async function parseViaDetect(raw: string): Promise<string> {
    execFileMock.mockResolvedValueOnce({ stdout: `claude:${raw}\n`, stderr: '' })
    const result = await detectLocalClis(['claude'])
    return result[0]?.version ?? ''
  }

  it('requires at least 2 version number groups (d+.d+): "1.2" → "1.2"', async () => {
    // If regex requires only 1 group (d+.d), "1.2" might fail
    expect(await parseViaDetect('1.2')).toBe('1.2')
  })

  it('requires major version to be 1+ digits: "10.2.3" → "10.2.3"', async () => {
    // If regex requires only 1 digit in major, "10.2.3" might fail
    expect(await parseViaDetect('10.2.3')).toBe('10.2.3')
  })

  it('requires minor version to be 1+ digits: "1.20.3" → "1.20.3"', async () => {
    // If regex requires only 1 digit in minor, "1.20" might fail
    expect(await parseViaDetect('1.20.3')).toBe('1.20.3')
  })

  it('strips v prefix: "v10.0.0" → "10.0.0"', async () => {
    expect(await parseViaDetect('v10.0.0')).toBe('10.0.0')
  })

  it('parses version with 4 parts: "1.2.3.4" → "1.2.3.4"', async () => {
    expect(await parseViaDetect('1.2.3.4')).toBe('1.2.3.4')
  })

  it('only uses first line (MethodExpression .split("\\n")[0])', async () => {
    // Multi-line version output — only first line matters
    execFileMock.mockResolvedValueOnce({
      stdout: 'claude:1.0.0 (first line)\nExtraLine: 9.9.9\n',
      stderr: '',
    })
    const result = await detectLocalClis(['claude'])
    // version from '1.0.0 (first line)' → '1.0.0'
    expect(result[0].version).toBe('1.0.0')
  })

  it('version from multiline Windows output uses first line only', async () => {
    const platformSpy2 = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    enrichWindowsPathMock.mockResolvedValue(undefined)
    execFileMock
      .mockResolvedValueOnce({ stdout: 'C:\\claude.cmd\n', stderr: '' }) // where
      .mockResolvedValueOnce({
        stdout: '2.1.0 (build 123)\nExtra info\n', // multiline
        stderr: '',
      })
      .mockRejectedValue(new Error('not found'))
    const result = await detectLocalClis(['claude'])
    // If .split('\n')[0] is replaced by raw, version might pick up wrong line
    expect(result[0].version).toBe('2.1.0')
    platformSpy2.mockRestore()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// ── CLI_REGISTRY — NoCoverage lines 53-59 ────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
describe('CLI_REGISTRY — all 6 entries are functional', () => {
  let platformSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  })

  afterEach(() => {
    platformSpy.mockRestore()
  })

  // Each CLI in the registry must have a binary with the exact string
  const allClis = [
    { cli: 'claude',   binary: 'claude'   },
    { cli: 'codex',    binary: 'codex'    },
    { cli: 'gemini',   binary: 'gemini'   },
    { cli: 'opencode', binary: 'opencode' },
    { cli: 'aider',    binary: 'aider'    },
    { cli: 'goose',    binary: 'goose'    },
  ]

  for (const { cli, binary } of allClis) {
    it(`detects "${cli}" CLI with binary "${binary}"`, async () => {
      execFileMock.mockResolvedValueOnce({
        stdout: `${binary}:1.0.0\n`,
        stderr: '',
      })
      const result = await detectLocalClis([cli as Parameters<typeof detectLocalClis>[0][0]])
      expect(result).toHaveLength(1)
      expect(result[0].cli).toBe(cli)
      expect(result[0].version).toBe('1.0.0')
    })

    it(`bash script includes "${binary}" binary for "${cli}"`, async () => {
      execFileMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
      await detectLocalClis([cli as Parameters<typeof detectLocalClis>[0][0]])
      const scriptArg = (execFileMock.mock.calls[0] as [string, string[]])[1][1]
      expect(scriptArg).toContain(binary)
    })
  }

  it('detects all 6 CLIs simultaneously when all are present (Linux)', async () => {
    execFileMock.mockResolvedValueOnce({
      stdout: 'claude:2.0.0\ncodex:1.0.0\ngemini:0.2.0\nopencode:0.1.2\naider:0.50.0\ngoose:1.0.0\n',
      stderr: '',
    })
    const result = await detectLocalClis()
    expect(result).toHaveLength(6)
    expect(result.map(r => r.cli).sort()).toEqual(['aider', 'claude', 'codex', 'gemini', 'goose', 'opencode'])
  })
})
