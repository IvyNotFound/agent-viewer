/**
 * Snapshot tests for key UI components (T984)
 * Run `npx vitest run --update-snapshots` to regenerate after intentional changes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createTestingPinia } from '@pinia/testing'
import i18n from '@renderer/plugins/i18n'

// ── AgentBadge ────────────────────────────────────────────────────────────────

import AgentBadge from '@renderer/components/AgentBadge.vue'

describe('AgentBadge — snapshots', () => {
  it('matches snapshot: inactive badge', () => {
    const wrapper = shallowMount(AgentBadge, {
      props: { name: 'dev-front-vuejs' },
    })
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('matches snapshot: active badge with dot', () => {
    const wrapper = shallowMount(AgentBadge, {
      props: { name: 'review-master', active: true },
    })
    expect(wrapper.html()).toMatchSnapshot()
  })
})

// ── ToggleSwitch ──────────────────────────────────────────────────────────────

import ToggleSwitch from '@renderer/components/ToggleSwitch.vue'

describe('ToggleSwitch — snapshots', () => {
  it('matches snapshot: off state', () => {
    const wrapper = shallowMount(ToggleSwitch, {
      props: { modelValue: false },
    })
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('matches snapshot: on state', () => {
    const wrapper = shallowMount(ToggleSwitch, {
      props: { modelValue: true },
    })
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('matches snapshot: disabled state', () => {
    const wrapper = shallowMount(ToggleSwitch, {
      props: { modelValue: false, disabled: true },
    })
    expect(wrapper.html()).toMatchSnapshot()
  })
})

// ── StatusColumn ──────────────────────────────────────────────────────────────

import StatusColumn from '@renderer/components/StatusColumn.vue'
import type { Task } from '@renderer/types'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    titre: 'Fix login bug',
    description: 'Description',
    statut: 'todo',
    perimetre: 'front-vuejs',
    effort: 2,
    priority: 'normal',
    agent_assigne_id: 1,
    agent_name: 'dev-front',
    agent_createur_id: null,
    agent_createur_name: null,
    agent_perimetre: null,
    parent_task_id: null,
    session_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    started_at: null,
    completed_at: null,
    validated_at: null,
    ...overrides,
  } as Task
}

describe('StatusColumn — snapshots', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('matches snapshot: empty column', () => {
    const wrapper = shallowMount(StatusColumn, {
      props: {
        title: 'Todo',
        statut: 'todo',
        tasks: [],
        accentClass: 'bg-slate-400',
      },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { agents: [], dbPath: '/p/db', boardAssignees: new Map() }, tabs: { tabs: [] } },
        }), i18n],
      },
    })
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('matches snapshot: column with 2 tasks', () => {
    const tasks = [
      makeTask({ id: 1, titre: 'Task Alpha', statut: 'todo' }),
      makeTask({ id: 2, titre: 'Task Beta', statut: 'todo', priority: 'high' }),
    ]
    const wrapper = shallowMount(StatusColumn, {
      props: {
        title: 'Todo',
        statut: 'todo',
        tasks,
        accentClass: 'bg-slate-400',
      },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { agents: [], dbPath: '/p/db', boardAssignees: new Map() }, tabs: { tabs: [] } },
        }), i18n],
      },
    })
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('matches snapshot: in_progress column (drop target)', () => {
    const tasks = [makeTask({ id: 3, titre: 'Active Task', statut: 'in_progress', effort: 3 })]
    const wrapper = shallowMount(StatusColumn, {
      props: {
        title: 'In Progress',
        statut: 'in_progress',
        tasks,
        accentClass: 'bg-cyan-400',
      },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { agents: [], dbPath: '/p/db', boardAssignees: new Map() }, tabs: { tabs: [] } },
        }), i18n],
      },
    })
    expect(wrapper.html()).toMatchSnapshot()
  })
})

// ── TaskCard ──────────────────────────────────────────────────────────────────

import TaskCard from '@renderer/components/TaskCard.vue'

describe('TaskCard — snapshots', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('matches snapshot: minimal todo task', () => {
    const wrapper = shallowMount(TaskCard, {
      props: {
        task: makeTask({ id: 10, titre: 'Simple Task', statut: 'todo', effort: 1 }),
      },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { agents: [], dbPath: '/p/db', boardAssignees: new Map() }, tabs: { tabs: [] } },
        }), i18n],
      },
    })
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('matches snapshot: critical in_progress task with all badges', () => {
    // started_at: null → isStale returns false → no dynamic stale tooltip
    const wrapper = shallowMount(TaskCard, {
      props: {
        task: makeTask({
          id: 42,
          titre: 'Urgent Fix',
          statut: 'in_progress',
          effort: 3,
          priority: 'critical',
          perimetre: 'back-electron',
          agent_name: 'dev-back',
          started_at: null,
        }),
      },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { agents: [], dbPath: '/p/db', boardAssignees: new Map() }, tabs: { tabs: [] } },
        }), i18n],
      },
    })
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('matches snapshot: done task without agent or perimetre', () => {
    const wrapper = shallowMount(TaskCard, {
      props: {
        task: makeTask({
          id: 99,
          titre: 'Completed Task',
          statut: 'done',
          effort: undefined as unknown as number,
          priority: undefined as unknown as string,
          perimetre: null as unknown as string,
          agent_name: null as unknown as string,
          completed_at: '2026-01-02T00:00:00Z',
        }),
      },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { agents: [], dbPath: '/p/db', boardAssignees: new Map() }, tabs: { tabs: [] } },
        }), i18n],
      },
    })
    expect(wrapper.html()).toMatchSnapshot()
  })
})

// ── TabBar ────────────────────────────────────────────────────────────────────

import TabBar from '@renderer/components/TabBar.vue'

describe('TabBar — snapshots', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(function MockResizeObserver(this: ResizeObserver) {
      (this as unknown as Record<string, unknown>).observe = vi.fn();
      (this as unknown as Record<string, unknown>).unobserve = vi.fn();
      (this as unknown as Record<string, unknown>).disconnect = vi.fn()
    }))
  })

  it('matches snapshot: empty tab bar (no tabs)', () => {
    const wrapper = shallowMount(TabBar, {
      global: {
        plugins: [createTestingPinia({
          initialState: { tabs: { tabs: [], activeTabId: null } },
        }), i18n],
      },
    })
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('matches snapshot: tab bar with one terminal tab', () => {
    const wrapper = shallowMount(TabBar, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            tabs: {
              tabs: [{
                id: 'tab-1',
                type: 'terminal',
                label: 'dev-front #1',
                agentName: 'dev-front',
                taskId: 1,
                permanent: false,
              }],
              activeTabId: 'tab-1',
            },
          },
        }), i18n],
      },
    })
    expect(wrapper.html()).toMatchSnapshot()
  })
})
