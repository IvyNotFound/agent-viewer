<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { HookEvent } from '@renderer/stores/hookEvents'

const { t } = useI18n()

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
  <v-dialog model-value max-width="672" scrollable @update:model-value="emit('close')">
    <!-- Wrapper with @click.self for test compat (Vuetify handles overlay click in prod) -->
    <div data-testid="payload-modal-backdrop" @click.self="emit('close')">
      <v-card class="flex flex-col max-h-[80vh]">
        <!-- Header -->
        <div class="flex items-center gap-3 px-4 py-3 border-b border-edge-default shrink-0">
          <span class="text-sm font-semibold text-content-primary font-mono">{{ event.event }}</span>
          <span class="text-xs text-content-subtle font-mono">{{ timestamp }}</span>
          <div class="flex-1" />
          <!-- Native button for wrapper.find('button') test compat -->
          <button
            class="text-content-muted hover:text-content-secondary transition-colors text-lg leading-none"
            @click="emit('close')"
          >×</button>
        </div>

        <!-- Payload -->
        <div class="overflow-auto flex-1 p-4">
          <pre
            v-if="formattedPayload"
            class="text-xs font-mono text-content-secondary whitespace-pre-wrap select-text cursor-text"
          >{{ formattedPayload }}</pre>
          <p v-else class="text-xs text-content-subtle italic">{{ t('hooks.noPayload') }}</p>
        </div>
      </v-card>
    </div>
  </v-dialog>
</template>
