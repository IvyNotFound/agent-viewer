<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import type { HookEvent } from '@renderer/stores/hookEvents'

const props = defineProps<{
  event: HookEvent
}>()

const emit = defineEmits<{
  close: []
}>()

const formattedPayload = computed(() =>
  props.event.payload != null
    ? JSON.stringify(props.event.payload, null, 2)
    : null
)

const timestamp = computed(() =>
  new Date(props.event.ts).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
)

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <!-- Modal -->
    <div class="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">
      <!-- Header -->
      <div class="flex items-center gap-3 px-4 py-3 border-b border-zinc-700 shrink-0">
        <span class="text-sm font-semibold text-zinc-100 font-mono">{{ event.event }}</span>
        <span class="text-xs text-zinc-500 font-mono">{{ timestamp }}</span>
        <div class="flex-1" />
        <button
          class="text-zinc-400 hover:text-zinc-200 transition-colors text-lg leading-none"
          @click="emit('close')"
        >
          ×
        </button>
      </div>

      <!-- Payload -->
      <div class="overflow-auto flex-1 p-4">
        <pre
          v-if="formattedPayload"
          class="text-xs font-mono text-zinc-200 whitespace-pre-wrap select-text cursor-text"
        >{{ formattedPayload }}</pre>
        <p v-else class="text-xs text-zinc-500 italic">No payload data</p>
      </div>
    </div>
  </div>
</template>
