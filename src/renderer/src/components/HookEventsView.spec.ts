import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import HookEventsView from '@renderer/components/HookEventsView.vue'
import i18n from '@renderer/plugins/i18n'

describe('HookEventsView (T758)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows empty state when no events', () => {
    const wrapper = shallowMount(HookEventsView, {
      global: { plugins: [createTestingPinia(), i18n] },
    })
    expect(wrapper.text()).toContain('Aucun événement')
    wrapper.unmount()
  })

  it('filters computed returns all events when filterTypes is empty', () => {
    const pinia = createTestingPinia({
      initialState: {
        hookEvents: {
          events: [
            { id: 1, event: 'PreToolUse', payload: { tool_name: 'Bash' }, ts: Date.now(), sessionId: 'abc' },
            { id: 2, event: 'SessionStart', payload: {}, ts: Date.now(), sessionId: 'abc' },
          ],
          activeTools: {},
        },
      },
    })
    const wrapper = shallowMount(HookEventsView, {
      global: { plugins: [pinia, i18n] },
    })
    // Both events shown (filter empty = all)
    expect(wrapper.text()).toContain('2 events')
    wrapper.unmount()
  })
})
