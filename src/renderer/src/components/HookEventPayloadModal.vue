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
      <v-card class="payload-card">
        <!-- Header -->
        <div class="modal-header">
          <span class="text-subtitle-2 font-weight-medium font-mono">{{ event.event }}</span>
          <span class="text-caption text-disabled font-mono">{{ timestamp }}</span>
          <div class="flex-grow-1" />
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            density="compact"
            class="close-btn"
            @click="emit('close')"
          />
        </div>

        <!-- Payload -->
        <div class="payload-body pa-4">
          <pre
            v-if="formattedPayload"
            class="payload-pre"
          >{{ formattedPayload }}</pre>
          <p v-else class="text-caption text-disabled font-italic">{{ t('hooks.noPayload') }}</p>
        </div>
      </v-card>
    </div>
  </v-dialog>
</template>

<style scoped>
.payload-card {
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  flex-shrink: 0;
}

.close-btn {
  opacity: 0.5;
}
.close-btn:hover { opacity: 1; }

.payload-body {
  overflow: auto;
  flex: 1;
}

.payload-pre {
  font-size: 0.75rem;
  font-family: monospace;
  white-space: pre-wrap;
  user-select: text;
  cursor: text;
}
</style>
