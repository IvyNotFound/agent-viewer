/**
 * Tests for useSidebarTree (T1961)
 * Covers: treeItems construction, openedSet initialization, toggleGroup, flatNodes
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import type { Agent, AgentGroup } from '@renderer/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeAgent(id: number, name: string): Agent {
  return {
    id,
    name,
    type: 'dev',
    scope: null,
    system_prompt: null,
    system_prompt_suffix: null,
    thinking_mode: null,
    allowed_tools: null,
    auto_launch: 1,
    permission_mode: null,
    max_sessions: 3,
    worktree_enabled: null,
    preferred_cli: null,
    preferred_model: null,
    created_at: '2024-01-01',
  }
}

function makeGroup(
  id: number,
  name: string,
  members: Array<{ agent_id: number; sort_order: number }> = [],
  parentId: number | null = null,
): AgentGroup {
  return { id, name, sort_order: 0, parent_id: parentId, created_at: '2024-01-01', members }
}

// ─── Pre-import modules (avoid cold-import timeout on first test) ─────────────
let useAgentsStore: Awaited<ReturnType<typeof import('@renderer/stores/agents')>>['useAgentsStore']
let useSidebarTree: Awaited<ReturnType<typeof import('@renderer/composables/useSidebarTree')>>['useSidebarTree']

beforeAll(async () => {
  ;({ useAgentsStore } = await import('@renderer/stores/agents'))
  ;({ useSidebarTree } = await import('@renderer/composables/useSidebarTree'))
}, 15000)

describe('useSidebarTree (T1961)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Clear the localStorage shim between tests (see src/test/setup.ts)
    window.localStorage.clear()
  })

  // ─── treeItems ──────────────────────────────────────────────────────────────

  it('treeItems: empty agentGroupsTree → []', () => {
    useAgentsStore()
    const { treeItems } = useSidebarTree()
    expect(treeItems.value).toEqual([])
  })

  it('treeItems: group with members in sort_order → agents appear in correct order', async () => {
    const agentsStore = useAgentsStore()

    const agentA = makeAgent(1, 'alpha')
    const agentB = makeAgent(2, 'beta')
    // beta has sort_order 0, alpha has sort_order 1 → beta appears first
    agentsStore.agents = [agentA, agentB]
    agentsStore.agentGroups = [makeGroup(10, 'MyGroup', [
      { agent_id: 2, sort_order: 0 },
      { agent_id: 1, sort_order: 1 },
    ])]
    await nextTick()

    const { treeItems } = useSidebarTree()
    await nextTick()

    expect(treeItems.value).toHaveLength(1)
    const groupNode = treeItems.value[0]
    expect(groupNode.nodeType).toBe('group')
    expect(groupNode.children).toHaveLength(2)
    expect(groupNode.children[0].name).toBe('beta')  // sort_order 0 first
    expect(groupNode.children[1].name).toBe('alpha') // sort_order 1 second
  })

  it('treeItems: nested groups → children converted recursively', async () => {
    const agentsStore = useAgentsStore()

    // Flat list with parent_id — buildGroupTree derives hierarchy from parent_id
    agentsStore.agentGroups = [
      makeGroup(10, 'Parent'),
      makeGroup(20, 'Child', [], 10), // parent_id = 10
    ]
    await nextTick()

    const { treeItems } = useSidebarTree()
    await nextTick()

    expect(treeItems.value).toHaveLength(1)
    const parent = treeItems.value[0]
    expect(parent.name).toBe('Parent')
    expect(parent.children).toHaveLength(1)
    expect(parent.children[0].name).toBe('Child')
    expect(parent.children[0].nodeType).toBe('group')
  })

  it('treeItems: members referencing non-existent agent ids → filtered out', async () => {
    const agentsStore = useAgentsStore()

    agentsStore.agents = [makeAgent(1, 'alpha')]
    agentsStore.agentGroups = [makeGroup(10, 'G', [
      { agent_id: 1, sort_order: 0 },
      { agent_id: 999, sort_order: 1 }, // non-existent agent
    ])]
    await nextTick()

    const { treeItems } = useSidebarTree()
    await nextTick()

    expect(treeItems.value[0].children).toHaveLength(1)
    expect(treeItems.value[0].children[0].name).toBe('alpha')
  })

  // ─── openedSet initialization ────────────────────────────────────────────────

  it('openedSet initialization: group without localStorage key → added to openedSet (expanded by default)', async () => {
    const agentsStore = useAgentsStore()
    agentsStore.agentGroups = [makeGroup(10, 'G')]
    await nextTick()

    const { openedSet } = useSidebarTree()
    await nextTick()

    expect(openedSet.value.has('g-10')).toBe(true)
  })

  it('openedSet initialization: localStorage "true" for group → NOT added (collapsed)', async () => {
    // Set BEFORE creating the composable so the watch sees it on first fire
    window.localStorage.setItem('sidebar-group-10', 'true')

    const agentsStore = useAgentsStore()
    agentsStore.agentGroups = [makeGroup(10, 'G')]
    await nextTick()

    const { openedSet } = useSidebarTree()
    await nextTick()

    expect(openedSet.value.has('g-10')).toBe(false)
  })

  // ─── toggleGroup ─────────────────────────────────────────────────────────────

  it('toggleGroup: open group → removes from openedSet, sets localStorage to "true"', async () => {
    const agentsStore = useAgentsStore()
    agentsStore.agentGroups = [makeGroup(10, 'G')]
    await nextTick()

    const { openedSet, toggleGroup } = useSidebarTree()
    await nextTick()

    // Group is open by default (no localStorage key → expanded)
    expect(openedSet.value.has('g-10')).toBe(true)

    toggleGroup('g-10', 10)

    expect(openedSet.value.has('g-10')).toBe(false)
    expect(window.localStorage.getItem('sidebar-group-10')).toBe('true')
  })

  it('toggleGroup: closed group → adds to openedSet, sets localStorage to "false"', async () => {
    window.localStorage.setItem('sidebar-group-10', 'true') // start collapsed

    const agentsStore = useAgentsStore()
    agentsStore.agentGroups = [makeGroup(10, 'G')]
    await nextTick()

    const { openedSet, toggleGroup } = useSidebarTree()
    await nextTick()

    // Group starts collapsed
    expect(openedSet.value.has('g-10')).toBe(false)

    toggleGroup('g-10', 10)

    expect(openedSet.value.has('g-10')).toBe(true)
    expect(window.localStorage.getItem('sidebar-group-10')).toBe('false')
  })

  // ─── flatNodes ───────────────────────────────────────────────────────────────

  it('flatNodes: collapsed group → children not included in flat list', async () => {
    window.localStorage.setItem('sidebar-group-10', 'true') // collapsed

    const agentsStore = useAgentsStore()
    agentsStore.agents = [makeAgent(1, 'alpha')]
    agentsStore.agentGroups = [makeGroup(10, 'G', [{ agent_id: 1, sort_order: 0 }])]
    await nextTick()

    const { flatNodes } = useSidebarTree()
    await nextTick()

    // Only the group node, no agent inside
    expect(flatNodes.value).toHaveLength(1)
    expect(flatNodes.value[0].type).toBe('group')
  })

  it('flatNodes: expanded group → children included with depth+1', async () => {
    const agentsStore = useAgentsStore()
    agentsStore.agents = [makeAgent(1, 'alpha')]
    agentsStore.agentGroups = [makeGroup(10, 'G', [{ agent_id: 1, sort_order: 0 }])]
    await nextTick()

    const { flatNodes } = useSidebarTree()
    await nextTick()

    // Group (depth=0) + agent (depth=1)
    expect(flatNodes.value).toHaveLength(2)
    expect(flatNodes.value[0].type).toBe('group')
    expect(flatNodes.value[0].depth).toBe(0)
    expect(flatNodes.value[1].type).toBe('agent')
    expect(flatNodes.value[1].depth).toBe(1)
  })

  it('flatNodes: mixed nested groups/agents at correct depth values', async () => {
    const agentsStore = useAgentsStore()
    agentsStore.agents = [makeAgent(1, 'alpha'), makeAgent(2, 'beta')]

    // parentGroup (id=10): has agentA (alpha) as member
    // childGroup (id=20): parent_id=10, has agentB (beta) as member
    agentsStore.agentGroups = [
      makeGroup(10, 'Parent', [{ agent_id: 1, sort_order: 0 }]),
      makeGroup(20, 'Child', [{ agent_id: 2, sort_order: 0 }], 10),
    ]
    await nextTick()

    const { flatNodes } = useSidebarTree()
    await nextTick()

    // All groups expanded by default.
    // Tree: Parent(group) → children: [Child(group), alpha(agent)]
    //        Child(group) → children: [beta(agent)]
    // flatNodes traversal order: Parent(0), Child(1), beta(2), alpha(1)
    const flat = flatNodes.value
    expect(flat).toHaveLength(4)

    const parentNode = flat.find(n => n.id === 'g-10')
    const childNode = flat.find(n => n.id === 'g-20')
    const alphaNode = flat.find(n => n.id === 'a-1')
    const betaNode = flat.find(n => n.id === 'a-2')

    expect(parentNode?.depth).toBe(0)
    expect(childNode?.depth).toBe(1)
    expect(betaNode?.depth).toBe(2)
    expect(alphaNode?.depth).toBe(1)
  })
})
