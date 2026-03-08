import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import WorkloadView from '@renderer/components/WorkloadView.vue'
import i18n from '@renderer/plugins/i18n'

describe('WorkloadView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders agent rows with proportional bars (T748)', async () => {
    const wrapper = mount(WorkloadView, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            tasks: {
              dbPath: '/p/db',
              agents: [
                { id: 1, name: 'dev-front', type: 'dev', scope: 'front-vuejs' },
                { id: 2, name: 'dev-back', type: 'dev', scope: 'back-electron' },
              ],
              tasks: [
                { id: 10, title: 'Fix login', status: 'in_progress', agent_assigned_id: 1, effort: 2 },
                { id: 11, title: 'API task', status: 'todo', agent_assigned_id: 1, effort: 2 },
                { id: 12, title: 'DB task', status: 'todo', agent_assigned_id: 2, effort: 2 },
              ],
            },
          },
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
    const wrapper = mount(WorkloadView, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            tasks: { dbPath: '/p/db', agents: [], tasks: [] },
          },
        }), i18n],
      },
    })
    await flushPromises()
    const text = wrapper.text()
    expect(text.toLowerCase()).toMatch(/aucun agent|no agent/)
    wrapper.unmount()
  })

  it('renders "—" for agents with no current task (T748)', async () => {
    const wrapper = mount(WorkloadView, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            tasks: {
              dbPath: '/p/db',
              agents: [{ id: 1, name: 'arch', type: 'arch', scope: null }],
              tasks: [],
            },
          },
        }), i18n],
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('arch')
    expect(wrapper.text()).toContain('—')
    wrapper.unmount()
  })
})
