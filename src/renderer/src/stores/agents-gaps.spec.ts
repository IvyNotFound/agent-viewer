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
