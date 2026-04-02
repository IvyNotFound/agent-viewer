import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ToastContainer from '@renderer/components/ToastContainer.vue'
import { useToast } from '@renderer/composables/useToast'

describe('ToastContainer', () => {
  beforeEach(() => {
    // Clear all toasts before each test
    const { toasts } = useToast()
    toasts.value.splice(0, toasts.value.length)
  })

  afterEach(() => {
    // Clean up singleton toasts to prevent leak between tests
    const { toasts } = useToast()
    toasts.value.splice(0, toasts.value.length)
  })

  it('renders nothing when toasts array is empty', () => {
    const wrapper = mount(ToastContainer)
    // Container div exists but no toast items inside
    const toastItems = wrapper.findAll('.toast-item')
    expect(toastItems).toHaveLength(0)
  })

  it('renders one div per toast with the correct message', async () => {
    const { push } = useToast()
    push('Error happened', 'error', 999999)
    push('Warning here', 'warn', 999999)

    const wrapper = mount(ToastContainer)
    await nextTick()
    const text = wrapper.text()
    expect(text).toContain('Error happened')
    expect(text).toContain('Warning here')
  })

  it('shows correct icon per type (error→✕, warn→⚠, info→ℹ)', async () => {
    const { push } = useToast()
    push('err', 'error', 999999)
    push('wrn', 'warn', 999999)
    push('inf', 'info', 999999)

    const wrapper = mount(ToastContainer)
    await nextTick()
    const text = wrapper.text()
    expect(text).toContain('✕')
    expect(text).toContain('⚠')
    expect(text).toContain('ℹ')
  })

  it('applies correct CSS class per type', async () => {
    const { push } = useToast()
    push('err', 'error', 999999)

    const wrapper = mount(ToastContainer)
    await nextTick()
    const toastDiv = wrapper.find('.toast-error')
    expect(toastDiv.exists()).toBe(true)
  })

  it('clicking dismiss button removes the toast', async () => {
    const { push, toasts } = useToast()
    push('dismiss me', 'error', 999999)
    expect(toasts.value).toHaveLength(1)

    const wrapper = mount(ToastContainer)
    await nextTick()

    // Click the ✕ dismiss button (last button in toast row)
    const dismissBtn = wrapper.find('button')
    await dismissBtn.trigger('click')
    await nextTick()

    expect(toasts.value).toHaveLength(0)
  })
})
