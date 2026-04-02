/**
 * Shared display constants and helpers for Claude Code hook events.
 *
 * Used by HookEventBar.vue, HookEventsView.vue, and other hook-event consumers.
 */

/** Icon/symbol for each hook event type. ASCII only — no emoji. */
export const EVENT_ICON: Record<string, string> = {
  PreToolUse:         '⚙',
  PostToolUse:        '✓',
  PostToolUseFailure: '✗',
  SessionStart:       '▶',
  SubagentStart:      '→',
  SubagentStop:       '✕',
  PermissionRequest:  '[?]',
  Notification:       '[!]',
  UserPromptSubmit:   '>',
  PreCompact:         '[~]',
  Stop:               '■',
}

/** Hex color per built-in tool name. */
export const TOOL_COLOR: Record<string, string> = {
  Bash:      '#fbbf24',
  Read:      '#38bdf8',
  Write:     '#34d399',
  Edit:      '#34d399',
  Glob:      '#a78bfa',
  Grep:      '#a78bfa',
  Agent:     '#f472b6',
  WebFetch:  '#60a5fa',
  WebSearch: '#60a5fa',
  TodoWrite: '#fb923c',
}

/** Hex color for specific event types (overrides default). */
export const EVENT_COLOR: Record<string, string> = {
  PostToolUseFailure: '#f87171',
  PermissionRequest:  '#fbbf24',
  PreCompact:         '#fcd34d',
}

/** Returns true when a tool name is from an MCP server (contains ':'). */
export function isMcpTool(name: string): boolean {
  return name.includes(':')
}

/** Hex color for MCP tools. */
export function mcpToolColor(): string {
  return '#2dd4bf'
}

/** Returns the icon for an event type. Falls back to '·'. */
export function eventIcon(event: string): string {
  return EVENT_ICON[event] ?? '·'
}

/** Returns the hex color for a tool name. */
export function toolColor(name: string): string {
  if (isMcpTool(name)) return mcpToolColor()
  return TOOL_COLOR[name] ?? '#a1a1aa'
}

/** Returns the hex color (or CSS variable) for an event type. */
export function eventColor(event: string): string {
  return EVENT_COLOR[event] ?? 'var(--content-subtle)'
}

/** Extracts tool_name from a hook event payload. Returns '?' if not present. */
export function toolName(payload: unknown): string {
  return (payload as Record<string, unknown>)?.tool_name as string ?? '?'
}
