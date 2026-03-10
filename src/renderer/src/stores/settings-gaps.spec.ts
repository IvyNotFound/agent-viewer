/**
 * settings-gaps.spec.ts
 * Coverage gaps for settings.ts — setDefaultCliInstance with empty cli,
 * loadWorktreeDefault branches, refreshCliDetection, setNotificationsEnabled
 * when permission already granted.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '@renderer/stores/settings'

const mockGetCliInstances = vi.fn().mockResolvedValue([])
const mockGetConfigValue = vi.fn().mockResolvedValue({ success: true, value: null })
const mockSetConfigValue = vi.fn().mockResolvedValue({ success: true })

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
  getCliInstances: mockGetCliInstances,
  getConfigValue: mockGetConfigValue,
  setConfigValue: mockSetConfigValue,
}

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
})


// ─── setDefaultCliInstance: empty cli string (falsy branch) ──────────────────

describe('stores/settings — setDefaultCliInstance empty cli (T1090)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('stores distro only when cli is empty string', () => {
    const store = useSettingsStore()
    store.setDefaultCliInstance('', 'Ubuntu-22.04')
    expect(store.defaultCliInstance).toBe('Ubuntu-22.04')
    expect(localStorage.getItem('defaultCliInstance')).toBe('Ubuntu-22.04')
  })

  it('stores cli:distro when cli is non-empty', () => {
    const store = useSettingsStore()
    store.setDefaultCliInstance('claude', 'Ubuntu-22.04')
    expect(store.defaultCliInstance).toBe('claude:Ubuntu-22.04')
  })

  it('empty cli removes legacy defaultClaudeInstance key', () => {
    localStorage.setItem('defaultClaudeInstance', 'OldDistro')
    const store = useSettingsStore()
    store.setDefaultCliInstance('', 'NewDistro')
    expect(localStorage.getItem('defaultClaudeInstance')).toBeNull()
    expect(localStorage.getItem('defaultCliInstance')).toBe('NewDistro')
  })
})


// ─── loadWorktreeDefault: value branches ─────────────────────────────────────

describe('stores/settings — loadWorktreeDefault (T1143)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('defaults to true when getConfigValue returns null value', async () => {
    mockGetConfigValue.mockResolvedValue({ success: true, value: null })
    const store = useSettingsStore()
    await store.loadWorktreeDefault('/fake/db')
    expect(store.worktreeDefault).toBe(true)
  })

  it('sets worktreeDefault to false when stored value is "0"', async () => {
    mockGetConfigValue.mockResolvedValue({ success: true, value: '0' })
    const store = useSettingsStore()
    await store.loadWorktreeDefault('/fake/db')
    expect(store.worktreeDefault).toBe(false)
  })

  it('sets worktreeDefault to true when stored value is "1"', async () => {
    mockGetConfigValue.mockResolvedValue({ success: true, value: '1' })
    const store = useSettingsStore()
    await store.loadWorktreeDefault('/fake/db')
    expect(store.worktreeDefault).toBe(true)
  })

  it('sets worktreeDefault to true when stored value is any non-"0" string', async () => {
    mockGetConfigValue.mockResolvedValue({ success: true, value: 'yes' })
    const store = useSettingsStore()
    await store.loadWorktreeDefault('/fake/db')
    expect(store.worktreeDefault).toBe(true)
  })

  it('keeps default true when IPC throws', async () => {
    mockGetConfigValue.mockRejectedValue(new Error('IPC error'))
    const store = useSettingsStore()
    await store.loadWorktreeDefault('/fake/db')
    expect(store.worktreeDefault).toBe(true)
  })

  it('calls getConfigValue with correct dbPath and key', async () => {
    mockGetConfigValue.mockResolvedValue({ success: true, value: null })
    const store = useSettingsStore()
    await store.loadWorktreeDefault('/my/project/.claude/project.db')
    expect(mockGetConfigValue).toHaveBeenCalledWith('/my/project/.claude/project.db', 'worktree_default')
  })

  it('keeps default true when success is false', async () => {
    mockGetConfigValue.mockResolvedValue({ success: false, value: '0' })
    const store = useSettingsStore()
    await store.loadWorktreeDefault('/fake/db')
    // success=false → condition `result.success && result.value !== null` is false → keep default
    expect(store.worktreeDefault).toBe(true)
  })
})


// ─── refreshCliDetection: try/catch/finally branches ─────────────────────────

describe('stores/settings — refreshCliDetection (T1013)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('populates allCliInstances on success', async () => {
    const instances = [{ cli: 'claude', distro: 'Ubuntu', enabled: true }]
    mockGetCliInstances.mockResolvedValue(instances)
    const store = useSettingsStore()

    await store.refreshCliDetection()

    expect(store.allCliInstances).toEqual(instances)
    expect(store.detectingClis).toBe(false)
  })

  it('sets allCliInstances to empty array on error', async () => {
    mockGetCliInstances.mockRejectedValue(new Error('detection failed'))
    const store = useSettingsStore()

    await store.refreshCliDetection()

    expect(store.allCliInstances).toEqual([])
    expect(store.detectingClis).toBe(false)
  })

  it('sets detectingClis to true during fetch', async () => {
    let resolveDetect: (v: unknown) => void
    mockGetCliInstances.mockReturnValue(new Promise(r => { resolveDetect = r }))
    const store = useSettingsStore()

    const p = store.refreshCliDetection()
    expect(store.detectingClis).toBe(true)

    resolveDetect!([])
    await p
    expect(store.detectingClis).toBe(false)
  })

  it('resets detectingClis to false even when IPC throws', async () => {
    mockGetCliInstances.mockRejectedValue(new Error('fail'))
    const store = useSettingsStore()

    await store.refreshCliDetection()

    expect(store.detectingClis).toBe(false)
  })

  it('passes forceRefresh=true to IPC when called with true', async () => {
    mockGetCliInstances.mockResolvedValue([])
    const store = useSettingsStore()

    await store.refreshCliDetection(true)

    expect(mockGetCliInstances).toHaveBeenCalledWith(undefined, true)
  })

  it('passes forceRefresh=false when called without argument', async () => {
    mockGetCliInstances.mockResolvedValue([])
    const store = useSettingsStore()

    await store.refreshCliDetection()

    expect(mockGetCliInstances).toHaveBeenCalledWith(undefined, false)
  })
})


// ─── setNotificationsEnabled: permission already granted short-circuit ────────

describe('stores/settings — setNotificationsEnabled permission already granted', () => {
  const mockRequestPermission = vi.fn()

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('enables without calling requestPermission when permission is already granted', async () => {
    ;(global as Record<string, unknown>)['Notification'] = {
      permission: 'granted',
      requestPermission: mockRequestPermission,
    }
    const store = useSettingsStore()

    await store.setNotificationsEnabled(true)

    expect(mockRequestPermission).not.toHaveBeenCalled()
    expect(store.notificationsEnabled).toBe(true)
  })

  it('requests permission when permission is "default"', async () => {
    mockRequestPermission.mockResolvedValue('granted')
    ;(global as Record<string, unknown>)['Notification'] = {
      permission: 'default',
      requestPermission: mockRequestPermission,
    }
    const store = useSettingsStore()

    await store.setNotificationsEnabled(true)

    expect(mockRequestPermission).toHaveBeenCalledOnce()
    expect(store.notificationsEnabled).toBe(true)
  })
})
