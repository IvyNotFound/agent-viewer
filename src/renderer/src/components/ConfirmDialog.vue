<script setup lang="ts">
import { watch, ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirmDialog } from '@renderer/composables/useConfirmDialog'

const { t } = useI18n()
const { pending, accept, cancel } = useConfirmDialog()

const cancelBtn = ref<HTMLButtonElement | null>(null)
const confirmBtn = ref<HTMLButtonElement | null>(null)

// Auto-focus confirm button when dialog opens
watch(pending, (val) => {
  if (val) nextTick(() => confirmBtn.value?.focus())
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    cancel()
    return
  }
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
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="pending"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        tabindex="-1"
        @click.self="cancel"
        @keydown="onKeydown"
      >
        <Transition
          enter-active-class="transition-all duration-150"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition-all duration-100"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="pending"
            class="w-[380px] bg-surface-primary border border-edge-default rounded-xl shadow-2xl overflow-hidden"
            role="alertdialog"
            aria-modal="true"
            :aria-label="pending.options.title"
          >
            <!-- Header with icon -->
            <div class="flex items-start gap-3 px-5 pt-5 pb-3">
              <!-- Icon -->
              <div
                :class="[
                  'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                  pending.options.type === 'danger' ? 'bg-red-500/15' :
                  pending.options.type === 'warning' ? 'bg-amber-500/15' :
                  'bg-blue-500/15'
                ]"
              >
                <!-- Danger icon -->
                <svg
                  v-if="pending.options.type === 'danger'"
                  viewBox="0 0 16 16" fill="currentColor"
                  class="w-4.5 h-4.5 text-red-400"
                >
                  <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                  <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
                </svg>
                <!-- Warning icon -->
                <svg
                  v-else-if="pending.options.type === 'warning'"
                  viewBox="0 0 16 16" fill="currentColor"
                  class="w-4.5 h-4.5 text-amber-400"
                >
                  <path d="M7.938 2.016A.13.13 0 0 1 8.002 2a.13.13 0 0 1 .063.016.146.146 0 0 1 .054.057l6.857 11.667c.036.06.035.124.002.183a.163.163 0 0 1-.054.06.116.116 0 0 1-.066.017H1.146a.115.115 0 0 1-.066-.017.163.163 0 0 1-.054-.06.176.176 0 0 1 .002-.183L7.884 2.073a.147.147 0 0 1 .054-.057zm1.044-.45a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566z"/>
                  <path d="M7.002 12a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 5.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995z"/>
                </svg>
                <!-- Info icon -->
                <svg
                  v-else
                  viewBox="0 0 16 16" fill="currentColor"
                  class="w-4.5 h-4.5 text-blue-400"
                >
                  <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                  <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
                </svg>
              </div>

              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-semibold text-content-primary leading-tight">
                  {{ pending.options.title }}
                </h3>
                <p class="text-sm text-content-secondary mt-1.5 leading-relaxed">
                  {{ pending.options.message }}
                </p>
                <p v-if="pending.options.detail" class="text-xs text-content-subtle mt-1">
                  {{ pending.options.detail }}
                </p>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-edge-subtle bg-surface-base/50">
              <button
                ref="cancelBtn"
                class="px-4 py-2 text-sm text-content-muted hover:text-content-secondary hover:bg-surface-secondary rounded-lg transition-colors"
                @click="cancel"
              >
                {{ pending.options.cancelLabel || t('common.cancel') }}
              </button>
              <button
                ref="confirmBtn"
                :class="[
                  'px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-transparent',
                  pending.options.type === 'danger'
                    ? 'bg-red-600 hover:bg-red-500 text-white focus:ring-red-500'
                    : pending.options.type === 'warning'
                      ? 'bg-amber-600 hover:bg-amber-500 text-white focus:ring-amber-500'
                      : 'bg-blue-600 hover:bg-blue-500 text-white focus:ring-blue-500'
                ]"
                @click="accept"
              >
                {{ pending.options.confirmLabel || t('common.confirm') }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
