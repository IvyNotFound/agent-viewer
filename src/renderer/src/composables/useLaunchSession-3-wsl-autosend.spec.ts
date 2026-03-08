import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLaunchSession } from './useLaunchSession'
import { useTabsStore } from '@renderer/stores/tabs'
import { useTasksStore } from '@renderer/stores/tasks'
import { useSettingsStore } from '@renderer/stores/settings'
import type { Task, Agent } from '@renderer/types'

// Mock window.electronAPI
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

describe('composables/useLaunchSession', () => {
  // Counter to ensure each test gets a unique time far enough apart to expire the cache
  let testIndex = 0

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()

    // Reset mock implementations
    api.getCliInstances.mockResolvedValue([
      { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' }
    ])
    api.getAgentSystemPrompt.mockResolvedValue({
      success: true, systemPrompt: 'You are dev-front', systemPromptSuffix: null, thinkingMode: 'auto'
    })
    api.buildAgentPrompt.mockResolvedValue('final prompt')

    // Set system time far enough apart between tests to expire the module-level
    // getCachedCliInstances cache (TTL = 5min)
    testIndex++
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 0, testIndex * 10, 0))

    // Set dbPath on tasks store so useLaunchSession can access it
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('WSL instance selection', () => {
    it('should use first instance when storedDistro not set and no isDefault', async () => {
      api.getCliInstances.mockResolvedValueOnce([
        { cli: 'claude', distro: 'Arch', version: '2.1.58', isDefault: false, type: 'wsl' },
        { cli: 'claude', distro: 'Debian', version: '2.1.58', isDefault: false, type: 'wsl' },
      ])

      const { launchAgentTerminal } = useLaunchSession()
      await launchAgentTerminal(makeAgent(), makeTask())

      const tabsStore = useTabsStore()
      const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
      expect(terminal?.wslDistro).toBe('Arch')
    })

    it('should prefer storedDistro over isDefault when storedDistro is present', async () => {
      api.getCliInstances.mockResolvedValueOnce([
        { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' },
        { cli: 'claude', distro: 'Debian', version: '2.1.58', isDefault: false, type: 'wsl' },
      ])
      const settingsStore = useSettingsStore()
      settingsStore.setDefaultCliInstance('claude', 'Debian')

      const { launchAgentTerminal } = useLaunchSession()
      await launchAgentTerminal(makeAgent(), makeTask())

      const tabsStore = useTabsStore()
      const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
      expect(terminal?.wslDistro).toBe('Debian')
    })

    it('should fallback to isDefault when storedDistro is unknown', async () => {
      api.getCliInstances.mockResolvedValueOnce([
        { cli: 'claude', distro: 'Arch', version: '2.1.58', isDefault: false, type: 'wsl' },
        { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' },
      ])
      const settingsStore = useSettingsStore()
      settingsStore.setDefaultCliInstance('NonExistentDistro')

      const { launchAgentTerminal } = useLaunchSession()
      await launchAgentTerminal(makeAgent(), makeTask())

      const tabsStore = useTabsStore()
      const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
      expect(terminal?.wslDistro).toBe('Ubuntu-24.04')
    })

    it('should use null distro when no CLI instances available', async () => {
      api.getCliInstances.mockResolvedValueOnce([])

      const { launchAgentTerminal } = useLaunchSession()
      await launchAgentTerminal(makeAgent(), makeTask())

      const tabsStore = useTabsStore()
      const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
      expect(terminal?.wslDistro).toBeNull()
    })
  })

  describe('autoSend / prompt content', () => {
    it('should store final prompt as autoSend on the terminal tab', async () => {
      api.buildAgentPrompt.mockResolvedValueOnce('T42 prompt content')
      const { launchAgentTerminal } = useLaunchSession()
      await launchAgentTerminal(makeAgent(), makeTask({ id: 42 }))

      const tabsStore = useTabsStore()
      const terminal = tabsStore.tabs.find(t => t.type === 'terminal')
      // autoSend param receives the finalPrompt string (built from buildAgentPrompt)
      expect(terminal?.autoSend).toBe('T42 prompt content')
    })

    it('review session: autoSend contains task list prompt', async () => {
      api.buildAgentPrompt.mockResolvedValueOnce('Audit prompt for review')
      const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })

      const { launchReviewSession } = useLaunchSession()
      await launchReviewSession(reviewAgent, [makeTask({ id: 5, status: 'done', title: 'My task' })])

      const tabsStore = useTabsStore()
      const terminal = tabsStore.tabs.find(t => t.agentName === 'review-master')
      expect(terminal?.autoSend).toBe('Audit prompt for review')
    })

    it('review session: buildAgentPrompt receives task list string', async () => {
      const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
      const tasks = [
        makeTask({ id: 5, title: 'First task', status: 'done' }),
        makeTask({ id: 6, title: 'Second task', status: 'done' }),
      ]

      const { launchReviewSession } = useLaunchSession()
      await launchReviewSession(reviewAgent, tasks)

      expect(api.buildAgentPrompt).toHaveBeenCalledWith(
        'review-master',
        expect.stringContaining('T5'),
        '/test/db',
        99
      )
      expect(api.buildAgentPrompt).toHaveBeenCalledWith(
        'review-master',
        expect.stringContaining('T6'),
        '/test/db',
        99
      )
    })
  })
})
