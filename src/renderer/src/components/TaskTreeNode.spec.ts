import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { shallowMount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import TaskTreeNode from '@renderer/components/TaskTreeNode.vue'
import i18n from '@renderer/plugins/i18n'
import type { TaskNode } from '@renderer/utils/taskTree'

function makeNode(overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id: 1,
    title: 'Root Task',
    description: null,
    status: 'todo',
    scope: 'front-vuejs',
    effort: 2,
    agent_assigned_id: 1,
    agent_name: 'dev-front',
    agent_scope: 'front-vuejs',
    agent_creator_id: null,
    agent_creator_name: null,
    agent_validator_id: null,
    parent_task_id: null,
    session_id: null,
    priority: 'normal',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    started_at: null,
    completed_at: null,
    validated_at: null,
    depth: 0,
    children: [],
    ...overrides,
  } as unknown as TaskNode
}

describe('TaskTreeNode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders task title', () => {
    const node = makeNode({ title: 'My Task Title' })
    const wrapper = shallowMount(TaskTreeNode, {
      props: { node },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    expect(wrapper.text()).toContain('My Task Title')
    wrapper.unmount()
  })

  it('renders task id', () => {
    const node = makeNode({ id: 42 })
    const wrapper = shallowMount(TaskTreeNode, {
      props: { node },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    expect(wrapper.text()).toContain('#42')
    wrapper.unmount()
  })

  it('does not show expand button for leaf nodes (no children)', () => {
    const node = makeNode({ children: [] })
    const wrapper = shallowMount(TaskTreeNode, {
      props: { node },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    // No expand/collapse button visible
    const buttons = wrapper.findAll('button')
    const expandBtn = buttons.find(b => b.attributes('title') === 'Réduire' || b.attributes('title') === 'Développer')
    expect(expandBtn).toBeUndefined()
    wrapper.unmount()
  })

  it('shows expand button for nodes with children', () => {
    const child = makeNode({ id: 2, title: 'Child Task', depth: 1, children: [] })
    const node = makeNode({ id: 1, children: [child] })
    const wrapper = shallowMount(TaskTreeNode, {
      props: { node },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    const expandBtn = wrapper.find('button[title]')
    expect(expandBtn.exists()).toBe(true)
    wrapper.unmount()
  })

  it('toggles expanded state when expand button is clicked', async () => {
    const child = makeNode({ id: 2, title: 'Child Task', depth: 1, children: [] })
    const node = makeNode({ id: 1, children: [child] })
    const wrapper = shallowMount(TaskTreeNode, {
      props: { node },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    // Initially expanded (default ref(true))
    const expandBtn = wrapper.find('button[title]')
    expect(expandBtn.attributes('title')).toBe('Réduire')
    await expandBtn.trigger('click')
    expect(expandBtn.attributes('title')).toBe('Développer')
    wrapper.unmount()
  })

  it('shows children count hint when collapsed and has children', async () => {
    const children = [
      makeNode({ id: 2, title: 'Child 1', depth: 1, children: [] }),
      makeNode({ id: 3, title: 'Child 2', depth: 1, children: [] }),
    ]
    const node = makeNode({ id: 1, children })
    const wrapper = shallowMount(TaskTreeNode, {
      props: { node },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    // Collapse
    const expandBtn = wrapper.find('button[title]')
    await expandBtn.trigger('click')
    expect(wrapper.text()).toContain('2 sous-tâches')
    wrapper.unmount()
  })

  it('shows effort badge when effort is set', () => {
    const node = makeNode({ effort: 3 })
    const wrapper = shallowMount(TaskTreeNode, {
      props: { node },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    expect(wrapper.text()).toContain('L')
    wrapper.unmount()
  })

  it('calls store.openTask when node row is clicked', async () => {
    const node = makeNode()
    const pinia = createTestingPinia()
    const wrapper = shallowMount(TaskTreeNode, {
      props: { node },
      global: { plugins: [pinia, i18n] },
    })
    const { useTasksStore } = await import('@renderer/stores/tasks')
    const store = useTasksStore()
    // Click the main row (first div with cursor-pointer)
    const row = wrapper.find('.cursor-pointer')
    await row.trigger('click')
    expect(store.openTask).toHaveBeenCalledWith(node)
    wrapper.unmount()
  })
})
