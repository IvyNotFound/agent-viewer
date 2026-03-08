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


describe('stores/tasks — tasksByStatus with scope filter (mutation: ConditionalExpression)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.queryDb.mockResolvedValue([])
  })

  it('should return only tasks matching selectedScope', () => {
    const store = useTasksStore()
    store.tasks = [
      { id: 1, title: 'T1', agent_assigned_id: 1, scope: 'front-vuejs', status: 'todo' },
      { id: 2, title: 'T2', agent_assigned_id: 2, scope: 'back-electron', status: 'todo' },
      { id: 3, title: 'T3', agent_assigned_id: 3, scope: 'front-vuejs', status: 'in_progress' },
    ] as never

    store.selectedPerimetre = 'front-vuejs'
    const byStatus = store.tasksByStatus

    expect(byStatus.todo).toHaveLength(1)
    expect(byStatus.todo[0].id).toBe(1)
    expect(byStatus.in_progress).toHaveLength(1)
    expect(byStatus.in_progress[0].id).toBe(3)
    expect(byStatus.done).toHaveLength(0)
  })

  it('should return all tasks when selectedScope is null', () => {
    const store = useTasksStore()
    store.tasks = [
      { id: 1, title: 'T1', agent_assigned_id: 1, scope: 'front-vuejs', status: 'todo' },
      { id: 2, title: 'T2', agent_assigned_id: 2, scope: 'back-electron', status: 'done' },
    ] as never

    store.selectedPerimetre = null
    const byStatus = store.tasksByStatus

    expect(byStatus.todo).toHaveLength(1)
    expect(byStatus.done).toHaveLength(1)
  })

  it('should return empty groups when scope filter matches nothing', () => {
    const store = useTasksStore()
    store.tasks = [
      { id: 1, title: 'T1', agent_assigned_id: 1, scope: 'front-vuejs', status: 'todo' },
    ] as never

    store.selectedPerimetre = 'nonexistent-scope'
    const byStatus = store.tasksByStatus

    expect(byStatus.todo).toHaveLength(0)
    expect(byStatus.in_progress).toHaveLength(0)
    expect(byStatus.done).toHaveLength(0)
    expect(byStatus.archived).toHaveLength(0)
  })
})


describe('stores/tasks — DONE_TASKS_LIMIT (mutation: EqualityOperator L159)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
  })

  it('should set doneTasksLimited=true when done tasks count equals DONE_TASKS_LIMIT', async () => {
    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'

    const { DONE_TASKS_LIMIT } = await import('@renderer/stores/tasks')
    const doneTasks = Array.from({ length: DONE_TASKS_LIMIT }, (_, i) => ({
      id: i + 1, title: `Done ${i}`, status: 'done', agent_assigned_id: null,
    }))

    mockElectronAPI.queryDb
      .mockResolvedValueOnce([]) // live tasks
      .mockResolvedValueOnce(doneTasks) // done tasks
      .mockResolvedValueOnce([]) // agents
      .mockResolvedValueOnce([]) // stats
      .mockResolvedValueOnce([]) // perimetres
      .mockResolvedValueOnce([]) // boardAssignees

    await store.refresh()

    expect(store.doneTasksLimited).toBe(true)
  })

  it('should set doneTasksLimited=false when done tasks count is below DONE_TASKS_LIMIT', async () => {
    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'

    mockElectronAPI.queryDb
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1, title: 'Done 1', status: 'done', agent_assigned_id: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await store.refresh()

    expect(store.doneTasksLimited).toBe(false)
  })
})


describe('stores/tasks — setTaskStatut mutations', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('should only modify the targeted task — not other tasks', async () => {
    ;(mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus =
      vi.fn().mockResolvedValue({ success: true })

    const store = useTasksStore()
    store.$patch({
      dbPath: '/p/db',
      tasks: [
        { id: 1, status: 'todo', title: 'Task A' },
        { id: 2, status: 'todo', title: 'Task B' },
        { id: 3, status: 'todo', title: 'Task C' },
      ] as never,
    })

    await store.setTaskStatut(2, 'in_progress')

    expect(store.tasks[0].status).toBe('todo')
    expect(store.tasks[1].status).toBe('in_progress')
    expect(store.tasks[2].status).toBe('todo')
  })

  it('should not crash when task does not exist', async () => {
    ;(mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus =
      vi.fn().mockResolvedValue({ success: true })

    const store = useTasksStore()
    store.$patch({
      dbPath: '/p/db',
      tasks: [{ id: 1, status: 'todo', title: 'Task A' }] as never,
    })

    await expect(store.setTaskStatut(999, 'in_progress')).resolves.not.toThrow()
    expect(store.tasks[0].status).toBe('todo')
  })

  it('should apply optimistic update before IPC resolves', async () => {
    let resolveIpc!: (value: unknown) => void
    ;(mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus =
      vi.fn().mockReturnValue(new Promise(resolve => { resolveIpc = resolve }))

    const store = useTasksStore()
    store.$patch({
      dbPath: '/p/db',
      tasks: [{ id: 1, status: 'todo', title: 'Task A' }] as never,
    })

    const promise = store.setTaskStatut(1, 'in_progress')
    expect(store.tasks[0].status).toBe('in_progress')

    resolveIpc({ success: true })
    await promise
    expect(store.tasks[0].status).toBe('in_progress')
  })

  it('should rollback optimistic update on IPC throw', async () => {
    ;(mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus =
      vi.fn().mockRejectedValue(new Error('Network error'))

    const store = useTasksStore()
    store.$patch({
      dbPath: '/p/db',
      tasks: [{ id: 1, status: 'todo', title: 'Task A' }] as never,
    })

    await expect(store.setTaskStatut(1, 'in_progress')).rejects.toThrow()
    expect(store.tasks[0].status).toBe('todo')
  })

  it('should return blockers from error object when IPC returns blockers', async () => {
    const blockers = [{ id: 5, title: 'Blocker', status: 'in_progress' }]
    ;(mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus =
      vi.fn().mockResolvedValue({ success: false, error: 'TASK_BLOCKED', blockers })

    const store = useTasksStore()
    store.$patch({
      dbPath: '/p/db',
      tasks: [{ id: 1, status: 'todo', title: 'Task A' }] as never,
    })

    let errorBlockers: unknown[] = []
    try {
      await store.setTaskStatut(1, 'in_progress')
    } catch (e) {
      errorBlockers = (e as { blockers: unknown[] }).blockers ?? []
    }

    expect(errorBlockers).toEqual(blockers)
  })

  it('should return empty blockers array when IPC error has no blockers', async () => {
    ;(mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus =
      vi.fn().mockResolvedValue({ success: false, error: 'UPDATE_FAILED' })

    const store = useTasksStore()
    store.$patch({
      dbPath: '/p/db',
      tasks: [{ id: 1, status: 'todo', title: 'Task A' }] as never,
    })

    let errorBlockers: unknown[] | undefined
    try {
      await store.setTaskStatut(1, 'in_progress')
    } catch (e) {
      errorBlockers = (e as { blockers?: unknown[] }).blockers
    }

    expect(errorBlockers).toEqual([])
  })

  it('should not call IPC when dbPath is null', async () => {
    ;(mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus =
      vi.fn().mockResolvedValue({ success: true })

    const store = useTasksStore()
    store.dbPath = null

    await store.setTaskStatut(1, 'in_progress')

    expect((mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus).not.toHaveBeenCalled()
  })
})
