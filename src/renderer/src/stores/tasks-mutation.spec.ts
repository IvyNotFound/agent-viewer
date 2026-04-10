/**
 * tasks-mutation.spec.ts
 * Targets surviving ArithmeticOperator and EqualityOperator mutations in tasks.ts.
 * Focus: stats counter exact values, status EqualityOperator comparisons,
 * setTaskStatut with impossible transitions, filter computed precision.
 * T1348
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTasksStore } from '@renderer/stores/tasks'

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
  agentGroupsCreate: vi.fn().mockResolvedValue({ success: true, group: { id: 1, name: 'G', sort_order: 0, created_at: '' } }),
  agentGroupsRename: vi.fn().mockResolvedValue({ success: true }),
  agentGroupsDelete: vi.fn().mockResolvedValue({ success: true }),
  agentGroupsSetMember: vi.fn().mockResolvedValue({ success: true }),
  agentGroupsSetParent: vi.fn().mockResolvedValue({ success: true }),
  getConfigValue: vi.fn().mockResolvedValue({ success: false, value: null }),
  agentKill: vi.fn(),
}

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
})


// ─── ArithmeticOperator: stats counters exact values from refresh ─────────────
// Mutation target: +/- 1 on count aggregation — verify exact numeric values

describe('tasks — stats counters exact arithmetic from refresh', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
  })

  it('stats.todo equals exactly the count from rawStats (not count±1)', async () => {
    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'

    mockElectronAPI.queryDb
      .mockResolvedValueOnce([]) // live tasks
      .mockResolvedValueOnce([]) // done tasks
      .mockResolvedValueOnce([]) // agents
      .mockResolvedValueOnce([
        { status: 'todo', count: 7 },
        { status: 'in_progress', count: 3 },
        { status: 'done', count: 12 },
        { status: 'archived', count: 1 },
      ])
      .mockResolvedValueOnce([]) // perimetres
      .mockResolvedValueOnce([]) // boardAssignees

    await store.refresh()

    expect(store.stats.todo).toBe(7)
    expect(store.stats.in_progress).toBe(3)
    expect(store.stats.done).toBe(12)
    expect(store.stats.archived).toBe(1)
  })

  it('stats.todo=1 is distinguishable from stats.todo=2', async () => {
    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'

    mockElectronAPI.queryDb
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'todo', count: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await store.refresh()

    expect(store.stats.todo).toBe(1)
    expect(store.stats.todo).not.toBe(0)
    expect(store.stats.todo).not.toBe(2)
  })

  it('stats.done=5 is distinguishable from stats.done=4 or 6', async () => {
    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'

    mockElectronAPI.queryDb
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'done', count: 5 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await store.refresh()

    expect(store.stats.done).toBe(5)
    expect(store.stats.done).not.toBe(4)
    expect(store.stats.done).not.toBe(6)
  })

  it('stats stay zero for statuses not in rawStats', async () => {
    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'

    mockElectronAPI.queryDb
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'todo', count: 3 }]) // only todo
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await store.refresh()

    expect(store.stats.todo).toBe(3)
    expect(store.stats.in_progress).toBe(0)
    expect(store.stats.done).toBe(0)
    expect(store.stats.archived).toBe(0)
  })
})


// ─── EqualityOperator: status in tasksByStatus grouping ──────────────────────
// Mutation target: replace 'done' === status with !== → task ends in wrong bucket

describe('tasks — tasksByStatus status equality grouping', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('task with status "done" goes into done bucket only (not in todo/in_progress/archived)', () => {
    const store = useTasksStore()
    store.tasks = [{ id: 1, title: 'Done T', status: 'done', agent_assigned_id: null }] as never

    const byStatus = store.tasksByStatus

    expect(byStatus.done).toHaveLength(1)
    expect(byStatus.todo).toHaveLength(0)
    expect(byStatus.in_progress).toHaveLength(0)
    expect(byStatus.archived).toHaveLength(0)
  })

  it('task with status "todo" goes into todo bucket only', () => {
    const store = useTasksStore()
    store.tasks = [{ id: 2, title: 'Todo T', status: 'todo', agent_assigned_id: null }] as never

    const byStatus = store.tasksByStatus

    expect(byStatus.todo).toHaveLength(1)
    expect(byStatus.done).toHaveLength(0)
  })

  it('task with status "in_progress" goes into in_progress bucket only', () => {
    const store = useTasksStore()
    store.tasks = [{ id: 3, title: 'WIP T', status: 'in_progress', agent_assigned_id: null }] as never

    const byStatus = store.tasksByStatus

    expect(byStatus.in_progress).toHaveLength(1)
    expect(byStatus.todo).toHaveLength(0)
    expect(byStatus.done).toHaveLength(0)
  })

  it('task with status "archived" goes into archived bucket only', () => {
    const store = useTasksStore()
    store.tasks = [{ id: 4, title: 'Arch T', status: 'archived', agent_assigned_id: null }] as never

    const byStatus = store.tasksByStatus

    expect(byStatus.archived).toHaveLength(1)
    expect(byStatus.todo).toHaveLength(0)
  })

  it('different statuses are mutually exclusive — 4 tasks one per bucket', () => {
    const store = useTasksStore()
    store.tasks = [
      { id: 10, title: 'T', status: 'todo' },
      { id: 11, title: 'T', status: 'in_progress' },
      { id: 12, title: 'T', status: 'done' },
      { id: 13, title: 'T', status: 'archived' },
    ] as never

    const byStatus = store.tasksByStatus

    expect(byStatus.todo).toHaveLength(1)
    expect(byStatus.in_progress).toHaveLength(1)
    expect(byStatus.done).toHaveLength(1)
    expect(byStatus.archived).toHaveLength(1)
    // Total = 4 — no duplicates across buckets
    const total = byStatus.todo.length + byStatus.in_progress.length + byStatus.done.length + byStatus.archived.length + byStatus.rejected.length
    expect(total).toBe(4)
  })

  it('task with unknown status does not appear in any bucket', () => {
    const store = useTasksStore()
    store.tasks = [{ id: 99, title: 'Unknown', status: 'unknown_status' }] as never

    const byStatus = store.tasksByStatus

    expect(byStatus.todo).toHaveLength(0)
    expect(byStatus.in_progress).toHaveLength(0)
    expect(byStatus.done).toHaveLength(0)
    expect(byStatus.archived).toHaveLength(0)
  })
})


// ─── EqualityOperator: filteredTasks agent and scope filters ─────────────────
// Mutation target: !== becomes === or === becomes !== in filter predicates

describe('tasks — filteredTasks agent filter equality (EqualityOperator)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('selectedAgentId=5 keeps only tasks with agent_assigned_id=5, excludes agent=6', () => {
    const store = useTasksStore()
    store.tasks = [
      { id: 1, agent_assigned_id: 5, scope: null, status: 'todo' },
      { id: 2, agent_assigned_id: 6, scope: null, status: 'todo' },
      { id: 3, agent_assigned_id: 5, scope: null, status: 'done' },
    ] as never
    store.selectedAgentId = 5

    const filtered = store.filteredTasks
    expect(filtered.map(t => t.id)).toEqual([1, 3])
    // Mutation kill: must NOT include agent=6 (id=2)
    expect(filtered.find(t => t.id === 2)).toBeUndefined()
  })

  it('selectedAgentId=null includes all agents', () => {
    const store = useTasksStore()
    store.tasks = [
      { id: 1, agent_assigned_id: 5, status: 'todo' },
      { id: 2, agent_assigned_id: 6, status: 'todo' },
    ] as never
    store.selectedAgentId = null

    expect(store.filteredTasks).toHaveLength(2)
  })

  it('toggleAgentFilter sets the filter and a second call with same id clears it', () => {
    const store = useTasksStore()
    store.toggleAgentFilter(10)
    expect(store.selectedAgentId).toBe(10)

    store.toggleAgentFilter(10) // toggle off
    expect(store.selectedAgentId).toBeNull()
  })

  it('toggleAgentFilter with different id replaces the filter', () => {
    const store = useTasksStore()
    store.toggleAgentFilter(10)
    store.toggleAgentFilter(20)

    expect(store.selectedAgentId).toBe(20)
  })
})


// ─── EqualityOperator: filteredTasks scope filter ────────────────────────────

describe('tasks — filteredTasks scope filter equality (EqualityOperator)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('selectedPerimetre="front-vuejs" excludes tasks with scope="back-electron"', () => {
    const store = useTasksStore()
    store.tasks = [
      { id: 1, scope: 'front-vuejs', agent_assigned_id: null, status: 'todo' },
      { id: 2, scope: 'back-electron', agent_assigned_id: null, status: 'todo' },
    ] as never
    store.selectedPerimetre = 'front-vuejs'

    const filtered = store.filteredTasks
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe(1)
    // Mutation kill: must NOT include scope="back-electron"
    expect(filtered.find(t => t.id === 2)).toBeUndefined()
  })

  it('agent filter AND scope filter are both applied (combined AND)', () => {
    const store = useTasksStore()
    store.tasks = [
      { id: 1, agent_assigned_id: 5, scope: 'front-vuejs', status: 'todo' },
      { id: 2, agent_assigned_id: 5, scope: 'back-electron', status: 'todo' },
      { id: 3, agent_assigned_id: 6, scope: 'front-vuejs', status: 'todo' },
    ] as never
    store.selectedAgentId = 5
    store.selectedPerimetre = 'front-vuejs'

    const filtered = store.filteredTasks
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe(1)
  })
})


// ─── ArithmeticOperator: stats row.count assignment ──────────────────────────
// Mutation target: s[status] = row.count → s[status] = row.count ± 1

describe('tasks — stats row.count assigned exactly (ArithmeticOperator)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
  })

  it('stats.archived = 0 when count is 0, not 1 or -1', async () => {
    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'

    mockElectronAPI.queryDb
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'archived', count: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await store.refresh()

    expect(store.stats.archived).toBe(0)
    expect(store.stats.archived).not.toBe(1)
    expect(store.stats.archived).not.toBe(-1)
  })

  it('stats.in_progress = 10 not 9 or 11', async () => {
    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'

    mockElectronAPI.queryDb
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'in_progress', count: 10 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await store.refresh()

    expect(store.stats.in_progress).toBe(10)
    expect(store.stats.in_progress).not.toBe(9)
    expect(store.stats.in_progress).not.toBe(11)
  })
})


// ─── EqualityOperator: setTaskStatut impossible transition ───────────────────
// Tests the guard conditions in setTaskStatut

describe('tasks — setTaskStatut guard conditions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('returns early when dbPath is null — no IPC call', async () => {
    ;(mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus =
      vi.fn().mockResolvedValue({ success: true })

    const store = useTasksStore()
    store.dbPath = null

    await store.setTaskStatut(1, 'in_progress')

    expect((mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus).not.toHaveBeenCalled()
  })

  it('IPC is called with exactly the provided taskId (not taskId±1)', async () => {
    ;(mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus =
      vi.fn().mockResolvedValue({ success: true })

    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'
    store.tasks = [{ id: 42, status: 'todo', title: 'T' }] as never

    await store.setTaskStatut(42, 'in_progress')

    const call = (mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus.mock.calls[0]
    expect(call[1]).toBe(42)
    expect(call[1]).not.toBe(41)
    expect(call[1]).not.toBe(43)
  })

  it('rollback restores previousStatus exactly (not a different status)', async () => {
    ;(mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus =
      vi.fn().mockRejectedValue(new Error('fail'))

    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'
    store.tasks = [{ id: 1, status: 'todo', title: 'T' }] as never

    await expect(store.setTaskStatut(1, 'in_progress')).rejects.toThrow()

    // Rollback must restore 'todo', not another status
    expect(store.tasks[0].status).toBe('todo')
    expect(store.tasks[0].status).not.toBe('in_progress')
    expect(store.tasks[0].status).not.toBe('done')
  })

  it('rollback on success=false restores previousStatus exactly', async () => {
    ;(mockElectronAPI as Record<string, ReturnType<typeof vi.fn>>).tasksUpdateStatus =
      vi.fn().mockResolvedValue({ success: false, error: 'BLOCKED' })

    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'
    store.tasks = [{ id: 1, status: 'archived', title: 'T' }] as never

    await expect(store.setTaskStatut(1, 'in_progress')).rejects.toThrow()

    // Rollback: archived → in_progress failed → must be back to archived
    expect(store.tasks[0].status).toBe('archived')
  })
})


// ─── EqualityOperator: closeProject clears stats exactly ─────────────────────
// Mutation target: replace === 0 with !== 0 or stats values

describe('tasks — closeProject resets stats to zero', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
    mockElectronAPI.unwatchDb.mockResolvedValue(undefined)
  })

  it('stats are all exactly 0 after closeProject (not 1 or -1)', async () => {
    const store = useTasksStore()
    await store.setProject('/p', '/p/.claude/db')

    // Simulate non-zero stats
    store.stats.todo = 5
    store.stats.in_progress = 3
    store.stats.done = 10
    store.stats.archived = 2

    store.closeProject()

    expect(store.stats.todo).toBe(0)
    expect(store.stats.in_progress).toBe(0)
    expect(store.stats.done).toBe(0)
    expect(store.stats.archived).toBe(0)
  })

  it('tasks array is empty after closeProject (length = 0, not 1 or -1)', async () => {
    const store = useTasksStore()
    await store.setProject('/p', '/p/.claude/db')
    store.tasks = [{ id: 1, status: 'todo', title: 'T' }] as never

    store.closeProject()

    expect(store.tasks).toHaveLength(0)
  })
})
