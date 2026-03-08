/**
 * Tests for ipc-cli-detect — multi-CLI detection (T1011) — Part 2
 *
 * Strategy: mock child_process.execFile via promisify hoisting,
 * capture the handler registered with ipcMain.handle, then call it directly.
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

// ── Mock ipc-wsl (shared utilities) ──────────────────────────────────────────
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
import { registerCliDetectHandlers, detectLocalClis, detectWslClis, _resetDetectionCacheForTest } from './ipc-cli-detect'

// ── Helper ────────────────────────────────────────────────────────────────────
function callHandler(args?: { clis?: string[]; forceRefresh?: boolean }): Promise<unknown> {
  const handler = handlers['wsl:get-cli-instances']
  if (!handler) throw new Error('Handler not registered')
  return handler(null, args) as Promise<unknown>
}

// ── parseVersion — via detectLocalClis Linux output ───────────────────────────
describe('parseVersion — version string extraction', () => {
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

  it('parses plain version "2.1.58"', async () => {
    expect(await parseViaDetect('2.1.58')).toBe('2.1.58')
  })

  it('strips leading v from "v2.1.58"', async () => {
    expect(await parseViaDetect('v2.1.58')).toBe('2.1.58')
  })

  it('extracts version from "opencode v0.1.2 (build info)"', async () => {
    expect(await parseViaDetect('opencode v0.1.2 (build info)')).toBe('0.1.2')
  })

  it('parses only the first line of multiline output', async () => {
    // The bash one-liner uses head -1, so only first line reaches parseVersion
    // Simulate multiline by embedding newline in the raw version field
    execFileMock.mockResolvedValueOnce({ stdout: 'claude:2.1.58\nignored:9.9.9\n', stderr: '' })
    const result = await detectLocalClis(['claude'])
    expect(result).toHaveLength(1)
    expect(result[0].version).toBe('2.1.58')
  })

  it('falls back to first word when no version pattern matches', async () => {
    // "no-version-here" has no digits → fallback to split(" ")[0]
    expect(await parseViaDetect('no-version-here')).toBe('no-version-here')
  })

  it('parses version with extra patch segments "1.2.3.4"', async () => {
    expect(await parseViaDetect('1.2.3.4')).toBe('1.2.3.4')
  })
})

// ── parseDetectionOutput — via detectWslClis ──────────────────────────────────
describe('parseDetectionOutput — line parsing edge cases', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('ignores lines without a colon separator', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: 'no-colon-line\nclaude:2.0.0\n', stderr: '' })
    const result = await detectWslClis('Ubuntu', true)
    expect(result).toHaveLength(1)
    expect(result[0].cli).toBe('claude')
  })

  it('ignores lines with unknown CLI name before colon', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: 'unknown-tool:1.2.3\nclaude:2.0.0\n', stderr: '' })
    const result = await detectWslClis('Ubuntu', true)
    expect(result).toHaveLength(1)
    expect(result[0].cli).toBe('claude')
  })

  it('sets isDefault=false for non-default distro', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: 'claude:2.0.0\n', stderr: '' })
    const result = await detectWslClis('Debian', false)
    expect(result[0].isDefault).toBe(false)
    expect(result[0].distro).toBe('Debian')
  })
})

// ── Detection cache ───────────────────────────────────────────────────────────
describe('detection cache', () => {
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

  it('calls bash only once for two consecutive handler calls (cache hit)', async () => {
    execFileMock.mockResolvedValue({ stdout: 'claude:2.1.58\n', stderr: '' })
    await callHandler()
    await callHandler()
    // Only 1 bash spawn despite 2 handler calls
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('_resetDetectionCacheForTest clears cache so next call re-detects', async () => {
    execFileMock.mockResolvedValue({ stdout: 'claude:2.1.58\n', stderr: '' })
    await callHandler()
    _resetDetectionCacheForTest()
    await callHandler()
    // Two separate detections → 2 bash spawns
    expect(execFileMock).toHaveBeenCalledTimes(2)
  })

  it('forceRefresh: true invalidates cache and triggers re-detection', async () => {
    execFileMock.mockResolvedValue({ stdout: 'claude:2.1.58\n', stderr: '' })
    await callHandler()
    // Second call with forceRefresh — should bypass cache
    await callHandler({ forceRefresh: true })
    expect(execFileMock).toHaveBeenCalledTimes(2)
  })

  it('forceRefresh: false (or omitted) reuses cache', async () => {
    execFileMock.mockResolvedValue({ stdout: 'claude:2.1.58\n', stderr: '' })
    await callHandler()
    await callHandler({ forceRefresh: false })
    // Cache hit — still only 1 spawn
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })
})

// ── warmupCliDetection ────────────────────────────────────────────────────────
describe('warmupCliDetection', () => {
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

  it('pre-warms cache so IPC handler uses cached result without extra spawn', async () => {
    execFileMock.mockResolvedValue({ stdout: 'claude:2.1.58\n', stderr: '' })
    const { warmupCliDetection } = await import('./ipc-cli-detect')
    warmupCliDetection()
    // Wait for the warmup promise to resolve
    await new Promise(resolve => setTimeout(resolve, 0))
    const result = await callHandler() as Array<{ cli: string }>
    // Result should be from cache
    expect(result[0]?.cli).toBe('claude')
    // Only 1 spawn (warmup), handler reuses the cache
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })
})
