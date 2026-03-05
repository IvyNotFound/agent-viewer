import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { shallowMount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import TaskDependencyGraph from '@renderer/components/TaskDependencyGraph.vue'
import i18n from '@renderer/plugins/i18n'
import type { TaskLink } from '@renderer/types'

function makeLink(overrides: Partial<TaskLink> = {}): TaskLink {
  return {
    id: 1,
    type: 'bloque',
    from_task: 1,
    to_task: 2,
    from_titre: 'Task A',
    from_statut: 'todo',
    to_titre: 'Task B',
    to_statut: 'in_progress',
    ...overrides,
  }
}

describe('TaskDependencyGraph', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows no dependencies message when links array is empty', () => {
    const wrapper = shallowMount(TaskDependencyGraph, {
      props: { taskId: 1, links: [] },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    expect(wrapper.find('p').exists()).toBe(true)
    wrapper.unmount()
  })

  it('outgoing: includes links where this task blocks another (from_task=taskId, type=bloque)', () => {
    const links = [makeLink({ type: 'bloque', from_task: 1, to_task: 2 })]
    const wrapper = shallowMount(TaskDependencyGraph, {
      props: { taskId: 1, links },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    // Should show outgoing section with task 2
    expect(wrapper.text()).toContain('#2')
    wrapper.unmount()
  })

  it('outgoing: includes links where this task depends on another (to_task=taskId, type=dépend_de)', () => {
    const links = [makeLink({ type: 'dépend_de', from_task: 2, to_task: 1, from_titre: 'Task B', to_titre: 'Task A' })]
    const wrapper = shallowMount(TaskDependencyGraph, {
      props: { taskId: 1, links },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    // Link where to_task=taskId and type=dépend_de → outgoing
    expect(wrapper.text()).toContain('#2')
    wrapper.unmount()
  })

  it('incoming: includes links where another task blocks this one (to_task=taskId, type=bloque)', () => {
    const links = [makeLink({ type: 'bloque', from_task: 3, to_task: 1, from_titre: 'Task C', to_titre: 'Task A', from_statut: 'in_progress', to_statut: 'todo' })]
    const wrapper = shallowMount(TaskDependencyGraph, {
      props: { taskId: 1, links },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    // incoming section should show task 3
    expect(wrapper.text()).toContain('#3')
    wrapper.unmount()
  })

  it('incoming: includes links where this task has from_task=taskId and type=dépend_de', () => {
    const links = [makeLink({ type: 'dépend_de', from_task: 1, to_task: 4, to_titre: 'Task D', to_statut: 'done' })]
    const wrapper = shallowMount(TaskDependencyGraph, {
      props: { taskId: 1, links },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    // incoming section should show task 4
    expect(wrapper.text()).toContain('#4')
    wrapper.unmount()
  })

  it('related: includes lié_à links involving this task', () => {
    const links = [makeLink({ type: 'lié_à', from_task: 1, to_task: 5, to_titre: 'Task E', to_statut: 'todo' })]
    const wrapper = shallowMount(TaskDependencyGraph, {
      props: { taskId: 1, links },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    expect(wrapper.text()).toContain('#5')
    wrapper.unmount()
  })

  it('related: includes duplique links involving this task', () => {
    const links = [makeLink({ type: 'duplique', from_task: 6, to_task: 1, from_titre: 'Task F', from_statut: 'todo', to_titre: 'Task A', to_statut: 'todo' })]
    const wrapper = shallowMount(TaskDependencyGraph, {
      props: { taskId: 1, links },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    expect(wrapper.text()).toContain('#6')
    wrapper.unmount()
  })

  it('emits navigate event when a link button is clicked', async () => {
    const links = [makeLink({ type: 'bloque', from_task: 1, to_task: 7, to_titre: 'Task G', to_statut: 'todo' })]
    const wrapper = shallowMount(TaskDependencyGraph, {
      props: { taskId: 1, links },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    // Click the first link button
    const btn = wrapper.find('button')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')![0]).toEqual([7])
    wrapper.unmount()
  })

  it('linkedTaskId returns to_task when from_task equals taskId', () => {
    const links = [makeLink({ type: 'bloque', from_task: 1, to_task: 99 })]
    const wrapper = shallowMount(TaskDependencyGraph, {
      props: { taskId: 1, links },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    expect(wrapper.text()).toContain('#99')
    wrapper.unmount()
  })

  it('linkedTaskId returns from_task when to_task equals taskId', () => {
    const links = [makeLink({ type: 'bloque', from_task: 88, to_task: 1, from_titre: 'Task 88', from_statut: 'todo', to_titre: 'Task A', to_statut: 'todo' })]
    const wrapper = shallowMount(TaskDependencyGraph, {
      props: { taskId: 1, links },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    expect(wrapper.text()).toContain('#88')
    wrapper.unmount()
  })
})
