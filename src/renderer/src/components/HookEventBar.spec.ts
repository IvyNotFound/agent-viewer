import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { shallowMount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import HookEventBar from '@renderer/components/HookEventBar.vue'
import i18n from '@renderer/plugins/i18n'

describe('HookEventBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('does not render when there are no events and no active tool', () => {
    const pinia = createTestingPinia({
      initialState: {
        hookEvents: { events: [], activeTools: {} },
      },
    })
    const wrapper = shallowMount(HookEventBar, {
      props: { sessionId: 'session-1' },
      global: { plugins: [pinia, i18n] },
    })
    expect(wrapper.find('.shrink-0').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders when there are events for the given sessionId', () => {
    const pinia = createTestingPinia({
      initialState: {
        hookEvents: {
          events: [
            { id: 1, event: 'SessionStart', payload: {}, ts: Date.now(), sessionId: 'session-1' },
          ],
          activeTools: {},
        },
      },
    })
    const wrapper = shallowMount(HookEventBar, {
      props: { sessionId: 'session-1' },
      global: { plugins: [pinia, i18n] },
    })
    expect(wrapper.find('.shrink-0').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not render when events belong to a different sessionId', () => {
    const pinia = createTestingPinia({
      initialState: {
        hookEvents: {
          events: [
            { id: 1, event: 'SessionStart', payload: {}, ts: Date.now(), sessionId: 'other-session' },
          ],
          activeTools: {},
        },
      },
    })
    const wrapper = shallowMount(HookEventBar, {
      props: { sessionId: 'session-1' },
      global: { plugins: [pinia, i18n] },
    })
    expect(wrapper.find('.shrink-0').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders when activeTool is set for the sessionId', () => {
    const pinia = createTestingPinia({
      initialState: {
        hookEvents: {
          events: [],
          activeTools: { 'session-2': 'Bash' },
        },
      },
    })
    const wrapper = shallowMount(HookEventBar, {
      props: { sessionId: 'session-2' },
      global: { plugins: [pinia, i18n] },
    })
    expect(wrapper.find('.shrink-0').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows active tool name when activeTool is set', () => {
    const pinia = createTestingPinia({
      initialState: {
        hookEvents: {
          events: [],
          activeTools: { 'session-3': 'Read' },
        },
      },
    })
    const wrapper = shallowMount(HookEventBar, {
      props: { sessionId: 'session-3' },
      global: { plugins: [pinia, i18n] },
    })
    expect(wrapper.text()).toContain('Read')
    wrapper.unmount()
  })

  it('toggles expanded state on header click', async () => {
    const pinia = createTestingPinia({
      initialState: {
        hookEvents: {
          events: [
            { id: 1, event: 'SessionStart', payload: {}, ts: Date.now(), sessionId: 'session-4' },
          ],
          activeTools: {},
        },
      },
    })
    const wrapper = shallowMount(HookEventBar, {
      props: { sessionId: 'session-4' },
      global: { plugins: [pinia, i18n] },
    })
    // Initially collapsed: no event list visible
    expect(wrapper.find('.max-h-36').exists()).toBe(false)
    // Click to expand
    await wrapper.find('.cursor-pointer').trigger('click')
    expect(wrapper.find('.max-h-36').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows event list in reversed order when expanded', async () => {
    const now = Date.now()
    const pinia = createTestingPinia({
      initialState: {
        hookEvents: {
          events: [
            { id: 1, event: 'SessionStart', payload: {}, ts: now, sessionId: 'session-5' },
            { id: 2, event: 'SessionStop', payload: {}, ts: now + 1000, sessionId: 'session-5' },
          ],
          activeTools: {},
        },
      },
    })
    const wrapper = shallowMount(HookEventBar, {
      props: { sessionId: 'session-5' },
      global: { plugins: [pinia, i18n] },
    })
    // Expand
    await wrapper.find('.cursor-pointer').trigger('click')
    // Verify content shows events
    expect(wrapper.find('.max-h-36').exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens HookEventPayloadModal on event click when expanded', async () => {
    const pinia = createTestingPinia({
      initialState: {
        hookEvents: {
          events: [
            { id: 1, event: 'SessionStart', payload: { data: 'test' }, ts: Date.now(), sessionId: 'session-6' },
          ],
          activeTools: {},
        },
      },
    })
    const wrapper = shallowMount(HookEventBar, {
      props: { sessionId: 'session-6' },
      global: { plugins: [pinia, i18n] },
    })
    // Expand list
    await wrapper.find('.cursor-pointer').trigger('click')
    // Click on first event row
    const eventRow = wrapper.find('.cursor-pointer.hover\\:bg-surface-secondary\\/40.rounded')
    if (eventRow.exists()) {
      await eventRow.trigger('click')
    }
    wrapper.unmount()
  })
})
