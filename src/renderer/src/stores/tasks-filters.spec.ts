import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
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


describe('stores/tasks', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('filteredTasks', () => {
    it('should return all tasks when no filter selected', () => {
      const store = useTasksStore()
      store.tasks = [
        { id: 1, title: 'Task 1', agent_assigned_id: 1, scope: 'front-vuejs', status: 'todo' },
        { id: 2, title: 'Task 2', agent_assigned_id: 2, scope: 'back-electron', status: 'todo' },
      ] as never

      const filtered = store.filteredTasks
      expect(filtered).toHaveLength(2)
    })

    it('should filter by agent_id', () => {
      const store = useTasksStore()
      store.tasks = [
        { id: 1, title: 'Task 1', agent_assigned_id: 1, scope: 'front-vuejs', status: 'todo' },
        { id: 2, title: 'Task 2', agent_assigned_id: 2, scope: 'back-electron', status: 'todo' },
      ] as never

      store.selectedAgentId = 1
      const filtered = store.filteredTasks

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(1)
    })

    it('should filter by scope', () => {
      const store = useTasksStore()
      store.tasks = [
        { id: 1, title: 'Task 1', agent_assigned_id: 1, scope: 'front-vuejs', status: 'todo' },
        { id: 2, title: 'Task 2', agent_assigned_id: 2, scope: 'back-electron', status: 'todo' },
      ] as never

      store.selectedPerimetre = 'front-vuejs'
      const filtered = store.filteredTasks

      expect(filtered).toHaveLength(1)
      expect(filtered[0].scope).toBe('front-vuejs')
    })

    it('should filter by both agent_id and scope', () => {
      const store = useTasksStore()
      store.tasks = [
        { id: 1, title: 'Task 1', agent_assigned_id: 1, scope: 'front-vuejs', status: 'todo' },
        { id: 2, title: 'Task 2', agent_assigned_id: 2, scope: 'back-electron', status: 'todo' },
        { id: 3, title: 'Task 3', agent_assigned_id: 1, scope: 'back-electron', status: 'todo' },
      ] as never

      store.selectedAgentId = 1
      store.selectedPerimetre = 'front-vuejs'
      const filtered = store.filteredTasks

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(1)
    })
  })

  describe('tasksByStatus', () => {
    it('should group tasks by status', () => {
      const store = useTasksStore()
      store.tasks = [
        { id: 1, title: 'Task 1', agent_assigned_id: 1, scope: 'front', status: 'todo' },
        { id: 2, title: 'Task 2', agent_assigned_id: 1, scope: 'front', status: 'todo' },
        { id: 3, title: 'Task 3', agent_assigned_id: 1, scope: 'front', status: 'in_progress' },
        { id: 4, title: 'Task 4', agent_assigned_id: 1, scope: 'front', status: 'done' },
        { id: 5, title: 'Task 5', agent_assigned_id: 1, scope: 'front', status: 'archived' },
        { id: 6, title: 'Task 6', agent_assigned_id: 1, scope: 'front', status: 'archived' },
      ] as never

      const byStatus = store.tasksByStatus

      expect(byStatus.todo).toHaveLength(2)
      expect(byStatus.in_progress).toHaveLength(1)
      expect(byStatus.done).toHaveLength(1)
      expect(byStatus.archived).toHaveLength(2) // archivé + validé
    })
  })

  describe('toggleAgentFilter', () => {
    it('should toggle agent filter on', () => {
      const store = useTasksStore()
      store.selectedAgentId = null

      store.toggleAgentFilter(1)

      expect(store.selectedAgentId).toBe(1)
    })

    it('should toggle agent filter off when same agent selected', () => {
      const store = useTasksStore()
      store.selectedAgentId = 1

      store.toggleAgentFilter(1)

      expect(store.selectedAgentId).toBeNull()
    })

    it('should switch to different agent', () => {
      const store = useTasksStore()
      store.selectedAgentId = 1

      store.toggleAgentFilter(2)

      expect(store.selectedAgentId).toBe(2)
    })
  })

  describe('togglePerimetreFilter', () => {
    it('should toggle scope filter on', () => {
      const store = useTasksStore()
      store.selectedPerimetre = null

      store.togglePerimetreFilter('front-vuejs')

      expect(store.selectedPerimetre).toBe('front-vuejs')
    })

    it('should toggle scope filter off when same scope selected', () => {
      const store = useTasksStore()
      store.selectedPerimetre = 'front-vuejs'

      store.togglePerimetreFilter('front-vuejs')

      expect(store.selectedPerimetre).toBeNull()
    })
  })

  describe('normalizeRow (via refresh)', () => {
    it('should populate tasks after refresh with queryDb data', async () => {
      const store = useTasksStore()
      store.dbPath = '/test/db'

      // Simulate queryDb returning proper rows
      // Order: live tasks (todo/in_progress), done tasks (capped), agents, stats, perimetres
      mockElectronAPI.queryDb
        .mockResolvedValueOnce([{ id: 1, title: 'Task One', status: 'todo', agent_assigned_id: null }]) // live tasks
        .mockResolvedValueOnce([]) // done tasks (capped)
        .mockResolvedValueOnce([{ id: 10, name: 'dev-front', type: 'scoped', scope: 'front-vuejs' }]) // agents
        .mockResolvedValueOnce([{ status: 'todo', count: 1 }]) // stats
        .mockResolvedValueOnce([]) // perimetres

      await store.refresh()

      expect(store.tasks).toHaveLength(1)
      expect(store.tasks[0].title).toBe('Task One')
      expect(store.tasks[0].status).toBe('todo')
      expect(store.agents).toHaveLength(1)
      expect(store.agents[0].name).toBe('dev-front')
      expect(store.stats.todo).toBe(1)
    })

    it('should handle string fields from queryDb unchanged', async () => {
      const store = useTasksStore()
      store.dbPath = '/test/db'

      mockElectronAPI.queryDb
        .mockResolvedValueOnce([{ id: 42, title: 'Already string', status: 'done', description: 'Some desc' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      await store.refresh()

      expect(store.tasks).toHaveLength(1)
      expect(store.tasks[0].title).toBe('Already string')
      expect(store.tasks[0].description).toBe('Some desc')
    })
  })

  describe('query', () => {
    it('should return empty array when dbPath is null', async () => {
      const store = useTasksStore()
      store.dbPath = null

      const result = await store.query('SELECT * FROM tasks')

      expect(result).toEqual([])
      expect(mockElectronAPI.queryDb).not.toHaveBeenCalled()
    })

    it('should call queryDb when dbPath is set', async () => {
      const store = useTasksStore()
      store.dbPath = '/test/path/db'
      mockElectronAPI.queryDb.mockResolvedValueOnce([{ id: 1 }])

      const result = await store.query('SELECT * FROM tasks')

      expect(mockElectronAPI.queryDb).toHaveBeenCalledWith('/test/path/db', 'SELECT * FROM tasks', undefined)
      expect(result).toEqual([{ id: 1 }])
    })
  })
})
