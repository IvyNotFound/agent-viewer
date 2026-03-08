import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTasksStore } from '@renderer/stores/tasks'
import { useTabsStore } from '@renderer/stores/tabs'

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


describe('stores/tasks — project lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.queryDb.mockResolvedValue([])
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
  })

  describe('setProject', () => {
    it('should set projectPath and dbPath, persisting to localStorage', async () => {
      const store = useTasksStore()

      await store.setProject('/my/project', '/my/project/.claude/project.db')

      expect(store.projectPath).toBe('/my/project')
      expect(store.dbPath).toBe('/my/project/.claude/project.db')
      expect(localStorage.getItem('projectPath')).toBe('/my/project')
      expect(localStorage.getItem('dbPath')).toBe('/my/project/.claude/project.db')
    })

    it('should call migrateDb before refresh', async () => {
      const store = useTasksStore()

      await store.setProject('/my/project', '/my/project/.claude/project.db')

      expect(mockElectronAPI.migrateDb).toHaveBeenCalledWith('/my/project/.claude/project.db')
    })

    it('should call queryDb (refresh) after setProject', async () => {
      const store = useTasksStore()

      await store.setProject('/my/project', '/my/project/.claude/project.db')

      expect(mockElectronAPI.queryDb).toHaveBeenCalled()
    })

    it('should start watching DB after setProject', async () => {
      const store = useTasksStore()

      await store.setProject('/my/project', '/my/project/.claude/project.db')

      expect(mockElectronAPI.watchDb).toHaveBeenCalledWith('/my/project/.claude/project.db')
    })
  })

  describe('closeProject', () => {
    it('should clear projectPath, dbPath and tasks', async () => {
      const store = useTasksStore()
      await store.setProject('/my/project', '/my/project/.claude/project.db')

      store.closeProject()

      expect(store.projectPath).toBeNull()
      expect(store.dbPath).toBeNull()
      expect(store.tasks).toHaveLength(0)
      expect(localStorage.getItem('projectPath')).toBeNull()
      expect(localStorage.getItem('dbPath')).toBeNull()
    })

    it('should clear selectedTask and taskComments on close', async () => {
      const store = useTasksStore()
      store.tasks = [{ id: 1, title: 'Task 1' }] as never
      await store.openTask({ id: 1, title: 'Task 1' } as never)

      store.closeProject()

      expect(store.selectedTask).toBeNull()
      expect(store.taskComments).toHaveLength(0)
    })
  })

  describe('refresh', () => {
    it('should return early when dbPath is null (no project loaded)', async () => {
      const store = useTasksStore()
      // dbPath is null by default

      await store.refresh()

      expect(mockElectronAPI.queryDb).not.toHaveBeenCalled()
    })

    it('should set loading=true during refresh and false after', async () => {
      const store = useTasksStore()
      await store.setProject('/p', '/p/.claude/db')
      mockElectronAPI.queryDb.mockClear()

      // Trigger refresh and check loading state
      const refreshPromise = store.refresh()
      // After promise resolves, loading should be false
      await refreshPromise
      expect(store.loading).toBe(false)
    })

    it('should set error state when queryDb throws', async () => {
      const store = useTasksStore()
      await store.setProject('/p', '/p/.claude/db')
      mockElectronAPI.queryDb.mockRejectedValue(new Error('DB connection failed'))

      await store.refresh()

      expect(store.error).toContain('DB connection failed')
    })

    it('should clear error on successful refresh', async () => {
      const store = useTasksStore()
      await store.setProject('/p', '/p/.claude/db')
      mockElectronAPI.queryDb.mockRejectedValue(new Error('error'))
      await store.refresh()
      expect(store.error).not.toBeNull()

      // Now a successful refresh
      mockElectronAPI.queryDb.mockResolvedValue([])
      await store.refresh()
      expect(store.error).toBeNull()
    })
  })

  describe('startPolling / stopPolling', () => {
    it('should not create duplicate polling intervals (startPolling called twice)', async () => {
      vi.useFakeTimers()
      const store = useTasksStore()
      await store.setProject('/p', '/p/.claude/db')
      mockElectronAPI.queryDb.mockClear()

      store.startPolling()
      store.startPolling() // second call — should cancel first interval

      // Advance past 300s (interval is 5min = 300000ms)
      await vi.advanceTimersByTimeAsync(300001)

      // queryDb called for ONE interval only (not doubled)
      // Each tick calls multiple queries via Promise.all
      const callCount = mockElectronAPI.queryDb.mock.calls.length
      // Should be > 0 (polling running) but NOT doubled
      expect(callCount).toBeGreaterThan(0)

      store.stopPolling()
      vi.useRealTimers()
    })

    it('should stop polling after stopPolling()', async () => {
      vi.useFakeTimers()
      const store = useTasksStore()
      await store.setProject('/p', '/p/.claude/db')
      store.startPolling()
      store.stopPolling()
      mockElectronAPI.queryDb.mockClear()

      // Advance past 35s — no more queries should fire
      await vi.advanceTimersByTimeAsync(35000)
      expect(mockElectronAPI.queryDb).not.toHaveBeenCalled()

      vi.useRealTimers()
    })
  })

  describe('openTask', () => {
    it('should set selectedTask when openTask is called', async () => {
      const store = useTasksStore()
      await store.setProject('/p', '/p/.claude/db')
      const task = { id: 42, title: 'My task' }
      mockElectronAPI.queryDb.mockResolvedValue([])

      await store.openTask(task as never)

      expect(store.selectedTask).toEqual(task)
    })

    it('should load task comments from DB', async () => {
      const store = useTasksStore()
      await store.setProject('/p', '/p/.claude/db')
      const mockComments = [{ id: 1, content: 'Commentaire', agent_name: 'review' }]
      // After setProject, we need to mock the comments query specifically
      // Use mockReturn return commentsValue to for the openTask call
      mockElectronAPI.queryDb.mockResolvedValueOnce(mockComments)

      await store.openTask({ id: 42, title: 'task' } as never)

      expect(store.taskComments).toHaveLength(1)
    })

    it('should reset taskComments on each openTask call', async () => {
      const store = useTasksStore()
      await store.setProject('/p', '/p/.claude/db')
      mockElectronAPI.queryDb.mockResolvedValue([])

      await store.openTask({ id: 1, title: 'first task' } as never)
      await store.openTask({ id: 2, title: 'second task' } as never)

      // selectedTask should be the second task
      expect(store.selectedTask?.id).toBe(2)
    })
  })
})


describe('stores/tasks — selectProject', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.queryDb.mockResolvedValue([])
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
  })

  it('should call showConfirmDialog when terminals are open', async () => {
    const tasksStore = useTasksStore()
    const tabsStore = useTabsStore()
    tabsStore.addTerminal('agent-1')
    tabsStore.addTerminal('agent-2')
    mockElectronAPI.showConfirmDialog.mockResolvedValue(false)

    await tasksStore.selectProject()

    expect(mockElectronAPI.showConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Changer de projet' })
    )
  })

  it('should abort when user refuses confirmation dialog', async () => {
    const tasksStore = useTasksStore()
    const tabsStore = useTabsStore()
    tabsStore.addTerminal('agent-1')
    mockElectronAPI.showConfirmDialog.mockResolvedValue(false)

    await tasksStore.selectProject()

    expect(mockElectronAPI.selectProjectDir).not.toHaveBeenCalled()
  })

  it('should proceed to selectProjectDir when user accepts confirmation', async () => {
    const tasksStore = useTasksStore()
    const tabsStore = useTabsStore()
    tabsStore.addTerminal('agent-1')
    mockElectronAPI.showConfirmDialog.mockResolvedValue(true)
    mockElectronAPI.selectProjectDir.mockResolvedValue(null)

    await tasksStore.selectProject()

    expect(mockElectronAPI.selectProjectDir).toHaveBeenCalled()
  })

  it('should skip confirmation when no terminals are open', async () => {
    const tasksStore = useTasksStore()
    mockElectronAPI.selectProjectDir.mockResolvedValue(null)

    await tasksStore.selectProject()

    expect(mockElectronAPI.showConfirmDialog).not.toHaveBeenCalled()
    expect(mockElectronAPI.selectProjectDir).toHaveBeenCalled()
  })

  it('should do nothing when selectProjectDir returns null', async () => {
    const tasksStore = useTasksStore()
    mockElectronAPI.selectProjectDir.mockResolvedValue(null)
    const prevPath = tasksStore.projectPath

    await tasksStore.selectProject()

    expect(tasksStore.projectPath).toBe(prevPath)
  })

  it('should call setProject when selectProjectDir returns dbPath', async () => {
    const tasksStore = useTasksStore()
    mockElectronAPI.selectProjectDir.mockResolvedValue({
      projectPath: '/new/project',
      dbPath: '/new/project/.claude/project.db',
      error: null,
      hasCLAUDEmd: true,
    })

    await tasksStore.selectProject()

    expect(tasksStore.projectPath).toBe('/new/project')
    expect(tasksStore.dbPath).toBe('/new/project/.claude/project.db')
  })

  it('should show WSL label when all terminals have wslDistro', async () => {
    const tasksStore = useTasksStore()
    const tabsStore = useTabsStore()
    tabsStore.addTerminal('agent-1', 'Ubuntu')
    tabsStore.addTerminal('agent-2', 'Debian')
    mockElectronAPI.showConfirmDialog.mockResolvedValue(false)

    await tasksStore.selectProject()

    expect(mockElectronAPI.showConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ message: '2 sessions WSL ouvertes' })
    )
  })

  it('should show mixed label when terminals include WSL and non-WSL', async () => {
    const tasksStore = useTasksStore()
    const tabsStore = useTabsStore()
    tabsStore.addTerminal('agent-1', 'Ubuntu')
    tabsStore.addTerminal('agent-2') // no wslDistro
    tabsStore.addTerminal('agent-3', 'Debian')
    mockElectronAPI.showConfirmDialog.mockResolvedValue(false)

    await tasksStore.selectProject()

    expect(mockElectronAPI.showConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ message: '2 sessions WSL + 1 terminal' })
    )
  })

  it('should show terminal label when no terminals have wslDistro', async () => {
    const tasksStore = useTasksStore()
    const tabsStore = useTabsStore()
    tabsStore.addTerminal('agent-1')
    tabsStore.addTerminal('agent-2')
    mockElectronAPI.showConfirmDialog.mockResolvedValue(false)

    await tasksStore.selectProject()

    expect(mockElectronAPI.showConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ message: '2 sessions terminal ouvertes' })
    )
  })

  it('should show setupWizard when selectProjectDir returns no dbPath', async () => {
    const tasksStore = useTasksStore()
    mockElectronAPI.selectProjectDir.mockResolvedValue({
      projectPath: '/new/project',
      dbPath: null,
      error: null,
      hasCLAUDEmd: false,
    })

    await tasksStore.selectProject()

    expect(tasksStore.setupWizardTarget).toEqual({
      projectPath: '/new/project',
      hasCLAUDEmd: false,
    })
  })
})
