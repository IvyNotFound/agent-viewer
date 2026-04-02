<script setup lang="ts">
import { watch, ref, nextTick, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirmDialog } from '@renderer/composables/useConfirmDialog'

const { t } = useI18n()
const { pending, accept, cancel } = useConfirmDialog()

const cancelBtn = ref<HTMLButtonElement | null>(null)
const confirmBtn = ref<HTMLButtonElement | null>(null)

const isOpen = computed(() => !!pending.value)

// Auto-focus confirm button when dialog opens
watch(pending, (val) => {
  if (val) nextTick(() => confirmBtn.value?.focus())
})

// Document-level Escape listener — works with v-dialog AND in unit tests
let escListener: ((e: KeyboardEvent) => void) | null = null
watch(pending, (val) => {
  if (val && !escListener) {
    escListener = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel() }
    document.addEventListener('keydown', escListener)
  } else if (!val && escListener) {
    document.removeEventListener('keydown', escListener)
    escListener = null
  }
})

onUnmounted(() => {
  if (escListener) document.removeEventListener('keydown', escListener)
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    const focusable = [cancelBtn.value, confirmBtn.value].filter(Boolean) as HTMLElement[]
    if (focusable.length === 0) return
    const current = document.activeElement
    const idx = focusable.indexOf(current as HTMLElement)
    if (e.shiftKey) {
      const next = idx <= 0 ? focusable[focusable.length - 1] : focusable[idx - 1]
      next.focus()
    } else {
      const next = idx >= focusable.length - 1 ? focusable[0] : focusable[idx + 1]
      next.focus()
    }
    e.preventDefault()
  }
}

const confirmBtnColor = computed(() =>
  pending.value?.options.type === 'danger' ? 'error' :
  pending.value?.options.type === 'warning' ? 'warning' : 'primary'
)
</script>

<template>
  <v-dialog :model-value="isOpen" max-width="420" persistent @update:model-value="cancel">
    <v-card
      v-if="pending"
      role="alertdialog"
      aria-modal="true"
      :aria-label="pending.options.title"
      @keydown="onKeydown"
    >
      <!-- Header with icon -->
      <v-card-text class="pa-5 pb-3">
        <div class="d-flex align-start ga-3">
          <!-- Icon wrapper -->
          <div
            class="icon-wrapper d-flex align-center justify-center"
            :class="[
              pending.options.type === 'danger' ? 'icon-danger' :
              pending.options.type === 'warning' ? 'icon-warning' :
              'icon-info'
            ]"
          >
            <!-- Danger icon -->
            <svg
              v-if="pending.options.type === 'danger'"
              viewBox="0 0 16 16" fill="currentColor"
              class="icon-svg icon-svg--danger"
            >
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
              <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
            </svg>
            <!-- Warning icon -->
            <svg
              v-else-if="pending.options.type === 'warning'"
              viewBox="0 0 16 16" fill="currentColor"
              class="icon-svg icon-svg--warning"
            >
              <path d="M7.938 2.016A.13.13 0 0 1 8.002 2a.13.13 0 0 1 .063.016.146.146 0 0 1 .054.057l6.857 11.667c.036.06.035.124.002.183a.163.163 0 0 1-.054.06.116.116 0 0 1-.066.017H1.146a.115.115 0 0 1-.066-.017.163.163 0 0 1-.054-.06.176.176 0 0 1 .002-.183L7.884 2.073a.147.147 0 0 1 .054-.057zm1.044-.45a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566z"/>
              <path d="M7.002 12a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 5.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995z"/>
            </svg>
            <!-- Info icon -->
            <svg
              v-else
              viewBox="0 0 16 16" fill="currentColor"
              class="icon-svg icon-svg--info"
            >
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
              <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
            </svg>
          </div>

          <div class="flex-grow-1 content-text">
            <h3 class="text-subtitle-2 font-weight-medium">
              {{ pending.options.title }}
            </h3>
            <p class="text-body-2 text-medium-emphasis mt-2">
              {{ pending.options.message }}
            </p>
            <p v-if="pending.options.detail" class="text-caption text-disabled mt-1">
              {{ pending.options.detail }}
            </p>
          </div>
        </div>
      </v-card-text>

      <!-- Actions -->
      <v-card-actions class="px-5 py-4 actions-border">
        <v-spacer />
        <button
          ref="cancelBtn"
          class="btn-cancel"
          @click="cancel"
        >
          {{ pending.options.cancelLabel || t('common.cancel') }}
        </button>
        <button
          ref="confirmBtn"
          class="btn-confirm"
          :class="[
            pending.options.type === 'danger' ? 'btn-confirm--danger'
            : pending.options.type === 'warning' ? 'btn-confirm--warning'
            : 'btn-confirm--info'
          ]"
          @click="accept"
        >
          {{ pending.options.confirmLabel || t('common.confirm') }}
        </button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.icon-wrapper {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  flex-shrink: 0;
}
.icon-danger  { background-color: rgb(239 68 68 / 0.15); }
.icon-warning { background-color: rgb(245 158 11 / 0.15); }
.icon-info    { background-color: rgb(59 130 246 / 0.15); }

.icon-svg {
  width: 18px;
  height: 18px;
}
.icon-svg--danger  { color: rgb(248 113 113); }
.icon-svg--warning { color: rgb(251 191 36); }
.icon-svg--info    { color: rgb(96 165 250); }

.content-text { min-width: 0; }

.actions-border {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.btn-cancel {
  padding: 8px 16px;
  font-size: 0.875rem;
  border-radius: 8px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  transition: background-color 0.15s, color 0.15s;
}
.btn-cancel:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.87);
}

.btn-confirm {
  padding: 8px 16px;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 8px;
  color: #fff;
  transition: background-color 0.15s;
}
.btn-confirm:focus { outline: none; }
.btn-confirm:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
.btn-confirm--danger  { background-color: rgb(220 38 38); }
.btn-confirm--danger:hover  { background-color: rgb(239 68 68); }
.btn-confirm--warning { background-color: rgb(217 119 6); }
.btn-confirm--warning:hover { background-color: rgb(245 158 11); }
.btn-confirm--info    { background-color: rgb(37 99 235); }
.btn-confirm--info:hover    { background-color: rgb(59 130 246); }
</style>
