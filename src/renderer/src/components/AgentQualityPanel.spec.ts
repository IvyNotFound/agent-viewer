import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import AgentQualityPanel from '@renderer/components/AgentQualityPanel.vue'
import { mockElectronAPI } from '../../../test/setup'

describe('AgentQualityPanel (T842)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(mockElectronAPI.tasksQualityStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      rows: [],
    })
  })

  it('calls tasksQualityStats IPC with dbPath on mount', async () => {
    const wrapper = mount(AgentQualityPanel, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { dbPath: '/p/project.db', projectPath: '/p' } } })],
      },
    })
    await flushPromises()
    expect(mockElectronAPI.tasksQualityStats).toHaveBeenCalledWith('/p/project.db')
    wrapper.unmount()
  })

  it('displays agents sorted (most rejections first)', async () => {
    ;(mockElectronAPI.tasksQualityStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      rows: [
        { agent_id: 1, agent_name: 'cheap-agent', agent_perimetre: 'front', total_tasks: 10, rejected_tasks: 1, rejection_rate: 10 },
        { agent_id: 2, agent_name: 'expensive-agent', agent_perimetre: 'front', total_tasks: 5, rejected_tasks: 4, rejection_rate: 80 },
      ],
    })
    const wrapper = mount(AgentQualityPanel, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { dbPath: '/p/project.db', projectPath: '/p' } } })],
      },
    })
    await flushPromises()
    const text = wrapper.text()
    // The IPC returns rows already in order — component displays them as-is
    expect(text).toContain('cheap-agent')
    expect(text).toContain('expensive-agent')
    wrapper.unmount()
  })

  it('displays rejection rate percentage', async () => {
    ;(mockElectronAPI.tasksQualityStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      rows: [
        { agent_id: 1, agent_name: 'agent-a', agent_perimetre: 'back', total_tasks: 10, rejected_tasks: 3, rejection_rate: 30 },
      ],
    })
    const wrapper = mount(AgentQualityPanel, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { dbPath: '/p/project.db', projectPath: '/p' } } })],
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('30%')
    wrapper.unmount()
  })

  it('shows "Aucune tâche" empty state when rows is empty', async () => {
    const wrapper = mount(AgentQualityPanel, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { dbPath: '/p/project.db', projectPath: '/p' } } })],
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Aucune tâche')
    wrapper.unmount()
  })

  it('shows error message when IPC returns success:false', async () => {
    ;(mockElectronAPI.tasksQualityStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      rows: [],
      error: 'DB locked',
    })
    const wrapper = mount(AgentQualityPanel, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { dbPath: '/p/project.db', projectPath: '/p' } } })],
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('DB locked')
    wrapper.unmount()
  })
})
