/**
 * Hook server — embedded HTTP server for Claude Code lifecycle hooks (T737)
 *
 * Listens on 127.0.0.1:27182 (HOOK_PORT) and handles POST requests from
 * Claude Code HTTP hooks (type: "http"). Currently handles:
 * - POST /hooks/stop → parse JSONL transcript, update session tokens in DB
 *
 * Uses sql.js via writeDb() (same as IPC handlers) — no better-sqlite3.
 * Always returns 2xx to avoid blocking Claude Code shutdown.
 *
 * @module hookServer
 */

import http from 'http'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { writeDb } from './db'

export const HOOK_PORT = 27182

// ── Token types ────────────────────────────────────────────────────────────────

export interface TokenCounts {
  tokensIn: number
  tokensOut: number
  cacheRead: number
  cacheWrite: number
}

interface StopPayload {
  hook_event_name?: string
  session_id?: string
  transcript_path?: string
  cwd?: string
}

// ── JSONL parsing ─────────────────────────────────────────────────────────────

/**
 * Parse token usage from a Claude Code conversation JSONL file content.
 *
 * Only counts finalized assistant messages (stop_reason != null).
 * Each API call produces two JSONL entries with the same requestId:
 *   - streaming start (stop_reason: null, output_tokens ~1)
 *   - final message  (stop_reason set, full output_tokens)
 * Only the final entry is counted to avoid double-counting.
 *
 * @param content - Raw JSONL string (newline-separated JSON objects)
 * @returns Summed token counts
 */
export function parseTokensFromJSONL(content: string): TokenCounts {
  let tokensIn = 0
  let tokensOut = 0
  let cacheRead = 0
  let cacheWrite = 0

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj = JSON.parse(trimmed) as any
      if (obj.type !== 'assistant') continue
      if (!obj.message?.usage || obj.message.stop_reason == null) continue
      const u = obj.message.usage
      tokensIn   += (u.input_tokens                 ?? 0)
      tokensOut  += (u.output_tokens                ?? 0)
      cacheRead  += (u.cache_read_input_tokens       ?? 0)
      cacheWrite += (u.cache_creation_input_tokens   ?? 0)
    } catch { /* malformed line — skip */ }
  }

  return { tokensIn, tokensOut, cacheRead, cacheWrite }
}

// ── Stop handler ──────────────────────────────────────────────────────────────

/**
 * Handle the Stop hook: parse JSONL transcript and persist token counts.
 *
 * Derives DB path from `cwd` (the project root sent by Claude Code).
 * Falls back to the most recent started session if no session matches convId.
 */
async function handleStop(payload: StopPayload): Promise<void> {
  const { session_id: convId, transcript_path: transcriptPath, cwd } = payload

  if (!convId || !transcriptPath || !cwd) {
    console.warn('[hookServer] /hooks/stop: missing required fields', { convId: !!convId, transcriptPath: !!transcriptPath, cwd: !!cwd })
    return
  }

  let content: string
  try {
    content = await readFile(transcriptPath, 'utf-8')
  } catch (err) {
    console.warn('[hookServer] Cannot read transcript:', err)
    return
  }

  const tokens = parseTokensFromJSONL(content)
  if (tokens.tokensIn === 0 && tokens.tokensOut === 0) return

  const dbPath = join(cwd, '.claude', 'project.db')

  try {
    await writeDb(dbPath, (db) => {
      // 1. Try to find session by conv_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byConvId = db.prepare('SELECT id FROM sessions WHERE claude_conv_id = ?') as any
      byConvId.bind([convId])
      let sessionId: number | null = null
      if (byConvId.step()) {
        sessionId = (byConvId.getAsObject() as { id: number }).id
      }
      byConvId.free()

      // 2. Fallback: most recent started/completed session with no tokens
      if (sessionId === null) {
        const fallback = db.prepare(
          "SELECT id FROM sessions WHERE (tokens_in = 0 OR tokens_in IS NULL) AND statut IN ('started','completed') ORDER BY id DESC LIMIT 1"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any
        if (fallback.step()) {
          sessionId = (fallback.getAsObject() as { id: number }).id
          console.warn(`[hookServer] Fallback: using session ${sessionId} (conv_id ${convId} not found)`)
        }
        fallback.free()
      }

      if (sessionId === null) {
        console.warn(`[hookServer] No session found for conv_id=${convId}`)
        return
      }

      db.run(
        'UPDATE sessions SET tokens_in=?, tokens_out=?, tokens_cache_read=?, tokens_cache_write=? WHERE id=?',
        [tokens.tokensIn, tokens.tokensOut, tokens.cacheRead, tokens.cacheWrite, sessionId]
      )
      console.log(`[hookServer] session ${sessionId}: in=${tokens.tokensIn} out=${tokens.tokensOut} cacheR=${tokens.cacheRead} cacheW=${tokens.cacheWrite}`)
    })
  } catch (err) {
    console.error('[hookServer] writeDb failed:', err)
  }
}

// ── Server ────────────────────────────────────────────────────────────────────

/**
 * Start the embedded HTTP hook server.
 *
 * Tries port HOOK_PORT (27182). If the port is already in use, logs a warning
 * and continues — Claude Code hooks will fail silently (non-blocking per spec).
 *
 * @returns The http.Server instance (call server.close() on app quit)
 */
export function startHookServer(): http.Server {
  const server = http.createServer((req, res) => {
    // Only accept POST /hooks/*
    if (req.method !== 'POST' || !req.url?.startsWith('/hooks/')) {
      res.writeHead(404)
      res.end()
      return
    }

    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      // Always respond 2xx immediately — hooks must never block Claude Code
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{}')

      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString()) as StopPayload

        if (req.url === '/hooks/stop') {
          handleStop(payload).catch(err =>
            console.error('[hookServer] handleStop error:', err)
          )
        }
      } catch (err) {
        console.warn('[hookServer] Failed to parse hook payload:', err)
      }
    })

    req.on('error', (err) => {
      console.warn('[hookServer] Request error:', err)
      if (!res.headersSent) {
        res.writeHead(200)
        res.end('{}')
      }
    })
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[hookServer] Port ${HOOK_PORT} already in use — hook server disabled. Tokens will not be captured via HTTP hook.`)
    } else {
      console.error('[hookServer] Server error:', err)
    }
  })

  server.listen(HOOK_PORT, '127.0.0.1', () => {
    const addr = server.address()
    const port = typeof addr === 'object' && addr !== null ? addr.port : HOOK_PORT
    console.log(`[hookServer] Listening on 127.0.0.1:${port}`)
  })

  return server
}
