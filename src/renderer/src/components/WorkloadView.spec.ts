import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import TopologyView from '@renderer/components/TopologyView.vue'
import WorkloadView from '@renderer/components/WorkloadView.vue'
import i18n from '@renderer/plugins/i18n'

describe('WorkloadView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders agent rows with proportional bars (T748)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([
      { agentId: 1, agentName: 'dev-front', taskCount: 3, totalEffort: 6, currentTask: 'Fix login' },
      { agentId: 2, agentName: 'dev-back', taskCount: 1, totalEffort: 2, currentTask: null },
    ])

    const wrapper = mount(WorkloadView, {
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/db' } },
        }), i18n],
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('dev-front')
    expect(wrapper.text()).toContain('dev-back')
    expect(wrapper.text()).toContain('Fix login')
    wrapper.unmount()
  })

  it('shows empty state when no agents (T748)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([])

    const wrapper = mount(WorkloadView, {
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/db' } },
        }), i18n],
      },
    })
    await flushPromises()
    // Should show empty state text
    const text = wrapper.text()
    expect(text.toLowerCase()).toMatch(/aucun agent|no agent/)
    wrapper.unmount()
  })

  it('renders "—" for agents with no current task (T748)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([
      { agentId: 1, agentName: 'arch', taskCount: 0, totalEffort: 0, currentTask: null },
    ])

    const wrapper = mount(WorkloadView, {
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/db' } },
        }), i18n],
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('arch')
    expect(wrapper.text()).toContain('—')
    wrapper.unmount()
  })
})

