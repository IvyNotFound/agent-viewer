import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useDebouncedFn } from './useDebounce'

describe('useDebouncedFn', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function setup(fn: () => void, delay: number) {
    let debouncedFn!: () => void
    const TestComponent = defineComponent({
      setup() {
        debouncedFn = useDebouncedFn(fn, delay)
      },
      template: '<div/>',
    })
    const wrapper = mount(TestComponent, { attachTo: document.body })
    return { wrapper, getDebouncedFn: () => debouncedFn }
  }

  it('calls fn after the specified delay', async () => {
    const fn = vi.fn()
    const { getDebouncedFn } = setup(fn, 200)
    getDebouncedFn()()
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('resets the timer on repeated calls within delay', () => {
    const fn = vi.fn()
    const { getDebouncedFn } = setup(fn, 200)
    const debounced = getDebouncedFn()
    debounced()
    vi.advanceTimersByTime(100)
    debounced()
    vi.advanceTimersByTime(100)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancels pending timer on component unmount', () => {
    const fn = vi.fn()
    const { wrapper, getDebouncedFn } = setup(fn, 200)
    getDebouncedFn()()
    wrapper.unmount()
    vi.advanceTimersByTime(200)
    expect(fn).not.toHaveBeenCalled()
  })

  it('calls fn multiple times for separate debounce windows', () => {
    const fn = vi.fn()
    const { getDebouncedFn } = setup(fn, 200)
    const debounced = getDebouncedFn()
    debounced()
    vi.advanceTimersByTime(200)
    debounced()
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
