/**
 * Tests for agent-stream.ts — singleShotStdin re-spawn (T1991).
 *
 * Verifies that agent:send triggers a re-spawn when an opencode process has exited,
 * and that convId extracted from events is passed to the new spawn via --session.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockWriteFileSync = vi.hoisted(() => vi.fn())
const mockUnlinkSync = vi.hoisted(() => vi.fn())
const mockWriteFile = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('fs', () => {
  const fns = {
    writeFileSync: mockWriteFileSync,
    unlinkSync: mockUnlinkSync,
    appendFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(''),
    existsSync: vi.fn().mockReturnValue(false),
  }
  return { default: fns, ...fns }
})

vi.mock('fs/promises', () => ({
  writeFile: mockWriteFile,
  default: { writeFile: mockWriteFile },
}))

const senderRegistry = vi.hoisted(() => new Map<number, {
  id: number
  once: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}>())

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { on: vi.fn() },
  webContents: { fromId: vi.fn((id: number) => senderRegistry.get(id) ?? null) },
}))

class FakeProc extends EventEmitter {
  stdin = { write: vi.fn(), writableEnded: false, end: vi.fn() }
  stdout = new PassThrough()
  stderr = new PassThrough()
  pid = 99999
  kill = vi.fn()
}

let mockProc: FakeProc
const mockSpawn = vi.fn()

vi.mock('child_process', () => {
  const spawnFn = (...args: unknown[]) => mockSpawn(...args)
  return {
    default: { spawn: spawnFn, execFile: vi.fn(), execFileSync: vi.fn() },
    spawn: spawnFn,
    execFile: vi.fn(),
    execFileSync: vi.fn(),
  }
})

vi.mock('./db', () => ({
  queryLive: vi.fn().mockResolvedValue([]),
  assertDbPathAllowed: vi.fn(),
  writeDb: vi.fn().mockResolvedValue(undefined),
  registerDbPath: vi.fn(),
  registerProjectPath: vi.fn(),
}))

vi.mock('./hookServer', () => ({
  resolvePermission: vi.fn().mockReturnValue(true),
  pendingPermissions: new Map(),
  startHookServer: vi.fn(),
  setHookWindow: vi.fn(),
  HOOK_PORT: 27182,
}))

vi.mock('./worktree-manager', () => ({
  createWorktree: vi.fn().mockResolvedValue({ path: '/tmp/wt/br', branch: 'session-1' }),
  copyWorktreeConfigs: vi.fn().mockResolvedValue(undefined),
  removeWorktree: vi.fn().mockResolvedValue(undefined),
}))

import * as agentStream from './agent-stream'

describe('agent-stream — singleShotStdin re-spawn (T1991)', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>
  let mockSender: { id: number; once: ReturnType<typeof vi.fn>; isDestroyed: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    vi.clearAllMocks()
    mockProc = new FakeProc()
    mockSpawn.mockReturnValue(mockProc)

    handlers = new Map()
    const { ipcMain } = await import('electron')
    vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    })
    agentStream.registerAgentStreamHandlers()

    mockSender = {
      id: 42,
      once: vi.fn(),
      isDestroyed: vi.fn().mockReturnValue(false),
      send: vi.fn(),
    }
    senderRegistry.set(42, mockSender)
    const { webContents } = await import('electron')
    vi.mocked(webContents.fromId).mockImplementation((id: number) => senderRegistry.get(id) ?? null)
  })

  afterEach(() => {
    vi.useRealTimers()
    for (const timer of agentStream._testing.streamTimers.values()) clearInterval(timer)
    agentStream._testing.streamBatches.clear()
    agentStream._testing.streamTimers.clear()
    agentStream._testing.agents.clear()
    agentStream._testing.webContentsAgents.clear()
    senderRegistry.clear()
  })

  // ── Re-spawn triggered when process exits ────────────────────────────────

  it('agent:send spawns a new process when opencode process has exited', async () => {
    const id = (await handlers.get('agent:create')!(
      { sender: mockSender },
      { cli: 'opencode', initialMessage: 'first message' }
    )) as string

    // Simulate process exit
    mockProc.emit('close', 0)
    await new Promise(resolve => setImmediate(resolve))
    expect(agentStream._testing.agents.has(id)).toBe(false)

    // Prepare a fresh proc for the re-spawn
    const respawnProc = new FakeProc()
    mockSpawn.mockReturnValueOnce(respawnProc)

    // agent:send should re-spawn (synchronous)
    handlers.get('agent:send')!({ sender: mockSender }, id, 'follow-up')

    // spawn called twice: initial create + re-spawn
    expect(mockSpawn).toHaveBeenCalledTimes(2)
    // New proc registered in agents
    expect(agentStream._testing.agents.get(id)).toBe(respawnProc)
  })

  it('re-spawn is triggered when convId was extracted and stored from events', async () => {
    const id = (await handlers.get('agent:create')!(
      { sender: mockSender },
      { cli: 'opencode', initialMessage: 'first' }
    )) as string

    // Simulate OpenCode emitting a text event with sessionID
    mockProc.stdout.write('{"type":"text","text":"hello","sessionID":"ses_test123"}\n')
    await new Promise(resolve => setImmediate(resolve))

    // agent:convId event should have been sent to renderer
    const convIdCall = vi.mocked(mockSender.send).mock.calls.find(
      ([ch]) => typeof ch === 'string' && ch.startsWith('agent:convId:')
    )
    expect(convIdCall).toBeDefined()
    expect(convIdCall![1]).toBe('ses_test123')

    // Process exits
    mockProc.emit('close', 0)
    await new Promise(resolve => setImmediate(resolve))

    const respawnProc = new FakeProc()
    mockSpawn.mockReturnValueOnce(respawnProc)

    // Re-spawn happens on follow-up send
    handlers.get('agent:send')!({ sender: mockSender }, id, 'follow-up')

    // spawn called twice — re-spawn happened
    expect(mockSpawn).toHaveBeenCalledTimes(2)
    expect(agentStream._testing.agents.get(id)).toBe(respawnProc)

    // The script file written during re-spawn (WSL path) should include --session and ses_test123
    // (verified via writeFileSync mock — the spawn script content contains the CLI command)
    const writeArgs = mockWriteFileSync.mock.calls
    const scriptWrite = writeArgs.find(([, content]: [unknown, unknown]) =>
      typeof content === 'string' && content.includes('--session') && content.includes('ses_test123')
    )
    expect(scriptWrite).toBeDefined()
  })

  it('agent:send falls through to stdin write when singleShotStdin process is still alive', async () => {
    const id = (await handlers.get('agent:create')!(
      { sender: mockSender },
      { cli: 'opencode', initialMessage: 'first' }
    )) as string

    // Restore process to agents with writable stdin (alive state)
    const fakeStdin = { write: vi.fn(), writableEnded: false, end: vi.fn() }
    Object.assign(mockProc, { stdin: fakeStdin })
    agentStream._testing.agents.set(id, mockProc as unknown as ReturnType<typeof import('child_process').spawn>)

    handlers.get('agent:send')!({ sender: mockSender }, id, 'while alive')

    // stdin.write used, no extra spawn
    expect(fakeStdin.write).toHaveBeenCalledOnce()
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })

  it('agent:send throws when singleShotStdin process dead with no respawn data', async () => {
    const sendHandler = handlers.get('agent:send')!

    // Use an ID that was never created — no adapter, no respawn data
    // Falls through to standard path: "No active agent process"
    expect(() => sendHandler({ sender: mockSender }, 'ghost-id-x', 'msg')).toThrow(
      'No active agent process for id=ghost-id-x'
    )
  })

  it('agent:kill removes respawn data so subsequent agent:send throws', async () => {
    const id = (await handlers.get('agent:create')!(
      { sender: mockSender },
      { cli: 'opencode', initialMessage: 'first' }
    )) as string

    // Process exits (removes from agents, keeps adapter for singleShotStdin)
    mockProc.emit('close', 0)
    await new Promise(resolve => setImmediate(resolve))

    // Kill removes respawn data + convIds
    handlers.get('agent:kill')!({ sender: mockSender }, id)

    // Now agent:send should throw about missing respawn data
    expect(() => handlers.get('agent:send')!({ sender: mockSender }, id, 'post-kill')).toThrow(
      `No respawn data for singleShotStdin agent id=${id}`
    )
  })

  it('non-singleShotStdin adapters (claude) are unaffected by re-spawn logic', async () => {
    const id = (await handlers.get('agent:create')!(
      { sender: mockSender },
      { cli: 'claude' }
    )) as string

    // Claude uses stdin write — no re-spawn
    const fakeStdin = { write: vi.fn(), writableEnded: false, end: vi.fn() }
    Object.assign(mockProc, { stdin: fakeStdin })
    agentStream._testing.agents.set(id, mockProc as unknown as ReturnType<typeof import('child_process').spawn>)

    handlers.get('agent:send')!({ sender: mockSender }, id, 'hello claude')

    expect(fakeStdin.write).toHaveBeenCalledOnce()
    expect(fakeStdin.end).not.toHaveBeenCalled()
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })
})
