import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { nextTick } from 'vue'
import ToolStatsPanel from '@renderer/components/ToolStatsPanel.vue'
import i18n from '@renderer/plugins/i18n'
import { useHookEventsStore } from '@renderer/stores/hookEvents'

describe('ToolStatsPanel (T842)', () => {
  it('shows empty state when no tool events', () => {
    const wrapper = mount(ToolStatsPanel, {
      global: {
        plugins: [createTestingPinia({ initialState: { hookEvents: { events: [], activeTools: {} } } }), i18n],
      },
    })
    // Empty state message rendered
    const text = wrapper.text()
    // Either the i18n key renders or placeholder text
    expect(wrapper.find('p').exists()).toBe(true)
    wrapper.unmount()
  })

  it('displays tool rows when events contain PreToolUse', async () => {
    const pinia = createTestingPinia({ stubActions: false })
    setActivePinia(pinia)
    const hStore = useHookEventsStore()
    hStore.push({ event: 'PreToolUse', payload: { tool_name: 'Read', session_id: 's1' }, ts: 1000 })
    hStore.push({ event: 'PreToolUse', payload: { tool_name: 'Read', session_id: 's1' }, ts: 2000 })
    hStore.push({ event: 'PreToolUse', payload: { tool_name: 'Bash', session_id: 's1' }, ts: 3000 })

    const wrapper = mount(ToolStatsPanel, {
      global: { plugins: [pinia, i18n] },
    })
    await nextTick()
    const text = wrapper.text()
    expect(text).toContain('Read')
    expect(text).toContain('Bash')
    // Read appears first (2 calls > 1)
    expect(text.indexOf('Read')).toBeLessThan(text.indexOf('Bash'))
    wrapper.unmount()
  })

  it('displays error rate when PostToolUseFailure events present', async () => {
    const pinia = createTestingPinia({ stubActions: false })
    setActivePinia(pinia)
    const hStore = useHookEventsStore()
    hStore.push({ event: 'PreToolUse', payload: { tool_name: 'Bash', session_id: 's1' }, ts: 1000 })
    hStore.push({ event: 'PostToolUseFailure', payload: { tool_name: 'Bash', session_id: 's1' }, ts: 1500 })

    const wrapper = mount(ToolStatsPanel, {
      global: { plugins: [pinia, i18n] },
    })
    await nextTick()
    // 1 error / 1 call = 100% → shows '100%'
    expect(wrapper.text()).toContain('100%')
    wrapper.unmount()
  })

  it('shows avg duration when Pre+Post pairs exist', async () => {
    const pinia = createTestingPinia({ stubActions: false })
    setActivePinia(pinia)
    const hStore = useHookEventsStore()
    hStore.push({ event: 'PreToolUse', payload: { tool_name: 'Read', session_id: 's1', tool_use_id: 'tu1' }, ts: 1000 })
    hStore.push({ event: 'PostToolUse', payload: { session_id: 's1', tool_use_id: 'tu1' }, ts: 2500 })

    const wrapper = mount(ToolStatsPanel, {
      global: { plugins: [pinia, i18n] },
    })
    await nextTick()
    // formatDuration(1500): 1500 >= 1000 → '1.5s'
    expect(wrapper.text()).toContain('1.5s')
    wrapper.unmount()
  })
})
