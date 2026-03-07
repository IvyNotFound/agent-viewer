import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import i18n from '@renderer/plugins/i18n'
import TopologyView from '@renderer/components/TopologyView.vue'

describe('TopologyView (T750)', () => {
  beforeEach(() => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb = vi.fn()
  })

  it('renders agent cards grouped by perimetre (T750)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([
      { id: 1, name: 'dev-front', type: 'dev', scope: 'front-vuejs', session_status: 'started', session_tokens: 1200, current_task: 'Build UI' },
      { id: 2, name: 'dev-back', type: 'dev', scope: 'back-electron', session_status: null, session_tokens: null, current_task: null },
    ])

    const wrapper = mount(TopologyView, {
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/db' } },
        }), i18n],
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('dev-front')
    expect(wrapper.text()).toContain('dev-back')
    expect(wrapper.text()).toContain('front-vuejs')
    expect(wrapper.text()).toContain('Build UI')
    wrapper.unmount()
  })

  it('shows empty state when no agents returned (T750)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([])

    const wrapper = mount(TopologyView, {
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/db' } },
        }), i18n],
      },
    })
    await flushPromises()
    const text = wrapper.text().toLowerCase()
    expect(text).toMatch(/no agents|aucun agent/)
    wrapper.unmount()
  })

  it('groups agents with null perimetre into global column (T750)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([
      { id: 3, name: 'arch', type: 'arch', scope: null, session_status: null, session_tokens: null, current_task: null },
    ])

    const wrapper = mount(TopologyView, {
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/db' } },
        }), i18n],
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('arch')
    // Global column header should appear
    const text = wrapper.text().toLowerCase()
    expect(text).toMatch(/global/)
    wrapper.unmount()
  })

  it('sets selectedAgentId on agent card click (T750)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([
      { id: 1, name: 'dev-front', type: 'dev', scope: 'front', session_status: null, session_tokens: null, current_task: null },
    ])

    const pinia = createTestingPinia({
      initialState: { tasks: { dbPath: '/p/db' }, tabs: { activeTabId: 'topology' } },
      stubActions: false,
    })
    const wrapper = mount(TopologyView, {
      global: { plugins: [pinia, i18n] },
    })
    await flushPromises()
    // Click the agent card button
    const btn = wrapper.find('button[title]')
    await btn.trigger('click')
    const { useTasksStore: getTasksStore } = await import('@renderer/stores/tasks')
    const tasksStore = getTasksStore(pinia)
    expect(tasksStore.selectedAgentId).toBe(1)
    wrapper.unmount()
  })
})
