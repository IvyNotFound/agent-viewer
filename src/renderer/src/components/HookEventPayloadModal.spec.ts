import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import HookEventPayloadModal from '@renderer/components/HookEventPayloadModal.vue'
import type { HookEvent } from '@renderer/stores/hookEvents'

describe('HookEventPayloadModal (T756)', () => {
  const makeEvent = (overrides: Partial<HookEvent> = {}): HookEvent => ({
    id: 1,
    event: 'PreToolUse',
    payload: { tool_name: 'Bash', input: 'ls' },
    ts: 1700000000000,
    sessionId: 'sess-1',
    ...overrides,
  })

  it('renders event type in header', () => {
    const wrapper = mount(HookEventPayloadModal, {
      props: { event: makeEvent() },
      attachTo: document.body,
    })
    expect(wrapper.text()).toContain('PreToolUse')
    wrapper.unmount()
  })

  it('displays formatted JSON payload', () => {
    const wrapper = mount(HookEventPayloadModal, {
      props: { event: makeEvent() },
      attachTo: document.body,
    })
    expect(wrapper.text()).toContain('"tool_name"')
    expect(wrapper.text()).toContain('"Bash"')
    wrapper.unmount()
  })

  it('shows "No payload data" when payload is null', () => {
    const wrapper = mount(HookEventPayloadModal, {
      props: { event: makeEvent({ payload: null }) },
      attachTo: document.body,
    })
    expect(wrapper.text()).toContain('No payload data')
    wrapper.unmount()
  })

  it('emits close when × button clicked', async () => {
    const wrapper = mount(HookEventPayloadModal, {
      props: { event: makeEvent() },
      attachTo: document.body,
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits close when backdrop clicked', async () => {
    const wrapper = mount(HookEventPayloadModal, {
      props: { event: makeEvent() },
      attachTo: document.body,
    })
    // The outermost div is the backdrop
    await wrapper.find('div').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits close on Escape keydown', async () => {
    const wrapper = mount(HookEventPayloadModal, {
      props: { event: makeEvent() },
      attachTo: document.body,
    })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
