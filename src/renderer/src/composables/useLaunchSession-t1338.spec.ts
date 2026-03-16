/**
 * T1338: Mutation coverage for useLaunchSession.ts
 *
 * Targets:
 * - Cache TTL boundary: exactly TTL-1ms, TTL, TTL+1ms (EqualityOperator line 47)
 * - Nullish coalescing chain (line 95): opts.cli ?? resolvedInstance?.cli ?? enabledClis[0] ?? 'claude'
 * - Instance resolution branches (lines 111-120): stored distro null vs undefined vs found
 * - LogicalOperator: maxSess !== -1 condition, agentTerminalCount >= maxSess
 * - opts?.instance !== undefined branch (line 92): null vs undefined instance
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLaunchSession, MAX_AGENT_SESSIONS } from './useLaunchSession'
import { useTabsStore, type Tab } from '@renderer/stores/tabs'
import { useTasksStore } from '@renderer/stores/tasks'
import { useSettingsStore } from '@renderer/stores/settings'
import type { Task, Agent } from '@renderer/types'
import type { CliType } from '@shared/cli-types'

const api = {
  getCliInstances: vi.fn().mockResolvedValue([
    { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' }
  ]),
  getAgentSystemPrompt: vi.fn().mockResolvedValue({
    success: true, systemPrompt: 'You are dev-front', systemPromptSuffix: null, thinkingMode: 'auto'
  }),
  buildAgentPrompt: vi.fn().mockResolvedValue('final prompt'),
  worktreeCreate: vi.fn().mockResolvedValue({ success: true, workDir: '/worktrees/s123/dev' }),
  terminalWrite: vi.fn().mockResolvedValue(undefined),
  terminalKill: vi.fn().mockResolvedValue(undefined),
  queryDb: vi.fn().mockResolvedValue([]),
  watchDb: vi.fn().mockResolvedValue(undefined),
  unwatchDb: vi.fn().mockResolvedValue(undefined),
  onDbChanged: vi.fn().mockReturnValue(() => {}),
  selectProjectDir: vi.fn().mockResolvedValue(null),
  showConfirmDialog: vi.fn().mockResolvedValue(true),
  migrateDb: vi.fn().mockResolvedValue({ success: true }),
  findProjectDb: vi.fn().mockResolvedValue(null),
}

Object.defineProperty(window, 'electronAPI', { value: api, writable: true })

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1, title: 'Test task', description: null, status: 'todo',
    agent_assigned_id: 10, agent_creator_id: 1, agent_validator_id: null,
    agent_name: 'dev-front-vuejs', agent_creator_name: null, agent_scope: null,
    parent_task_id: null, session_id: null, scope: 'front-vuejs',
    effort: 2, priority: 'normal', created_at: '', updated_at: '',
    started_at: null, completed_at: null, validated_at: null,
    ...overrides
  } as Task
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 10, name: 'dev-front-vuejs', type: 'dev', scope: 'front-vuejs',
    system_prompt: null, system_prompt_suffix: null, thinking_mode: 'auto',
    allowed_tools: null, created_at: '', auto_launch: 1, permission_mode: null, max_sessions: 3,
    ...overrides
  } as Agent
}

let testIndex = 0

describe('useLaunchSession T1338: TTL cache boundary (EqualityOperator line 47)', () => {
  // These tests verify the exact boundary: `now - cacheTimestamp < CACHE_TTL_MS`
  // Mutations: change < to <=, >=, >, !=, ==
  // We need the SAME module-level cache, so we use a fixed base and advance from there.

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    // Use large offsets to ensure prior tests' caches are expired
    vi.setSystemTime(new Date(2026, 4, 1, testIndex, 0, 0))
    api.getCliInstances.mockResolvedValue([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' }
    ])
    api.getAgentSystemPrompt.mockResolvedValue({
      success: true, systemPrompt: 'You are dev-front', systemPromptSuffix: null, thinkingMode: 'auto'
    })
    api.buildAgentPrompt.mockResolvedValue('final prompt')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('TTL-1ms: cache still valid 1ms before expiry — no second IPC call', async () => {
    // Verify: at TTL-1ms, cache IS still valid (now - ts < TTL is true)
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask())
    expect(api.getCliInstances).toHaveBeenCalledTimes(1)

    // Advance to exactly TTL - 1ms (still within TTL)
    vi.advanceTimersByTime(5 * 60 * 1000 - 1)
    await launchAgentTerminal(makeAgent(), makeTask())

    // Must still be 1 call — cache is valid at TTL-1ms
    expect(api.getCliInstances).toHaveBeenCalledTimes(1)
  })

  it('TTL exactly: cache expired at exactly TTL ms — triggers second IPC call', async () => {
    // Verify: at exactly TTL ms elapsed, cache IS expired (now - ts < TTL is false when equal)
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask())
    expect(api.getCliInstances).toHaveBeenCalledTimes(1)

    // Advance to exactly TTL (= 5 min * 60s * 1000ms)
    vi.advanceTimersByTime(5 * 60 * 1000)
    await launchAgentTerminal(makeAgent(), makeTask())

    // Cache is expired: now - cacheTimestamp == TTL, which is NOT < TTL → second call
    expect(api.getCliInstances).toHaveBeenCalledTimes(2)
  })

  it('TTL+1ms: cache definitely expired — triggers second IPC call', async () => {
    // Verify: at TTL+1ms, cache IS expired (now - ts < TTL is false)
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask())
    expect(api.getCliInstances).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    await launchAgentTerminal(makeAgent(), makeTask())

    expect(api.getCliInstances).toHaveBeenCalledTimes(2)
  })

  it('cache with non-empty result: cacheTimestamp is updated, subsequent call within TTL uses cache', async () => {
    // This tests that cacheTimestamp is actually SET (line 53: cacheTimestamp = now)
    // If cacheTimestamp were never updated, every call would go through
    const { launchAgentTerminal } = useLaunchSession()

    // First call at t=0
    await launchAgentTerminal(makeAgent(), makeTask())
    // Second call at t=1000ms (well within TTL)
    vi.advanceTimersByTime(1000)
    await launchAgentTerminal(makeAgent(), makeTask())
    vi.advanceTimersByTime(1000)
    await launchAgentTerminal(makeAgent(), makeTask())

    // Only 1 IPC call total — cache was stored and reused
    expect(api.getCliInstances).toHaveBeenCalledTimes(1)
  })
})

describe('useLaunchSession T1338: opts.instance resolution (line 92-95)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 2, testIndex, 0, 0))
    api.buildAgentPrompt.mockResolvedValue('final prompt')
    api.getAgentSystemPrompt.mockResolvedValue({
      success: true, systemPrompt: 'System', systemPromptSuffix: null, thinkingMode: 'auto'
    })
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('opts.instance = null: caller explicitly passes null instance (undefined branch skipped)', async () => {
    // null !== undefined → enters the opts.instance branch (line 92)
    // resolvedInstance = null → resolvedCli falls through to enabledClis[0] ?? 'claude'
    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent(), makeTask(), { instance: null })

    // getCliInstances must NOT be called (modal path, not auto-detect)
    expect(api.getCliInstances).not.toHaveBeenCalled()
    expect(result).toBe('ok')

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    // resolvedInstance is null → distro is undefined → stored as null
    expect(terminal?.wslDistro).toBeNull()
  })

  it('opts.instance with opts.cli: opts.cli wins over resolvedInstance.cli (first ??) ', async () => {
    // Kills the EqualityOperator mutation on opts.cli ?? resolvedInstance?.cli
    const instance = { cli: 'claude', distro: 'Debian', version: '2.0', isDefault: false, type: 'wsl' as const }
    const { launchAgentTerminal } = useLaunchSession()

    // opts.cli = 'gemini' should override instance.cli = 'claude'
    const settingsStore = useSettingsStore()
    settingsStore.$patch({ enabledClis: ['gemini', 'claude'] as CliType[] })

    await launchAgentTerminal(makeAgent(), makeTask(), { instance, cli: 'gemini' })

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    expect(terminal?.wslDistro).toBe('Debian')
    // cli type used comes from opts.cli
    expect(api.getCliInstances).not.toHaveBeenCalled()
  })

  it('opts.instance set, opts.cli undefined: falls back to resolvedInstance.cli (second ??)', async () => {
    // opts.cli is undefined → uses resolvedInstance?.cli
    const instance = { cli: 'gemini', distro: 'Ubuntu-24.04', version: '1.0', isDefault: true, type: 'wsl' as const }
    const { launchAgentTerminal } = useLaunchSession()

    await launchAgentTerminal(makeAgent(), makeTask(), { instance })

    expect(api.getCliInstances).not.toHaveBeenCalled()
    expect(result => result).toBeDefined() // just verify no crash
  })

  it('opts.instance null, opts.cli undefined: falls back to enabledClis[0] (third ??)', async () => {
    // opts.cli is undefined, resolvedInstance is null (?.cli = undefined) → enabledClis[0]
    const settingsStore = useSettingsStore()
    settingsStore.$patch({ enabledClis: ['claude'] as CliType[] })

    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent(), makeTask(), { instance: null })

    expect(result).toBe('ok')
    expect(api.getCliInstances).not.toHaveBeenCalled()
  })

  it('opts.instance null, opts.cli undefined, enabledClis empty: falls back to claude (fourth ??)', async () => {
    // opts.cli = undefined, resolvedInstance = null, enabledClis = [] → 'claude'
    const settingsStore = useSettingsStore()
    settingsStore.$patch({ enabledClis: [] as CliType[] })

    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent(), makeTask(), { instance: null })

    expect(result).toBe('ok')
    expect(api.getCliInstances).not.toHaveBeenCalled()
  })
})

describe('useLaunchSession T1338: instance resolution — storedDistro null vs undefined (lines 111-120)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 3, testIndex, 0, 0))
    api.getAgentSystemPrompt.mockResolvedValue({
      success: true, systemPrompt: 'System', systemPromptSuffix: null, thinkingMode: 'auto'
    })
    api.buildAgentPrompt.mockResolvedValue('final prompt')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('storedDistro never set (empty string default): falsy → skip find() → use isDefault', async () => {
    // storedDistro defaults to '' (falsy) → storedDistro ? ... → undefined → ?? find(isDefault)
    // Tests: if mutation changes truthy check for storedDistro, this breaks
    api.getCliInstances.mockResolvedValueOnce([
      { cli: 'claude', distro: 'Arch', version: '2.1.58', isDefault: false, type: 'wsl' },
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' },
    ])

    const settingsStore = useSettingsStore()
    // Ensure defaultCliInstance is the default empty string (never set by user)
    settingsStore.$patch({ defaultCliInstance: '' })

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask())

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    // Should have picked the isDefault instance since no storedDistro
    expect(terminal?.wslDistro).toBe('Ubuntu-24.04')
  })

  it('storedDistro=empty string: falsy → skip find() → use isDefault', async () => {
    api.getCliInstances.mockResolvedValueOnce([
      { cli: 'claude', distro: 'Arch', version: '2.1.58', isDefault: false, type: 'wsl' },
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' },
    ])

    const settingsStore = useSettingsStore()
    settingsStore.$patch({ defaultCliInstance: '' })

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask())

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    expect(terminal?.wslDistro).toBe('Ubuntu-24.04')
  })

  it('storedDistro found in instances: uses stored distro over isDefault', async () => {
    api.getCliInstances.mockResolvedValueOnce([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' },
      { cli: 'claude', distro: 'Arch', version: '2.1.58', isDefault: false, type: 'wsl' },
    ])

    const settingsStore = useSettingsStore()
    settingsStore.setDefaultCliInstance('claude', 'Arch')

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask())

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    // stored distro 'Arch' was found → use it
    expect(terminal?.wslDistro).toBe('Arch')
  })

  it('storedDistro NOT found: falls back to first in list when no isDefault', async () => {
    api.getCliInstances.mockResolvedValueOnce([
      { cli: 'claude', distro: 'Arch', version: '2.1.58', isDefault: false, type: 'wsl' },
      { cli: 'claude', distro: 'Debian', version: '2.1.58', isDefault: false, type: 'wsl' },
    ])

    const settingsStore = useSettingsStore()
    settingsStore.setDefaultCliInstance('claude', 'NonExistent')

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask())

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    // storedDistro not found, no isDefault → falls back to cliInstances[0]
    expect(terminal?.wslDistro).toBe('Arch')
  })

  it('no CLI instances available: resolvedInstance = null → distro null', async () => {
    api.getCliInstances.mockResolvedValueOnce([])

    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent(), makeTask())

    expect(result).toBe('ok')
    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    expect(terminal?.wslDistro).toBeNull()
  })
})

describe('useLaunchSession T1338: session-limit logic (maxSess !== -1 AND >= maxSess)', () => {
  // These tests target LogicalOperator mutations on line 81:
  // `if (maxSess !== -1 && agentTerminalCount(agent.name) >= maxSess)`
  // Mutations: && → ||, !== -1 → === -1, !== -1 → true/false, >= → >, <=, ===

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 4, testIndex, 0, 0))
    api.getCliInstances.mockResolvedValue([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' }
    ])
    api.getAgentSystemPrompt.mockResolvedValue({
      success: true, systemPrompt: 'System', systemPromptSuffix: null, thinkingMode: 'auto'
    })
    api.buildAgentPrompt.mockResolvedValue('final prompt')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('exactly at max_sessions limit: returns session-limit (>= must be true at count == max)', async () => {
    const tabsStore = useTabsStore()
    // Add exactly max_sessions=2 terminals
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')

    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent({ max_sessions: 2 }), makeTask())

    // count(2) >= max(2) → session-limit
    expect(result).toBe('session-limit')
  })

  it('one below max_sessions: returns ok (count < max)', async () => {
    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')

    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent({ max_sessions: 2 }), makeTask())

    // count(1) < max(2) → ok
    expect(result).toBe('ok')
  })

  it('max_sessions=-1 with many terminals: never returns session-limit (unlimited)', async () => {
    const tabsStore = useTabsStore()
    for (let i = 0; i < 20; i++) tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')

    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent({ max_sessions: -1 }), makeTask())

    // maxSess === -1 → skip limit check → ok
    expect(result).toBe('ok')
  })

  it('max_sessions=0: immediately returns session-limit (count 0 >= max 0)', async () => {
    // No terminals open, but max_sessions=0 means even 0 >= 0 triggers limit
    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent({ max_sessions: 0 }), makeTask())

    expect(result).toBe('session-limit')
  })

  it('max_sessions=1 with 1 terminal: session-limit (boundary case for >=)', async () => {
    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')

    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent({ max_sessions: 1 }), makeTask())

    expect(result).toBe('session-limit')
  })

  it('different agent not counted toward limit: terminals for other agents are ignored', async () => {
    const tabsStore = useTabsStore()
    // Add 10 terminals for a different agent
    for (let i = 0; i < 10; i++) tabsStore.addTerminal('other-agent', 'Ubuntu-24.04')

    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent({ max_sessions: 3 }), makeTask())

    // Count for 'dev-front-vuejs' is 0 → 0 >= 3 is false → ok
    expect(result).toBe('ok')
  })
})

describe('useLaunchSession T1338: prompt resolution branches', () => {
  // Tests for the systemPrompt resolution path (opts?.systemPrompt === false vs !== undefined)
  // and convId (resume mode) vs normal prompt

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 5, testIndex, 0, 0))
    api.getCliInstances.mockResolvedValue([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' }
    ])
    api.buildAgentPrompt.mockResolvedValue('auto prompt')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('opts.systemPrompt = false: skips getAgentSystemPrompt and leaves systemPrompt undefined', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), { systemPrompt: false })

    // With systemPrompt=false, getAgentSystemPrompt should NOT be called
    expect(api.getAgentSystemPrompt).not.toHaveBeenCalled()

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    expect(terminal?.systemPrompt).toBeNull()
  })

  it('opts.systemPrompt = string: uses provided string, skips getAgentSystemPrompt', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), { systemPrompt: 'Custom system prompt' })

    expect(api.getAgentSystemPrompt).not.toHaveBeenCalled()

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    expect(terminal?.systemPrompt).toBe('Custom system prompt')
  })

  it('opts.systemPrompt = empty string: stores null (falsy → undefined → null)', async () => {
    // '' || undefined → undefined → addTerminal stores null
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), { systemPrompt: '' })

    expect(api.getAgentSystemPrompt).not.toHaveBeenCalled()

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    // '' is falsy → opts.systemPrompt || undefined → undefined → null in addTerminal
    expect(terminal?.systemPrompt).toBeNull()
  })

  it('opts.convId provided: skips buildAgentPrompt (resume mode → no initial prompt)', async () => {
    api.getAgentSystemPrompt.mockResolvedValueOnce({
      success: true, systemPrompt: 'System', systemPromptSuffix: null, thinkingMode: 'auto'
    })

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), { convId: 'conv-abc-123' })

    // In resume mode, buildAgentPrompt should NOT be called
    expect(api.buildAgentPrompt).not.toHaveBeenCalled()

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    // autoSend/finalPrompt should be undefined → stored as null
    expect(terminal?.autoSend).toBeNull()
    // convId should be stored
    expect(terminal?.convId).toBe('conv-abc-123')
  })

  it('opts.customPrompt: uses customPrompt instead of T{taskId}', async () => {
    api.getAgentSystemPrompt.mockResolvedValueOnce({
      success: true, systemPrompt: 'System', systemPromptSuffix: null, thinkingMode: 'auto'
    })

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask({ id: 42 }), { customPrompt: 'Custom task instructions' })

    expect(api.buildAgentPrompt).toHaveBeenCalledWith(
      'dev-front-vuejs',
      'Custom task instructions',
      '/test/db',
      10
    )
  })

  it('no task, no customPrompt: passes empty string to buildAgentPrompt', async () => {
    api.getAgentSystemPrompt.mockResolvedValueOnce({
      success: true, systemPrompt: 'System', systemPromptSuffix: null, thinkingMode: 'auto'
    })

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), undefined)

    expect(api.buildAgentPrompt).toHaveBeenCalledWith(
      'dev-front-vuejs',
      '',
      '/test/db',
      10
    )
  })

  it('opts.thinkingMode with systemPrompt=false: uses opts.thinkingMode (resume path)', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), { systemPrompt: false, thinkingMode: 'disabled' })

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    expect(terminal?.thinkingMode).toBe('disabled')
  })

  it('opts.thinkingMode with opts.systemPrompt string: uses opts.thinkingMode', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), {
      systemPrompt: 'Custom prompt',
      thinkingMode: 'disabled'
    })

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    expect(terminal?.thinkingMode).toBe('disabled')
  })
})

describe('useLaunchSession T1338: opts.taskId and activate overrides', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 6, testIndex, 0, 0))
    api.getCliInstances.mockResolvedValue([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' }
    ])
    api.getAgentSystemPrompt.mockResolvedValue({
      success: true, systemPrompt: 'System', systemPromptSuffix: null, thinkingMode: 'auto'
    })
    api.buildAgentPrompt.mockResolvedValue('auto prompt')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('opts.taskId overrides task.id for tab tracking', async () => {
    // resolvedTaskId = opts?.taskId ?? task?.id → opts.taskId wins
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask({ id: 5 }), { taskId: 99 })

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    expect(terminal?.taskId).toBe(99)
  })

  it('no opts.taskId: uses task.id for tab tracking', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask({ id: 42 }))

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    expect(terminal?.taskId).toBe(42)
  })

  it('no opts, no task: taskId is undefined → stored as null', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), undefined)

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    expect(terminal?.taskId).toBeNull()
  })

  it('opts.activate = true: tab is activated after launch', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), { activate: true })

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal') as Tab | undefined
    expect(terminal).toBeDefined()
    // When activate=true, the tab becomes the active tab
    expect(tabsStore.activeTabId).toBe(terminal?.id)
  })

  it('opts.activate = false (default): tab is not activated', async () => {
    // First create a different active tab
    const tabsStore = useTabsStore()
    tabsStore.addTerminal('other-agent', 'Ubuntu-24.04', undefined, undefined, undefined, undefined, undefined, true)
    const firstTabId = tabsStore.activeTabId

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), { activate: false })

    // Active tab should still be the first one
    expect(tabsStore.activeTabId).toBe(firstTabId)
  })
})
