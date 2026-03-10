/**
 * Google Gemini CLI adapter for KanbAgent.
 *
 * Headless mode: `gemini -p "<prompt>" --output-format stream-json` emits JSONL events to stdout.
 * No TTY required — stdout is streamed line by line.
 * System prompt injection is not supported via CLI flags; configure via GEMINI.md in project root.
 * Initial prompt is delivered via `-p` positional flag at spawn time.
 * Multi-turn follow-ups require re-spawning with a new `-p` value (not currently supported).
 *
 * @module adapters/gemini
 */
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import type {
  CliAdapter,
  LaunchOpts,
  SpawnSpec,
  SystemPromptResult,
  StreamEvent,
} from '../../shared/cli-types'

/** Validates custom gemini binary names. */
export const GEMINI_CMD_REGEX = /^gemini(-[a-z0-9-]+)?$/

export const geminiAdapter: CliAdapter = {
  cli: 'gemini',
  binaries: ['gemini'],
  singleShotStdin: true,

  buildCommand(opts: LaunchOpts): SpawnSpec {
    const cmd = (opts.binaryName && GEMINI_CMD_REGEX.test(opts.binaryName))
      ? opts.binaryName
      : 'gemini'

    const args: string[] = []

    if (opts.initialMessage) {
      // Headless mode: stream JSONL events to stdout line by line.
      args.push('--output-format', 'stream-json')
      // -p enters non-interactive mode; required for headless operation (no TTY).
      args.push('-p', opts.initialMessage)
    }

    // Note: gemini CLI has no --system-prompt flag.
    // Configure system prompt via GEMINI.md in the project root instead.

    return { command: cmd, args }
  },

  async prepareSystemPrompt(prompt: string, tempDir: string): Promise<SystemPromptResult> {
    const filePath = join(tempDir, `gemini-sp-${Date.now()}.txt`)
    writeFileSync(filePath, prompt, 'utf-8')
    return {
      filePath,
      cleanup: async () => { try { unlinkSync(filePath) } catch { /* best-effort */ } },
    }
  },

  formatStdinMessage(text: string): string {
    // Gemini CLI interactive mode expects plain text input, not Claude JSONL format.
    return text + '\n'
  },

  parseLine(line: string): StreamEvent | null {
    if (!line.trim()) return null
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>
      const evType = parsed.type

      if (evType === 'init') return null  // session metadata, not displayed

      if (evType === 'message') {
        if (parsed.role === 'user') return null  // echo of user input, not displayed
        if (parsed.role === 'assistant') {
          // Both delta (streaming chunks) and non-delta (final) assistant messages
          const content = typeof parsed.content === 'string' ? parsed.content : ''
          if (!content) return null
          return { type: 'text', text: content }
        }
        return null
      }

      if (evType === 'result') {
        if (parsed.status === 'success') return null  // lifecycle metadata, not displayed
        // Error result
        const errMsg = typeof parsed.error === 'string'
          ? parsed.error
          : `Process exited with status: ${String(parsed.status)}`
        return { type: 'error', text: errMsg }
      }

      // Unknown type — ignore lifecycle metadata
      return null
    } catch {
      // Non-JSON line (e.g. "Loaded cached credentials.") — surface as text
      return { type: 'text', text: line }
    }
  },
}
