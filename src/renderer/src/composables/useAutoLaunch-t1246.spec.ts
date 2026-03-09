/**
 * T1246: No-task tabs (review, doc…) must not be force-closed by a fallback timer.
 * They should only close when the agent session reaches status='completed'.
 *
 * Tests:
 * 1. No-task tab stays open far beyond the old 5-min fallback (session still active)
 * 2. No-task tab closes when session completes, even after a long running session
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
    success: true, systemPrompt: 'You are review', systemPromptSuffix: null, thinkingMode: 'auto'
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
    id: 10, name: 'review-master', type: 'review', scope: null,
    system_prompt: null, system_prompt_suffix: null, thinking_mode: 'auto',
    allowed_tools: null, auto_launch: 1, permission_mode: null, max_sessions: 3, created_at: '',
    ...overrides
  } as Agent
}

describe('useAutoLaunch T1246: no-task tabs have no fallback timer', () => {
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
    vi.setSystemTime(new Date(2026, 6, 1, 0, testIndex * 20, 0))

    // Default: no completed session (agent still working)
    api.queryDb.mockResolvedValue([])

    tasks = ref<Task[]>([])
    agents = ref<Agent[]>([])
    dbPath = ref<string | null>('/test/db')

    const tasksStore = useTasksStore()
    ;(tasksStore as unknown as { dbPath: string | null }).dbPath = '/test/db'
  })

  afterEach(() => { vi.useRealTimers() })

  it('should NOT close a no-task tab after 10 minutes when session is still started', async () => {
    // review agent tab without taskId (Chemin 2).
    // Session is still active (queryDb returns no completed session).
    // Even after 10 min (>> old 5-min fallback), tab must remain open.
    const agent = makeAgent({ id: 50, name: 'review-master' })
    agents.value = [agent]

    useAutoLaunch({ tasks, agents, dbPath })
    tasks.value = []
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('review-master', 'Ubuntu-24.04')
    const reviewTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    reviewTab.streamId = 'stream-review-no-fallback'
    // No taskId — Chemin 2 path

    // Trigger watch to schedule the no-task close (with fallbackMs=0)
    tasks.value = [makeTask({ id: 99, status: 'done', agent_assigned_id: 999 })]
    await nextTick()

    // Advance 10 minutes — well beyond the old 5-min fallback (FALLBACK_CLOSE_NOTASK_MS)
    // queryDb still returns [] → no session completed → tab must stay open
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)

    expect(api.agentKill).not.toHaveBeenCalled()
    expect(tabsStore.tabs.filter(t => t.type === 'terminal')).toHaveLength(1)
  })

  it('should close the no-task tab once session completes, even after a long session', async () => {
    // review agent runs for 8 minutes before completing.
    // With no fallback (T1246), the tab must stay open for those 8 minutes
    // then close when session reaches 'completed'.
    const agent = makeAgent({ id: 51, name: 'review-master' })
    agents.value = [agent]

    useAutoLaunch({ tasks, agents, dbPath })
    tasks.value = []
    await nextTick()

    const tabsStore = useTabsStore()
    tabsStore.addTerminal('review-master', 'Ubuntu-24.04')
    const reviewTab = tabsStore.tabs.find(t => t.type === 'terminal')!
    reviewTab.streamId = 'stream-review-long-session'

    // Trigger no-task close scheduling
    tasks.value = [makeTask({ id: 99, status: 'done', agent_assigned_id: 999 })]
    await nextTick()

    // 8 minutes pass — session still active
    await vi.advanceTimersByTimeAsync(8 * 60 * 1000)
    expect(api.agentKill).not.toHaveBeenCalled()
    expect(tabsStore.tabs.filter(t => t.type === 'terminal')).toHaveLength(1)

    // Session now completes — next poll (every 5s) detects it
    api.queryDb.mockResolvedValue([{ id: 77 }])
    await vi.advanceTimersByTimeAsync(5_000 + 100)

    // Tab closed (agentKill then closeTab after 30s post-complete delay)
    expect(api.agentKill).toHaveBeenCalledWith('stream-review-long-session')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(tabsStore.tabs.filter(t => t.type === 'terminal')).toHaveLength(0)
  })
})
