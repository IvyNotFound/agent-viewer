import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref, nextTick } from 'vue'
import { useAutoLaunch } from './useAutoLaunch'
import { useTabsStore } from '@renderer/stores/tabs'
import { useSettingsStore } from '@renderer/stores/settings'
import { useTasksStore } from '@renderer/stores/tasks'
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
  agentKill: vi.fn().mockResolvedValue(undefined),
  // queryDb: returns a completed session by default (used by scheduleClose poller)
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

describe('composables/useAutoLaunch', () => {
  let tasks: ReturnType<typeof ref<Task[]>>
  let agents: ReturnType<typeof ref<Agent[]>>
  let dbPath: ReturnType<typeof ref<string | null>>

  // Counter to ensure each test gets a unique time far enough apart to expire
  // the module-level getCachedClaudeInstances cache (TTL = 5min)
  let testIndex = 0

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
    testIndex++
    vi.setSystemTime(new Date(2026, 0, 1, 0, testIndex * 10, 0))

    // Default: queryDb returns a completed session (agent is done, safe to close)
    api.queryDb.mockResolvedValue([{ id: 1 }])

    tasks = ref<Task[]>([])
    agents = ref<Agent[]>([makeAgent()])
    dbPath = ref<string | null>('/test/db')

    // Set dbPath on tasks store so useLaunchSession can access it
    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('T1065: REVIEW_COOLDOWN_MS — 5 minutes exactly', () => {
    function makeDoneTasksCooldown(count: number): Task[] {
      return Array.from({ length: count }, (_, i) =>
        makeTask({ id: i + 1, status: 'done', agent_assigned_id: 10 })
      )
    }

    it('should NOT re-launch review at exactly 4min59s (still in cooldown)', async () => {
      const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
      agents.value = [makeAgent(), reviewAgent]
      useAutoLaunch({ tasks, agents, dbPath })

      tasks.value = []
      await nextTick()

      tasks.value = makeDoneTasksCooldown(10)
      await nextTick()

      await vi.waitFor(() => {
        const tabsStore = useTabsStore()
        expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(true)
      })

      const tabsStore = useTabsStore()
      const reviewTab = tabsStore.tabs.find(t => t.agentName === 'review-master')!
      tabsStore.closeTab(reviewTab.id)

      // Advance 4min59s — still within 5min cooldown
      vi.advanceTimersByTime(4 * 60 * 1000 + 59 * 1000)

      tasks.value = [...makeDoneTasksCooldown(10)]
      await nextTick()
      await nextTick()

      expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(false)
    })

    it('should re-launch review after 5 full minutes (cooldown expired)', async () => {
      const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
      agents.value = [makeAgent(), reviewAgent]
      useAutoLaunch({ tasks, agents, dbPath })

      tasks.value = []
      await nextTick()

      tasks.value = makeDoneTasksCooldown(10)
      await nextTick()

      await vi.waitFor(() => {
        const tabsStore = useTabsStore()
        expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(true)
      })

      const tabsStore = useTabsStore()
      const reviewTab = tabsStore.tabs.find(t => t.agentName === 'review-master')!
      tabsStore.closeTab(reviewTab.id)

      // Advance past the 5min cooldown (300001ms)
      vi.advanceTimersByTime(5 * 60 * 1000 + 1)

      tasks.value = [...makeDoneTasksCooldown(10)]
      await nextTick()

      await vi.waitFor(() => {
        expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(true)
      })
    })
  })

  describe('T1065: debounce collapses rapid batch updates into one handler', () => {
    it('should process only the last state when watch fires multiple times within 80ms', async () => {
      useAutoLaunch({ tasks, agents, dbPath })

      tasks.value = []
      await nextTick()

      // Rapid updates within debounce window
      tasks.value = [makeTask({ id: 1, status: 'in_progress', agent_assigned_id: 10 })]
      tasks.value = [makeTask({ id: 1, status: 'in_progress', agent_assigned_id: 10 })]

      await vi.advanceTimersByTimeAsync(80)

      const tabsStore = useTabsStore()
      expect(tabsStore.tabs.filter(t => t.type === 'terminal')).toHaveLength(0)
    })

    it('should cancel pending debounce when a new update arrives within 80ms', async () => {
      useAutoLaunch({ tasks, agents, dbPath })

      // Seed with in_progress
      tasks.value = [makeTask({ id: 1, status: 'in_progress', agent_assigned_id: 10 })]
      await nextTick()

      const tabsStore = useTabsStore()
      tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
      const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
      termTab.taskId = 1 // T1937: link to task so Chemin 1 matches (Chemin 2 now guards on streamId)
      termTab.streamId = 'stream-debounce'

      // First done transition — starts 80ms debounce
      tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]

      // 40ms later: another update arrives — debounce resets
      await vi.advanceTimersByTimeAsync(40)
      tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]

      // Advance 40ms more — original debounce would have fired but was reset
      await vi.advanceTimersByTimeAsync(40)

      // Immediate poll hasn't fired yet — still within the second debounce window
      expect(api.agentKill).not.toHaveBeenCalled()

      // Complete the second debounce window
      await vi.advanceTimersByTimeAsync(80)

      // Now scheduleClose fires (from second debounce) — immediate poll resolves
      expect(api.agentKill).toHaveBeenCalledWith('stream-debounce')
    })
  })

  describe('T1065: prevStatus conditions — task transitions', () => {
    it('should NOT schedule close for task going todo→in_progress (not a done transition)', async () => {
      // task.status === 'done' guard: in_progress doesn't trigger task-done scheduleClose.
      // With in_progress, hasActiveTasks=true — no-task path doesn't trigger either.
      api.queryDb.mockResolvedValue([]) // no completed session
      useAutoLaunch({ tasks, agents, dbPath })

      tasks.value = [makeTask({ id: 1, status: 'todo', agent_assigned_id: 10 })]
      await nextTick()

      const tabsStore = useTabsStore()
      tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
      const termTab = tabsStore.tabs.find(t => t.type === 'terminal')!
      termTab.streamId = 'stream-in-progress'

      tasks.value = [makeTask({ id: 1, status: 'in_progress', agent_assigned_id: 10 })]
      await nextTick()
      await vi.advanceTimersByTimeAsync(200)

      // in_progress is active → no-task path skips → task-done path skips (not done)
      expect(api.agentKill).not.toHaveBeenCalled()
    })

    it('should NOT re-trigger task-done close when prevStatus is done (same task stays done)', async () => {
      // prevStatus !== 'done' guard: task-done path doesn't schedule twice.
      // T1937: Chemin 2 no longer fires with streamId set, so we verify via no-task path without streamId.
      useAutoLaunch({ tasks, agents, dbPath })

      // Seed: task already done → prevStatus[1] = 'done'
      tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]
      await nextTick()

      const tabsStore = useTabsStore()
      tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
      // T1937: no streamId — Chemin 2 guard skips tabs with active process

      // Task stays done — prevStatus[1] === 'done' → task-done path condition fails
      tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]
      await nextTick()
      await vi.advanceTimersByTimeAsync(200)

      // T1937: Chemin 1 doesn't re-trigger (prevStatus=done), Chemin 2 fires but
      // no streamId → agentKill not called. Tab still gets closed via doClose→closeTab.
      expect(api.agentKill).not.toHaveBeenCalled()
    })
  })

  describe('T1065: hasActiveTasks — every() checks all tasks for agent', () => {
    it('should NOT schedule no-task close when agent has 1 in_progress task', async () => {
      api.queryDb.mockResolvedValue([]) // no completed session
      useAutoLaunch({ tasks, agents, dbPath })

      tasks.value = []
      await nextTick()

      const tabsStore = useTabsStore()
      tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')

      // Agent has an in_progress task → hasActiveTasks = true → no-task close NOT scheduled
      tasks.value = [makeTask({ id: 1, status: 'in_progress', agent_assigned_id: 10 })]
      await nextTick()
      await vi.advanceTimersByTimeAsync(200)

      expect(api.agentKill).not.toHaveBeenCalled()
    })

    it('should NOT schedule no-task close when agent has a todo task', async () => {
      api.queryDb.mockResolvedValue([]) // no completed session
      useAutoLaunch({ tasks, agents, dbPath })

      tasks.value = []
      await nextTick()

      const tabsStore = useTabsStore()
      tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')

      // todo counts as active → hasActiveTasks = true → no-task close NOT scheduled
      tasks.value = [makeTask({ id: 1, status: 'todo', agent_assigned_id: 10 })]
      await nextTick()
      await vi.advanceTimersByTimeAsync(200)

      expect(api.agentKill).not.toHaveBeenCalled()
    })

    it('should schedule no-task close when agent has only done tasks (no active)', async () => {
      api.queryDb.mockResolvedValue([{ id: 1 }]) // session completed

      useAutoLaunch({ tasks, agents, dbPath })

      tasks.value = []
      await nextTick()

      const tabsStore = useTabsStore()
      tabsStore.addTerminal('dev-front-vuejs', 'Ubuntu-24.04')
      // T1937: no streamId — Chemin 2 guard now skips tabs with active process

      // All tasks done → hasActiveTasks = false → no-task close scheduled
      tasks.value = [makeTask({ id: 1, status: 'done', agent_assigned_id: 10 })]
      await nextTick()
      await vi.advanceTimersByTimeAsync(200)

      // T1937: no streamId → agentKill not called, but Chemin 2 still fires (queryDb polled)
      expect(api.agentKill).not.toHaveBeenCalled()
      expect(api.queryDb).toHaveBeenCalled()
    })
  })

  describe('T1065: done tasks filter passed to launchReviewSession', () => {
    // 3 done (T1, T2, T5) + 1 in_progress (T3) + 1 todo (T4).
    // setAutoReviewThreshold clamps minimum to 3.
    function makeMixedTasksFilter(): Task[] {
      return [
        makeTask({ id: 1, status: 'done', agent_assigned_id: 10, title: 'Done A' }),
        makeTask({ id: 2, status: 'done', agent_assigned_id: 10, title: 'Done B' }),
        makeTask({ id: 5, status: 'done', agent_assigned_id: 10, title: 'Done C' }),
        makeTask({ id: 3, status: 'in_progress', agent_assigned_id: 10, title: 'In progress' }),
        makeTask({ id: 4, status: 'todo', agent_assigned_id: 10, title: 'Todo' }),
      ]
    }

    it('should only include done tasks in review prompt (filter t.status === done)', async () => {
      const reviewAgent = makeAgent({ id: 99, name: 'review-master', type: 'review' })
      agents.value = [makeAgent(), reviewAgent]

      // Capture userPrompt from buildAgentPrompt — it encodes the done task list
      const capturedPrompts: string[] = []
      api.buildAgentPrompt.mockImplementation(
        (_agentName: string, userPrompt: string, _dbPath: string, _agentId: number) => {
          capturedPrompts.push(userPrompt as string)
          return Promise.resolve('final prompt')
        }
      )

      const settingsStore = useSettingsStore()
      settingsStore.setAutoReviewThreshold(3) // min threshold = 3

      useAutoLaunch({ tasks, agents, dbPath })

      tasks.value = []
      await nextTick()

      // Mixed tasks: 3 done (T1, T2, T5) + 1 in_progress (T3) + 1 todo (T4)
      tasks.value = makeMixedTasksFilter()
      await nextTick()

      await vi.waitFor(() => {
        const tabsStore = useTabsStore()
        expect(tabsStore.tabs.some(t => t.agentName === 'review-master')).toBe(true)
      })

      // userPrompt: "T1 Done A, T2 Done B, T5 Done C" — only done tasks
      expect(capturedPrompts.length).toBeGreaterThan(0)
      const prompt = capturedPrompts[0]
      expect(prompt).toContain('T1')
      expect(prompt).toContain('T2')
      expect(prompt).toContain('T5')
      expect(prompt).not.toContain('T3')
      expect(prompt).not.toContain('T4')
    })
  })
})
