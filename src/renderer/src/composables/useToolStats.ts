import { computed } from 'vue'
import { useHookEventsStore } from '@renderer/stores/hookEvents'

export interface ToolStat {
  name: string
  calls: number
  errors: number
  errorRate: number
  avgDurationMs: number | null
}

export function useToolStats() {
  const store = useHookEventsStore()

  const toolStats = computed((): ToolStat[] => {
    const map = new Map<string, { calls: number; errors: number; durations: number[] }>()
    const preByToolUseId = new Map<string, { toolName: string; ts: number }>()

    for (const e of store.events) {
      if (e.event === 'PreToolUse') {
        const name = (e.payload as Record<string, unknown>)?.tool_name as string ?? '?'
        if (!map.has(name)) map.set(name, { calls: 0, errors: 0, durations: [] })
        map.get(name)!.calls++
        if (e.toolUseId) preByToolUseId.set(e.toolUseId, { toolName: name, ts: e.ts })
      } else if (e.event === 'PostToolUse' && e.toolUseId) {
        const pre = preByToolUseId.get(e.toolUseId)
        if (pre) map.get(pre.toolName)?.durations.push(e.ts - pre.ts)
      } else if (e.event === 'PostToolUseFailure') {
        const name = (e.payload as Record<string, unknown>)?.tool_name as string ?? '?'
        const s = map.get(name)
        if (s) s.errors++
      }
    }

    return [...map.entries()]
      .map(([name, s]) => ({
        name,
        calls: s.calls,
        errors: s.errors,
        errorRate: s.calls > 0 ? s.errors / s.calls : 0,
        avgDurationMs: s.durations.length > 0
          ? Math.round(s.durations.reduce((a, b) => a + b, 0) / s.durations.length)
          : null,
      }))
      .sort((a, b) => b.calls - a.calls)
  })

  return { toolStats }
}
