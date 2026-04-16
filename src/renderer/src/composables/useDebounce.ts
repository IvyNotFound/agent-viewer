import { onUnmounted } from 'vue'

/**
 * Returns a debounced wrapper around `fn` that delays execution by `delay` ms.
 * Any pending call is cancelled automatically when the component unmounts.
 */
export function useDebouncedFn(fn: () => void, delay: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  onUnmounted(() => {
    if (timer !== null) clearTimeout(timer)
  })

  return () => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(fn, delay)
  }
}
