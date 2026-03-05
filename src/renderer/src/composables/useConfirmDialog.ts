/**
 * Composable: promise-based confirm dialog (module-level singleton).
 *
 * Call `confirm(options)` to show the dialog and await the user's decision.
 * Only one dialog can be pending at a time; a second call immediately rejects
 * the previous one with `false`.
 *
 * @example
 * const { confirm } = useConfirmDialog()
 * const ok = await confirm({ title: 'Delete task?', message: 'This cannot be undone.', type: 'danger' })
 * if (ok) await deleteTask(id)
 */
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
  /**
   * Show the confirm dialog and return a promise that resolves with the user's choice.
   * @param options - Dialog configuration (title, message, type, labels)
   * @returns `true` if the user confirmed, `false` if cancelled or superseded
   */
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
