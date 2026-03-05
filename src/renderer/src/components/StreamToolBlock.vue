<script setup lang="ts">
import type { StreamContentBlock } from '@renderer/types/stream'

/** Number of lines above which a tool_result is auto-collapsed (T727). */
const TOOL_RESULT_COLLAPSE_THRESHOLD = 15

const props = defineProps<{
  block: StreamContentBlock
  eventId: number
  blockIdx: number
  collapsed: Record<string, boolean>
  accentFg: string
  accentBg: string
  accentBorder: string
}>()

const emit = defineEmits<{
  toggleCollapsed: [key: string, defaultCollapsed: boolean]
}>()

function collapseKey(eventId: number, blockIdx: number): string {
  return `${eventId}-${blockIdx}`
}

function isCollapsed(eventId: number, blockIdx: number, defaultCollapsed = false): boolean {
  const key = collapseKey(eventId, blockIdx)
  return props.collapsed[key] ?? defaultCollapsed
}

function toolInputPreview(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*[mGKHF]/g, '')
}

function toolResultText(content: StreamContentBlock['content']): string {
  if (!content) return ''
  if (typeof content === 'string') return stripAnsi(content)
  if (Array.isArray(content)) {
    return stripAnsi(content.map(c => c.text ?? '').join('\n'))
  }
  return stripAnsi(String(content))
}

function toolResultIsLong(content: StreamContentBlock['content']): boolean {
  return toolResultText(content).split('\n').length > TOOL_RESULT_COLLAPSE_THRESHOLD
}
</script>

<template>
  <!-- tool_use block — carte collapsible couleur agent (T680) -->
  <div
    v-if="block.type === 'tool_use'"
    class="border rounded-lg overflow-hidden"
    :style="{ borderColor: accentBorder }"
    data-testid="block-tool-use"
  >
    <button
      class="w-full flex items-center gap-2 px-3 py-2 transition-colors text-xs"
      :style="{ backgroundColor: accentBg, color: accentFg }"
      @click="emit('toggleCollapsed', collapseKey(eventId, blockIdx), true)"
    >
      <span class="transition-transform duration-200" :class="isCollapsed(eventId, blockIdx, true) ? '' : 'rotate-90'">▶</span>
      <span class="font-semibold">{{ block.name }}</span>
      <span class="ml-auto opacity-60">outil</span>
    </button>
    <div
      v-show="!isCollapsed(eventId, blockIdx, true)"
      class="px-4 py-3 bg-zinc-900 text-xs text-zinc-300 overflow-x-auto select-text cursor-text"
    >
      <pre class="whitespace-pre-wrap">{{ toolInputPreview(block.input) }}</pre>
    </div>
  </div>

  <!-- tool_result block — sortie collapsible + markdown + strip ANSI (T727/T729) -->
  <div
    v-else-if="block.type === 'tool_result'"
    class="border rounded-lg overflow-hidden"
    :class="block.is_error ? 'border-red-800 bg-red-950' : 'border-zinc-700 bg-zinc-900'"
    data-testid="block-tool-result"
  >
    <button
      class="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors"
      :class="block.is_error ? 'text-red-400 hover:bg-red-900' : 'text-zinc-400 hover:bg-zinc-800'"
      @click="emit('toggleCollapsed', collapseKey(eventId, blockIdx), !block.is_error && toolResultIsLong(block.content))"
    >
      <span
        class="transition-transform duration-200"
        :class="isCollapsed(eventId, blockIdx, !block.is_error && toolResultIsLong(block.content)) ? '' : 'rotate-90'"
      >▶</span>
      <span>{{ block.is_error ? '✗ Erreur' : '✓ Résultat' }}</span>
      <span
        v-if="isCollapsed(eventId, blockIdx, !block.is_error && toolResultIsLong(block.content))"
        class="ml-1 opacity-60"
      >({{ toolResultText(block.content).split('\n').length }} lignes)</span>
    </button>
    <!-- eslint-disable vue/no-v-html -->
    <div
      v-show="!isCollapsed(eventId, blockIdx, !block.is_error && toolResultIsLong(block.content))"
      class="stream-markdown px-4 py-2 text-xs text-zinc-300 overflow-x-auto select-text cursor-text"
      v-html="block._html ?? ''"
    />
    <!-- eslint-enable vue/no-v-html -->
  </div>
</template>
