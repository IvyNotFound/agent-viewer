/**
 * agents-gaps.spec.ts
 * Coverage gaps for agents.ts — query non-Array, createAgentGroup with parentId,
 * agentGroupsTree computed reactivity, setGroupParent direct unit test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { useAgentsStore } from '@renderer/stores/agents'

const mockElectronAPI = {
  queryDb: vi.fn().mockResolvedValue([]),
  watchDb: vi.fn().mockResolvedValue(undefined),
  unwatchDb: vi.fn().mockResolvedValue(undefined),
  onDbChanged: vi.fn().mockReturnValue(() => {}),
  selectProjectDir: vi.fn().mockResolvedValue(null),
  showConfirmDialog: vi.fn().mockResolvedValue(true),
  migrateDb: vi.fn().mockResolvedValue({ success: true }),
  terminalKill: vi.fn(),
  findProjectDb: vi.fn().mockResolvedValue(null),
  getTaskLinks: vi.fn().mockResolvedValue({ success: true, links: [] }),
  getTaskAssignees: vi.fn().mockResolvedValue({ success: true, assignees: [] }),
  agentGroupsList: vi.fn().mockResolvedValue({ success: true, groups: [] }),
  agentGroupsCreate: vi.fn().mockResolvedValue({ success: true, group: { id: 1, name: 'New Group', sort_order: 0, created_at: '' } }),
  agentGroupsRename: vi.fn().mockResolvedValue({ success: true }),
  agentGroupsDelete: vi.fn().mockResolvedValue({ success: true }),
  agentGroupsSetMember: vi.fn().mockResolvedValue({ success: true }),
  agentGroupsSetParent: vi.fn().mockResolvedValue({ success: true }),
  agentKill: vi.fn(),
}

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
})


// ─── query: non-Array return ──────────────────────────────────────────────────

describe('stores/agents — query non-Array response (LogicalOperator)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('returns empty array when queryDb returns a non-Array object', async () => {
    localStorage.setItem('dbPath', '/test/project.db')
    mockElectronAPI.queryDb.mockResolvedValueOnce({ error: 'permission denied' })
    const store = useAgentsStore()

    // query is exposed; call directly
    const result = await store.query('SELECT * FROM agents')

    expect(result).toEqual([])
  })

  it('returns empty array when queryDb returns null', async () => {
    localStorage.setItem('dbPath', '/test/project.db')
    mockElectronAPI.queryDb.mockResolvedValueOnce(null)
    const store = useAgentsStore()

    const result = await store.query('SELECT * FROM agents')

    expect(result).toEqual([])
  })

  it('returns empty array when queryDb returns a string', async () => {
    localStorage.setItem('dbPath', '/test/project.db')
    mockElectronAPI.queryDb.mockResolvedValueOnce('unexpected')
    const store = useAgentsStore()

    const result = await store.query('SELECT * FROM agents')

    expect(result).toEqual([])
  })

  it('returns empty array when dbPath is null', async () => {
    // No dbPath in localStorage
    const store = useAgentsStore()

    const result = await store.query('SELECT * FROM agents')

    expect(result).toEqual([])
    expect(mockElectronAPI.queryDb).not.toHaveBeenCalled()
  })
})


// ─── createAgentGroup: with parentId ─────────────────────────────────────────

describe('stores/agents — createAgentGroup with parentId', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('passes parentId to IPC when provided', async () => {
    localStorage.setItem('dbPath', '/test/project.db')
    mockElectronAPI.agentGroupsCreate.mockResolvedValue({
      success: true,
      group: { id: 10, name: 'Child Group', sort_order: 0, created_at: '' },
    })
    const store = useAgentsStore()

    await store.createAgentGroup('Child Group', 5)

    expect(mockElectronAPI.agentGroupsCreate).toHaveBeenCalledWith('/test/project.db', 'Child Group', 5)
  })

  it('passes null parentId when explicitly null', async () => {
    localStorage.setItem('dbPath', '/test/project.db')
    mockElectronAPI.agentGroupsCreate.mockResolvedValue({
      success: true,
      group: { id: 11, name: 'Root Group', sort_order: 0, created_at: '' },
    })
    const store = useAgentsStore()

    await store.createAgentGroup('Root Group', null)

    expect(mockElectronAPI.agentGroupsCreate).toHaveBeenCalledWith('/test/project.db', 'Root Group', null)
  })

  it('passes undefined parentId when not provided', async () => {
    localStorage.setItem('dbPath', '/test/project.db')
    mockElectronAPI.agentGroupsCreate.mockResolvedValue({
      success: true,
      group: { id: 12, name: 'Ungrouped', sort_order: 0, created_at: '' },
    })
    const store = useAgentsStore()

    await store.createAgentGroup('Ungrouped')

    expect(mockElectronAPI.agentGroupsCreate).toHaveBeenCalledWith('/test/project.db', 'Ungrouped', undefined)
  })
})


// ─── agentGroupsTree computed: reactivity ────────────────────────────────────

describe('stores/agents — agentGroupsTree computed reactivity', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('returns empty tree when agentGroups is empty', () => {
    const store = useAgentsStore()
    expect(store.agentGroupsTree).toEqual([])
  })

  it('returns flat tree when groups have no parent_id', async () => {
    const store = useAgentsStore()
    store.agentGroups = [
      { id: 1, name: 'Frontend', sort_order: 0, parent_id: null, created_at: '', members: [] },
      { id: 2, name: 'Backend', sort_order: 1, parent_id: null, created_at: '', members: [] },
    ]
    await nextTick()

    expect(store.agentGroupsTree).toHaveLength(2)
    expect(store.agentGroupsTree.every(g => g.children?.length === 0)).toBe(true)
  })

  it('nests child group under parent in computed tree', async () => {
    const store = useAgentsStore()
    store.agentGroups = [
      { id: 1, name: 'Parent', sort_order: 0, parent_id: null, created_at: '', members: [] },
      { id: 2, name: 'Child', sort_order: 0, parent_id: 1, created_at: '', members: [] },
    ]
    await nextTick()

    const tree = store.agentGroupsTree
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe(1)
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children![0].id).toBe(2)
  })

  it('updates reactively when agentGroups changes', async () => {
    const store = useAgentsStore()
    store.agentGroups = []
    await nextTick()
    expect(store.agentGroupsTree).toHaveLength(0)

    store.agentGroups = [
      { id: 1, name: 'New Group', sort_order: 0, parent_id: null, created_at: '', members: [] },
    ]
    await nextTick()
    expect(store.agentGroupsTree).toHaveLength(1)
  })
})


// ─── setGroupParent: direct unit test ────────────────────────────────────────

describe('stores/agents — setGroupParent direct', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('does nothing when dbPath is null', async () => {
    const store = useAgentsStore()
    await store.setGroupParent(3, 1)
    expect(mockElectronAPI.agentGroupsSetParent).not.toHaveBeenCalled()
  })

  it('calls agentGroupsSetParent with correct args', async () => {
    localStorage.setItem('dbPath', '/test/project.db')
    mockElectronAPI.agentGroupsList.mockResolvedValue({ success: true, groups: [] })
    const store = useAgentsStore()

    await store.setGroupParent(7, 2)

    expect(mockElectronAPI.agentGroupsSetParent).toHaveBeenCalledWith('/test/project.db', 7, 2)
  })

  it('calls agentGroupsSetParent with null to detach', async () => {
    localStorage.setItem('dbPath', '/test/project.db')
    mockElectronAPI.agentGroupsList.mockResolvedValue({ success: true, groups: [] })
    const store = useAgentsStore()

    await store.setGroupParent(7, null)

    expect(mockElectronAPI.agentGroupsSetParent).toHaveBeenCalledWith('/test/project.db', 7, null)
  })

  it('refetches agentGroups after setGroupParent', async () => {
    localStorage.setItem('dbPath', '/test/project.db')
    const groups = [{ id: 1, name: 'G', sort_order: 0, parent_id: null, created_at: '', members: [] }]
    mockElectronAPI.agentGroupsList.mockResolvedValue({ success: true, groups })
    const store = useAgentsStore()

    await store.setGroupParent(3, null)

    expect(mockElectronAPI.agentGroupsList).toHaveBeenCalled()
    expect(store.agentGroups).toHaveLength(1)
  })
})


// ─── T1319: buildGroupTree mutation killers ───────────────────────────────────

import { buildGroupTree } from '@renderer/stores/agents'
import type { AgentGroup } from '@renderer/types'

const makeG = (id: number, parentId: number | null | undefined = null, sortOrder = 0): AgentGroup => ({
  id, name: `g${id}`, sort_order: sortOrder, parent_id: parentId, created_at: '', members: [],
})

describe('buildGroupTree — parent_id undefined treated as root (T1319)', () => {
  // Kills: LogicalOperator || -> && in (parent_id === null || parent_id === undefined)
  it('group with parent_id undefined becomes a root (not nested)', () => {
    const flat = [makeG(1, undefined), makeG(2, null)]
    const tree = buildGroupTree(flat)
    expect(tree).toHaveLength(2)
    // Both should be roots, not nested under anyone
    expect(tree.every(g => !g.children?.length)).toBe(true)
  })

  it('group with parent_id pointing to non-existent parent becomes root', () => {
    const flat = [makeG(1, 999)]
    const tree = buildGroupTree(flat)
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe(1)
  })
})

describe('buildGroupTree — sort direction (T1319)', () => {
  // Kills: ArithmeticOperator a.sort_order - b.sort_order -> b.sort_order - a.sort_order
  // and MethodExpression sort() mutants

  it('children sorted ascending by sort_order (high -> low input must come out low -> high)', () => {
    const flat = [
      makeG(1, null, 0),              // root
      makeG(4, 1, 100),               // child with highest sort_order
      makeG(2, 1, 0),                 // child with lowest sort_order
      makeG(3, 1, 50),                // child with middle sort_order
    ]
    const tree = buildGroupTree(flat)
    const childIds = tree[0].children!.map(c => c.id)
    expect(childIds).toEqual([2, 3, 4])
  })

  it('top-level roots sorted ascending by sort_order', () => {
    const flat = [
      makeG(3, null, 10),
      makeG(1, null, 0),
      makeG(2, null, 5),
    ]
    const tree = buildGroupTree(flat)
    expect(tree.map(g => g.id)).toEqual([1, 2, 3])
  })

  it('recursive sort: grandchildren also sorted ascending', () => {
    const flat = [
      makeG(1, null, 0),
      makeG(2, 1, 0),         // child of 1
      makeG(5, 2, 30),        // grandchild high
      makeG(4, 2, 10),        // grandchild mid
      makeG(3, 2, 0),         // grandchild low
    ]
    const tree = buildGroupTree(flat)
    const grandchildIds = tree[0].children![0].children!.map(c => c.id)
    expect(grandchildIds).toEqual([3, 4, 5])
  })
})

describe('buildGroupTree — setAgentGroup no-op branch (T1319)', () => {
  // Kills: filtered.length !== g.members.length (mutation: !== -> ===)
  // This branch returns the group unchanged when the agent was not a member

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('group not containing agent is returned unchanged when setAgentGroup targets another group', async () => {
    localStorage.setItem('dbPath', '/test/project.db')
    const store = useAgentsStore()
    store.agentGroups = [
      { id: 1, name: 'Group A', sort_order: 0, created_at: '', members: [{ agent_id: 10, sort_order: 0 }] },
      { id: 2, name: 'Group B', sort_order: 1, created_at: '', members: [] },
    ]
    // Move agent 10 to group 2 — group B has no member to remove (filtered.length === members.length)
    await store.setAgentGroup(10, 2, 0)
    expect(store.agentGroups[0].members).toHaveLength(0) // agent 10 removed from group A
    expect(store.agentGroups[1].members).toHaveLength(1) // agent 10 added to group B
    expect(store.agentGroups[1].members[0].agent_id).toBe(10)
  })

  it('group with no members stays unchanged (filtered.length === 0 === members.length)', async () => {
    localStorage.setItem('dbPath', '/test/project.db')
    const store = useAgentsStore()
    store.agentGroups = [
      { id: 1, name: 'Empty Group', sort_order: 0, created_at: '', members: [] },
    ]
    await store.setAgentGroup(99, null)
    // Group had no members, filtering agent 99 from it returns same empty array
    expect(store.agentGroups[0].members).toHaveLength(0)
  })
})
