/**
 * T1338: Mutation coverage for useAutoLaunch.ts
 *
 * Targets:
 * - Debounce reset: debounceId !== null check (line 116) — must clear existing timer
 * - ConditionalExpression line 103: !dbPath.value guard (prevents processing when null)
 * - LogicalOperator line 125: prevStatus && prevStatus !== 'done' && task.status === 'done' && task.agent_assigned_id
 *   → all 4 operands must be exercised individually to kill AND mutations
 * - Status transitions: from various states to done (not just in_progress)
 * - Debounce timer: successive rapid calls collapse into ONE handler run
 * - checkReviewThreshold: doneCount < threshold (ArithmeticOperator / EqualityOperator)
 * - REVIEW_COOLDOWN_MS: Date.now() - lastReviewLaunchedAt < REVIEW_COOLDOWN_MS
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref, nextTick } from 'vue'
import { useAutoLaunch } from './useAutoLaunch'
import { useTabsStore } from '@renderer/stores/tabs'
import { useSettingsStore } from '@renderer/stores/settings'
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
  queryDb: vi.fn().mockResolvedValue([{ id: 1 }]),
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

let testIndex = 0

describe('useAutoLaunch T1338: debounce timer reset (line 116)', () => {
  let tasks: ReturnType<typeof ref<Task[]>>
  let agents: ReturnType<typeof ref<Agent[]>>
  let dbPath: ReturnType<typeof ref<string | null>>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
    testIndex++
    vi.setSystemTime(new Date(2026, 7, 1, testIndex, 0, 0))
    api.queryDb.mockResolvedValue([{ id: 1 }])
    tasks = ref<Task[]>([])
    agents = ref<Agent[]>([makeAgent()])
    dbPath = ref<string | null>('/test/db')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('rapid successive task updates: debounce collapses into single handler run', async () => {
    // If debounceId !== null check is removed, the debounce timer would NOT be reset
    // and multiple rapid updates would fire multiple handlers → multiple closes.
    // With proper reset: only the LAST update fires the handler.
    useAutoLaunch({ tasks, agents, dbPath })

    tasks.value = [makeTask({ id: 1, status: 'in_progress', agent_assigned_id: 10 })]
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    termTab.taskId = 1
    termTab.streamId = 'stream-debounce-reset'

    // Fire multiple rapid task updates within the 80ms debounce window
    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]
    await nextTick()
    // Advance 40ms (halfway through debounce — timer should be cleared and restarted)
    vi.advanceTimersByTime(40)

    // Another update resets the debounce
    tasks.value = [...tasks.value]
    await nextTick()
    vi.advanceTimersByTime(40)

    // Another update resets again
    tasks.value = [...tasks.value]
    await nextTick()

    // At this point only ~80ms total has passed since last update
    // Handler has NOT fired yet
    expect(api.queryDb).not.toHaveBeenCalled()

    // Complete the final debounce window
    await vi.advanceTimersByTimeAsync(100)

    // queryDb should be called exactly ONCE (from the single collapsed handler)
    expect(api.queryDb).toHaveBeenCalledTimes(1)
  })

  it('debounce: update fires handler after 80ms quiet window (baseline)', async () => {
    // Confirms the debounce timeout is 80ms — queryDb called once handler fires
    useAutoLaunch({ tasks, agents, dbPath })

    // Seed: task in_progress
    tasks.value = [makeTask({ id: 1, status: 'in_progress', agent_assigned_id: 10 })]
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    termTab.taskId = 1
    termTab.streamId = 'stream-debounce-80ms'

    // Transition to done — starts 80ms debounce
    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]
    await nextTick()

    // 79ms — handler has NOT fired yet
    vi.advanceTimersByTime(79)
    expect(api.queryDb).not.toHaveBeenCalled()

    // 2ms more → past 80ms → handler fires → immediate poll fires → queryDb called
    await vi.advanceTimersByTimeAsync(2)
    expect(api.queryDb).toHaveBeenCalled()
  })

  it('debounce=80ms boundary: exactly 80ms fires the handler', async () => {
    // At exactly 80ms setTimeout, the handler fires and scheduleClose triggers an immediate poll
    useAutoLaunch({ tasks, agents, dbPath })

    tasks.value = [makeTask({ id: 1, status: 'in_progress', agent_assigned_id: 10 })]
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    termTab.taskId = 1
    termTab.streamId = 'stream-debounce-exact-80ms'

    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]
    await nextTick()

    // Advance 81ms total — past the 80ms boundary
    await vi.advanceTimersByTimeAsync(81)
    expect(api.queryDb).toHaveBeenCalled()
  })
})

describe('useAutoLaunch T1338: LogicalOperator mutations in Chemin 1 condition (line 125)', () => {
  // Line 125: if (prevStatus && prevStatus !== 'done' && task.status === 'done' && task.agent_assigned_id)
  // Kills: removing any of the 4 operands, or changing && to ||
  let tasks: ReturnType<typeof ref<Task[]>>
  let agents: ReturnType<typeof ref<Agent[]>>
  let dbPath: ReturnType<typeof ref<string | null>>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
    testIndex++
    vi.setSystemTime(new Date(2026, 7, 2, testIndex, 0, 0))
    api.queryDb.mockResolvedValue([{ id: 1 }])
    tasks = ref<Task[]>([])
    agents = ref<Agent[]>([makeAgent()])
    dbPath = ref<string | null>('/test/db')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('prevStatus undefined (new task): should NOT schedule close (prevStatus is falsy)', async () => {
    // First operand: prevStatus must be truthy
    // If a task appears for the first time already as "done" → no prevStatus → no close
    useAutoLaunch({ tasks, agents, dbPath })

    // Seed: empty
    tasks.value = []
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    termTab.taskId = 1
    termTab.streamId = 'stream-no-prevstatus'

    // Task 1 appears for the first time already as 'done' (no previous status)
    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)

    // No scheduleClose should have been triggered (no previous state)
    expect(api.agentKill).not.toHaveBeenCalled()
  })

  it('prevStatus = done: should NOT schedule close again (prevStatus !== done must be false)', async () => {
    // Second operand: prevStatus !== 'done'
    // If task was already done and stays done → no transition → no close
    useAutoLaunch({ tasks, agents, dbPath })

    // Seed: task already done
    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    termTab.taskId = 1
    termTab.streamId = 'stream-already-done'

    // Task remains done (no status change)
    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)

    // No close — was already done
    expect(api.agentKill).not.toHaveBeenCalled()
  })

  it('task.status = in_progress (not done): should NOT schedule close', async () => {
    // Third operand: task.status === 'done' must be true
    useAutoLaunch({ tasks, agents, dbPath })

    // Seed: task in todo
    tasks.value = [makeTask({ id: 1, status: 'todo', agent_assigned_id: 10 })]
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    termTab.taskId = 1
    termTab.streamId = 'stream-not-done'

    // Transition to in_progress (not done)
    tasks.value = [makeTask({ id: 1, status: 'in_progress', agent_assigned_id: 10 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)

    expect(api.agentKill).not.toHaveBeenCalled()
  })

  it('task.agent_assigned_id = null: should NOT schedule close', async () => {
    // Fourth operand: task.agent_assigned_id must be truthy
    useAutoLaunch({ tasks, agents, dbPath })

    // Seed: task in_progress with no agent
    tasks.value = [makeTask({ id: 1, status: 'in_progress', agent_assigned_id: null as unknown as number })]
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    termTab.taskId = 1
    termTab.streamId = 'stream-no-agent'

    // Transition to done but no agent assigned
    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: null as unknown as number })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)

    expect(api.agentKill).not.toHaveBeenCalled()
  })

  it('todo → done transition: should schedule close (prevStatus was not done)', async () => {
    // Tests that transitions from any non-done status (not just in_progress) trigger close
    useAutoLaunch({ tasks, agents, dbPath })

    // Seed: task in todo
    tasks.value = [makeTask({ id: 1, status: 'todo', agent_assigned_id: 10 })]
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    termTab.taskId = 1
    termTab.streamId = 'stream-todo-to-done'

    // Transition from todo to done
    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(100 + 2100) // debounce + kill delay

    expect(api.agentKill).toHaveBeenCalledWith('stream-todo-to-done')
  })

  it('archived → done transition: should schedule close', async () => {
    // prevStatus !== 'done' is true when prevStatus = 'archived'
    useAutoLaunch({ tasks, agents, dbPath })

    tasks.value = [makeTask({ id: 1, status: 'archived', agent_assigned_id: 10 })]
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    termTab.taskId = 1
    termTab.streamId = 'stream-archived-to-done'

    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(100 + 2100)

    expect(api.agentKill).toHaveBeenCalledWith('stream-archived-to-done')
  })

  it('done → todo transition: should NOT trigger close (task.status !== done)', async () => {
    // Tests mutation that removes task.status === 'done' check
    useAutoLaunch({ tasks, agents, dbPath })

    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    termTab.taskId = 1
    termTab.streamId = 'stream-done-to-todo'

    // Transition from done back to todo (rejection)
    tasks.value = [makeTask({ id: 1, status: 'todo', agent_assigned_id: 10 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)

    expect(api.agentKill).not.toHaveBeenCalled()
  })
})

describe('useAutoLaunch T1338: review threshold exact boundary (doneCount < threshold)', () => {
  // checkReviewThreshold: `if (doneCount < settingsStore.autoReviewThreshold) return`
  // Mutations: < → <=, >= → change what triggers/skips review
  let tasks: ReturnType<typeof ref<Task[]>>
  let agents: ReturnType<typeof ref<Agent[]>>
  let dbPath: ReturnType<typeof ref<string | null>>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
    testIndex++
    vi.setSystemTime(new Date(2026, 7, 3, testIndex, 0, 0))
    api.queryDb.mockResolvedValue([])
    tasks = ref<Task[]>([])
    agents = ref<Agent[]>([])
    dbPath = ref<string | null>('/test/db')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('doneCount = threshold - 1: should NOT launch review (below threshold)', async () => {
    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    agents.value = [makeAgent(), reviewAgent]

    const settingsStore = useSettingsStore()
    settingsStore.setAutoReviewThreshold(5)

    useAutoLaunch({ tasks, agents, dbPath })
    tasks.value = []
    await nextTick()

    // 4 done tasks (threshold=5, 4 < 5 → no review)
    const doneTasks = Array.from({ length: 4 }, (_, i) =>
      makeTask({ id: i + 1, status: 'done', agent_assigned_id: 10 })
    )
    tasks.value = doneTasks
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)

    const tabsStore = useTabsStore()
    expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(false)
  })

  it('doneCount = threshold: should launch review (exactly at threshold)', async () => {
    // Tests that < is correct: at exactly threshold, doneCount < threshold is FALSE → launch
    // If mutation changes < to <=, doneCount == threshold would return early → no launch
    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    agents.value = [makeAgent(), reviewAgent]

    const settingsStore = useSettingsStore()
    settingsStore.setAutoReviewThreshold(5)

    api.queryDb.mockResolvedValue([{ id: 1 }])
    useAutoLaunch({ tasks, agents, dbPath })
    tasks.value = []
    await nextTick()

    // Exactly 5 done tasks (at threshold)
    const doneTasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({ id: i + 1, status: 'done', agent_assigned_id: 10 })
    )
    tasks.value = doneTasks
    await nextTick()

    await vi.waitFor(() => {
      const tabsStore = useTabsStore()
      expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(true)
    })
  })

  it('doneCount = threshold + 1: should launch review (above threshold)', async () => {
    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    agents.value = [makeAgent(), reviewAgent]

    const settingsStore = useSettingsStore()
    settingsStore.setAutoReviewThreshold(5)

    api.queryDb.mockResolvedValue([{ id: 1 }])
    useAutoLaunch({ tasks, agents, dbPath })
    tasks.value = []
    await nextTick()

    // 6 done tasks (above threshold)
    const doneTasks = Array.from({ length: 6 }, (_, i) =>
      makeTask({ id: i + 1, status: 'done', agent_assigned_id: 10 })
    )
    tasks.value = doneTasks
    await nextTick()

    await vi.waitFor(() => {
      const tabsStore = useTabsStore()
      expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(true)
    })
  })

  it('mixed statuses: only done tasks count toward threshold', async () => {
    // Verifies the for loop counts ONLY done tasks, not all tasks
    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    agents.value = [makeAgent(), reviewAgent]

    const settingsStore = useSettingsStore()
    settingsStore.setAutoReviewThreshold(3)

    useAutoLaunch({ tasks, agents, dbPath })
    tasks.value = []
    await nextTick()

    // 2 done, 5 non-done — total 7 tasks but only 2 done (below threshold=3)
    tasks.value = [
      makeTask({ id: 1, status: 'done', agent_assigned_id: 10 }),
      makeTask({ id: 2, status: 'done', agent_assigned_id: 10 }),
      makeTask({ id: 3, status: 'in_progress', agent_assigned_id: 10 }),
      makeTask({ id: 4, status: 'in_progress', agent_assigned_id: 10 }),
      makeTask({ id: 5, status: 'todo', agent_assigned_id: 10 }),
      makeTask({ id: 6, status: 'archived', agent_assigned_id: 10 }),
      makeTask({ id: 7, status: 'todo', agent_assigned_id: 10 }),
    ]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)

    const tabsStore = useTabsStore()
    expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(false)
  })
})

describe('useAutoLaunch T1338: review cooldown boundary', () => {
  // REVIEW_COOLDOWN_MS = 5 * 60 * 1000
  // `if (Date.now() - lastReviewLaunchedAt < REVIEW_COOLDOWN_MS) return`
  // Mutations: < → <=, removing the check, swapping operands
  let tasks: ReturnType<typeof ref<Task[]>>
  let agents: ReturnType<typeof ref<Agent[]>>
  let dbPath: ReturnType<typeof ref<string | null>>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
    testIndex++
    vi.setSystemTime(new Date(2026, 7, 4, testIndex, 0, 0))
    api.queryDb.mockResolvedValue([{ id: 1 }])
    tasks = ref<Task[]>([])
    agents = ref<Agent[]>([])
    dbPath = ref<string | null>('/test/db')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('cooldown: re-launch blocked within 5min cooldown window', async () => {
    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    agents.value = [makeAgent(), reviewAgent]

    useAutoLaunch({ tasks, agents, dbPath })
    tasks.value = []
    await nextTick()

    // Trigger first review (seeds lastReviewLaunchedAt)
    tasks.value = Array.from({ length: 10 }, (_, i) =>
      makeTask({ id: i + 1, status: 'done', agent_assigned_id: 10 })
    )
    await nextTick()

    await vi.waitFor(() => {
      const tabsStore = useTabsStore()
      expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(true)
    })

    // Close the review terminal
    const tabsStore = useTabsStore()
    const reviewTab = tabsStore.tabs.find(t => t.agentName === 'review-master')!
    tabsStore.closeTab(reviewTab.id)

    // Advance exactly 4min 59s (just inside cooldown)
    vi.advanceTimersByTime(4 * 60 * 1000 + 59 * 1000)

    // Trigger again — should be blocked by cooldown
    tasks.value = [...tasks.value.map(t => ({ ...t }))]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)

    expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(false)
  })

  it('cooldown: re-launch allowed after exactly 5min cooldown passes', async () => {
    const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
    agents.value = [makeAgent(), reviewAgent]

    useAutoLaunch({ tasks, agents, dbPath })
    tasks.value = []
    await nextTick()

    // Trigger first review
    const doneTasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({ id: i + 1, status: 'done', agent_assigned_id: 10 })
    )
    tasks.value = doneTasks
    await nextTick()

    await vi.waitFor(() => {
      const tabsStore = useTabsStore()
      expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(true)
    })

    // Close review terminal
    const tabsStore = useTabsStore()
    const reviewTab = tabsStore.tabs.find(t => t.agentName === 'review-master')!
    tabsStore.closeTab(reviewTab.id)

    // Advance exactly 5min (cooldown expired: now - last = 5min, 5min < 5min is false → launch)
    vi.advanceTimersByTime(5 * 60 * 1000)

    // Trigger again — cooldown expired → should launch
    tasks.value = [...doneTasks.map(t => ({ ...t }))]
    await nextTick()

    await vi.waitFor(() => {
      expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(true)
    })
  })
})

describe('useAutoLaunch T1338: watcher initialization and status tracking', () => {
  let tasks: ReturnType<typeof ref<Task[]>>
  let agents: ReturnType<typeof ref<Agent[]>>
  let dbPath: ReturnType<typeof ref<string | null>>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
    testIndex++
    vi.setSystemTime(new Date(2026, 7, 5, testIndex, 0, 0))
    api.queryDb.mockResolvedValue([{ id: 1 }])
    tasks = ref<Task[]>([])
    agents = ref<Agent[]>([makeAgent()])
    dbPath = ref<string | null>('/test/db')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('previousStatuses updated after debounce: second transition detected correctly', async () => {
    // After handler runs, previousStatuses = new Map(current) must be updated
    // If not updated, the second transition would see the old prevStatus
    useAutoLaunch({ tasks, agents, dbPath })

    tasks.value = [makeTask({ id: 1, status: 'in_progress', agent_assigned_id: 10 })]
    await nextTick()

    const tabsStore = useTabsStore()

    // First terminal → task 1 done → closes
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const tab1 = tabsStore.tabs.find(t => t.type === 'terminal')!
    tab1.taskId = 1
    tab1.streamId = 'stream-t1'

    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(100 + 2100) // debounce + kill delay

    // Tab 1 should be closed
    expect(api.agentKill).toHaveBeenCalledWith('stream-t1')
    expect(tabsStore.tabs.filter(t => t.type === 'terminal')).toHaveLength(0)

    // Now a new task 2 starts and transitions to done
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const tab2 = tabsStore.tabs.find(t => t.type === 'terminal')!
    tab2.taskId = 2
    tab2.streamId = 'stream-t2'

    // Add task 2 as in_progress then done
    tasks.value = [
      makeTask({ id: 1, status: 'done', agent_assigned_id: 10 }),
      makeTask({ id: 2, status: 'in_progress', agent_assigned_id: 10 }),
    ]
    await nextTick()
    await vi.advanceTimersByTimeAsync(100)

    tasks.value = [
      makeTask({ id: 1, status: 'done', agent_assigned_id: 10 }),
      makeTask({ id: 2, status: 'done', agent_assigned_id: 10 }),
    ]
    await nextTick()
    await vi.advanceTimersByTimeAsync(100 + 2100)

    expect(api.agentKill).toHaveBeenCalledWith('stream-t2')
  })

  it('multiple tasks in one batch: each task done transition schedules close independently', async () => {
    useAutoLaunch({ tasks, agents, dbPath })

    tasks.value = [
      makeTask({ id: 10, status: 'in_progress', agent_assigned_id: 10 }),
      makeTask({ id: 11, status: 'in_progress', agent_assigned_id: 10 }),
    ]
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const tab10 = tabsStore.tabs.find(t => t.type === 'terminal')!
    tab10.taskId = 10
    tab10.streamId = 'stream-t10'

    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const tab11 = tabsStore.tabs.filter(t => t.type === 'terminal')[1]!
    tab11.taskId = 11
    tab11.streamId = 'stream-t11'

    // Both tasks go done simultaneously
    tasks.value = [
      makeTask({ id: 10, status: 'done', agent_assigned_id: 10 }),
      makeTask({ id: 11, status: 'done', agent_assigned_id: 10 }),
    ]
    await nextTick()
    await vi.advanceTimersByTimeAsync(100 + 2100)

    // Both tabs should be closed
    expect(api.agentKill).toHaveBeenCalledWith('stream-t10')
    expect(api.agentKill).toHaveBeenCalledWith('stream-t11')
    expect(tabsStore.tabs.filter(t => t.type === 'terminal')).toHaveLength(0)
  })
})

describe('useAutoLaunch T1338: no-task path (Chemin 2) guards', () => {
  let tasks: ReturnType<typeof ref<Task[]>>
  let agents: ReturnType<typeof ref<Agent[]>>
  let dbPath: ReturnType<typeof ref<string | null>>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
    testIndex++
    vi.setSystemTime(new Date(2026, 7, 6, testIndex, 0, 0))
    api.queryDb.mockResolvedValue([])
    tasks = ref<Task[]>([])
    agents = ref<Agent[]>([])
    dbPath = ref<string | null>('/test/db')
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('tab with agentName = null: Chemin 2 skips this tab (!tab.agentName guard)', async () => {
    // Tests: `if (!tab.agentName) continue`
    const agent = makeAgent({ id: 20, name: 'review-master', type: 'review' })
    agents.value = [agent]
    useAutoLaunch({ tasks, agents, dbPath })
    tasks.value = []
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('review-master', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    // Simulate no agentName
    termTab.agentName = null as unknown as string
    termTab.streamId = 'stream-no-agentname'

    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 999 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)

    // Should not have triggered a close
    expect(api.agentKill).not.toHaveBeenCalled()
  })

  it('tab with taskId: Chemin 2 skips task-linked tabs (tab.taskId guard)', async () => {
    // Tests: `if (tab.taskId) continue` — no-task path must skip task-linked tabs
    const agent = makeAgent({ id: 20, name: 'dev-front-vuejs' })
    agents.value = [agent]
    useAutoLaunch({ tasks, agents, dbPath })
    tasks.value = []
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    termTab.taskId = 42  // Task-linked → Chemin 2 must skip it
    termTab.streamId = 'stream-task-linked'

    // Trigger Chemin 2 path (task for different agent)
    tasks.value = [makeTask({ id: 999, status: 'done', agent_assigned_id: 999 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)

    // Should NOT schedule close via Chemin 2 (taskId set → skip)
    expect(api.queryDb).not.toHaveBeenCalled()
  })

  it('agent not found in agents list: Chemin 2 skips the tab', async () => {
    // Tests: `const agent = agents.value.find(...)` + `if (!agent || ...) continue`
    agents.value = [] // agent list is empty
    useAutoLaunch({ tasks, agents, dbPath })
    tasks.value = []
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('unknown-agent', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    termTab.streamId = 'stream-unknown-agent'

    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 999 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)

    expect(api.agentKill).not.toHaveBeenCalled()
  })

  it('agent.auto_launch = 0 in Chemin 2: tab not closed', async () => {
    // Tests: `if (!agent || agent.auto_launch === 0) continue`
    const agent = makeAgent({ id: 20, name: 'review-master', auto_launch: 0 })
    agents.value = [agent]
    useAutoLaunch({ tasks, agents, dbPath })
    tasks.value = []
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('review-master', 'Ubuntu-24.04')
    const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    termTab.streamId = 'stream-no-auto-launch-notask'

    tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 999 })]
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)

    expect(api.agentKill).not.toHaveBeenCalled()
  })
})
