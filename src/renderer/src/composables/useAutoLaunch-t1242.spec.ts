/**
 * T1242: Fix intempestive agent tab closures in useAutoLaunch
 *
 * Three regression tests:
 * 1. Pending close is cancelled when agent receives active tasks (Fix 1 — T1241 fix)
 * 2. Tab IS still closed once session completes for a no-task agent (existing flow regression)
 * 3. No false positive from old completed session when opening a new terminal (Fix 3 — lookbackMs=0)
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref, nextTick } from 'vue'
import { useAutoLaunch } from './useAutoLaunch'
import { useTabsStore } from '@renderer/stores/tabs'
import { useTasksStore } from '@renderer/stores/tasks'
import type { Task, Agent } from '@renderer/types'

const api = {
  getCliInstances: vi.fn().mockResolvedValue([
    { cli: 'claude', distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, type: 'wsl' }
  ]),
  getAgentSystemPrompt: vi.fn().mockResolvedValue({
    success: true, systemPrompt: 'You are dev-front', systemPromptSuffix: null, thinkingMode: 'auto'
  }),
  buildAgentPrompt: vi.fn().mockResolvedValue('final prompt'),
  agentKill: vi.fn().mockResolvedValue(undefined),
  queryDb: vi.fn().mockResolvedValue([]),
}

Object.defineProperty(window, 'electronAPI', { value: api, writable: true })

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1, title: 'Test task', description: null, status: 'todo',
    agent_assigned_id: 10, agent_creator_id: null, agent_validator_id: null,
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
    allowed_tools: null, auto_launch: 1, permission_mode: null, max_sessions: 3, created_at: '',
    ...overrides
  } as Agent
}

describe('useAutoLaunch T1249: multi-tab independence — same agent, different tasks', () => {
  let tasks: ReturnType<typeof ref<Task[]>>
  let agents: ReturnType<typeof ref<Agent[]>>
  let dbPath: ReturnType<typeof ref<string | null>>
  let testIndex = 0

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
    testIndex++
    vi.setSystemTime(new Date(2026, 5, 1, 0, testIndex * 10, 0))

    api.queryDb.mockResolvedValue([{ id: 1 }]) // session completed by default

    tasks = ref<Task[]>([])
    agents = ref<Agent[]>([])
    dbPath = ref<string | null>('/test/db')

    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('should close only the tab linked to the done task, not the other tab for the same agent', async () => {
    // dev-front-vuejs open on task 58 AND task 74 simultaneously.
    // When task 74 transitions to done, only tab 74 should close. Tab 58 stays open.
    const agent = makeAgent({ id: 20, name: 'dev-front-vuejs' })
    agents.value = [agent]

    useAutoLaunch({ tasks, agents, dbPath })

    // Seed: both tasks in_progress
    tasks.value = [
      makeTask({ id: 58, status: 'in_progress', agent_assigned_id: 20 }),
      makeTask({ id: 74, status: 'in_progress', agent_assigned_id: 20 }),
    ]
    await nextTick()

    const tabsStore = useTabsStore()

    // Tab for task 58
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const tab58 = tabsStore.tabs.find(t => t.type === 'terminal')!
    tab58.taskId = 58
    tab58.streamId = 'stream-task-58'

    // Tab for task 74 (second terminal for same agent)
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const tab74 = tabsStore.tabs.filter(t => t.type === 'terminal')[1]!
    tab74.taskId = 74
    tab74.streamId = 'stream-task-74'

    // Task 74 transitions to done (task 58 still in_progress)
    tasks.value = [
      makeTask({ id: 58, status: 'in_progress', agent_assigned_id: 20 }),
      makeTask({ id: 74, status: 'done', agent_assigned_id: 20 }),
    ]
    await nextTick()
    // debounce (80ms) + immediate poll + kill delay (2000ms)
    await vi.advanceTimersByTimeAsync(200 + 2000)

    // Tab 74 must be closed
    expect(api.agentKill).toHaveBeenCalledWith('stream-task-74')
    expect(tabsStore.tabs.find(t => t.streamId === 'stream-task-74')).toBeUndefined()

    // Tab 58 must remain open
    expect(api.agentKill).not.toHaveBeenCalledWith('stream-task-58')
    expect(tabsStore.tabs.find(t => t.streamId === 'stream-task-58')).toBeDefined()
  })

  it('T1243: doClose called after pendingCloses cleared should be a no-op (race guard)', async () => {
    // Regression: if the immediate poll fires asynchronously after the pending was
    // cleared (e.g., by a prior doClose call), it must not close the tab again.
    const agent = makeAgent({ id: 20, name: 'dev-front-vuejs' })
    agents.value = [agent]

    // queryDb returns session on first call only
    api.queryDb
      .mockResolvedValueOnce([{ id: 1 }]) // immediate poll → triggers close
      .mockResolvedValue([{ id: 2 }])     // subsequent polls → would close again if guard absent

    useAutoLaunch({ tasks, agents, dbPath })

    tasks.value = [makeTask({ id: 58, status: 'in_progress', agent_assigned_id: 20 })]
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const tab = tabsStore.tabs.find(t => t.type === 'terminal')!
    tab.taskId = 58
    tab.streamId = 'stream-race-guard'

    // Task done → scheduleClose → immediate poll finds session → doClose (clears pendingCloses)
    tasks.value = [makeTask({ id: 58, status: 'done', agent_assigned_id: 20 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200 + 2000) // debounce + poll + kill delay

    // Tab closed once
    expect(api.agentKill).toHaveBeenCalledTimes(2) // doClose + closeTab internal kill
    expect(tabsStore.tabs.filter(t => t.type === 'terminal')).toHaveLength(0)

    // Subsequent interval polls fire — T1243 guard prevents second close attempt
    await vi.advanceTimersByTimeAsync(5_000 + 5_000)
    // agentKill must not have been called additional times beyond the initial 2
    expect(api.agentKill).toHaveBeenCalledTimes(2)
  })

  it('no-task tab (review) should close on session completed with 30s post-complete delay', async () => {
    // Tab without taskId (review) → Chemin 2. Session completes → close after 30s.
    const agent = makeAgent({ id: 30, name: 'review-master', type: 'review' })
    agents.value = [agent]

    api.queryDb.mockResolvedValue([]) // no session initially

    useAutoLaunch({ tasks, agents, dbPath })
    tasks.value = []
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('review-master', 'Ubuntu-24.04')
    const reviewTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    reviewTab.streamId = 'stream-review-30s'
    // no taskId — Chemin 2 path

    // Trigger watch to schedule no-task close
    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 999 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200) // debounce + immediate poll (no session yet)

    expect(api.agentKill).not.toHaveBeenCalled()

    // Session completes → next poll detects it
    api.queryDb.mockResolvedValue([{ id: 99 }])
    await vi.advanceTimersByTimeAsync(5_000 + 100) // poll interval

    // agentKill fired immediately by doClose
    expect(api.agentKill).toHaveBeenCalledWith('stream-review-30s')

    // Tab still open — closeTab fires after 30s post-complete delay
    expect(tabsStore.tabs.filter(t => t.type === 'terminal')).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(tabsStore.tabs.filter(t => t.type === 'terminal')).toHaveLength(0)
  })
})

describe('useAutoLaunch T1242: Fix 3 — no-task path uses lookbackMs=0', () => {
  let tasks: ReturnType<typeof ref<Task[]>>
  let agents: ReturnType<typeof ref<Agent[]>>
  let dbPath: ReturnType<typeof ref<string | null>>
  let testIndex = 0

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
    testIndex++
    vi.setSystemTime(new Date(2026, 5, 2, 0, testIndex * 10, 0))

    api.queryDb.mockResolvedValue([])

    tasks = ref<Task[]>([])
    agents = ref<Agent[]>([])
    dbPath = ref<string | null>('/test/db')

    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('should pass notBefore=now (no lookback) to queryDb for no-task path', async () => {
    const capturedParams: unknown[][] = []
    api.queryDb.mockImplementation((_path: string, _sql: string, params: unknown[]) => {
      capturedParams.push(params)
      return Promise.resolve([])
    })

    const now = new Date(2026, 5, 2, 12, 0, 0)
    vi.setSystemTime(now)

    const agent = makeAgent({ id: 20, name: 'test-agent-lookback' })
    agents.value = [agent]
    useAutoLaunch({ tasks, agents, dbPath })

    tasks.value = []
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('test-agent-lookback', 'Ubuntu-24.04')

    // Trigger no-task path
    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 999 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200) // debounce + immediate poll fires

    expect(capturedParams.length).toBeGreaterThan(0)

    // notBefore should be approximately now (lookbackMs=0), not 5 minutes ago
    const notBefore = capturedParams[0][1] as string
    const notBeforeDate = new Date(notBefore.replace(' ', 'T') + 'Z')
    const expectedMs = now.getTime()

    // Should be within 1 second of current time (not ~5 min ago)
    expect(Math.abs(notBeforeDate.getTime() - expectedMs)).toBeLessThan(1000)

    // Extra guard: confirm it is NOT 5 minutes in the past
    const fiveMinAgo = expectedMs - 5 * 60 * 1000
    expect(notBeforeDate.getTime()).toBeGreaterThan(fiveMinAgo + 60 * 1000)
  })

  it('should NOT trigger false close when agent had a session completed 3 min ago', async () => {
    // Simulate: queryDb returns a session only if notBefore <= 3 min ago
    // (i.e., the session was completed 3 min before the schedule was created)
    const sessionEndedAt = new Date(Date.now() - 3 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19)

    api.queryDb.mockImplementation((_path: string, _sql: string, params: unknown[]) => {
      const notBefore = params[1] as string
      // Session is 3 min old; only return it if notBefore is also old (>= 3 min lookback)
      if (notBefore <= sessionEndedAt) {
        return Promise.resolve([{ id: 1 }]) // old behavior: false positive
      }
      return Promise.resolve([]) // correct behavior: no match
    })

    const agent = makeAgent({ id: 20, name: 'test-agent-nofp' })
    agents.value = [agent]
    useAutoLaunch({ tasks, agents, dbPath })

    tasks.value = []
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('test-agent-nofp', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    termTab.streamId = 'stream-no-false-positive'

    // Trigger no-task path for the agent
    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 999 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200) // debounce + immediate poll

    // With lookbackMs=0: notBefore = now > sessionEndedAt → no match → no close ✓
    expect(api.agentKill).not.toHaveBeenCalled()
    expect(tabsStore.tabs.filter(t => t.type === 'terminal')).toHaveLength(1)
  })
})
