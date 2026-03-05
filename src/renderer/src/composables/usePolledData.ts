import { ref, watch, onUnmounted, type Ref, type WatchSource } from 'vue'

/**
 * Composable for polling data with automatic lifecycle management.
 *
 * Starts polling when `active` becomes truthy, stops when falsy.
 * Skips fetch when document is hidden (saves DB queries on inactive tabs).
 * Cleans up on unmount.
 *
 * @param fetcher - Async function to call on each poll tick.
 * @param active - Reactive source controlling start/stop (e.g. `() => tabId === 'logs'`).
 * @param interval - Poll interval in ms (default 30000).
 */
export function usePolledData(
  fetcher: () => Promise<void>,
  active: WatchSource<boolean>,
  interval = 30000,
): {
  loading: Ref<boolean>
  refresh: () => Promise<void>
} {
  const loading = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null
  let mounted = true

  async function safeFetch(): Promise<void> {
    if (document.visibilityState === 'hidden') return
    loading.value = true
    try {
      await fetcher()
    } finally {
      loading.value = false
    }
  }

  function start() {
    if (!timer && mounted) {
      timer = setInterval(safeFetch, interval)
    }
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  watch(active, (isActive) => {
    if (isActive) {
      safeFetch()
      start()
    } else {
      stop()
    }
  }, { immediate: true })

  onUnmounted(() => {
    mounted = false
    stop()
  })

  return { loading, refresh: safeFetch }
}
