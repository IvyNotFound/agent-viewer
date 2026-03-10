/**
 * Deep mutation-killing tests for the gemini adapter (T1070, T1245).
 *
 * Targets:
 * - GEMINI_CMD_REGEX: anchors, suffix pattern, invalid chars
 * - buildCommand: binaryName guard (falsy, valid, invalid)
 * - buildCommand: headless mode via -p + --output-format stream-json
 * - parseLine: stream-json format (init, message, result)
 * - singleShotStdin flag
 */

import { describe, it, expect, vi } from 'vitest'

const mockWriteFileSync = vi.hoisted(() => vi.fn())
const mockUnlinkSync = vi.hoisted(() => vi.fn())
vi.mock('fs', () => {
  const fns = { writeFileSync: mockWriteFileSync, unlinkSync: mockUnlinkSync }
  return { default: fns, ...fns }
})

import { geminiAdapter, GEMINI_CMD_REGEX } from './gemini'

// ── GEMINI_CMD_REGEX ──────────────────────────────────────────────────────────

describe('GEMINI_CMD_REGEX', () => {
  it('matches exact "gemini"', () => {
    expect(GEMINI_CMD_REGEX.test('gemini')).toBe(true)
  })

  it('matches "gemini-custom" (valid suffix)', () => {
    expect(GEMINI_CMD_REGEX.test('gemini-custom')).toBe(true)
  })

  it('matches "gemini-123" (numeric suffix)', () => {
    expect(GEMINI_CMD_REGEX.test('gemini-123')).toBe(true)
  })

  it('rejects "gemini-CAPS" (uppercase in suffix)', () => {
    expect(GEMINI_CMD_REGEX.test('gemini-CAPS')).toBe(false)
  })

  it('rejects "not-gemini" (anchor ^ required)', () => {
    expect(GEMINI_CMD_REGEX.test('not-gemini')).toBe(false)
  })

  it('rejects "gemini-" (trailing dash without suffix body)', () => {
    expect(GEMINI_CMD_REGEX.test('gemini-')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(GEMINI_CMD_REGEX.test('')).toBe(false)
  })

  it('rejects "gemini extra" (space — anchor $ required)', () => {
    expect(GEMINI_CMD_REGEX.test('gemini extra')).toBe(false)
  })
})

// ── geminiAdapter.buildCommand ────────────────────────────────────────────────

describe('geminiAdapter.buildCommand', () => {
  it('defaults to "gemini" when binaryName is undefined', () => {
    const spec = geminiAdapter.buildCommand({})
    expect(spec.command).toBe('gemini')
  })

  it('defaults to "gemini" when binaryName is empty string (falsy)', () => {
    const spec = geminiAdapter.buildCommand({ binaryName: '' })
    expect(spec.command).toBe('gemini')
  })

  it('defaults to "gemini" when binaryName fails regex (invalid)', () => {
    const spec = geminiAdapter.buildCommand({ binaryName: 'rm -rf /' })
    expect(spec.command).toBe('gemini')
  })

  it('uses binaryName when it matches GEMINI_CMD_REGEX', () => {
    const spec = geminiAdapter.buildCommand({ binaryName: 'gemini-dev' })
    expect(spec.command).toBe('gemini-dev')
  })

  it('args are empty by default (no initialMessage → interactive fallback)', () => {
    const spec = geminiAdapter.buildCommand({})
    expect(spec.args).toEqual([])
  })

  it('does not include -p by default (no initialMessage provided)', () => {
    const spec = geminiAdapter.buildCommand({})
    expect(spec.args).not.toContain('-p')
  })

  it('includes --output-format stream-json when initialMessage is provided', () => {
    const spec = geminiAdapter.buildCommand({ initialMessage: 'hello' })
    const idx = spec.args.indexOf('--output-format')
    expect(idx).toBeGreaterThan(-1)
    expect(spec.args[idx + 1]).toBe('stream-json')
  })

  it('includes -p <initialMessage> when initialMessage is provided', () => {
    const spec = geminiAdapter.buildCommand({ initialMessage: 'fix the bug' })
    const idx = spec.args.indexOf('-p')
    expect(idx).toBeGreaterThan(-1)
    expect(spec.args[idx + 1]).toBe('fix the bug')
  })

  it('--output-format appears before -p in args', () => {
    const spec = geminiAdapter.buildCommand({ initialMessage: 'test' })
    const fmtIdx = spec.args.indexOf('--output-format')
    const pIdx = spec.args.indexOf('-p')
    expect(fmtIdx).toBeGreaterThan(-1)
    expect(pIdx).toBeGreaterThan(-1)
    expect(fmtIdx).toBeLessThan(pIdx)
  })

  it('does not include --system-prompt (flag does not exist in gemini CLI)', () => {
    const spec = geminiAdapter.buildCommand({ systemPromptFile: '/tmp/sp.txt' })
    expect(spec.args).not.toContain('--system-prompt')
  })

  it('binaryName exact name is in returned command field', () => {
    const spec = geminiAdapter.buildCommand({ binaryName: 'gemini' })
    expect(spec.command).toBe('gemini')
  })
})

// ── geminiAdapter.singleShotStdin ─────────────────────────────────────────────

describe('geminiAdapter.singleShotStdin', () => {
  it('is true (gemini exits after one -p response)', () => {
    expect(geminiAdapter.singleShotStdin).toBe(true)
  })
})

// ── geminiAdapter.formatStdinMessage ─────────────────────────────────────────

describe('geminiAdapter.formatStdinMessage', () => {
  it('returns plain text with trailing newline', () => {
    expect(geminiAdapter.formatStdinMessage?.('hello')).toBe('hello\n')
  })

  it('preserves internal whitespace', () => {
    expect(geminiAdapter.formatStdinMessage?.('hello world')).toBe('hello world\n')
  })

  it('handles empty string', () => {
    expect(geminiAdapter.formatStdinMessage?.('')).toBe('\n')
  })
})

// ── geminiAdapter.parseLine ───────────────────────────────────────────────────

describe('geminiAdapter.parseLine', () => {
  // Blank lines
  it('returns null for empty string', () => {
    expect(geminiAdapter.parseLine('')).toBeNull()
  })

  it('returns null for whitespace-only line', () => {
    expect(geminiAdapter.parseLine('   ')).toBeNull()
  })

  // init event
  it('returns null for type:init (session metadata)', () => {
    const line = JSON.stringify({ type: 'init', session_id: 'abc', model: 'gemini-3' })
    expect(geminiAdapter.parseLine(line)).toBeNull()
  })

  // message events — user role
  it('returns null for type:message role:user (echo of input)', () => {
    const line = JSON.stringify({ type: 'message', role: 'user', content: 'hello' })
    expect(geminiAdapter.parseLine(line)).toBeNull()
  })

  // message events — assistant role (delta chunks)
  it('returns text event for type:message role:assistant delta:true', () => {
    const line = JSON.stringify({ type: 'message', role: 'assistant', content: 'Hello,', delta: true })
    expect(geminiAdapter.parseLine(line)).toEqual({ type: 'text', text: 'Hello,' })
  })

  it('returns text event for type:message role:assistant without delta flag', () => {
    const line = JSON.stringify({ type: 'message', role: 'assistant', content: 'Hello world!' })
    expect(geminiAdapter.parseLine(line)).toEqual({ type: 'text', text: 'Hello world!' })
  })

  it('returns null for type:message role:assistant with empty content', () => {
    const line = JSON.stringify({ type: 'message', role: 'assistant', content: '' })
    expect(geminiAdapter.parseLine(line)).toBeNull()
  })

  // result events
  it('returns null for type:result status:success', () => {
    const line = JSON.stringify({ type: 'result', status: 'success', stats: { total_tokens: 100 } })
    expect(geminiAdapter.parseLine(line)).toBeNull()
  })

  it('returns error event for type:result status:error with string error', () => {
    const line = JSON.stringify({ type: 'result', status: 'error', error: 'rate limit exceeded' })
    const result = geminiAdapter.parseLine(line)
    expect(result).toEqual({ type: 'error', text: 'rate limit exceeded' })
  })

  it('returns error event for type:result status:error with no error field', () => {
    const line = JSON.stringify({ type: 'result', status: 'error' })
    const result = geminiAdapter.parseLine(line)
    expect(result?.type).toBe('error')
    expect(result?.text).toContain('error')
  })

  // Unknown type
  it('returns null for unknown event types (lifecycle metadata)', () => {
    const line = JSON.stringify({ type: 'tool_use', name: 'shell' })
    expect(geminiAdapter.parseLine(line)).toBeNull()
  })

  // Non-JSON fallback
  it('returns text event for non-JSON lines (e.g. "Loaded cached credentials.")', () => {
    expect(geminiAdapter.parseLine('Loaded cached credentials.')).toEqual({
      type: 'text',
      text: 'Loaded cached credentials.',
    })
  })
})
