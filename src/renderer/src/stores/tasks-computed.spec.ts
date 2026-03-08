import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { useTasksStore } from '@renderer/stores/tasks'

// Mock window.electronAPI
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
  agentKill: vi.fn(),
}

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
})


describe('stores/tasks — perimetres computed', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.queryDb.mockResolvedValue([])
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
  })

  it('should deduplicate scopes from tasks', () => {
    const store = useTasksStore()
    store.tasks = [
      { id: 1, scope: 'front-vuejs', status: 'todo' },
      { id: 2, scope: 'back-electron', status: 'todo' },
      { id: 3, scope: 'front-vuejs', status: 'done' },
    ] as never

    expect(store.perimetres).toEqual(['back-electron', 'front-vuejs'])
  })

  it('should return sorted array', () => {
    const store = useTasksStore()
    store.tasks = [
      { id: 1, scope: 'zzz', status: 'todo' },
      { id: 2, scope: 'aaa', status: 'todo' },
      { id: 3, scope: 'mmm', status: 'todo' },
    ] as never

    expect(store.perimetres).toEqual(['aaa', 'mmm', 'zzz'])
  })

  it('should skip tasks with null/undefined scope', () => {
    const store = useTasksStore()
    store.tasks = [
      { id: 1, scope: null, status: 'todo' },
      { id: 2, scope: undefined, status: 'todo' },
      { id: 3, scope: 'front-vuejs', status: 'todo' },
    ] as never

    expect(store.perimetres).toEqual(['front-vuejs'])
  })

  it('should return empty array when no tasks', () => {
    const store = useTasksStore()
    store.tasks = []

    expect(store.perimetres).toEqual([])
  })
})


describe('stores/tasks — watch(agents) auto-clear filter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.queryDb.mockResolvedValue([])
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
  })

  it('should clear selectedAgentId when filtered agent disappears from agents list', async () => {
    const store = useTasksStore()
    store.agents = [
      { id: 10, name: 'dev-front', type: 'dev', scope: 'front-vuejs' },
      { id: 20, name: 'dev-back', type: 'dev', scope: 'back-electron' },
    ] as never
    store.selectedAgentId = 10
    await nextTick()

    // Agent 10 disappears (e.g. project switch refreshed agents)
    store.agents = [
      { id: 20, name: 'dev-back', type: 'dev', scope: 'back-electron' },
    ] as never
    await nextTick()

    expect(store.selectedAgentId).toBeNull()
  })

  it('should keep selectedAgentId when filtered agent still exists', async () => {
    const store = useTasksStore()
    store.agents = [
      { id: 10, name: 'dev-front', type: 'dev', scope: 'front-vuejs' },
    ] as never
    store.selectedAgentId = 10
    await nextTick()

    // Agents refreshed but agent 10 still present
    store.agents = [
      { id: 10, name: 'dev-front', type: 'dev', scope: 'front-vuejs' },
      { id: 20, name: 'dev-back', type: 'dev', scope: 'back-electron' },
    ] as never
    await nextTick()

    expect(store.selectedAgentId).toBe(10)
  })

  it('should be a no-op when selectedAgentId is already null', async () => {
    const store = useTasksStore()
    store.selectedAgentId = null
    store.agents = [{ id: 10, name: 'dev-front' }] as never
    await nextTick()

    store.agents = [] as never
    await nextTick()

    expect(store.selectedAgentId).toBeNull()
  })
})


describe('stores/tasks — watch(dbPath) reset filters', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.queryDb.mockResolvedValue([])
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
  })

  it('should reset selectedAgentId and selectedPerimetre when dbPath changes', async () => {
    const store = useTasksStore()
    store.dbPath = '/project-a/.claude/project.db'
    store.selectedAgentId = 5
    store.selectedPerimetre = 'front-vuejs'
    await nextTick()

    // Switch project
    store.dbPath = '/project-b/.claude/project.db'
    await nextTick()

    expect(store.selectedAgentId).toBeNull()
    expect(store.selectedPerimetre).toBeNull()
  })

  it('should not reset filters when dbPath stays the same', async () => {
    const store = useTasksStore()
    store.dbPath = '/project-a/.claude/project.db'
    await nextTick()

    // Set filters AFTER the initial watcher fires
    store.selectedAgentId = 5
    store.selectedPerimetre = 'front-vuejs'

    // Same path re-assigned (Vue ref won't trigger watcher for identical value)
    store.dbPath = '/project-a/.claude/project.db'
    await nextTick()

    expect(store.selectedAgentId).toBe(5)
    expect(store.selectedPerimetre).toBe('front-vuejs')
  })
})
