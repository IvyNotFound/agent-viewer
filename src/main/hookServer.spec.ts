/**
 * Tests for hookServer — JSONL transcript parsing (T737) + exports (T741)
 */
import { describe, it, expect } from 'vitest'
import { parseTokensFromJSONL, HOOK_PORT } from './hookServer'

// ── Constants ─────────────────────────────────────────────────────────────────

describe('hookServer constants', () => {
  it('HOOK_PORT is 27182', () => {
    expect(HOOK_PORT).toBe(27182)
  })

  it('route-to-eventName conversion matches expected values', () => {
    // Inline the same conversion used in startHookServer
    const convert = (url: string) =>
      url.replace('/hooks/', '').replace(/-./g, (m) => m[1].toUpperCase())

    expect(convert('/hooks/session-start')).toBe('sessionStart')
    expect(convert('/hooks/subagent-start')).toBe('subagentStart')
    expect(convert('/hooks/subagent-stop')).toBe('subagentStop')
    expect(convert('/hooks/pre-tool-use')).toBe('preToolUse')
    expect(convert('/hooks/post-tool-use')).toBe('postToolUse')
  })
})

// ── JSONL fixtures ────────────────────────────────────────────────────────────

function makeAssistantLine(opts: {
  stopReason: string | null
  inputTokens?: number
  outputTokens?: number
  cacheRead?: number
  cacheWrite?: number
}): string {
  return JSON.stringify({
    type: 'assistant',
    message: {
      stop_reason: opts.stopReason,
      usage: {
        input_tokens: opts.inputTokens ?? 0,
        output_tokens: opts.outputTokens ?? 0,
        cache_read_input_tokens: opts.cacheRead ?? 0,
        cache_creation_input_tokens: opts.cacheWrite ?? 0,
      }
    }
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('parseTokensFromJSONL', () => {
  it('returns zero counts for empty string', () => {
    expect(parseTokensFromJSONL('')).toEqual({ tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 })
  })

  it('returns zero counts for blank lines only', () => {
    expect(parseTokensFromJSONL('\n\n  \n')).toEqual({ tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 })
  })

  it('ignores non-assistant message types', () => {
    const content = [
      JSON.stringify({ type: 'user', message: { content: 'hello' } }),
      JSON.stringify({ type: 'tool_result', content: 'result' }),
    ].join('\n')
    expect(parseTokensFromJSONL(content)).toEqual({ tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 })
  })

  it('ignores assistant messages with stop_reason = null (streaming start)', () => {
    const content = makeAssistantLine({ stopReason: null, inputTokens: 100, outputTokens: 1 })
    expect(parseTokensFromJSONL(content)).toEqual({ tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 })
  })

  it('counts a single finalized assistant message', () => {
    const content = makeAssistantLine({
      stopReason: 'tool_use',
      inputTokens: 500,
      outputTokens: 150,
      cacheRead: 200,
      cacheWrite: 50,
    })
    expect(parseTokensFromJSONL(content)).toEqual({
      tokensIn: 500,
      tokensOut: 150,
      cacheRead: 200,
      cacheWrite: 50,
    })
  })

  it('sums tokens across multiple finalized messages', () => {
    const content = [
      makeAssistantLine({ stopReason: 'tool_use', inputTokens: 100, outputTokens: 50 }),
      makeAssistantLine({ stopReason: 'end_turn', inputTokens: 200, outputTokens: 80, cacheRead: 30, cacheWrite: 10 }),
    ].join('\n')
    expect(parseTokensFromJSONL(content)).toEqual({
      tokensIn: 300,
      tokensOut: 130,
      cacheRead: 30,
      cacheWrite: 10,
    })
  })

  it('skips streaming entries (stop_reason null) but counts finalized entries', () => {
    const content = [
      // Streaming start — stop_reason null, output_tokens ~1
      makeAssistantLine({ stopReason: null, inputTokens: 500, outputTokens: 1 }),
      // Finalized — same call, full output_tokens
      makeAssistantLine({ stopReason: 'tool_use', inputTokens: 500, outputTokens: 120 }),
    ].join('\n')
    expect(parseTokensFromJSONL(content)).toEqual({
      tokensIn: 500,
      tokensOut: 120,
      cacheRead: 0,
      cacheWrite: 0,
    })
  })

  it('skips malformed JSON lines gracefully', () => {
    const content = [
      'not json at all',
      makeAssistantLine({ stopReason: 'end_turn', inputTokens: 100, outputTokens: 40 }),
      '{broken json',
    ].join('\n')
    expect(parseTokensFromJSONL(content)).toEqual({
      tokensIn: 100,
      tokensOut: 40,
      cacheRead: 0,
      cacheWrite: 0,
    })
  })

  it('ignores assistant messages missing usage field', () => {
    const content = JSON.stringify({ type: 'assistant', message: { stop_reason: 'end_turn' } })
    expect(parseTokensFromJSONL(content)).toEqual({ tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 })
  })

  it('treats missing token sub-fields as 0', () => {
    const content = JSON.stringify({
      type: 'assistant',
      message: {
        stop_reason: 'end_turn',
        usage: { input_tokens: 50 } // output_tokens etc. missing
      }
    })
    expect(parseTokensFromJSONL(content)).toEqual({
      tokensIn: 50,
      tokensOut: 0,
      cacheRead: 0,
      cacheWrite: 0,
    })
  })
})
