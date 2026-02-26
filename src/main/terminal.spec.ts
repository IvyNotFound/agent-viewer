import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import util from 'util'

// Mock electron BEFORE importing terminal module
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  app: {
    on: vi.fn(),
  },
}))

// Mock node-pty — provide default export for CJS/ESM interop
const mockPty = {
  onData: vi.fn(),
  onExit: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
}
vi.mock('node-pty', () => {
  const spawn = vi.fn(() => mockPty)
  return {
    default: { spawn },
    spawn,
  }
})

// Mock child_process — provide default export for CJS/ESM interop
// Add util.promisify.custom so promisify(execFile) returns { stdout, stderr }
vi.mock('child_process', () => {
  const execFile = vi.fn()
  // promisify.custom makes promisify(execFile) call this instead of the raw fn
  ;(execFile as Record<symbol, unknown>)[util.promisify.custom] = (...args: unknown[]) => {
    return new Promise((resolve, reject) => {
      execFile(...args, (err: Error | null, stdout?: string, stderr?: string) => {
        if (err) reject(err)
        else resolve({ stdout: stdout ?? '', stderr: stderr ?? '' })
      })
    })
  }
  return {
    default: { execFile },
    execFile,
  }
})

// Mock fs/promises for temp script file (T278)
const mockWriteFile = vi.fn().mockResolvedValue(undefined)
const mockUnlink = vi.fn().mockResolvedValue(undefined)
vi.mock('fs/promises', () => {
  const writeFile = (...args: unknown[]) => mockWriteFile(...args)
  const unlink = (...args: unknown[]) => mockUnlink(...args)
  return {
    default: { writeFile, unlink },
    writeFile,
    unlink,
  }
})

// Import the module once — module is cached, handlers registered in beforeEach
import { registerTerminalHandlers } from './terminal'

describe('terminal utilities', () => {
  describe('toWslPath (path conversion)', () => {
    it('should convert Windows path to WSL path', () => {
      const winPath = 'C:\\Users\\Test\\project'
      const result = winPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`)
      expect(result).toBe('/mnt/c/Users/Test/project')
    })

    it('should handle paths with forward slashes', () => {
      const winPath = 'C:/Users/Test/project'
      const result = winPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`)
      expect(result).toBe('/mnt/c/Users/Test/project')
    })

    it('should handle lowercase drive letters', () => {
      const winPath = 'd:\\Users\\Test'
      const result = winPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`)
      expect(result).toBe('/mnt/d/Users/Test')
    })

    it('should handle paths with spaces', () => {
      const winPath = 'C:\\Users\\My Documents\\project'
      const result = winPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`)
      expect(result).toBe('/mnt/c/Users/My Documents/project')
    })

    it('should handle UNC-style paths starting with /mnt/ unchanged', () => {
      // A path already in Linux format should not be double-converted
      const linuxPath = '/mnt/c/Users/Test'
      const result = linuxPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`)
      expect(result).toBe('/mnt/c/Users/Test')
    })

    it('should handle empty string without crashing', () => {
      const result = ''.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`)
      expect(result).toBe('')
    })

    it('should convert uppercase drive letter to lowercase', () => {
      const winPath = 'Z:\\Projects\\app'
      const result = winPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`)
      expect(result).toBe('/mnt/z/Projects/app')
    })
  })

  describe('registerTerminalHandlers (IPC registration)', () => {
    beforeEach(async () => {
      const { ipcMain } = await import('electron')
      vi.mocked(ipcMain.handle).mockClear()
      registerTerminalHandlers()
    })

    it('should register handlers with ipcMain', async () => {
      const { ipcMain, app } = await import('electron')
      // ipcMain.handle should be called for each terminal channel
      expect(ipcMain.handle).toHaveBeenCalled()
      // app.on('before-quit') should be registered for cleanup
      expect(app.on).toHaveBeenCalledWith('before-quit', expect.any(Function))
    })

    it('should register terminal:getWslUsers handler', async () => {
      const { ipcMain } = await import('electron')
      const mockHandle = vi.mocked(ipcMain.handle)
      const channels = mockHandle.mock.calls.map(c => c[0])
      expect(channels).toContain('terminal:getWslUsers')
    })

    it('should register terminal:create handler', async () => {
      const { ipcMain } = await import('electron')
      const mockHandle = vi.mocked(ipcMain.handle)
      const channels = mockHandle.mock.calls.map(c => c[0])
      expect(channels).toContain('terminal:create')
    })

    it('should register terminal:write handler', async () => {
      const { ipcMain } = await import('electron')
      const mockHandle = vi.mocked(ipcMain.handle)
      const channels = mockHandle.mock.calls.map(c => c[0])
      expect(channels).toContain('terminal:write')
    })

    it('should register terminal:resize handler', async () => {
      const { ipcMain } = await import('electron')
      const mockHandle = vi.mocked(ipcMain.handle)
      const channels = mockHandle.mock.calls.map(c => c[0])
      expect(channels).toContain('terminal:resize')
    })

    it('should register terminal:kill handler', async () => {
      const { ipcMain } = await import('electron')
      const mockHandle = vi.mocked(ipcMain.handle)
      const channels = mockHandle.mock.calls.map(c => c[0])
      expect(channels).toContain('terminal:kill')
    })
  })

  // Helper: fresh handlers for each PTY test
  async function getHandlers() {
    const { ipcMain } = await import('electron')
    vi.mocked(ipcMain.handle).mockClear()
    registerTerminalHandlers()
    const mockHandle = vi.mocked(ipcMain.handle)
    const find = (ch: string) => {
      const call = mockHandle.mock.calls.find(c => c[0] === ch)
      if (!call) throw new Error(`Handler not found: ${ch}`)
      return call[1] as (...args: unknown[]) => unknown
    }
    return { find, mockHandle }
  }

  function makeEvent(id: number) {
    return {
      sender: {
        id,
        once: vi.fn(),
        isDestroyed: vi.fn().mockReturnValue(false),
        send: vi.fn(),
      }
    }
  }

  describe('terminal:create handler (PTY spawning)', () => {
    it('should spawn a PTY via node-pty', async () => {
      const nodePty = await import('node-pty')
      const mockSpawn = vi.mocked(nodePty.spawn)
      mockSpawn.mockClear()

      const { find } = await getHandlers()
      const handler = find('terminal:create')

      const id = await handler(makeEvent(1), 80, 24, undefined, undefined, undefined, undefined, undefined)
      expect(typeof id).toBe('string')
      expect(mockSpawn).toHaveBeenCalledWith('wsl.exe', expect.any(Array), expect.objectContaining({
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
      }))
    })

    it('should include --cd flag when projectPath is provided (without system prompt)', async () => {
      const nodePty = await import('node-pty')
      const mockSpawn = vi.mocked(nodePty.spawn)
      mockSpawn.mockClear()

      const { find } = await getHandlers()
      const handler = find('terminal:create')

      await handler(makeEvent(2), 80, 24, 'C:\\Projects\\myapp', undefined, undefined, undefined, undefined)
      expect(mockSpawn).toHaveBeenCalledWith('wsl.exe', expect.arrayContaining(['--cd']), expect.any(Object))
    })
  })

  describe('terminal:kill handler (PTY cleanup)', () => {
    it('should call kill() on the PTY process', async () => {
      mockPty.kill.mockClear()

      const { find } = await getHandlers()
      const createHandler = find('terminal:create')
      const killHandler = find('terminal:kill')

      const id = await createHandler(makeEvent(3), 80, 24)
      await killHandler({}, id)

      expect(mockPty.kill).toHaveBeenCalled()
    })

    it('should not throw when killing a non-existent PTY id', async () => {
      const { find } = await getHandlers()
      const killHandler = find('terminal:kill')
      expect(() => killHandler({}, 'nonexistent-id-9999')).not.toThrow()
    })
  })

  describe('terminal:write handler', () => {
    it('should write data to an existing PTY', async () => {
      mockPty.write.mockClear()

      const { find } = await getHandlers()
      const createHandler = find('terminal:create')
      const writeHandler = find('terminal:write')

      const id = await createHandler(makeEvent(10), 80, 24)
      await writeHandler({}, id, 'hello world\n')

      expect(mockPty.write).toHaveBeenCalledWith('hello world\n')
    })

    it('should be a no-op for non-existent PTY id (no crash)', async () => {
      const { find } = await getHandlers()
      const writeHandler = find('terminal:write')
      expect(() => writeHandler({}, 'nonexistent-99', 'data')).not.toThrow()
    })
  })

  describe('terminal:resize handler', () => {
    it('should resize an existing PTY', async () => {
      mockPty.resize.mockClear()

      const { find } = await getHandlers()
      const createHandler = find('terminal:create')
      const resizeHandler = find('terminal:resize')

      const id = await createHandler(makeEvent(20), 80, 24)
      await resizeHandler({}, id, 120, 40)

      expect(mockPty.resize).toHaveBeenCalledWith(120, 40)
    })

    it('should be a no-op for non-existent PTY id (no crash)', async () => {
      const { find } = await getHandlers()
      const resizeHandler = find('terminal:resize')
      expect(() => resizeHandler({}, 'nonexistent-99', 100, 30)).not.toThrow()
    })
  })

  describe('terminal:create — system prompt injection', () => {
    it('should write temp script and use bash -l when systemPrompt + userPrompt provided', async () => {
      const nodePty = await import('node-pty')
      const mockSpawn = vi.mocked(nodePty.spawn)
      mockSpawn.mockClear()
      mockWriteFile.mockClear()

      const { find } = await getHandlers()
      const handler = find('terminal:create')

      const systemPrompt = 'Tu es un agent de test'
      const userPrompt = 'Démarre la session'
      await handler(makeEvent(30), 80, 24, undefined, undefined, systemPrompt, userPrompt, undefined)

      // Should write a temp script file with --append-system-prompt
      expect(mockWriteFile).toHaveBeenCalledOnce()
      const [, scriptContent] = mockWriteFile.mock.calls[0]
      expect(scriptContent).toContain('--append-system-prompt')
      expect(scriptContent).toContain('base64 -d')

      const callArgs = mockSpawn.mock.calls[0]
      const spawnArgs = callArgs[1] as string[]
      // Should use -- bash -l <script_path> (no -lc inline command)
      expect(spawnArgs).toContain('--')
      expect(spawnArgs).toContain('bash')
      expect(spawnArgs).toContain('-l')
      expect(spawnArgs).not.toContain('-lc')
    })

    it('should include base64-encoded systemPrompt in temp script file', async () => {
      mockWriteFile.mockClear()

      const { find } = await getHandlers()
      const handler = find('terminal:create')

      const systemPrompt = 'Mon prompt spécial avec "guillemets"'
      await handler(makeEvent(31), 80, 24, undefined, undefined, systemPrompt, 'start', undefined)

      // The temp script should contain the base64-encoded system prompt
      expect(mockWriteFile).toHaveBeenCalledOnce()
      const [scriptPath, scriptContent] = mockWriteFile.mock.calls[0]
      const expectedB64 = Buffer.from(systemPrompt).toString('base64')
      expect(scriptContent).toContain(expectedB64)
      expect(scriptContent).toContain('base64 -d')
      // Script path should be a temp file
      expect(scriptPath).toContain('agent-prompt-')
      expect(scriptPath).toMatch(/\.sh$/)
    })

    it('should include projectPath via --cd when both projectPath and systemPrompt provided', async () => {
      const nodePty = await import('node-pty')
      const mockSpawn = vi.mocked(nodePty.spawn)
      mockSpawn.mockClear()

      const { find } = await getHandlers()
      const handler = find('terminal:create')

      await handler(makeEvent(32), 80, 24, 'C:\\Projects\\app', undefined, 'prompt', 'start', undefined)

      const callArgs = mockSpawn.mock.calls[0]
      const spawnArgs = callArgs[1] as string[]
      expect(spawnArgs).toContain('--cd')
      // Path should be WSL-converted
      const cdIndex = spawnArgs.indexOf('--cd')
      expect(spawnArgs[cdIndex + 1]).toContain('/mnt/c/')
    })

    it('should send userPrompt after PTY output quiet period (not via setTimeout)', async () => {
      vi.useFakeTimers()
      mockPty.write.mockClear()
      mockPty.onData.mockClear()

      const { find } = await getHandlers()
      const handler = find('terminal:create')

      await handler(makeEvent(33), 80, 24, undefined, undefined, 'prompt', 'Bonjour agent', undefined)

      // onData should have been registered
      expect(mockPty.onData).toHaveBeenCalled()
      const onDataCallback = mockPty.onData.mock.calls[0][0] as (data: string) => void

      // userPrompt should NOT be sent yet (no output received)
      expect(mockPty.write).not.toHaveBeenCalledWith('Bonjour agent\r')

      // Simulate PTY output burst (Claude startup)
      onDataCallback('Loading...')
      onDataCallback('Claude Code v2.1')

      // Still not sent — quiet period hasn't elapsed
      expect(mockPty.write).not.toHaveBeenCalledWith('Bonjour agent\r')

      // Advance past quiet period (800ms)
      vi.advanceTimersByTime(900)

      // Now userPrompt should have been sent
      expect(mockPty.write).toHaveBeenCalledWith('Bonjour agent\r')

      vi.useRealTimers()
    })

    it('should send userPrompt via max timeout even without PTY output', async () => {
      vi.useFakeTimers()
      mockPty.write.mockClear()
      mockPty.onData.mockClear()

      const { find } = await getHandlers()
      const handler = find('terminal:create')

      await handler(makeEvent(34), 80, 24, undefined, undefined, 'prompt', 'Hello', undefined)

      // No PTY output at all — max timeout should fire
      vi.advanceTimersByTime(15100)

      expect(mockPty.write).toHaveBeenCalledWith('Hello\r')

      vi.useRealTimers()
    })

    it('should return a unique string ID for each created PTY', async () => {
      const { find } = await getHandlers()
      const handler = find('terminal:create')

      const id1 = await handler(makeEvent(50), 80, 24) as string
      const id2 = await handler(makeEvent(51), 80, 24) as string
      expect(id1).not.toBe(id2)
      expect(typeof id1).toBe('string')
      expect(typeof id2).toBe('string')
    })
  })

  describe('terminal:getWslUsers handler', () => {
    it('should return empty array when wsl.exe fails', async () => {
      const { execFile } = await import('child_process')
      const mockExecFile = vi.mocked(execFile)

      // Simulate wsl.exe error (WSL not installed)
      mockExecFile.mockImplementation((_cmd, _args, callback) => {
        ;(callback as (err: Error) => void)(new Error('wsl.exe not found'))
        return {} as ReturnType<typeof execFile>
      })

      const { find } = await getHandlers()
      const handler = find('terminal:getWslUsers')

      const result = await handler({}) as string[]
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(0)
    })

    it('should parse /etc/passwd and return only users with uid >= 1000', async () => {
      const { execFile } = await import('child_process')
      const mockExecFile = vi.mocked(execFile)

      // Simulate /etc/passwd output with system users (uid < 1000) and regular users (uid >= 1000)
      const passwd = [
        'root:x:0:0:root:/root:/bin/bash',
        'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin',
        'testuser:x:1000:1000:Test User:/home/testuser:/bin/bash',
        'devuser:x:1001:1001:Dev User:/home/devuser:/bin/zsh',
        'sysuser:x:999:999:System:/home/sys:/bin/bash', // uid 999 - excluded
      ].join('\n')

      mockExecFile.mockImplementation((_cmd, _args, callback) => {
        ;(callback as (err: null, stdout: string) => void)(null, passwd)
        return {} as ReturnType<typeof execFile>
      })

      const { find } = await getHandlers()
      const handler = find('terminal:getWslUsers')

      const result = await handler({}) as string[]
      expect(result).toContain('testuser')
      expect(result).toContain('devuser')
      expect(result).not.toContain('root')
      expect(result).not.toContain('daemon')
      expect(result).not.toContain('sysuser')
    })

    it('should exclude users with nologin shell', async () => {
      const { execFile } = await import('child_process')
      const mockExecFile = vi.mocked(execFile)

      const passwd = [
        'noshelluser:x:1002:1002:No Shell:/home/noshelluser:/usr/sbin/nologin',
        'normaluser:x:1003:1003:Normal:/home/normal:/bin/bash',
      ].join('\n')

      mockExecFile.mockImplementation((_cmd, _args, callback) => {
        ;(callback as (err: null, stdout: string) => void)(null, passwd)
        return {} as ReturnType<typeof execFile>
      })

      const { find } = await getHandlers()
      const handler = find('terminal:getWslUsers')

      const result = await handler({}) as string[]
      expect(result).not.toContain('noshelluser')
      expect(result).toContain('normaluser')
    })
  })

  describe('webContents destroyed → PTY cleanup', () => {
    it('should register destroyed listener on first PTY creation for a webContents', async () => {
      const { find } = await getHandlers()
      const handler = find('terminal:create')

      const mockOnce = vi.fn()
      const mockEvent = {
        sender: {
          id: 100,
          once: mockOnce,
          isDestroyed: vi.fn().mockReturnValue(false),
          send: vi.fn(),
        }
      }

      await handler(mockEvent, 80, 24)
      // 'destroyed' listener should be registered on first PTY creation
      expect(mockOnce).toHaveBeenCalledWith('destroyed', expect.any(Function))
    })

    it('should NOT register destroyed listener again for same webContents on second PTY', async () => {
      const { find } = await getHandlers()
      const handler = find('terminal:create')

      const mockOnce = vi.fn()
      const mockEvent = {
        sender: {
          id: 101, // same wcId for both calls
          once: mockOnce,
          isDestroyed: vi.fn().mockReturnValue(false),
          send: vi.fn(),
        }
      }

      await handler(mockEvent, 80, 24)
      mockOnce.mockClear()
      await handler(mockEvent, 80, 24)

      // Second PTY for same webContents should NOT re-register 'destroyed'
      expect(mockOnce).not.toHaveBeenCalled()
    })
  })

  // ── T248: terminal:getClaudeProfiles handler ────────────────────────────────

  describe('terminal:getClaudeProfiles handler', () => {
    it('should return [claude] when ~/bin/ is empty (no wslUser)', async () => {
      const { execFile } = await import('child_process')
      const mockExecFile = vi.mocked(execFile)

      // execPromise calls promisify(execFile) — mock the callback version
      mockExecFile.mockImplementation((_cmd, _args, callback) => {
        ;(callback as (err: null, stdout: string) => void)(null, '')
        return {} as ReturnType<typeof execFile>
      })

      const { find } = await getHandlers()
      const handler = find('terminal:getClaudeProfiles')

      const result = await handler({}) as string[]
      expect(result).toContain('claude')
      expect(result[0]).toBe('claude')
    })

    it('should use -u <user> args when wslUser is provided', async () => {
      const { execFile } = await import('child_process')
      const mockExecFile = vi.mocked(execFile)

      let capturedArgs: string[] = []
      mockExecFile.mockImplementation((_cmd, args, callback) => {
        capturedArgs = args as string[]
        ;(callback as (err: null, stdout: string) => void)(null, '')
        return {} as ReturnType<typeof execFile>
      })

      const { find } = await getHandlers()
      const handler = find('terminal:getClaudeProfiles')

      await handler({}, 'myuser') as string[]
      expect(capturedArgs).toContain('-u')
      expect(capturedArgs).toContain('myuser')
    })

    it('should parse claude/claude-pro/claude-dev from stdout, sorted with claude first', async () => {
      const { execFile } = await import('child_process')
      const mockExecFile = vi.mocked(execFile)

      mockExecFile.mockImplementation((_cmd, _args, callback) => {
        ;(callback as (err: null, stdout: string) => void)(null, 'claude-pro\nclaude-dev\nclaude\n')
        return {} as ReturnType<typeof execFile>
      })

      const { find } = await getHandlers()
      const handler = find('terminal:getClaudeProfiles')

      const result = await handler({}) as string[]
      expect(result[0]).toBe('claude')
      expect(result).toContain('claude-dev')
      expect(result).toContain('claude-pro')
    })

    it('should filter out invalid scripts (not matching claude pattern)', async () => {
      const { execFile } = await import('child_process')
      const mockExecFile = vi.mocked(execFile)

      mockExecFile.mockImplementation((_cmd, _args, callback) => {
        ;(callback as (err: null, stdout: string) => void)(null, 'claude\nrm-rf\nnotclaude\nclaude-dev\n')
        return {} as ReturnType<typeof execFile>
      })

      const { find } = await getHandlers()
      const handler = find('terminal:getClaudeProfiles')

      const result = await handler({}) as string[]
      expect(result).toContain('claude')
      expect(result).toContain('claude-dev')
      expect(result).not.toContain('rm-rf')
      expect(result).not.toContain('notclaude')
    })

    it('should return [claude] as fallback when execPromise throws', async () => {
      const { execFile } = await import('child_process')
      const mockExecFile = vi.mocked(execFile)

      mockExecFile.mockImplementation((_cmd, _args, callback) => {
        ;(callback as (err: Error) => void)(new Error('ls: cannot access'))
        return {} as ReturnType<typeof execFile>
      })

      const { find } = await getHandlers()
      const handler = find('terminal:getClaudeProfiles')

      const result = await handler({}) as string[]
      expect(result).toEqual(['claude'])
    })
  })

  // ── T248: terminal:create — claudeCommand + convId validation ──────────────

  describe('terminal:create — claudeCommand validation', () => {
    it('should accept valid claudeCommand (claude)', async () => {
      const nodePty = await import('node-pty')
      vi.mocked(nodePty.spawn).mockClear()

      const { find } = await getHandlers()
      const handler = find('terminal:create')

      // terminal:create(event, cols, rows, projectPath, wslDistro, systemPrompt, userPrompt, thinkingMode, claudeCommand, convId)
      await expect(handler(makeEvent(60), 80, 24, undefined, undefined, undefined, undefined, undefined, 'claude', undefined)).resolves.not.toThrow()
    })

    it('should throw on invalid claudeCommand (rm -rf)', async () => {
      const { find } = await getHandlers()
      const handler = find('terminal:create')

      await expect(
        handler(makeEvent(61), 80, 24, undefined, undefined, undefined, undefined, undefined, 'rm -rf', undefined)
      ).rejects.toThrow('Invalid claudeCommand')
    })

    it('should accept claude-pro as valid claudeCommand', async () => {
      const { find } = await getHandlers()
      const handler = find('terminal:create')

      await expect(
        handler(makeEvent(62), 80, 24, undefined, undefined, undefined, undefined, undefined, 'claude-pro', undefined)
      ).resolves.not.toThrow()
    })
  })

  describe('terminal:create — convId validation', () => {
    it('should use --resume with valid UUID convId', async () => {
      const nodePty = await import('node-pty')
      const mockSpawn = vi.mocked(nodePty.spawn)
      mockSpawn.mockClear()
      mockWriteFile.mockClear()

      const { find } = await getHandlers()
      const handler = find('terminal:create')

      const validUuid = '550e8400-e29b-41d4-a716-446655440000'
      await handler(makeEvent(63), 80, 24, undefined, undefined, undefined, undefined, undefined, undefined, validUuid)

      const spawnArgs = mockSpawn.mock.calls[0][1] as string[]
      expect(spawnArgs.join(' ')).toContain('--resume')
      expect(spawnArgs.join(' ')).toContain(validUuid)
    })

    it('should ignore invalid convId (not UUID)', async () => {
      const nodePty = await import('node-pty')
      const mockSpawn = vi.mocked(nodePty.spawn)
      mockSpawn.mockClear()

      const { find } = await getHandlers()
      const handler = find('terminal:create')

      await handler(makeEvent(64), 80, 24, undefined, undefined, undefined, undefined, undefined, undefined, 'not-a-uuid')

      const spawnArgs = mockSpawn.mock.calls[0][1] as string[]
      expect(spawnArgs.join(' ')).not.toContain('--resume')
    })

    it('should use claudeCommand in --resume mode when both provided', async () => {
      const nodePty = await import('node-pty')
      const mockSpawn = vi.mocked(nodePty.spawn)
      mockSpawn.mockClear()

      const { find } = await getHandlers()
      const handler = find('terminal:create')

      const validUuid = '550e8400-e29b-41d4-a716-446655440000'
      await handler(makeEvent(65), 80, 24, undefined, undefined, undefined, undefined, undefined, 'claude-dev', validUuid)

      const spawnArgs = mockSpawn.mock.calls[0][1] as string[]
      const fullCmd = spawnArgs.join(' ')
      expect(fullCmd).toContain('claude-dev')
      expect(fullCmd).toContain('--resume')
      expect(fullCmd).toContain(validUuid)
    })

    it('should default to claude when claudeCommand is null/undefined', async () => {
      const nodePty = await import('node-pty')
      const mockSpawn = vi.mocked(nodePty.spawn)
      mockSpawn.mockClear()

      const { find } = await getHandlers()
      const handler = find('terminal:create')

      const validUuid = '550e8400-e29b-41d4-a716-446655440000'
      await handler(makeEvent(66), 80, 24, undefined, undefined, undefined, undefined, undefined, undefined, validUuid)

      const spawnArgs = mockSpawn.mock.calls[0][1] as string[]
      const fullCmd = spawnArgs.join(' ')
      expect(fullCmd).toContain('exec claude --resume')
    })
  })

  // ── T299: quiet-period timer reset test ────────────────────────────────────

  describe('terminal:create — quiet-period timer reset (T299)', () => {
    it('should reset quiet timer on new data, delaying userPrompt send', async () => {
      vi.useFakeTimers()
      mockPty.write.mockClear()
      mockPty.onData.mockClear()

      const { find } = await getHandlers()
      const handler = find('terminal:create')

      await handler(makeEvent(70), 80, 24, undefined, undefined, 'prompt', 'Reset test', undefined)

      expect(mockPty.onData).toHaveBeenCalled()
      const onDataCallback = mockPty.onData.mock.calls[0][0] as (data: string) => void

      // 1) First data event
      onDataCallback('Loading...')

      // 2) Advance 600ms (not yet at 800ms quiet threshold)
      vi.advanceTimersByTime(600)
      expect(mockPty.write).not.toHaveBeenCalledWith('Reset test\n')

      // 3) New data event — resets quiet timer
      onDataCallback('More output')

      // 4) Advance another 600ms (total 1200ms since start, but only 600ms since last data)
      vi.advanceTimersByTime(600)
      expect(mockPty.write).not.toHaveBeenCalledWith('Reset test\r')

      // 5) Advance remaining 200ms (now 800ms since last data) — quiet period elapsed
      vi.advanceTimersByTime(200)
      expect(mockPty.write).toHaveBeenCalledWith('Reset test\r')

      vi.useRealTimers()
    })
  })

  // ── T328: parseFreeMOutput ──────────────────────────────────────────────────

  describe('parseFreeMOutput (T328 — available metric)', () => {
    // Import _testing helpers
    let parseFreeMOutput: typeof import('./terminal')._testing.parseFreeMOutput

    beforeEach(async () => {
      const mod = await import('./terminal')
      parseFreeMOutput = mod._testing.parseFreeMOutput
    })

    it('should use available column for memory pressure (not used)', () => {
      const output = [
        '              total        used        free      shared  buff/cache   available',
        'Mem:           7951        3200        2100          50        2651        4500',
        'Swap:          2048           0        2048',
      ].join('\n')

      const result = parseFreeMOutput(output)

      expect(result).not.toBeNull()
      // usedRatio = (total - available) / total = (7951 - 4500) / 7951 ≈ 0.434
      expect(result!.usedRatio).toBeCloseTo((7951 - 4500) / 7951, 3)
      expect(result!.totalMB).toBe(7951)
      expect(result!.availableMB).toBe(4500)
      expect(result!.usedMB).toBe(7951 - 4500)
    })

    it('should return null when no Mem: line found', () => {
      const output = 'Swap:  2048  0  2048\n'
      expect(parseFreeMOutput(output)).toBeNull()
    })

    it('should return null when total is 0 or NaN', () => {
      const output = 'Mem:   0   0   0   0   0   0\n'
      expect(parseFreeMOutput(output)).toBeNull()
    })

    it('should fallback to used column when available is missing (old free format)', () => {
      // Old format with only 4 columns: total used free shared
      const output = 'Mem:   8000  3000  5000  50\n'
      const result = parseFreeMOutput(output)

      expect(result).not.toBeNull()
      // Fallback: usedRatio = used / total = 3000/8000
      expect(result!.usedRatio).toBeCloseTo(3000 / 8000, 3)
      expect(result!.usedMB).toBe(3000)
      expect(result!.availableMB).toBe(5000) // total - used
    })

    it('should handle lines with varying whitespace', () => {
      const output = 'Mem:     16384   8000   4000    200    4184    7800\n'
      const result = parseFreeMOutput(output)

      expect(result).not.toBeNull()
      expect(result!.totalMB).toBe(16384)
      expect(result!.availableMB).toBe(7800)
      expect(result!.usedRatio).toBeCloseTo((16384 - 7800) / 16384, 3)
    })
  })

  // ── T328: releaseWslMemory ──────────────────────────────────────────────────

  describe('releaseWslMemory (T328)', () => {
    let releaseWslMemory: typeof import('./terminal')._testing.releaseWslMemory
    let testing: typeof import('./terminal')._testing
    let mockExecFile: ReturnType<typeof vi.fn>

    beforeEach(async () => {
      const mod = await import('./terminal')
      releaseWslMemory = mod._testing.releaseWslMemory
      testing = mod._testing

      const cp = await import('child_process')
      mockExecFile = vi.mocked(cp.execFile)
    })

    it('should return synced:true, dropped:true when drop_caches is available', async () => {
      testing.dropCachesAvailable = true
      mockExecFile.mockImplementation((_cmd: string, _args: string[], opts: unknown, callback?: unknown) => {
        // execPromise uses promisify(execFile) — mock the callback version
        if (callback && typeof callback === 'function') {
          (callback as (err: null, stdout: string, stderr: string) => void)(null, '', '')
        }
        return {} as ReturnType<typeof import('child_process').execFile>
      })

      const result = await releaseWslMemory()

      expect(result.synced).toBe(true)
      expect(result.dropped).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return synced:true, dropped:false when drop_caches is not available', async () => {
      testing.dropCachesAvailable = false
      mockExecFile.mockImplementation((_cmd: string, _args: string[], opts: unknown, callback?: unknown) => {
        if (callback && typeof callback === 'function') {
          (callback as (err: null, stdout: string, stderr: string) => void)(null, '', '')
        }
        return {} as ReturnType<typeof import('child_process').execFile>
      })

      const result = await releaseWslMemory()

      expect(result.synced).toBe(true)
      expect(result.dropped).toBe(false)
      expect(result.error).toBeUndefined()
    })

    it('should return error when sync fails', async () => {
      testing.dropCachesAvailable = true
      mockExecFile.mockImplementation((_cmd: string, _args: string[], opts: unknown, callback?: unknown) => {
        if (callback && typeof callback === 'function') {
          (callback as (err: Error) => void)(new Error('WSL not available'))
        }
        return {} as ReturnType<typeof import('child_process').execFile>
      })

      const result = await releaseWslMemory()

      expect(result.synced).toBe(false)
      expect(result.dropped).toBe(false)
      expect(result.error).toContain('sync failed')
    })
  })

  // ── T328: Cooldown logic in doMemoryCheck ───────────────────────────────────

  describe('auto-release cooldown (T328)', () => {
    let testing: typeof import('./terminal')._testing
    let mockExecFile: ReturnType<typeof vi.fn>

    beforeEach(async () => {
      const mod = await import('./terminal')
      testing = mod._testing

      const cp = await import('child_process')
      mockExecFile = vi.mocked(cp.execFile)

      // Reset state
      testing.dropCachesAvailable = true
      testing.lastAutoReleaseAt = 0
      testing.memoryCheckRunning = false

      // Add a fake PTY so doMemoryCheck doesn't exit early
      testing.ptys.set('test-cooldown', {} as import('node-pty').IPty)

      // Mock BrowserWindow.getAllWindows to return empty array
      const electron = await import('electron')
      ;(electron as Record<string, unknown>).BrowserWindow = {
        getAllWindows: vi.fn(() => []),
      }
    })

    afterEach(async () => {
      const mod = await import('./terminal')
      mod._testing.ptys.delete('test-cooldown')
    })

    it('should call releaseWslMemory when cooldown has elapsed', async () => {
      // lastAutoReleaseAt = 0 means never released → cooldown elapsed
      testing.lastAutoReleaseAt = 0

      // Mock free -m output with critical memory (available < 15%)
      const criticalFreeOutput = '              total        used        free      shared  buff/cache   available\nMem:           8000        7500         100          50         400         500\n'

      let callCount = 0
      mockExecFile.mockImplementation((...args: unknown[]) => {
        callCount++
        // promisify calls execFile(cmd, args, cb) or execFile(cmd, args, opts, cb)
        // Find the callback — it's always the last argument
        const cb = args[args.length - 1]
        if (typeof cb === 'function') {
          if (callCount === 1) {
            // First call: wsl.exe -- free -m
            cb(null, criticalFreeOutput, '')
          } else {
            // Subsequent calls: sync / drop_caches from releaseWslMemory
            cb(null, '', '')
          }
        }
        return {} as ReturnType<typeof import('child_process').execFile>
      })

      await testing.doMemoryCheck()

      // doMemoryCheck sets lastAutoReleaseAt before calling releaseWslMemory (fire-and-forget)
      // So lastAutoReleaseAt > 0 proves the auto-release was triggered
      expect(testing.lastAutoReleaseAt).toBeGreaterThan(0)
      // free -m call happened + at least releaseWslMemory was invoked
      expect(callCount).toBeGreaterThanOrEqual(1)
    })

    it('should NOT call releaseWslMemory when within 60s cooldown window', async () => {
      // Set lastAutoReleaseAt to "just now" — within cooldown
      testing.lastAutoReleaseAt = Date.now()

      const criticalFreeOutput = '              total        used        free      shared  buff/cache   available\nMem:           8000        7500         100          50         400         500\n'

      let callCount = 0
      mockExecFile.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1]
        if (typeof cb === 'function') {
          callCount++
          cb(null, criticalFreeOutput, '')
        }
        return {} as ReturnType<typeof import('child_process').execFile>
      })

      const previousReleaseAt = testing.lastAutoReleaseAt

      await testing.doMemoryCheck()

      // Only 1 call: free -m. No sync/drop_caches because cooldown not elapsed
      expect(callCount).toBe(1)
      // lastAutoReleaseAt should NOT have changed
      expect(testing.lastAutoReleaseAt).toBe(previousReleaseAt)
    })
  })

  // ── T328: terminal:releaseMemory IPC ────────────────────────────────────────

  describe('terminal:releaseMemory IPC handler (T328)', () => {
    it('should register terminal:releaseMemory handler', async () => {
      const { ipcMain } = await import('electron')
      vi.mocked(ipcMain.handle).mockClear()
      registerTerminalHandlers()

      const channels = vi.mocked(ipcMain.handle).mock.calls.map(c => c[0])
      expect(channels).toContain('terminal:releaseMemory')
    })
  })
})
