import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { usePolledData } from './usePolledData'

// Helper: mount a component that uses usePolledData and returns the composable return values
function mountWithPolledData(
  fetcher: () => Promise<void>,
  active: ReturnType<typeof ref<boolean>>,
  interval?: number,
) {
  let result: ReturnType<typeof usePolledData> | undefined
  const TestComp = defineComponent({
    setup() {
      result = usePolledData(fetcher, active, interval)
    },
    template: '<div/>',
  })
  const wrapper = mount(TestComp, { attachTo: document.body })
  return { wrapper, get result() { return result! } }
}

describe('usePolledData (T784)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls fetcher immediately when active=true at mount', async () => {
    const fetcher = vi.fn().mockResolvedValue(undefined)
    const active = ref(true)
    const { wrapper } = mountWithPolledData(fetcher, active)
    await nextTick()
    expect(fetcher).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('does NOT call fetcher when active=false at mount', async () => {
    const fetcher = vi.fn().mockResolvedValue(undefined)
    const active = ref(false)
    const { wrapper } = mountWithPolledData(fetcher, active)
    await nextTick()
    expect(fetcher).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('creates interval with the provided interval value', async () => {
    const fetcher = vi.fn().mockResolvedValue(undefined)
    const active = ref(true)
    const { wrapper } = mountWithPolledData(fetcher, active, 5000)
    await nextTick()
    // After 5000ms, should fire again
    vi.advanceTimersByTime(5000)
    await nextTick()
    expect(fetcher).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('does NOT call fetcher when document.visibilityState === "hidden"', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    const fetcher = vi.fn().mockResolvedValue(undefined)
    const active = ref(true)
    const { wrapper } = mountWithPolledData(fetcher, active, 1000)
    await nextTick()
    vi.advanceTimersByTime(2000)
    await nextTick()
    expect(fetcher).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('stops interval when active changes to false', async () => {
    const fetcher = vi.fn().mockResolvedValue(undefined)
    const active = ref(true)
    const { wrapper } = mountWithPolledData(fetcher, active, 1000)
    await nextTick()
    expect(fetcher).toHaveBeenCalledTimes(1)

    active.value = false
    await nextTick()
    vi.advanceTimersByTime(3000)
    await nextTick()
    // No additional calls after deactivation
    expect(fetcher).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('clears interval on unmount', async () => {
    const fetcher = vi.fn().mockResolvedValue(undefined)
    const active = ref(true)
    const { wrapper } = mountWithPolledData(fetcher, active, 1000)
    await nextTick()
    expect(fetcher).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('sets loading=true during fetch and loading=false after', async () => {
    let resolveFn!: () => void
    const fetcher = vi.fn().mockImplementation(() => new Promise<void>(resolve => { resolveFn = resolve }))
    const active = ref(true)
    const { wrapper, result } = mountWithPolledData(fetcher, active)
    await nextTick()
    expect(result.loading.value).toBe(true)

    resolveFn()
    await nextTick()
    expect(result.loading.value).toBe(false)
    wrapper.unmount()
  })

  it('sets loading=false after fetch error', async () => {
    // fetcher throws synchronously inside an async fn — caught by try/finally
    const fetcher = vi.fn().mockImplementation(async () => { throw new Error('fail') })
    const active = ref(false) // start inactive to control timing
    const { wrapper, result } = mountWithPolledData(fetcher, active)
    await nextTick()
    // Manually call refresh() to trigger fetch — catch the error so it doesn't propagate
    await result.refresh().catch(() => {})
    expect(result.loading.value).toBe(false)
    wrapper.unmount()
  })

  it('refresh() calls fetcher immediately', async () => {
    const fetcher = vi.fn().mockResolvedValue(undefined)
    const active = ref(false)
    const { wrapper, result } = mountWithPolledData(fetcher, active, 1000)
    await nextTick()
    expect(fetcher).not.toHaveBeenCalled()

    await result.refresh()
    expect(fetcher).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
