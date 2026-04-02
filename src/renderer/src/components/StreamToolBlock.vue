<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { StreamContentBlock } from '@renderer/types/stream'

const { t } = useI18n()

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

</script>

<template>
  <!-- tool_use block — carte collapsible couleur agent (T680) -->
  <div
    v-if="block.type === 'tool_use'"
    class="tool-block"
    :style="{ borderColor: accentBorder }"
    data-testid="block-tool-use"
  >
    <button
      class="tool-header"
      :style="{ backgroundColor: accentBg, color: accentFg }"
      @click="emit('toggleCollapsed', collapseKey(eventId, blockIdx), true)"
    >
      <span class="collapse-arrow" :class="isCollapsed(eventId, blockIdx, true) ? '' : 'rotated'">▶</span>
      <span class="tool-name">{{ block.name }}</span>
      <span class="tool-label">{{ t('stream.tool') }}</span>
    </button>
    <div
      v-show="!isCollapsed(eventId, blockIdx, true)"
      class="tool-body"
    >
      <pre>{{ toolInputPreview(block.input) }}</pre>
    </div>
  </div>

  <!-- tool_result block — sortie collapsible + markdown + strip ANSI (T727/T729) -->
  <div
    v-else-if="block.type === 'tool_result'"
    class="tool-block"
    :class="block.is_error ? 'tool-block--error' : 'tool-block--result'"
    data-testid="block-tool-result"
  >
    <button
      class="tool-header tool-header--result"
      :class="block.is_error ? 'tool-header--error' : ''"
      @click="emit('toggleCollapsed', collapseKey(eventId, blockIdx), !block.is_error && !!block._isLong)"
    >
      <span
        class="collapse-arrow"
        :class="isCollapsed(eventId, blockIdx, !block.is_error && !!block._isLong) ? '' : 'rotated'"
      >▶</span>
      <span>{{ block.is_error ? t('stream.error') : t('stream.result') }}</span>
      <span
        v-if="isCollapsed(eventId, blockIdx, !block.is_error && !!block._isLong)"
        class="line-count"
      >({{ block._lineCount ?? 0 }} {{ t('stream.lines') }})</span>
    </button>
    <!-- eslint-disable vue/no-v-html -->
    <div
      v-show="!isCollapsed(eventId, blockIdx, !block.is_error && !!block._isLong)"
      class="stream-markdown tool-body"
      v-html="block._html ?? ''"
    />
    <!-- eslint-enable vue/no-v-html -->
  </div>
</template>

<style scoped>
.tool-block {
  border: 1px solid;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 8px;
}

.tool-block--result {
  border-color: var(--edge-default);
  background-color: var(--surface-primary);
}

.tool-block--error {
  border-color: #7f1d1d;
  background-color: #0c0505;
}

.tool-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 0.75rem;
  border: none;
  text-align: left;
  transition: filter 0.15s;
}
.tool-header:hover {
  filter: brightness(1.1);
}

.tool-header--result {
  background-color: transparent;
  color: var(--content-muted);
}
.tool-header--result:hover {
  background-color: var(--surface-secondary);
  filter: none;
}

.tool-header--error {
  color: #f87171;
}
.tool-header--error:hover {
  background-color: rgba(127, 29, 29, 0.3);
  filter: none;
}

.collapse-arrow {
  transition: transform 0.2s;
  display: inline-block;
}
.collapse-arrow.rotated {
  transform: rotate(90deg);
}

.tool-name {
  font-weight: 600;
}

.tool-label {
  margin-left: auto;
  opacity: 0.6;
}

.line-count {
  margin-left: 4px;
  opacity: 0.6;
}

.tool-body {
  padding: 12px 16px 8px;
  font-size: 0.75rem;
  color: var(--content-muted);
  overflow-x: auto;
  user-select: text;
  cursor: text;
}

.tool-body pre {
  white-space: pre-wrap;
  margin: 0;
}
</style>
