import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@renderer/locales/en.json'
import HookEventPayloadModal from '@renderer/components/HookEventPayloadModal.vue'
import type { HookEvent } from '@renderer/stores/hookEvents'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

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
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('PreToolUse')
    wrapper.unmount()
  })

  it('displays formatted JSON payload', () => {
    const wrapper = mount(HookEventPayloadModal, {
      props: { event: makeEvent() },
      attachTo: document.body,
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('"tool_name"')
    expect(wrapper.text()).toContain('"Bash"')
    wrapper.unmount()
  })

  it('shows "No payload data" when payload is null', () => {
    const wrapper = mount(HookEventPayloadModal, {
      props: { event: makeEvent({ payload: null }) },
      attachTo: document.body,
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('No payload data')
    wrapper.unmount()
  })

  it('emits close when × button clicked', async () => {
    const wrapper = mount(HookEventPayloadModal, {
      props: { event: makeEvent() },
      attachTo: document.body,
      global: { plugins: [i18n] },
    })
    await wrapper.find('v-btn').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits close when backdrop clicked', async () => {
    const wrapper = mount(HookEventPayloadModal, {
      props: { event: makeEvent() },
      attachTo: document.body,
      global: { plugins: [i18n] },
    })
    // v-dialog handles the overlay click; the inner wrapper has @click.self as a test-compat fallback
    await wrapper.find('[data-testid="payload-modal-backdrop"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits close on Escape keydown', async () => {
    const wrapper = mount(HookEventPayloadModal, {
      props: { event: makeEvent() },
      attachTo: document.body,
      global: { plugins: [i18n] },
    })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
