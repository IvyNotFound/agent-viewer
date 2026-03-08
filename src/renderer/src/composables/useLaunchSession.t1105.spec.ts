/**
 * T1105: Additional mutation coverage for useLaunchSession.ts
 * Tests targeting surviving mutants: enabledClis slice(1) fallback, thinkingMode,
 * maxFileLinesEnabled=false, second terminal guard, empty enabledClis nullish coalescing.
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

describe('useLaunchSession T1105: enabledClis slice(1) fallback', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 5, 0, testIndex * 10, 0))
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

  it('should fallback to second enabled CLI when first has no instances', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.$patch({ enabledClis: ['claude', 'gemini'] as CliType[] })

    api.getCliInstances.mockResolvedValueOnce([
      { cli: 'gemini', distro: 'Ubuntu-24.04', version: '1.0.0', isDefault: true, type: 'wsl' }
    ])

    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent(), makeTask())

    expect(result).toBe('ok')
    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.wslDistro).toBe('Ubuntu-24.04')
  })

  it('should use first CLI when it has instances (slice(1) not entered)', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.$patch({ enabledClis: ['claude', 'gemini'] as CliType[] })

    api.getCliInstances.mockResolvedValueOnce([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.0.0', isDefault: true, type: 'wsl' },
      { cli: 'gemini', distro: 'Debian', version: '1.0.0', isDefault: false, type: 'wsl' }
    ])

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask())

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.wslDistro).toBe('Ubuntu-24.04')
  })

  it('review: should fallback to second CLI when first has no instances', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.$patch({ enabledClis: ['claude', 'gemini'] as CliType[] })

    api.getCliInstances.mockResolvedValueOnce([
      { cli: 'gemini', distro: 'Arch', version: '1.0.0', isDefault: true, type: 'wsl' }
    ])

    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    const { launchReviewSession } = useLaunchSession()
    const result = await launchReviewSession(reviewAgent, [makeTask({ status: 'done' })])

    expect(result).toBe(true)
    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.agentName === 'review-master')
    expect(terminal?.wslDistro).toBe('Arch')
  })

  it('should default to claude when enabledClis is empty (nullish coalescing)', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.$patch({ enabledClis: [] as CliType[] })

    api.getCliInstances.mockResolvedValueOnce([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.0.0', isDefault: true, type: 'wsl' }
    ])

    const { launchAgentTerminal } = useLaunchSession()
    const result = await launchAgentTerminal(makeAgent(), makeTask())

    expect(result).toBe('ok')
    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.wslDistro).toBe('Ubuntu-24.04')
  })
})

describe('useLaunchSession T1105: thinkingMode from getAgentSystemPrompt', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 6, 0, testIndex * 10, 0))
    api.buildAgentPrompt.mockResolvedValue('final prompt')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('should use disabled thinkingMode when promptResult returns disabled', async () => {
    api.getAgentSystemPrompt.mockResolvedValueOnce({
      success: true, systemPrompt: 'Base', systemPromptSuffix: null, thinkingMode: 'disabled'
    })

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask())

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.thinkingMode).toBe('disabled')
  })

  it('should default thinkingMode to auto when promptResult has no thinkingMode', async () => {
    api.getAgentSystemPrompt.mockResolvedValueOnce({
      success: true, systemPrompt: 'Base', systemPromptSuffix: null, thinkingMode: null
    })

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask())

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.thinkingMode).toBe('auto')
  })

  it('review: should use disabled thinkingMode when promptResult returns disabled', async () => {
    api.getAgentSystemPrompt.mockResolvedValueOnce({
      success: true, systemPrompt: 'Review', systemPromptSuffix: null, thinkingMode: 'disabled'
    })

    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    const { launchReviewSession } = useLaunchSession()
    await launchReviewSession(reviewAgent, [makeTask({ status: 'done' })])

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.agentName === 'review-master')
    expect(terminal?.thinkingMode).toBe('disabled')
  })
})

describe('useLaunchSession T1105: maxFileLinesEnabled false branch', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 7, 0, testIndex * 10, 0))
    api.buildAgentPrompt.mockResolvedValue('final prompt')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('should NOT add maxFileLines line when maxFileLinesEnabled is false', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.setMaxFileLinesEnabled(false)

    api.getAgentSystemPrompt.mockResolvedValueOnce({
      success: true, systemPrompt: 'Base prompt', systemPromptSuffix: null, thinkingMode: 'auto'
    })

    const { launchAgentTerminal } = useLaunchSession()
    await launchAgentTerminal(makeAgent(), makeTask())

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
    expect(terminal?.systemPrompt).toBe('Base prompt')
    expect(terminal?.systemPrompt).not.toContain('maximum')
  })

  it('review: should NOT add maxFileLines line when maxFileLinesEnabled is false', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.setMaxFileLinesEnabled(false)

    api.getAgentSystemPrompt.mockResolvedValueOnce({
      success: true, systemPrompt: 'Review prompt', systemPromptSuffix: null, thinkingMode: 'auto'
    })

    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    const { launchReviewSession } = useLaunchSession()
    await launchReviewSession(reviewAgent, [makeTask({ status: 'done' })])

    const tabsStore = useTabsStore()
    const terminal = tabsStore.tabs.find(t => t.agentName === 'review-master')
    expect(terminal?.systemPrompt).toBe('Review prompt')
    expect(terminal?.systemPrompt).not.toContain('maximum')
  })
})

describe('useLaunchSession T1105: launchReviewSession second guard (line 189)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 8, 0, testIndex * 10, 0))
    api.buildAgentPrompt.mockResolvedValue('final prompt')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('should return false if terminal added concurrently before addTerminal call', async () => {
    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })

    let callCount = 0
    api.buildAgentPrompt.mockImplementation(async () => {
      if (callCount === 0) {
        const tabsStore = useTabsStore()
        tabsStore.addTerminal('review-master', 'Ubuntu-24.04')
      }
      callCount++
      return 'final prompt'
    })

    const { launchReviewSession } = useLaunchSession()
    const result = await launchReviewSession(reviewAgent, [makeTask({ status: 'done' })])

    expect(result).toBe(false)
    const tabsStore = useTabsStore()
    // Only 1 terminal (added concurrently), not 2
    expect(tabsStore.tabs.filter(t => t.agentName === 'review-master')).toHaveLength(1)
  })

  it('should return false when getAgentSystemPrompt fails for review', async () => {
    api.getAgentSystemPrompt.mockResolvedValueOnce({ success: false })

    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    const { launchReviewSession } = useLaunchSession()
    const result = await launchReviewSession(reviewAgent, [makeTask({ status: 'done' })])

    expect(result).toBe(false)
    const tabsStore = useTabsStore()
    expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(false)
  })
})
