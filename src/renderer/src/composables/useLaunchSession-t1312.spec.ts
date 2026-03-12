/**
 * T1312: Mutation coverage gaps for useLaunchSession.ts
 * Targets surviving mutants and NoCoverage lines:
 * - L95: opts.cli ?? resolvedInstance?.cli ?? settingsStore.enabledClis[0] (CLI string literal)
 * - L104: candidates.length > 0 boundary
 * - L113-116: parsedDefault.cli === null branch (distro matching with null CLI)
 * - L128-135: opts.systemPrompt false / string / undefined branches
 * - L153-157: convId resume mode + customPrompt override
 * - L166: opts?.taskId ?? task?.id short-circuit
 * - L167: opts.activate
 * - L245-246: inner distro matching in launchReviewSession
 * - L268-273: error handling block in launchReviewSession
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLaunchSession } from './useLaunchSession'
import { useTabsStore } from '@renderer/stores/tabs'
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
  worktreeCreate: vi.fn().mockResolvedValue({ success: false, error: 'no worktree' }),
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

describe('useLaunchSession T1312: CLI resolution gaps', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 12, 0, testIndex * 10, 0))
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

  // L95: opts.cli overrides resolvedInstance.cli when both are provided
  it('opts.cli overrides resolvedInstance.cli when both provided', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), {
      instance: { cli: 'claude', distro: 'Ubuntu-24.04', isDefault: true, version: '2.0', type: 'wsl' },
      cli: 'gemini' as CliType,
    })

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.cli).toBe('gemini')
  })

  // L95: opts.cli is undefined → falls back to resolvedInstance.cli
  it('uses resolvedInstance.cli when opts.cli is undefined', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), {
      instance: { cli: 'claude', distro: 'Ubuntu-24.04', isDefault: true, version: '2.0', type: 'wsl' },
      // no opts.cli
    })

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.cli).toBe('claude')
  })

  // L95: opts.instance is null → settingsStore.enabledClis[0] fallback
  it('falls back to settingsStore.enabledClis[0] when opts.instance is null', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.$patch({ enabledClis: ['gemini'] as CliType[] })

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), {
      instance: null,
      // no opts.cli
    })

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.cli).toBe('gemini')
  })

  // L95: all absent → 'claude' hardcoded fallback
  it('falls back to claude when opts.cli, resolvedInstance, and enabledClis[0] are absent', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.$patch({ enabledClis: [] as CliType[] })

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), {
      instance: null,
      // no opts.cli
    })

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.cli).toBe('claude')
  })

  // L104: candidates.length === 0 for all fallback CLIs → resolvedInstance = null
  it('all CLIs have no instances → resolvedInstance null, defaultCli stays first', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.$patch({ enabledClis: ['claude', 'gemini'] as CliType[] })

    api.getCliInstances.mockResolvedValueOnce([])

    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent(), makeTask())

    expect(result).toBe('ok')
    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    // resolvedInstance = null (no candidates), resolvedCli = 'claude'
    expect(terminal?.cli).toBe('claude')
    expect(terminal?.wslDistro).toBeNull()
  })

  // L104: candidates.length === 1 → enters inner loop, switches CLI
  it('candidates.length === 1 in fallback loop triggers CLI switch', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.$patch({ enabledClis: ['claude', 'gemini'] as CliType[] })

    api.getCliInstances.mockResolvedValueOnce([
      { cli: 'gemini', distro: 'Arch', version: '1.0', isDefault: true, type: 'wsl' }
    ])

    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent(), makeTask())

    expect(result).toBe('ok')
    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    // claude had 0 instances → fell back to gemini
    expect(terminal?.cli).toBe('gemini')
    expect(terminal?.wslDistro).toBe('Arch')
  })

  // L113-116: parsedDefault.cli === null (legacy distro-only format) — matches any CLI with that distro
  it('distro-only storedDefault (no CLI prefix) matches instance by distro regardless of CLI', async () => {
    // Simulate legacy format (no cli prefix) by patching the store directly
    const settingsStore = useSettingsStore()
    settingsStore.$patch({ defaultCliInstance: 'Debian' })

    api.getCliInstances.mockResolvedValueOnce([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.0', isDefault: false, type: 'wsl' },
      { cli: 'claude', distro: 'Debian', version: '2.0', isDefault: false, type: 'wsl' },
    ])

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask())

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.wslDistro).toBe('Debian')
  })
})

describe('useLaunchSession T1312: systemPrompt opts branches', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 12, 1, testIndex * 10, 0))
    api.getCliInstances.mockResolvedValue([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' }
    ])
    api.buildAgentPrompt.mockResolvedValue('final prompt')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  // L128-131: opts.systemPrompt === false → no systemPrompt, no IPC call
  it('opts.systemPrompt === false skips system prompt and does NOT call getAgentSystemPrompt', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent(), makeTask(), {
      systemPrompt: false,
    })

    expect(result).toBe('ok')
    expect(api.getAgentSystemPrompt).not.toHaveBeenCalled()
    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.systemPrompt).toBeNull()
  })

  // L131: opts.systemPrompt === false with thinkingMode override applied
  it('opts.systemPrompt === false applies opts.thinkingMode', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), {
      systemPrompt: false,
      thinkingMode: 'disabled',
    })

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.thinkingMode).toBe('disabled')
  })

  // L132-135: opts.systemPrompt is a non-empty string → used directly, no IPC call
  it('opts.systemPrompt string is used directly without IPC call', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), {
      systemPrompt: 'Custom system prompt',
    })

    expect(api.getAgentSystemPrompt).not.toHaveBeenCalled()
    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.systemPrompt).toBe('Custom system prompt')
  })

  // L134: opts.systemPrompt is empty string → falsy → stored as null
  it('opts.systemPrompt empty string resolves to null in terminal', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), {
      systemPrompt: '',
    })

    expect(api.getAgentSystemPrompt).not.toHaveBeenCalled()
    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    // opts.systemPrompt || undefined → undefined → addTerminal stores null
    expect(terminal?.systemPrompt).toBeNull()
  })

  // L135: opts.systemPrompt string with thinkingMode
  it('opts.systemPrompt string with thinkingMode disabled', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), {
      systemPrompt: 'Custom prompt',
      thinkingMode: 'disabled',
    })

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.thinkingMode).toBe('disabled')
  })
})

describe('useLaunchSession T1312: prompt + taskId resolution', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 12, 2, testIndex * 10, 0))
    api.getCliInstances.mockResolvedValue([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' }
    ])
    api.getAgentSystemPrompt.mockResolvedValue({
      success: true, systemPrompt: 'prompt', systemPromptSuffix: null, thinkingMode: 'auto'
    })
    api.buildAgentPrompt.mockResolvedValue('built prompt')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  // L153-155: opts.convId → finalPrompt = undefined (resume mode)
  it('opts.convId skips prompt building and stores convId', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask({ id: 7 }), {
      convId: 'conv-abc',
    })

    expect(api.buildAgentPrompt).not.toHaveBeenCalled()
    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.autoSend).toBeNull()
    expect(terminal?.convId).toBe('conv-abc')
  })

  // L157: opts.customPrompt takes precedence over task-based prompt
  it('opts.customPrompt overrides default T{taskId} prompt', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask({ id: 5 }), {
      customPrompt: 'Custom user text',
    })

    expect(api.buildAgentPrompt).toHaveBeenCalledWith(
      'dev-front-vuejs',
      'Custom user text',
      '/test/db',
      10
    )
  })

  // L157: no opts at all → uses task-based prompt T{task.id}
  it('no opts uses task-based T{id} prompt', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask({ id: 77 }))

    expect(api.buildAgentPrompt).toHaveBeenCalledWith(
      'dev-front-vuejs',
      'T77',
      '/test/db',
      10
    )
  })

  // L157: no task and no customPrompt → empty string
  it('no task and no customPrompt sends empty string to buildAgentPrompt', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), undefined)

    expect(api.buildAgentPrompt).toHaveBeenCalledWith(
      'dev-front-vuejs',
      '',
      '/test/db',
      10
    )
  })

  // L166: opts.taskId takes precedence over task.id
  it('opts.taskId overrides task.id for terminal association', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask({ id: 1 }), {
      taskId: 999,
    })

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.taskId).toBe(999)
  })

  // L166: opts.taskId undefined falls back to task.id
  it('opts.taskId undefined falls back to task.id', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask({ id: 42 }), {})

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.taskId).toBe(42)
  })

  // L166: no opts, no task → resolvedTaskId = undefined → stored as null
  it('no opts and no task → taskId is null on terminal', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), undefined)

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.taskId).toBeNull()
  })

  // L167: activate defaults to false — terminal is not selected as active tab
  it('activate defaults to false — new terminal is not activeTab', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask())

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal).toBeDefined()
    expect(tabsStore.activeTabId).not.toBe(terminal?.id)
  })

  // L167: opts.activate = true activates the tab
  it('opts.activate = true activates the new terminal tab', async () => {
    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask(), { activate: true })

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(tabsStore.activeTabId).toBe(terminal?.id)
  })
})

describe('useLaunchSession T1312: launchReviewSession inner distro matching (L242-250)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 12, 3, testIndex * 10, 0))
    api.getAgentSystemPrompt.mockResolvedValue({
      success: true, systemPrompt: 'Review prompt', systemPromptSuffix: null, thinkingMode: 'auto'
    })
    api.buildAgentPrompt.mockResolvedValue('review built prompt')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  // L242-250: review session uses storedDistro to pick correct instance
  it('review: storedDistro picks matching distro instance', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.setDefaultCliInstance('claude', 'Debian')

    api.getCliInstances.mockResolvedValueOnce([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.0', isDefault: true, type: 'wsl' },
      { cli: 'claude', distro: 'Debian', version: '2.0', isDefault: false, type: 'wsl' },
    ])

    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    const { launchReviewSession } = useLaunchSession()
    const result = await launchReviewSession(reviewAgent, [makeTask({ status: 'done' })])

    expect(result).toBe(true)
    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.agentName === 'review-master')
    expect(terminal?.wslDistro).toBe('Debian')
  })

  // L244-246: parsedDefault.cli === null in review — legacy distro-only format
  it('review: distro-only stored key (no CLI prefix) matches instance by distro', async () => {
    // Simulate legacy format (no cli prefix) by patching the store directly
    const settingsStore = useSettingsStore()
    settingsStore.$patch({ defaultCliInstance: 'Arch' })

    api.getCliInstances.mockResolvedValueOnce([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.0', isDefault: true, type: 'wsl' },
      { cli: 'claude', distro: 'Arch', version: '2.0', isDefault: false, type: 'wsl' },
    ])

    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    const { launchReviewSession } = useLaunchSession()
    const result = await launchReviewSession(reviewAgent, [makeTask({ status: 'done' })])

    expect(result).toBe(true)
    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.agentName === 'review-master')
    expect(terminal?.wslDistro).toBe('Arch')
  })

  // L248: storedDistro absent → falls back to isDefault instance
  it('review: no storedDistro falls back to isDefault instance', async () => {
    api.getCliInstances.mockResolvedValueOnce([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.0', isDefault: true, type: 'wsl' },
      { cli: 'claude', distro: 'Debian', version: '2.0', isDefault: false, type: 'wsl' },
    ])

    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    const { launchReviewSession } = useLaunchSession()
    const result = await launchReviewSession(reviewAgent, [makeTask({ status: 'done' })])

    expect(result).toBe(true)
    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.agentName === 'review-master')
    expect(terminal?.wslDistro).toBe('Ubuntu-24.04')
  })

  // L249: no storedDistro, no isDefault → first instance used
  it('review: no storedDistro and no isDefault falls back to first instance', async () => {
    api.getCliInstances.mockResolvedValueOnce([
      { cli: 'claude', distro: 'Debian', version: '2.0', isDefault: false, type: 'wsl' },
      { cli: 'claude', distro: 'Arch', version: '2.0', isDefault: false, type: 'wsl' },
    ])

    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    const { launchReviewSession } = useLaunchSession()
    const result = await launchReviewSession(reviewAgent, [makeTask({ status: 'done' })])

    expect(result).toBe(true)
    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.agentName === 'review-master')
    expect(terminal?.wslDistro).toBe('Debian')
  })
})

describe('useLaunchSession T1312: error handling NoCoverage (L268-273)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 12, 4, testIndex * 10, 0))
    api.getCliInstances.mockResolvedValue([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' }
    ])
    api.getAgentSystemPrompt.mockResolvedValue({
      success: true, systemPrompt: 'prompt', systemPromptSuffix: null, thinkingMode: 'auto'
    })
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  // L268-273: buildAgentPrompt throws inside launchReviewSession → returns false
  it('review: buildAgentPrompt throwing returns false', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    api.buildAgentPrompt.mockRejectedValueOnce(new Error('IPC failure'))

    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    const { launchReviewSession } = useLaunchSession()
    const result = await launchReviewSession(reviewAgent, [makeTask({ status: 'done' })])

    expect(result).toBe(false)
    const tabsStore = useTabsStore()
    expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(false)
    vi.mocked(console.warn).mockRestore()
  })

  // L210-212: launchAgentTerminal logs warning on error
  it('launchAgentTerminal logs warning on error with agent name', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    api.getCliInstances.mockRejectedValueOnce(new Error('network error'))

    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent(), makeTask())

    expect(result).toBe('error')
    expect(warnSpy).toHaveBeenCalledWith(
      '[launchSession] Failed to launch terminal for agent',
      'dev-front-vuejs',
      expect.any(Error)
    )
    warnSpy.mockRestore()
  })

  // L292-294: launchReviewSession logs warning on error
  it('launchReviewSession logs warning on error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    api.getCliInstances.mockRejectedValueOnce(new Error('network error'))

    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    const { launchReviewSession } = useLaunchSession()
    const result = await launchReviewSession(reviewAgent, [makeTask({ status: 'done' })])

    expect(result).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(
      '[launchSession] Failed to launch review session',
      expect.any(Error)
    )
    warnSpy.mockRestore()
  })
})
