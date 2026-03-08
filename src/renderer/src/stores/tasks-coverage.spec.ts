/**
 * tasks-coverage.spec.ts
 * Mutation tests for tasks.ts store (part 2/2) — StringLiteral, ConditionalExpression, ArrayDeclaration.
 * selectProject labels, closeProject state, query errors, watchForDb, notifications, stats.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTasksStore } from '@renderer/stores/tasks'
import { useTabsStore } from '@renderer/stores/tabs'
import { useSettingsStore } from '@renderer/stores/settings'

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

// ─── selectProject label for single terminal (StringLiteral) ─────────────────

describe('tasks — selectProject label for single terminal (StringLiteral)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.queryDb.mockResolvedValue([])
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
  })

  it('shows singular label for 1 non-WSL terminal', async () => {
    const tasksStore = useTasksStore()
    const tabsStore = useTabsStore()
    tabsStore.addTerminal('agent-1')
    mockElectronAPI.showConfirmDialog.mockResolvedValue(false)

    await tasksStore.selectProject()

    expect(mockElectronAPI.showConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ message: '1 session terminal ouverte' })
    )
  })

  it('shows singular label for 1 WSL terminal', async () => {
    const tasksStore = useTasksStore()
    const tabsStore = useTabsStore()
    tabsStore.addTerminal('agent-1', 'Ubuntu')
    mockElectronAPI.showConfirmDialog.mockResolvedValue(false)

    await tasksStore.selectProject()

    expect(mockElectronAPI.showConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ message: '1 session WSL ouverte' })
    )
  })
})

// ─── closeProject clears all state (ArrayDeclaration) ────────────────────────

describe('tasks — closeProject clears all state (ArrayDeclaration)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.queryDb.mockResolvedValue([])
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
    mockElectronAPI.agentGroupsList.mockResolvedValue({ success: true, groups: [] })
  })

  it('clears boardAssignees map on closeProject', async () => {
    const store = useTasksStore()
    await store.setProject('/p', '/p/.claude/db')
    store.boardAssignees.set(1, [{ agent_id: 10, agent_name: 'dev', role: 'primary', assigned_at: '' }])

    store.closeProject()

    expect(store.boardAssignees.size).toBe(0)
  })

  it('clears agents array on closeProject', async () => {
    const store = useTasksStore()
    await store.setProject('/p', '/p/.claude/db')
    store.agents = [{ id: 1, name: 'dev-front', type: 'dev', scope: 'front' }] as never

    store.closeProject()

    expect(store.agents).toHaveLength(0)
  })

  it('clears agentGroups array on closeProject', async () => {
    const store = useTasksStore()
    await store.setProject('/p', '/p/.claude/db')
    store.agentGroups = [{ id: 1, name: 'Frontend', position: 0, members: [] }] as never

    store.closeProject()

    expect(store.agentGroups).toHaveLength(0)
  })

  it('resets stats to zeros on closeProject', async () => {
    const store = useTasksStore()
    await store.setProject('/p', '/p/.claude/db')
    store.stats = { todo: 5, in_progress: 3, done: 2, archived: 1 }

    store.closeProject()

    expect(store.stats).toEqual({ todo: 0, in_progress: 0, done: 0, archived: 0 })
  })

  it('clears selectedAgentId and selectedPerimetre on closeProject', async () => {
    const store = useTasksStore()
    await store.setProject('/p', '/p/.claude/db')
    store.selectedAgentId = 42
    store.selectedPerimetre = 'front-vuejs'

    store.closeProject()

    expect(store.selectedAgentId).toBeNull()
    expect(store.selectedPerimetre).toBeNull()
  })
})

// ─── query non-Array response (LogicalOperator) ───────────────────────────────

describe('tasks — query non-Array response (LogicalOperator)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('returns empty array when queryDb returns non-Array object', async () => {
    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'
    mockElectronAPI.queryDb.mockResolvedValue({ error: 'permission denied' })

    const result = await store.query('SELECT * FROM tasks')

    expect(result).toEqual([])
  })

  it('returns empty array when queryDb returns null', async () => {
    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'
    mockElectronAPI.queryDb.mockResolvedValue(null)

    const result = await store.query('SELECT * FROM tasks')

    expect(result).toEqual([])
  })

  it('returns empty array when queryDb returns a string', async () => {
    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'
    mockElectronAPI.queryDb.mockResolvedValue('unexpected string')

    const result = await store.query('SELECT * FROM tasks')

    expect(result).toEqual([])
  })
})

// ─── watchForDb skip when document hidden (ConditionalExpression) ─────────────

describe('tasks — watchForDb skip when document hidden (ConditionalExpression)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.queryDb.mockResolvedValue([])
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
    mockElectronAPI.findProjectDb.mockResolvedValue(null)
  })

  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true })
  })

  it('skips findProjectDb tick when document is hidden', async () => {
    vi.useFakeTimers()
    const store = useTasksStore()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true })

    store.watchForDb('/my/project')
    await vi.advanceTimersByTimeAsync(2000)

    expect(mockElectronAPI.findProjectDb).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('calls findProjectDb when document is visible', async () => {
    vi.useFakeTimers()
    const store = useTasksStore()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true })

    store.watchForDb('/my/project')
    await vi.advanceTimersByTimeAsync(2000)

    expect(mockElectronAPI.findProjectDb).toHaveBeenCalledWith('/my/project')
    vi.useRealTimers()
  })
})

// ─── notifications body content and debounce (ArithmeticOperator L170) ───────

describe('tasks — notifications body and debounce (ArithmeticOperator L170)', () => {
  const originalNotification = global.Notification

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.queryDb.mockResolvedValue([])
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
  })

  afterEach(() => {
    global.Notification = originalNotification
  })

  it('includes agent_name in notification body', async () => {
    const mockCtor = vi.fn()
    ;(global as unknown as Record<string, unknown>).Notification = Object.assign(mockCtor, { permission: 'granted' })

    const store = useTasksStore()
    await store.setProject('/p', '/p/.claude/db')
    const s = useSettingsStore()
    s.notificationsEnabled = true
    store.tasks = [{ id: 77002, title: 'My Feature', status: 'todo', agent_assigned_id: null }] as never

    mockElectronAPI.queryDb
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 77002, title: 'My Feature', status: 'done', agent_name: 'dev-front', agent_assigned_id: 10 }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await store.refresh()

    expect(mockCtor).toHaveBeenCalledWith(
      'Task completed',
      expect.objectContaining({ body: 'My Feature — dev-front' })
    )
  })

  it('uses ? for agent_name when agent_name is not set', async () => {
    const mockCtor = vi.fn()
    ;(global as unknown as Record<string, unknown>).Notification = Object.assign(mockCtor, { permission: 'granted' })

    const store = useTasksStore()
    await store.setProject('/p', '/p/.claude/db')
    const s = useSettingsStore()
    s.notificationsEnabled = true
    store.tasks = [{ id: 77003, title: 'Unnamed Task', status: 'todo', agent_assigned_id: null }] as never

    mockElectronAPI.queryDb
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 77003, title: 'Unnamed Task', status: 'done', agent_assigned_id: null }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await store.refresh()

    expect(mockCtor).toHaveBeenCalledWith(
      'Task completed',
      expect.objectContaining({ body: 'Unnamed Task — ?' })
    )
  })

  it('debounces — second notification within 5s for same task is suppressed', async () => {
    const mockCtor = vi.fn()
    ;(global as unknown as Record<string, unknown>).Notification = Object.assign(mockCtor, { permission: 'granted' })

    const store = useTasksStore()
    await store.setProject('/p', '/p/.claude/db')
    const s = useSettingsStore()
    s.notificationsEnabled = true
    store.tasks = [{ id: 88001, title: 'Task D', status: 'todo', agent_assigned_id: null }] as never

    mockElectronAPI.queryDb
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 88001, title: 'Task D', status: 'done', agent_assigned_id: null }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await store.refresh()
    expect(mockCtor).toHaveBeenCalledTimes(1)

    store.tasks = [{ id: 88001, title: 'Task D', status: 'todo', agent_assigned_id: null }] as never
    mockElectronAPI.queryDb
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 88001, title: 'Task D', status: 'done', agent_assigned_id: null }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await store.refresh()
    // Still only 1 — debounce blocked the second notification
    expect(mockCtor).toHaveBeenCalledTimes(1)
  })
})

// ─── refresh stats multi-status (StringLiteral) ───────────────────────────────

describe('tasks — refresh stats multi-status (StringLiteral)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockElectronAPI.migrateDb.mockResolvedValue({ success: true })
    mockElectronAPI.watchDb.mockResolvedValue(undefined)
    mockElectronAPI.onDbChanged.mockReturnValue(() => {})
  })

  it('correctly aggregates all 4 status counts from stats query', async () => {
    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'
    mockElectronAPI.queryDb
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { status: 'todo', count: 7 },
        { status: 'in_progress', count: 3 },
        { status: 'done', count: 42 },
        { status: 'archived', count: 15 },
      ])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await store.refresh()

    expect(store.stats.todo).toBe(7)
    expect(store.stats.in_progress).toBe(3)
    expect(store.stats.done).toBe(42)
    expect(store.stats.archived).toBe(15)
  })

  it('ignores unknown status values in stats query', async () => {
    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'
    mockElectronAPI.queryDb
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { status: 'todo', count: 5 },
        { status: 'unknown_status', count: 999 },
      ])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await store.refresh()

    expect(store.stats.todo).toBe(5)
    expect(store.stats.in_progress).toBe(0)
    expect(store.stats.done).toBe(0)
    expect(store.stats.archived).toBe(0)
  })

  it('sets lastRefresh date after successful refresh', async () => {
    const store = useTasksStore()
    store.dbPath = '/p/.claude/db'
    mockElectronAPI.queryDb.mockResolvedValue([])

    const before = new Date()
    await store.refresh()

    expect(store.lastRefresh).toBeInstanceOf(Date)
    expect(store.lastRefresh!.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })
})
