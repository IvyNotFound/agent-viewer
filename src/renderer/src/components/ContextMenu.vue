<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

export interface ContextMenuItem {
  label: string
  action: () => void
  separator?: boolean
}

defineProps<{
  x: number
  y: number
  items: ContextMenuItem[]
}>()

const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[200]"
      @click="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div
        class="absolute bg-surface-primary border border-edge-default rounded-lg shadow-2xl py-1 min-w-[188px]"
        :style="{ left: `${x}px`, top: `${y}px` }"
        @click.stop
      >
        <template v-for="(item, i) in items" :key="i">
          <div v-if="item.separator" class="my-1 border-t border-edge-subtle" />
          <button
            v-else
            class="w-full flex items-center px-3 py-1.5 text-sm text-left text-content-tertiary hover:bg-surface-secondary hover:text-content-primary transition-colors"
            @click="item.action(); emit('close')"
          >
            {{ item.label }}
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>
