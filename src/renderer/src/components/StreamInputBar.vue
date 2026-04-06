<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  isStreaming: boolean
  ptyId: string | null
  agentStopped: boolean
  sessionId: string | null
  accentFg: string
}>()

const emit = defineEmits<{
  send: [text: string]
  stop: []
}>()

const inputText = ref('')

defineExpose({ inputText })

function sendMessage(): void {
  const text = inputText.value.trim()
  if (!text || !props.sessionId) return
  emit('send', text)
  inputText.value = ''
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function stopAgent(): void {
  if (!props.ptyId || props.agentStopped) return
  emit('stop')
}
</script>

<template>
  <!-- MD3 divider replaces the border-top CSS (T1687) -->
  <v-divider />
  <!-- ── Input zone (T681: items-end aligne boutons sur bas textarea) ─── -->
  <div class="input-bar d-flex align-end ga-2 px-5 py-4">
    <v-textarea
      v-model="inputText"
      rows="3"
      auto-grow
      variant="outlined"
      rounded="lg"
      :placeholder="t('stream.inputPlaceholder')"
      hide-details
      color="primary"
      base-color="outline"
      class="flex-1-1 text-body-2"
      @keydown="handleKeydown"
    />
    <!-- Stop button (T683, T1536, T1569) — always visible, disabled when not actionable -->
    <v-btn
      icon
      rounded="lg"
      variant="tonal"
      color="error"
      size="x-large"
      class="action-btn"
      :disabled="!isStreaming || !ptyId || agentStopped"
      aria-label="Stop"
      data-testid="stop-button"
      @click="stopAgent"
    >
      <v-icon icon="mdi-stop-circle" size="28" />
    </v-btn>
    <!-- Send button — accent color via CSS v-bind (T1687: preserves MD3 state layers) -->
    <v-btn
      icon
      rounded="lg"
      variant="flat"
      size="x-large"
      :disabled="!inputText.trim() || !sessionId"
      class="action-btn send-btn"
      aria-label="Send"
      data-testid="send-button"
      @click="sendMessage"
    >
      <v-icon icon="mdi-send" size="28" />
    </v-btn>
  </div>
</template>

<style scoped>
.input-bar {
  background: var(--surface-secondary);
  /* Override user-select:none inherited from .main-wrap (App.vue).
     On Windows/Electron, user-select:none on a parent blocks focus and
     keyboard capture in child input elements (T1488). */
  user-select: text;
  pointer-events: auto;
}
/* Explicitly re-enable text input on the native textarea element */
.input-bar :deep(textarea) {
  user-select: text;
  pointer-events: auto;
}
/* Prevent Vuetify's v-field overlay from intercepting pointer events */
.input-bar :deep(.v-field__overlay) {
  pointer-events: none;
}
/* Smooth appearance transition for icon buttons (T1536) */
.action-btn {
  transition: all 150ms ease;
}
/* Send button: accent color via CSS v-bind — preserves Vuetify state layers (T1687) */
.send-btn {
  --send-accent: v-bind(accentFg);
}
.send-btn:not(:disabled) {
  background-color: var(--send-accent) !important;
}
</style>
