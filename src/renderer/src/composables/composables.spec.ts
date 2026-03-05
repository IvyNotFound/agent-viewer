/**
 * Tests for composables: useToolStats, useToast, useConfirmDialog,
 * useSidebarGroups, useSidebarDragDrop (T840)
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'

// ─── Mock electronAPI ────────────────────────────────────────────────────────
const mockElectronAPI = {
  queryDb: vi.fn().mockResolvedValue([]),
  watchDb: vi.fn().mockResolvedValue(undefined),
  unwatchDb: vi.fn().mockResolvedValue(undefined),
  onDbChanged: vi.fn().mockReturnValue(() => {}),
  agentGroupsList: vi.fn().mockResolvedValue({ success: true, groups: [] }),
  agentGroupsCreate: vi.fn().mockResolvedValue({ success: true, group: { id: 1, name: 'NewGroup', sort_order: 0, created_at: '' } }),
  agentGroupsRename: vi.fn().mockResolvedValue({ success: true }),
  agentGroupsDelete: vi.fn().mockResolvedValue({ success: true }),
  agentGroupsSetMember: vi.fn().mockResolvedValue({ success: true }),
  selectProjectDir: vi.fn().mockResolvedValue(null),
  showConfirmDialog: vi.fn().mockResolvedValue(true),
  migrateDb: vi.fn().mockResolvedValue({ success: true }),
  terminalKill: vi.fn(),
  findProjectDb: vi.fn().mockResolvedValue(null),
  getTaskLinks: vi.fn().mockResolvedValue({ success: true, links: [] }),
  getTaskAssignees: vi.fn().mockResolvedValue({ success: true, assignees: [] }),
  agentKill: vi.fn(),
}

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
})

// ─── useToolStats ─────────────────────────────────────────────────────────────
describe('useToolStats (T840)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('toolStats is empty when hookEvents store has no events', async () => {
    const { useHookEventsStore } = await import('@renderer/stores/hookEvents')
    const { useToolStats } = await import('@renderer/composables/useToolStats')

    useHookEventsStore() // initialize
    const { toolStats } = useToolStats()
    expect(toolStats.value).toHaveLength(0)
  })

  it('toolStats aggregates calls by tool_name from PreToolUse events', async () => {
    const { useHookEventsStore } = await import('@renderer/stores/hookEvents')
    const { useToolStats } = await import('@renderer/composables/useToolStats')

    const hookStore = useHookEventsStore()
    hookStore.push({ event: 'PreToolUse', payload: { tool_name: 'Bash', session_id: 'A' }, ts: 1000 })
    hookStore.push({ event: 'PreToolUse', payload: { tool_name: 'Bash', session_id: 'A' }, ts: 2000 })
    hookStore.push({ event: 'PreToolUse', payload: { tool_name: 'Read', session_id: 'A' }, ts: 3000 })

    const { toolStats } = useToolStats()
    const bash = toolStats.value.find(s => s.name === 'Bash')
    const read = toolStats.value.find(s => s.name === 'Read')

    expect(bash?.calls).toBe(2)
    expect(read?.calls).toBe(1)
  })

  it('toolStats calculates avgDurationMs from Pre/PostToolUse by toolUseId', async () => {
    const { useHookEventsStore } = await import('@renderer/stores/hookEvents')
    const { useToolStats } = await import('@renderer/composables/useToolStats')

    const hookStore = useHookEventsStore()
    hookStore.push({ event: 'PreToolUse', payload: { tool_name: 'Glob', session_id: 'A', tool_use_id: 'uid-1' }, ts: 1000 })
    hookStore.push({ event: 'PostToolUse', payload: { session_id: 'A', tool_use_id: 'uid-1' }, ts: 1500 })

    const { toolStats } = useToolStats()
    const glob = toolStats.value.find(s => s.name === 'Glob')

    expect(glob?.avgDurationMs).toBe(500)
  })

  it('toolStats.errors counts PostToolUseFailure events', async () => {
    const { useHookEventsStore } = await import('@renderer/stores/hookEvents')
    const { useToolStats } = await import('@renderer/composables/useToolStats')

    const hookStore = useHookEventsStore()
    hookStore.push({ event: 'PreToolUse', payload: { tool_name: 'Bash', session_id: 'A' }, ts: 1000 })
    hookStore.push({ event: 'PostToolUseFailure', payload: { tool_name: 'Bash', session_id: 'A' }, ts: 1200 })

    const { toolStats } = useToolStats()
    const bash = toolStats.value.find(s => s.name === 'Bash')

    expect(bash?.errors).toBe(1)
    expect(bash?.errorRate).toBeGreaterThan(0)
  })

  it('toolStats sorts by calls DESC', async () => {
    const { useHookEventsStore } = await import('@renderer/stores/hookEvents')
    const { useToolStats } = await import('@renderer/composables/useToolStats')

    const hookStore = useHookEventsStore()
    hookStore.push({ event: 'PreToolUse', payload: { tool_name: 'Read', session_id: 'A' }, ts: 1 })
    hookStore.push({ event: 'PreToolUse', payload: { tool_name: 'Bash', session_id: 'A' }, ts: 2 })
    hookStore.push({ event: 'PreToolUse', payload: { tool_name: 'Bash', session_id: 'A' }, ts: 3 })
    hookStore.push({ event: 'PreToolUse', payload: { tool_name: 'Bash', session_id: 'A' }, ts: 4 })

    const { toolStats } = useToolStats()
    expect(toolStats.value[0].name).toBe('Bash')
    expect(toolStats.value[0].calls).toBe(3)
    expect(toolStats.value[1].name).toBe('Read')
  })

  it('avgDurationMs is null when no PostToolUse paired', async () => {
    const { useHookEventsStore } = await import('@renderer/stores/hookEvents')
    const { useToolStats } = await import('@renderer/composables/useToolStats')

    const hookStore = useHookEventsStore()
    hookStore.push({ event: 'PreToolUse', payload: { tool_name: 'Write', session_id: 'A' }, ts: 1000 })

    const { toolStats } = useToolStats()
    const write = toolStats.value.find(s => s.name === 'Write')

    expect(write?.avgDurationMs).toBeNull()
  })
})

// ─── useToast ─────────────────────────────────────────────────────────────────
describe('useToast (T840)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Reset module-level singleton state by re-importing fresh
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('push() adds a toast with correct id, message and type', async () => {
    const { useToast } = await import('@renderer/composables/useToast')
    const { toasts, push, dismiss } = useToast()

    // Clear any pre-existing toasts from singleton
    while (toasts.value.length > 0) {
      dismiss(toasts.value[0].id)
    }

    push('Test error', 'error')

    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].message).toBe('Test error')
    expect(toasts.value[0].type).toBe('error')
    expect(toasts.value[0].id).toBeGreaterThan(0)

    // cleanup
    dismiss(toasts.value[0].id)
  })

  it('push() with default type is error', async () => {
    const { useToast } = await import('@renderer/composables/useToast')
    const { toasts, push, dismiss } = useToast()

    while (toasts.value.length > 0) dismiss(toasts.value[0].id)

    push('Warning msg')
    expect(toasts.value[0].type).toBe('error')

    dismiss(toasts.value[0].id)
  })

  it('dismiss(id) removes the toast from the list', async () => {
    const { useToast } = await import('@renderer/composables/useToast')
    const { toasts, push, dismiss } = useToast()

    while (toasts.value.length > 0) dismiss(toasts.value[0].id)

    push('To remove', 'warn')
    const id = toasts.value[0].id
    dismiss(id)

    expect(toasts.value.find(t => t.id === id)).toBeUndefined()
  })

  it('auto-dismisses after duration using fake timers', async () => {
    const { useToast } = await import('@renderer/composables/useToast')
    const { toasts, push, dismiss } = useToast()

    while (toasts.value.length > 0) dismiss(toasts.value[0].id)

    push('Auto dismiss', 'info', 3000)
    const id = toasts.value[0].id

    vi.advanceTimersByTime(2999)
    expect(toasts.value.find(t => t.id === id)).toBeDefined()

    vi.advanceTimersByTime(2)
    expect(toasts.value.find(t => t.id === id)).toBeUndefined()
  })

  it('caps at 5 toasts (oldest removed on 6th push)', async () => {
    const { useToast } = await import('@renderer/composables/useToast')
    const { toasts, push, dismiss } = useToast()

    while (toasts.value.length > 0) dismiss(toasts.value[0].id)

    for (let i = 0; i < 6; i++) push(`msg ${i}`, 'info', 60000)

    expect(toasts.value).toHaveLength(5)

    // cleanup
    while (toasts.value.length > 0) dismiss(toasts.value[0].id)
  })
})

// ─── useConfirmDialog ─────────────────────────────────────────────────────────
describe('useConfirmDialog (T840)', () => {
  it('confirm() returns a Promise that resolves true when accept() is called', async () => {
    const { useConfirmDialog } = await import('@renderer/composables/useConfirmDialog')
    // Reset pending via cancel first if needed
    const { confirm, accept, cancel } = useConfirmDialog()
    cancel() // clear any pre-existing pending

    const p = confirm({ title: 'Delete?', message: 'Are you sure?' })
    accept()

    const result = await p
    expect(result).toBe(true)
  })

  it('confirm() returns false when cancel() is called', async () => {
    const { useConfirmDialog } = await import('@renderer/composables/useConfirmDialog')
    const { confirm, cancel } = useConfirmDialog()
    cancel() // reset

    const p = confirm({ title: 'Delete?', message: 'Are you sure?' })
    cancel()

    const result = await p
    expect(result).toBe(false)
  })

  it('pending is null by default, non-null during confirmation', async () => {
    const { useConfirmDialog } = await import('@renderer/composables/useConfirmDialog')
    const { pending, confirm, cancel } = useConfirmDialog()
    cancel() // reset

    expect(pending.value).toBeNull()

    const p = confirm({ title: 'Test', message: 'msg' })
    expect(pending.value).not.toBeNull()
    expect(pending.value?.options.title).toBe('Test')

    cancel()
    await p
    expect(pending.value).toBeNull()
  })

  it('second confirm() resolves first one with false (replacement behavior)', async () => {
    const { useConfirmDialog } = await import('@renderer/composables/useConfirmDialog')
    const { confirm, cancel } = useConfirmDialog()
    cancel() // reset

    const p1 = confirm({ title: 'First', message: 'First confirm' })
    const p2 = confirm({ title: 'Second', message: 'Second confirm' })

    cancel()
    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1).toBe(false) // displaced by second confirm
    expect(r2).toBe(false) // cancelled
  })
})

// ─── useSidebarGroups ─────────────────────────────────────────────────────────
describe('useSidebarGroups (T840)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('dbPath', '/test/project.db')
  })

  it('startRename() populates renamingGroupId and renameGroupName', async () => {
    const { useSidebarGroups } = await import('@renderer/composables/useSidebarGroups')
    const { renamingGroupId, renameGroupName, startRename } = useSidebarGroups()

    expect(renamingGroupId.value).toBeNull()

    await startRename({ id: 5, name: 'MyGroup' })

    expect(renamingGroupId.value).toBe(5)
    expect(renameGroupName.value).toBe('MyGroup')
  })

  it('cancelRename() sets renamingGroupId back to null', async () => {
    const { useSidebarGroups } = await import('@renderer/composables/useSidebarGroups')
    const { renamingGroupId, startRename, cancelRename } = useSidebarGroups()

    await startRename({ id: 3, name: 'ToCancel' })
    expect(renamingGroupId.value).toBe(3)

    cancelRename()
    expect(renamingGroupId.value).toBeNull()
  })

  it('confirmRename() calls store.renameAgentGroup IPC and resets renamingGroupId', async () => {
    const { useTasksStore } = await import('@renderer/stores/tasks')
    const { useSidebarGroups } = await import('@renderer/composables/useSidebarGroups')

    const store = useTasksStore()
    const spy = vi.spyOn(store, 'renameAgentGroup').mockResolvedValue(undefined)

    const { renamingGroupId, renameGroupName, confirmRename } = useSidebarGroups()
    renamingGroupId.value = 7
    renameGroupName.value = 'NewName'

    await confirmRename(7)

    expect(spy).toHaveBeenCalledWith(7, 'NewName')
    expect(renamingGroupId.value).toBeNull()
  })

  it('confirmCreateGroup() with empty name does not call store.createAgentGroup', async () => {
    const { useTasksStore } = await import('@renderer/stores/tasks')
    const { useSidebarGroups } = await import('@renderer/composables/useSidebarGroups')

    const store = useTasksStore()
    const spy = vi.spyOn(store, 'createAgentGroup').mockResolvedValue(null)

    const { newGroupName, confirmCreateGroup } = useSidebarGroups()
    newGroupName.value = '   ' // whitespace only

    await confirmCreateGroup()

    expect(spy).not.toHaveBeenCalled()
  })

  it('handleDeleteGroup() with members sets confirmDeleteGroup (does not delete immediately)', async () => {
    const { useTasksStore } = await import('@renderer/stores/tasks')
    const { useSidebarGroups } = await import('@renderer/composables/useSidebarGroups')

    const store = useTasksStore()
    store.agentGroups = [{ id: 10, name: 'GroupWithMembers', sort_order: 0, created_at: '', members: [{ agent_id: 1, sort_order: 0 }] }]
    const deleteSpy = vi.spyOn(store, 'deleteAgentGroup').mockResolvedValue(undefined)

    const { confirmDeleteGroup, handleDeleteGroup } = useSidebarGroups()

    await handleDeleteGroup(10)

    expect(confirmDeleteGroup.value).toEqual({ groupId: 10 })
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('onConfirmDeleteGroup() calls store.deleteAgentGroup and clears confirmDeleteGroup', async () => {
    const { useTasksStore } = await import('@renderer/stores/tasks')
    const { useSidebarGroups } = await import('@renderer/composables/useSidebarGroups')

    const store = useTasksStore()
    const deleteSpy = vi.spyOn(store, 'deleteAgentGroup').mockResolvedValue(undefined)

    const { confirmDeleteGroup, onConfirmDeleteGroup } = useSidebarGroups()
    confirmDeleteGroup.value = { groupId: 42 }

    await onConfirmDeleteGroup()

    expect(deleteSpy).toHaveBeenCalledWith(42)
    expect(confirmDeleteGroup.value).toBeNull()
  })
})

// ─── useSidebarDragDrop ───────────────────────────────────────────────────────
describe('useSidebarDragDrop (T840)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('dbPath', '/test/project.db')
  })

  function makeDragEvent(overrides: Partial<DragEvent> & { dataTransferData?: Record<string, string> }): DragEvent {
    const data: Record<string, string> = overrides.dataTransferData ?? {}
    const dataTransfer = {
      setData: vi.fn((k: string, v: string) => { data[k] = v }),
      getData: vi.fn((k: string) => data[k] ?? ''),
      effectAllowed: '',
      dropEffect: '',
    } as unknown as DataTransfer

    return {
      preventDefault: vi.fn(),
      dataTransfer,
      currentTarget: document.createElement('div'),
      relatedTarget: null,
      ...overrides,
    } as unknown as DragEvent
  }

  it('onAgentDragStart() sets dragAgentId and stores data in dataTransfer', async () => {
    const { useSidebarDragDrop } = await import('@renderer/composables/useSidebarDragDrop')
    const { dragAgentId, onAgentDragStart } = useSidebarDragDrop()

    const agent = { id: 7, name: 'agent-x' } as never
    const event = makeDragEvent({})

    onAgentDragStart(event, agent)

    expect(dragAgentId.value).toBe(7)
    expect(event.dataTransfer!.setData).toHaveBeenCalledWith('agent-id', '7')
  })

  it('onGroupDrop() with valid agentId calls store.setAgentGroup', async () => {
    const { useTasksStore } = await import('@renderer/stores/tasks')
    const { useSidebarDragDrop } = await import('@renderer/composables/useSidebarDragDrop')

    const store = useTasksStore()
    const setSpy = vi.spyOn(store, 'setAgentGroup').mockResolvedValue(undefined)

    const { onGroupDrop } = useSidebarDragDrop()
    const event = makeDragEvent({ dataTransferData: { 'agent-id': '42' } })

    await onGroupDrop(event, 3)

    expect(setSpy).toHaveBeenCalledWith(42, 3)
  })

  it('onGroupDrop() with agentId=0 (empty string) does not call setAgentGroup', async () => {
    const { useTasksStore } = await import('@renderer/stores/tasks')
    const { useSidebarDragDrop } = await import('@renderer/composables/useSidebarDragDrop')

    const store = useTasksStore()
    const setSpy = vi.spyOn(store, 'setAgentGroup').mockResolvedValue(undefined)

    const { onGroupDrop } = useSidebarDragDrop()
    const event = makeDragEvent({ dataTransferData: { 'agent-id': '' } })

    await onGroupDrop(event, 3)

    expect(setSpy).not.toHaveBeenCalled()
  })

  it('onGroupDragLeave() clears dragOverGroupId when relatedTarget is outside', async () => {
    const { useSidebarDragDrop } = await import('@renderer/composables/useSidebarDragDrop')
    const { dragOverGroupId, onGroupDragLeave } = useSidebarDragDrop()

    dragOverGroupId.value = 5

    const container = document.createElement('div')
    const event = {
      currentTarget: container,
      relatedTarget: document.createElement('span'), // outside container
    } as unknown as DragEvent

    onGroupDragLeave(event)

    expect(dragOverGroupId.value).toBeNull()
  })

  it('onGroupDragLeave() does NOT clear dragOverGroupId when relatedTarget is inside', async () => {
    const { useSidebarDragDrop } = await import('@renderer/composables/useSidebarDragDrop')
    const { dragOverGroupId, onGroupDragLeave } = useSidebarDragDrop()

    dragOverGroupId.value = 5

    const container = document.createElement('div')
    const child = document.createElement('span')
    container.appendChild(child)

    const event = {
      currentTarget: container,
      relatedTarget: child, // inside container
    } as unknown as DragEvent

    onGroupDragLeave(event)

    // should NOT clear since relatedTarget is inside
    expect(dragOverGroupId.value).toBe(5)
  })
})
