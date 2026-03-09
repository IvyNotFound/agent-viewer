/**
 * Tests for hookServer — handleStop DB path (byConvId lookup, fallback, zero tokens, token update)
 * Covers the NoCoverage mutants in the writeDb callback (L123-L167) (T1219)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'http'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockWriteDb, mockAssertDbPathAllowed, mockInitHookSecret, mockGetHookSecret, mockDetectWslGatewayIp } = vi.hoisted(
  () => ({
    mockWriteDb: vi.fn(),
    mockAssertDbPathAllowed: vi.fn(), // no-op by default
    mockInitHookSecret: vi.fn(),
    mockGetHookSecret: vi.fn().mockReturnValue('test-secret-db'),
    mockDetectWslGatewayIp: vi.fn().mockReturnValue(null),
  })
)

vi.mock('./db', () => ({
  writeDb: mockWriteDb,
  assertDbPathAllowed: mockAssertDbPathAllowed,
}))

vi.mock('./hookServer-inject', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hookServer-inject')>()
  return {
    ...actual,
    HOOK_PORT: actual.HOOK_PORT,
    initHookSecret: mockInitHookSecret,
    getHookSecret: mockGetHookSecret,
    detectWslGatewayIp: mockDetectWslGatewayIp,
  }
})

// ── Import module ──────────────────────────────────────────────────────────────

const { startHookServer, setHookWindow } = await import('./hookServer')

// ── Helpers ────────────────────────────────────────────────────────────────────

async function createTestServer(): Promise<[http.Server, number]> {
  const server = startHookServer()
  await new Promise<void>((resolve) => {
    if (server.listening) { resolve(); return }
    const onListening = () => { cleanup(); resolve() }
    const onError = () => { cleanup(); resolve() }
    const cleanup = () => {
      server.removeListener('listening', onListening)
      server.removeListener('error', onError)
    }
    server.once('listening', onListening)
    server.once('error', onError)
  })
  await new Promise<void>((resolve) => {
    if (!server.listening) { resolve(); return }
    server.close(() => resolve())
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.once('listening', resolve)
    server.listen(0, '127.0.0.1')
  })
  const addr = server.address() as { port: number }
  return [server, addr.port]
}

function makeRequest(
  port: number,
  opts: { path: string; body?: unknown; authHeader?: string | null }
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = opts.body !== undefined ? JSON.stringify(opts.body) : ''
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(payload)),
    }
    if (opts.authHeader !== null) {
      headers['Authorization'] =
        opts.authHeader !== undefined ? opts.authHeader : 'Bearer test-secret-db'
    }
    const req = http.request(
      { hostname: '127.0.0.1', port, path: opts.path, method: 'POST', headers },
      (res) => {
        let data = ''
        res.on('data', (c) => { data += c })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
      }
    )
    req.on('error', reject)
    req.end(payload)
  })
}

/** Build a minimal JSONL transcript with given token counts */
function makeTranscript(opts: { inputTokens: number; outputTokens: number; cacheRead?: number; cacheWrite?: number }): string {
  return JSON.stringify({
    type: 'assistant',
    message: {
      stop_reason: 'end_turn',
      usage: {
        input_tokens: opts.inputTokens,
        output_tokens: opts.outputTokens,
        cache_read_input_tokens: opts.cacheRead ?? 0,
        cache_creation_input_tokens: opts.cacheWrite ?? 0,
      },
    },
  }) + '\n'
}

// ── handleStop — DB write path ─────────────────────────────────────────────────

describe('handleStop — DB write path via real transcript', () => {
  let server: http.Server
  let port: number
  const tmpFile = join(tmpdir(), 'hookServer_db_test_transcript.jsonl')

  beforeEach(async () => {
    vi.resetAllMocks()
    mockGetHookSecret.mockReturnValue('test-secret-db')
    ;[server, port] = await createTestServer()
  })

  afterEach(async () => {
    setHookWindow(null as unknown as import('electron').BrowserWindow)
    await new Promise<void>((r) => server.close(() => r()))
    try { unlinkSync(tmpFile) } catch { /* ignore */ }
  })

  it('calls writeDb when all fields present and transcript has non-zero tokens', async () => {
    writeFileSync(tmpFile, makeTranscript({ inputTokens: 500, outputTokens: 200 }))
    mockWriteDb.mockResolvedValue(undefined)

    await makeRequest(port, {
      path: '/hooks/stop',
      body: { session_id: 'conv-abc', transcript_path: tmpFile, cwd: '/project' },
    })
    await new Promise((r) => setTimeout(r, 200))

    expect(mockWriteDb).toHaveBeenCalledOnce()
    expect(mockWriteDb).toHaveBeenCalledWith(
      expect.stringContaining('project.db'),
      expect.any(Function)
    )
  })

  it('skips writeDb when transcript parses to zero tokens (both tokensIn and tokensOut are 0)', async () => {
    // File with no finalized assistant messages → zero tokens
    writeFileSync(tmpFile, JSON.stringify({ type: 'user', message: { content: 'hello' } }) + '\n')
    mockWriteDb.mockResolvedValue(undefined)

    await makeRequest(port, {
      path: '/hooks/stop',
      body: { session_id: 'conv-zero', transcript_path: tmpFile, cwd: '/project' },
    })
    await new Promise((r) => setTimeout(r, 200))

    // tokensIn=0 and tokensOut=0 → early return, no DB write
    expect(mockWriteDb).not.toHaveBeenCalled()
  })

  it('runs writeDb callback: executes DB statements to find session by conv_id', async () => {
    writeFileSync(tmpFile, makeTranscript({ inputTokens: 100, outputTokens: 50 }))

    let capturedCallback: ((db: unknown) => void) | null = null
    mockWriteDb.mockImplementation(async (_path: string, cb: (db: unknown) => void) => {
      capturedCallback = cb
    })

    await makeRequest(port, {
      path: '/hooks/stop',
      body: { session_id: 'conv-lookup', transcript_path: tmpFile, cwd: '/project' },
    })
    await new Promise((r) => setTimeout(r, 200))

    expect(capturedCallback).not.toBeNull()

    // Execute the callback with a mock DB that returns a session
    const mockStmt = {
      bind: vi.fn(),
      step: vi.fn().mockReturnValue(true),
      getAsObject: vi.fn().mockReturnValue({ id: 42 }),
      free: vi.fn(),
    }
    const mockRun = vi.fn()
    const mockDb = {
      prepare: vi.fn().mockReturnValue(mockStmt),
      run: mockRun,
    }

    capturedCallback!(mockDb)

    // Should have prepared a SELECT statement
    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM sessions WHERE claude_conv_id = ?')
    )
    // Should have called stmt.bind, step, getAsObject, free
    expect(mockStmt.bind).toHaveBeenCalledWith(['conv-lookup'])
    expect(mockStmt.step).toHaveBeenCalled()
    expect(mockStmt.getAsObject).toHaveBeenCalled()
    expect(mockStmt.free).toHaveBeenCalled()
  })

  it('runs writeDb callback: updates tokens and status on found session', async () => {
    writeFileSync(tmpFile, makeTranscript({ inputTokens: 300, outputTokens: 120, cacheRead: 50, cacheWrite: 20 }))

    let capturedCallback: ((db: unknown) => void) | null = null
    mockWriteDb.mockImplementation(async (_path: string, cb: (db: unknown) => void) => {
      capturedCallback = cb
    })

    await makeRequest(port, {
      path: '/hooks/stop',
      body: { session_id: 'conv-update', transcript_path: tmpFile, cwd: '/project' },
    })
    await new Promise((r) => setTimeout(r, 200))

    expect(capturedCallback).not.toBeNull()

    const mockStmt = {
      bind: vi.fn(),
      step: vi.fn().mockReturnValue(true),
      getAsObject: vi.fn().mockReturnValue({ id: 99 }),
      free: vi.fn(),
    }
    const mockRun = vi.fn()
    const mockDb = {
      prepare: vi.fn().mockReturnValue(mockStmt),
      run: mockRun,
    }

    capturedCallback!(mockDb)

    // Should have run two UPDATEs: tokens + status
    expect(mockRun).toHaveBeenCalledWith(
      'UPDATE sessions SET tokens_in=?, tokens_out=?, tokens_cache_read=?, tokens_cache_write=? WHERE id=?',
      [300, 120, 50, 20, 99]
    )
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining("SET status='completed'"),
      [99]
    )
  })

  it('runs writeDb callback: falls back to most recent started session when conv_id not found', async () => {
    writeFileSync(tmpFile, makeTranscript({ inputTokens: 200, outputTokens: 80 }))

    let capturedCallback: ((db: unknown) => void) | null = null
    mockWriteDb.mockImplementation(async (_path: string, cb: (db: unknown) => void) => {
      capturedCallback = cb
    })

    await makeRequest(port, {
      path: '/hooks/stop',
      body: { session_id: 'conv-unknown', transcript_path: tmpFile, cwd: '/project' },
    })
    await new Promise((r) => setTimeout(r, 200))

    expect(capturedCallback).not.toBeNull()

    // First stmt (byConvId): step returns false → session not found
    // Second stmt (fallback): step returns true → session found via fallback
    const mockStmtNotFound = {
      bind: vi.fn(),
      step: vi.fn().mockReturnValue(false),
      getAsObject: vi.fn().mockReturnValue({}),
      free: vi.fn(),
    }
    const mockStmtFallback = {
      bind: vi.fn(),
      step: vi.fn().mockReturnValue(true),
      getAsObject: vi.fn().mockReturnValue({ id: 77 }),
      free: vi.fn(),
    }
    const mockRun = vi.fn()
    let callCount = 0
    const mockDb = {
      prepare: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? mockStmtNotFound : mockStmtFallback
      }),
      run: mockRun,
    }

    capturedCallback!(mockDb)

    // Fallback stmt prepared with the fallback query
    expect(mockDb.prepare).toHaveBeenCalledTimes(2)
    expect(mockDb.prepare).toHaveBeenNthCalledWith(2,
      expect.stringContaining("status IN ('started','completed')")
    )
    // Should use fallback session id=77 for update
    expect(mockRun).toHaveBeenCalledWith(
      'UPDATE sessions SET tokens_in=?, tokens_out=?, tokens_cache_read=?, tokens_cache_write=? WHERE id=?',
      [200, 80, 0, 0, 77]
    )
  })

  it('runs writeDb callback: returns early when no session found (byConvId and fallback both fail)', async () => {
    writeFileSync(tmpFile, makeTranscript({ inputTokens: 100, outputTokens: 50 }))

    let capturedCallback: ((db: unknown) => void) | null = null
    mockWriteDb.mockImplementation(async (_path: string, cb: (db: unknown) => void) => {
      capturedCallback = cb
    })

    await makeRequest(port, {
      path: '/hooks/stop',
      body: { session_id: 'conv-noexist', transcript_path: tmpFile, cwd: '/project' },
    })
    await new Promise((r) => setTimeout(r, 200))

    expect(capturedCallback).not.toBeNull()

    // Both stmts: step returns false → no session found
    const mockStmtNone = {
      bind: vi.fn(),
      step: vi.fn().mockReturnValue(false),
      getAsObject: vi.fn().mockReturnValue({}),
      free: vi.fn(),
    }
    const mockRun = vi.fn()
    const mockDb = {
      prepare: vi.fn().mockReturnValue(mockStmtNone),
      run: mockRun,
    }

    capturedCallback!(mockDb)

    // No UPDATE should be run
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('handles writeDb rejection without crashing server', async () => {
    writeFileSync(tmpFile, makeTranscript({ inputTokens: 100, outputTokens: 50 }))
    mockWriteDb.mockRejectedValue(new Error('DB write failed'))

    await makeRequest(port, {
      path: '/hooks/stop',
      body: { session_id: 'conv-err', transcript_path: tmpFile, cwd: '/project' },
    })
    await new Promise((r) => setTimeout(r, 200))

    // Server should still be alive
    const health = await makeRequest(port, { path: '/hooks/session-start', body: {} })
    expect(health.status).toBe(200)
  })

  it('pushes Stop hook:event even when writeDb is not called (missing session_id)', async () => {
    const mockWebContentsSend = vi.fn()
    const fakeWin = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: { send: mockWebContentsSend },
    } as unknown as import('electron').BrowserWindow
    setHookWindow(fakeWin)

    await makeRequest(port, {
      path: '/hooks/stop',
      body: { transcript_path: '/tmp/x.jsonl', cwd: '/cwd' },
    })
    await new Promise((r) => setTimeout(r, 50))

    // pushHookEvent is always called for /hooks/stop, even without session_id
    expect(mockWebContentsSend).toHaveBeenCalledWith(
      'hook:event',
      expect.objectContaining({ event: 'Stop' })
    )
    expect(mockWriteDb).not.toHaveBeenCalled()
  })
})

// ── handleStop — token skip guard (L123) ──────────────────────────────────────

describe('handleStop — token skip guard', () => {
  let server: http.Server
  let port: number
  const tmpFile = join(tmpdir(), 'hookServer_token_skip.jsonl')

  beforeEach(async () => {
    vi.resetAllMocks()
    mockGetHookSecret.mockReturnValue('test-secret-db')
    ;[server, port] = await createTestServer()
  })

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()))
    try { unlinkSync(tmpFile) } catch { /* ignore */ }
  })

  it('skips DB when only tokensIn is 0 but tokensOut is also 0 (both zero → skip)', async () => {
    // Only streaming entries (stop_reason=null) → tokensIn=0, tokensOut=0
    writeFileSync(tmpFile,
      JSON.stringify({
        type: 'assistant',
        message: { stop_reason: null, usage: { input_tokens: 100, output_tokens: 1 } },
      }) + '\n'
    )
    mockWriteDb.mockResolvedValue(undefined)

    await makeRequest(port, {
      path: '/hooks/stop',
      body: { session_id: 'conv-skip', transcript_path: tmpFile, cwd: '/project' },
    })
    await new Promise((r) => setTimeout(r, 200))
    expect(mockWriteDb).not.toHaveBeenCalled()
  })

  it('does NOT skip DB when tokensIn > 0 (even if tokensOut is 0)', async () => {
    // A finalized message with tokensIn > 0 and tokensOut = 0
    writeFileSync(tmpFile,
      JSON.stringify({
        type: 'assistant',
        message: {
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 0 },
        },
      }) + '\n'
    )
    mockWriteDb.mockResolvedValue(undefined)

    await makeRequest(port, {
      path: '/hooks/stop',
      body: { session_id: 'conv-nonzero', transcript_path: tmpFile, cwd: '/project' },
    })
    await new Promise((r) => setTimeout(r, 200))
    // tokensIn=100, tokensOut=0 → NOT (tokensIn===0 && tokensOut===0) → writeDb called
    expect(mockWriteDb).toHaveBeenCalled()
  })
})

// ── startHookServer — edge cases ───────────────────────────────────────────────

describe('startHookServer — listen and body size edge cases', () => {
  let server: http.Server
  let port: number

  beforeEach(async () => {
    vi.resetAllMocks()
    mockGetHookSecret.mockReturnValue('test-secret-db')
    ;[server, port] = await createTestServer()
  })

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()))
  })

  it('returns 200 and body {} for valid authorized request', async () => {
    const res = await makeRequest(port, { path: '/hooks/session-start', body: { session_id: 'x', cwd: '/p' } })
    expect(res.status).toBe(200)
    expect(res.body).toBe('{}')
  })

  it('rejects oversized body with 413', async () => {
    // Send > 1 MB body
    const largeBody = 'x'.repeat(1.1 * 1024 * 1024)
    const result = await new Promise<{ status: number }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/hooks/session-start',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-secret-db',
          },
        },
        (res) => {
          res.resume()
          resolve({ status: res.statusCode ?? 0 })
        }
      )
      req.on('error', (e) => {
        // ECONNRESET is expected after req.destroy() — resolve with the status we got
        if ((e as NodeJS.ErrnoException).code === 'ECONNRESET') {
          resolve({ status: 413 })
        } else {
          reject(e)
        }
      })
      req.write(largeBody)
      req.end()
    })
    expect(result.status).toBe(413)
  })

  it('returns 200 for authorized /hooks/stop', async () => {
    const res = await makeRequest(port, {
      path: '/hooks/stop',
      body: { session_id: 'c1', transcript_path: '/tmp/t.jsonl', cwd: '/cwd' },
    })
    expect(res.status).toBe(200)
    expect(res.body).toBe('{}')
  })

  it('server address port equals the port used for the test', () => {
    const addr = server.address() as { port: number } | null
    expect(addr).not.toBeNull()
    expect(addr!.port).toBe(port)
    expect(addr!.port).toBeGreaterThan(0)
  })
})
