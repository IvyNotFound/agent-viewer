<script setup lang="ts">
import { ref } from 'vue'

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
  <!-- ── Input zone (T681: items-end aligne boutons sur bas textarea) ─── -->
  <div class="input-bar">
    <textarea
      v-model="inputText"
      rows="2"
      placeholder="Envoyer un message…"
      class="input-textarea"
      @keydown="handleKeydown"
    />
    <!-- Stop button (T683) — visible only while agent is streaming and not yet stopped -->
    <button
      v-if="isStreaming && ptyId && !agentStopped"
      class="btn-stop"
      data-testid="stop-button"
      @click="stopAgent"
    >
      Stop
    </button>
    <!-- Send button — couleur agent quand actif, surface-tertiary quand disabled (T680) -->
    <button
      :disabled="!inputText.trim() || !sessionId"
      class="btn-send"
      data-testid="send-button"
      :style="inputText.trim() && sessionId ? { backgroundColor: accentFg } : {}"
      @click="sendMessage"
    >
      Envoyer
    </button>
  </div>
</template>

<style scoped>
.input-bar {
  border-top: 1px solid var(--edge-subtle);
  padding: 12px 16px;
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.input-textarea {
  flex: 1;
  resize: none;
  background: var(--surface-secondary);
  border: 1px solid var(--edge-default);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.875rem;
  color: var(--content-primary);
  outline: none;
  transition: border-color 0.15s;
  font-family: inherit;
}
.input-textarea::placeholder {
  color: var(--content-faint);
}
.input-textarea:focus {
  border-color: var(--content-subtle);
  box-shadow: 0 0 0 1px var(--content-subtle);
}

.btn-stop,
.btn-send {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: filter 0.15s;
  align-self: flex-end;
  color: #fff;
  white-space: nowrap;
}

.btn-stop {
  background-color: #b91c1c;
}
.btn-stop:hover {
  filter: brightness(1.15);
}

.btn-send:disabled {
  background-color: var(--surface-tertiary) !important;
  color: var(--content-subtle);
  cursor: not-allowed;
}
.btn-send:not(:disabled):hover {
  filter: brightness(1.1);
}
</style>
