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


describe('stores/tasks — auto-resume cold start', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.queryDb.mockResolvedValue([])
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
    mockElectronAPI.findProjectDb.mockResolvedValue('/my/project/.claude/project.db')
  })

  it('should call findProjectDb before migrateDb on cold start when projectPath is set', async () => {
    localStorage.setItem('dbPath', '/my/project/.claude/project.db')
    localStorage.setItem('projectPath', '/my/project')

    useTasksStore()
    await nextTick()
    // Let promises settle
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(mockElectronAPI.findProjectDb).toHaveBeenCalledWith('/my/project')
    expect(mockElectronAPI.migrateDb).toHaveBeenCalledWith('/my/project/.claude/project.db')
  })

  it('should call migrateDb even when findProjectDb returns null (fallback)', async () => {
    localStorage.setItem('dbPath', '/my/project/.claude/project.db')
    localStorage.setItem('projectPath', '/my/project')
    mockElectronAPI.findProjectDb.mockResolvedValue(null)

    useTasksStore()
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(mockElectronAPI.findProjectDb).toHaveBeenCalledWith('/my/project')
    expect(mockElectronAPI.migrateDb).toHaveBeenCalledWith('/my/project/.claude/project.db')
  })

  it('should skip findProjectDb and call migrateDb directly when projectPath cannot be derived', async () => {
    // Use a dbPath that doesn't match the .claude pattern so projectPath stays null
    localStorage.setItem('dbPath', '/my/project/custom.db')
    // projectPath intentionally not set, and path doesn't match .claude migration

    useTasksStore()
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(mockElectronAPI.findProjectDb).not.toHaveBeenCalled()
    expect(mockElectronAPI.migrateDb).toHaveBeenCalledWith('/my/project/custom.db')
  })

  it('should call watchDb after migrateDb and refresh on cold start', async () => {
    localStorage.setItem('dbPath', '/my/project/.claude/project.db')
    localStorage.setItem('projectPath', '/my/project')

    useTasksStore()
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(mockElectronAPI.watchDb).toHaveBeenCalledWith('/my/project/.claude/project.db')
  })
})


describe('stores/tasks — setTaskStatut TASK_BLOCKED', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('throws TASK_BLOCKED error when IPC returns TASK_BLOCKED (T553)', async () => {
    const blockers = [{ id: 5, title: 'Blocker', status: 'in_progress' }]
    ;(mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus =
      vi.fn().mockResolvedValue({ success: false, error: 'TASK_BLOCKED', blockers })

    const store = useTasksStore()
    store.$patch({ dbPath: '/p/db', tasks: [{ id: 1, status: 'todo', title: 'T' } as never] })

    await expect(store.setTaskStatut(1, 'in_progress')).rejects.toThrow('TASK_BLOCKED')
  })

  it('rolls back optimistic update on TASK_BLOCKED (T553)', async () => {
    const blockers = [{ id: 5, title: 'Blocker', status: 'in_progress' }]
    ;(mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus =
      vi.fn().mockResolvedValue({ success: false, error: 'TASK_BLOCKED', blockers })

    const store = useTasksStore()
    store.$patch({ dbPath: '/p/db', tasks: [{ id: 1, status: 'todo', title: 'T' } as never] })

    try { await store.setTaskStatut(1, 'in_progress') } catch { /* expected */ }

    expect(store.tasks.find(t => t.id === 1)?.status).toBe('todo')
  })
})


describe('stores/tasks — agentGroups actions', () => {
  const DB_PATH = '/test/project/.claude/project.db'

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    // Reset mocks to defaults
    mockElectronAPI.agentGroupsList.mockResolvedValue({ success: true, groups: [] })
    mockElectronAPI.agentGroupsCreate.mockResolvedValue({ success: true, group: { id: 1, name: 'New Group', sort_order: 0, created_at: '' } })
    mockElectronAPI.agentGroupsRename.mockResolvedValue({ success: true })
    mockElectronAPI.agentGroupsDelete.mockResolvedValue({ success: true })
    // Needed for setProject which calls refresh + watch
    mockElectronAPI.queryDb.mockResolvedValue([])
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
  })

  // ── fetchAgentGroups ──────────────────────────────────────────────────────

  describe('fetchAgentGroups', () => {
    it('calls agentGroupsList with dbPath', async () => {
      const store = useTasksStore()
      await store.setProject('/test/project', DB_PATH)
      vi.clearAllMocks()

      mockElectronAPI.agentGroupsList.mockResolvedValue({ success: true, groups: [] })
      await store.fetchAgentGroups()

      expect(mockElectronAPI.agentGroupsList).toHaveBeenCalledWith(DB_PATH)
    })

    it('updates store.agentGroups with returned groups on success', async () => {
      const store = useTasksStore()
      await store.setProject('/test/project', DB_PATH)

      const groups = [
        { id: 1, name: 'Frontend', position: 0, members: [] },
        { id: 2, name: 'Backend', position: 1, members: [] },
      ]
      mockElectronAPI.agentGroupsList.mockResolvedValue({ success: true, groups })
      await store.fetchAgentGroups()

      expect(store.agentGroups).toHaveLength(2)
      expect(store.agentGroups[0].name).toBe('Frontend')
      expect(store.agentGroups[1].name).toBe('Backend')
    })

    it('does not update agentGroups when success is false', async () => {
      const store = useTasksStore()
      await store.setProject('/test/project', DB_PATH)
      store.agentGroups = [{ id: 99, name: 'Existing', position: 0, members: [] }] as never

      mockElectronAPI.agentGroupsList.mockResolvedValue({ success: false, groups: [] })
      await store.fetchAgentGroups()

      // State unchanged — success:false is silently ignored
      expect(store.agentGroups).toHaveLength(1)
      expect(store.agentGroups[0].id).toBe(99)
    })

    it('does not crash and does not call API when dbPath is null', async () => {
      const store = useTasksStore()
      // dbPath is null by default (no setProject called)
      await store.fetchAgentGroups()

      expect(mockElectronAPI.agentGroupsList).not.toHaveBeenCalled()
    })

    it('does not crash on API error (silent catch)', async () => {
      const store = useTasksStore()
      await store.setProject('/test/project', DB_PATH)

      mockElectronAPI.agentGroupsList.mockRejectedValue(new Error('IPC error'))
      await expect(store.fetchAgentGroups()).resolves.toBeUndefined()
    })
  })

  // ── createAgentGroup ──────────────────────────────────────────────────────

  describe('createAgentGroup', () => {
    it('calls agentGroupsCreate with dbPath and name', async () => {
      const store = useTasksStore()
      await store.setProject('/test/project', DB_PATH)
      vi.clearAllMocks()

      mockElectronAPI.agentGroupsCreate.mockResolvedValue({ success: true, group: { id: 5, name: 'Ops', sort_order: 0, created_at: '' } })
      await store.createAgentGroup('Ops')

      expect(mockElectronAPI.agentGroupsCreate).toHaveBeenCalledWith(DB_PATH, 'Ops', undefined)
    })

    it('returns AgentGroup and appends to store.agentGroups on success', async () => {
      const store = useTasksStore()
      await store.setProject('/test/project', DB_PATH)
      store.agentGroups = [] as never

      mockElectronAPI.agentGroupsCreate.mockResolvedValue({ success: true, group: { id: 5, name: 'Ops', sort_order: 0, created_at: '' } })
      const result = await store.createAgentGroup('Ops')

      expect(result).not.toBeNull()
      expect(result?.name).toBe('Ops')
      expect(store.agentGroups).toHaveLength(1)
      expect(store.agentGroups[0].name).toBe('Ops')
    })

    it('returns null when success is false', async () => {
      const store = useTasksStore()
      await store.setProject('/test/project', DB_PATH)

      mockElectronAPI.agentGroupsCreate.mockResolvedValue({ success: false })
      const result = await store.createAgentGroup('Fail')

      expect(result).toBeNull()
    })

    it('returns null and does not call API when dbPath is null', async () => {
      const store = useTasksStore()
      // no setProject — dbPath is null
      const result = await store.createAgentGroup('Test')

      expect(result).toBeNull()
      expect(mockElectronAPI.agentGroupsCreate).not.toHaveBeenCalled()
    })
  })

  // ── renameAgentGroup ──────────────────────────────────────────────────────

  describe('renameAgentGroup', () => {
    it('calls agentGroupsRename with dbPath, groupId and new name', async () => {
      const store = useTasksStore()
      await store.setProject('/test/project', DB_PATH)
      vi.clearAllMocks()

      await store.renameAgentGroup(3, 'New Name')

      expect(mockElectronAPI.agentGroupsRename).toHaveBeenCalledWith(DB_PATH, 3, 'New Name')
    })

    it('updates the group name in agentGroups state', async () => {
      const store = useTasksStore()
      await store.setProject('/test/project', DB_PATH)
      store.agentGroups = [
        { id: 3, name: 'Old Name', position: 0, members: [] },
        { id: 4, name: 'Other', position: 1, members: [] },
      ] as never

      await store.renameAgentGroup(3, 'New Name')

      expect(store.agentGroups[0].name).toBe('New Name')
      expect(store.agentGroups[1].name).toBe('Other')
    })

    it('does not call API when dbPath is null', async () => {
      const store = useTasksStore()
      await store.renameAgentGroup(1, 'Test')

      expect(mockElectronAPI.agentGroupsRename).not.toHaveBeenCalled()
    })
  })

  // ── deleteAgentGroup ──────────────────────────────────────────────────────

  describe('deleteAgentGroup', () => {
    it('calls agentGroupsDelete with dbPath and groupId', async () => {
      const store = useTasksStore()
      await store.setProject('/test/project', DB_PATH)
      vi.clearAllMocks()

      await store.deleteAgentGroup(7)

      expect(mockElectronAPI.agentGroupsDelete).toHaveBeenCalledWith(DB_PATH, 7)
    })

    it('removes the group from agentGroups state', async () => {
      const store = useTasksStore()
      await store.setProject('/test/project', DB_PATH)
      store.agentGroups = [
        { id: 7, name: 'To Delete', position: 0, members: [] },
        { id: 8, name: 'Keep', position: 1, members: [] },
      ] as never

      await store.deleteAgentGroup(7)

      expect(store.agentGroups).toHaveLength(1)
      expect(store.agentGroups[0].id).toBe(8)
    })

    it('does not call API when dbPath is null', async () => {
      const store = useTasksStore()
      await store.deleteAgentGroup(1)

      expect(mockElectronAPI.agentGroupsDelete).not.toHaveBeenCalled()
    })
  })
})
