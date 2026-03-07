import { describe, it, expect } from 'vitest'
import {
  eventIcon,
  toolColor,
  isMcpTool,
  eventColor,
  toolName,
  mcpToolColor,
  EVENT_ICON,
  TOOL_COLOR,
  EVENT_COLOR,
} from './useHookEventDisplay'

describe('useHookEventDisplay — eventIcon() (T779)', () => {
  it('returns correct icon for PreToolUse', () => {
    expect(eventIcon('PreToolUse')).toBe('⚙')
  })

  it('returns correct icon for PostToolUse', () => {
    expect(eventIcon('PostToolUse')).toBe('✓')
  })

  it('returns correct icon for PostToolUseFailure', () => {
    expect(eventIcon('PostToolUseFailure')).toBe('✗')
  })

  it('returns correct icon for SessionStart', () => {
    expect(eventIcon('SessionStart')).toBe('▶')
  })

  it('returns correct icon for Stop', () => {
    expect(eventIcon('Stop')).toBe('■')
  })

  it('returns "·" fallback for unknown event type', () => {
    expect(eventIcon('UnknownEventType')).toBe('·')
    expect(eventIcon('')).toBe('·')
  })

  it('covers all defined EVENT_ICON keys', () => {
    for (const [key, icon] of Object.entries(EVENT_ICON)) {
      expect(eventIcon(key)).toBe(icon)
    }
  })
})

describe('useHookEventDisplay — EVENT_ICON hardcoded values (T1074)', () => {
  it.each([
    ['PreToolUse', '⚙'],
    ['PostToolUse', '✓'],
    ['PostToolUseFailure', '✗'],
    ['SessionStart', '▶'],
    ['SubagentStart', '→'],
    ['SubagentStop', '✕'],
    ['PermissionRequest', '[?]'],
    ['Notification', '[!]'],
    ['UserPromptSubmit', '>'],
    ['PreCompact', '[~]'],
    ['Stop', '■'],
  ] as [string, string][])('EVENT_ICON[%s] === "%s" (not empty)', (key, expected) => {
    expect(EVENT_ICON[key]).toBe(expected)
    expect(EVENT_ICON[key]).not.toBe('')
  })
})

describe('useHookEventDisplay — toolColor() (T779)', () => {
  it('returns text-amber-400 for Bash', () => {
    expect(toolColor('Bash')).toBe('text-amber-400')
  })

  it('returns text-zinc-400 for unknown tool', () => {
    expect(toolColor('UnknownTool')).toBe('text-zinc-400')
    expect(toolColor('')).toBe('text-zinc-400')
  })

  it('returns text-teal-400 for MCP tool (contains ":")', () => {
    expect(toolColor('mcp:something')).toBe('text-teal-400')
    expect(toolColor('server:tool_name')).toBe('text-teal-400')
  })

  it('covers all built-in TOOL_COLOR keys', () => {
    for (const [key, color] of Object.entries(TOOL_COLOR)) {
      expect(toolColor(key)).toBe(color)
    }
  })
})

describe('useHookEventDisplay — TOOL_COLOR hardcoded values (T1074)', () => {
  it.each([
    ['Bash', 'text-amber-400'],
    ['Read', 'text-sky-400'],
    ['Write', 'text-emerald-400'],
    ['Edit', 'text-emerald-400'],
    ['Glob', 'text-violet-400'],
    ['Grep', 'text-violet-400'],
    ['Agent', 'text-pink-400'],
    ['WebFetch', 'text-blue-400'],
    ['WebSearch', 'text-blue-400'],
    ['TodoWrite', 'text-orange-400'],
  ] as [string, string][])('TOOL_COLOR[%s] === "%s" (not empty)', (key, expected) => {
    expect(TOOL_COLOR[key]).toBe(expected)
    expect(TOOL_COLOR[key]).not.toBe('')
  })
})

describe('useHookEventDisplay — EVENT_COLOR hardcoded values (T1074)', () => {
  it.each([
    ['PostToolUseFailure', 'text-red-400'],
    ['PermissionRequest', 'text-amber-400'],
    ['PreCompact', 'text-amber-300'],
  ] as [string, string][])('EVENT_COLOR[%s] === "%s" (not empty)', (key, expected) => {
    expect(EVENT_COLOR[key]).toBe(expected)
    expect(EVENT_COLOR[key]).not.toBe('')
  })
})

describe('useHookEventDisplay — isMcpTool() (T779)', () => {
  it('returns true for tool names containing ":"', () => {
    expect(isMcpTool('mcp:something')).toBe(true)
    expect(isMcpTool('server:read_file')).toBe(true)
  })

  it('returns false for built-in tool names without ":"', () => {
    expect(isMcpTool('Bash')).toBe(false)
    expect(isMcpTool('Read')).toBe(false)
    expect(isMcpTool('')).toBe(false)
  })
})

describe('useHookEventDisplay — mcpToolColor() (T1074)', () => {
  it('returns text-teal-400 (not empty string)', () => {
    expect(mcpToolColor()).toBe('text-teal-400')
    expect(mcpToolColor()).not.toBe('')
  })
})

describe('useHookEventDisplay — eventColor() (T779)', () => {
  it('returns text-red-400 for PostToolUseFailure', () => {
    expect(eventColor('PostToolUseFailure')).toBe('text-red-400')
  })

  it('returns text-amber-400 for PermissionRequest', () => {
    expect(eventColor('PermissionRequest')).toBe('text-amber-400')
  })

  it('returns text-amber-300 for PreCompact', () => {
    expect(eventColor('PreCompact')).toBe('text-amber-300')
  })

  it('returns text-content-subtle fallback for unknown event', () => {
    expect(eventColor('SessionStart')).toBe('text-content-subtle')
    expect(eventColor('UnknownEvent')).toBe('text-content-subtle')
    expect(eventColor('')).toBe('text-content-subtle')
  })

  it('fallback is not empty string', () => {
    expect(eventColor('SomeUnknown')).not.toBe('')
  })
})

describe('useHookEventDisplay — toolName() (T779)', () => {
  it('extracts tool_name from payload', () => {
    expect(toolName({ tool_name: 'Bash' })).toBe('Bash')
  })

  it('returns "?" when tool_name is absent', () => {
    expect(toolName({})).toBe('?')
    expect(toolName(null)).toBe('?')
  })

  it('"?" fallback is not empty string', () => {
    expect(toolName(undefined)).toBe('?')
    expect(toolName({ other_key: 'x' })).toBe('?')
  })
})
