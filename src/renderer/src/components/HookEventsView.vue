<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useHookEventsStore, type HookEvent } from '@renderer/stores/hookEvents'
import { EVENT_ICON, eventIcon, toolColor, eventColor, toolName } from '@renderer/composables/useHookEventDisplay'
import HookEventPayloadModal from './HookEventPayloadModal.vue'

const store = useHookEventsStore()

const filterTypes = ref<string[]>([])
const stickyScroll = ref(true)
const selectedEvent = ref<HookEvent | null>(null)
const listRef = ref<HTMLElement | null>(null)

const ALL_TYPES = Object.keys(EVENT_ICON)

function toggleType(t: string): void {
  const idx = filterTypes.value.indexOf(t)
  if (idx >= 0) filterTypes.value.splice(idx, 1)
  else filterTypes.value.push(t)
}

const filtered = computed(() => {
  const types = filterTypes.value
  return store.events
    .filter(e => !types.length || types.includes(e.event))
    .slice()
    .reverse()
})

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  return `${Math.floor(diff / 3600)}h`
}

function scrollToBottom(): void {
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
  })
}

watch(() => store.events.length, () => {
  if (stickyScroll.value) scrollToBottom()
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden bg-surface-primary">
    <!-- Header filters -->
    <div class="flex items-center gap-2 px-3 py-2 border-b border-edge-subtle shrink-0 flex-wrap">
      <span class="text-xs text-content-faint font-semibold mr-1">Filtres :</span>
      <button
        v-for="t in ALL_TYPES"
        :key="t"
        class="text-[11px] font-mono px-2 py-0.5 rounded border transition-colors"
        :class="filterTypes.includes(t)
          ? 'border-amber-500 text-amber-300 bg-amber-950/40'
          : 'border-edge-subtle text-content-subtle hover:text-content-secondary hover:border-edge-default'"
        @click="toggleType(t)"
      >
        {{ EVENT_ICON[t] }} {{ t }}
      </button>
      <div class="flex-1" />
      <span class="text-[11px] text-content-faint font-mono tabular-nums">
        {{ filtered.length }} event{{ filtered.length !== 1 ? 's' : '' }}
      </span>
      <button
        class="text-[11px] px-2 py-0.5 rounded border transition-colors"
        :class="stickyScroll
          ? 'border-sky-600 text-sky-300 bg-sky-950/40'
          : 'border-edge-subtle text-content-subtle hover:text-content-secondary'"
        title="Auto-scroll"
        @click="stickyScroll = !stickyScroll"
      >
        ↓ scroll
      </button>
    </div>

    <!-- Event list -->
    <div
      ref="listRef"
      class="flex-1 overflow-y-auto px-3 py-2 space-y-0.5"
    >
      <div
        v-if="filtered.length === 0"
        class="flex items-center justify-center h-full text-content-faint text-xs italic"
      >
        Aucun événement
      </div>
      <div
        v-for="e in filtered"
        :key="e.id"
        class="flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-surface-secondary/40 transition-colors"
        @click="selectedEvent = e"
      >
        <!-- Event icon -->
        <span class="text-[11px] text-content-faint font-mono shrink-0 w-4 text-center">
          {{ eventIcon(e.event) }}
        </span>
        <!-- Event type / tool name -->
        <span
          class="text-[11px] font-mono shrink-0"
          :class="['PreToolUse','PostToolUse','PostToolUseFailure'].includes(e.event)
            ? toolColor(toolName(e.payload))
            : eventColor(e.event)"
        >
          {{ ['PreToolUse','PostToolUse','PostToolUseFailure'].includes(e.event) ? toolName(e.payload) : e.event }}
        </span>
        <!-- Session ID short -->
        <span class="text-[10px] text-content-faint font-mono truncate flex-1">
          {{ e.sessionId ? e.sessionId.slice(0, 8) : '—' }}
        </span>
        <!-- Relative timestamp -->
        <span class="text-[10px] text-content-faint font-mono tabular-nums shrink-0">
          {{ relativeTime(e.ts) }}
        </span>
      </div>
    </div>
  </div>

  <!-- Payload modal -->
  <Teleport to="body">
    <HookEventPayloadModal
      v-if="selectedEvent"
      :event="selectedEvent"
      @close="selectedEvent = null"
    />
  </Teleport>
</template>
