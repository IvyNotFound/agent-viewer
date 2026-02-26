import { ref, readonly } from 'vue'

export type ConfirmType = 'danger' | 'warning' | 'info'

export interface ConfirmOptions {
  title: string
  message: string
  detail?: string
  type?: ConfirmType
  confirmLabel?: string
  cancelLabel?: string
}

interface PendingConfirm {
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

// Module-level singleton: shared across all composable calls
const pending = ref<PendingConfirm | null>(null)

export function useConfirmDialog() {
  function confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (pending.value) {
        pending.value.resolve(false)
      }
      pending.value = { options, resolve }
    })
  }

  function accept() {
    pending.value?.resolve(true)
    pending.value = null
  }

  function cancel() {
    pending.value?.resolve(false)
    pending.value = null
  }

  return { pending: readonly(pending), confirm, accept, cancel }
}
