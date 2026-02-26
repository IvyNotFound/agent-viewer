/**
 * Composable for auto-launching and auto-closing agent terminal sessions.
 *
 * Watches task changes and:
 * - Opens a terminal when a new task is created with an assigned agent (T340)
 * - Closes the terminal when the task transitions to 'done' (with 5s grace period)
 * - Launches a review session when done-task count reaches threshold (T341)
 *
 * Excluded agent types for auto-launch: review, setup, infra-prod
 *
 * @module composables/useAutoLaunch
 */

import { watch, type Ref } from 'vue'
import { useTabsStore } from '@renderer/stores/tabs'
import { useSettingsStore } from '@renderer/stores/settings'
import type { Task, Agent } from '@renderer/types'

/** Agent types excluded from auto-launch */
const EXCLUDED_TYPES = new Set(['review', 'setup', 'infra-prod'])

/** Grace period (ms) before closing a terminal after task goes done */
const CLOSE_GRACE_MS = 5000

/** Cooldown (ms) between review auto-launches to prevent infinite loops */
const REVIEW_COOLDOWN_MS = 5 * 60 * 1000

interface AutoLaunchOptions {
  tasks: Ref<Task[]>
  agents: Ref<Agent[]>
  dbPath: Ref<string | null>
}

export function useAutoLaunch({ tasks, agents, dbPath }: AutoLaunchOptions): void {
  const tabsStore = useTabsStore()
  const settingsStore = useSettingsStore()

  /** Track known task IDs to detect newly appearing tasks */
  let knownTaskIds = new Set<number>()
  /** Track tasks that were not 'done' to detect transitions to 'done' */
  let previousStatuses = new Map<number, string>()
  /** Pending close timers keyed by agent name (for grace period) */
  const closeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Flag: skip first watch trigger (initial load is not "new" tasks) */
  let initialized = false
  /** Timestamp of last review auto-launch (cooldown prevention) */
  let lastReviewLaunchedAt = 0

  watch(tasks, (newTasks) => {
    if (!dbPath.value) return

    const currentIds = new Set(newTasks.map(t => t.id))

    if (!initialized) {
      // First load: seed the known set, don't trigger launches
      knownTaskIds = currentIds
      previousStatuses = new Map(newTasks.map(t => [t.id, t.statut]))
      initialized = true
      return
    }

    // --- T340: Auto-launch agent sessions ---
    if (settingsStore.autoLaunchAgentSessions) {
      for (const task of newTasks) {
        if (!knownTaskIds.has(task.id) && task.agent_assigne_id && task.statut === 'todo') {
          const agent = agents.value.find(a => a.id === task.agent_assigne_id)
          if (agent && !EXCLUDED_TYPES.has(agent.type) && !tabsStore.hasAgentTerminal(agent.name)) {
            launchAgentTerminal(agent, task)
          }
        }
      }
    }

    // --- T340: Auto-close on done transition ---
    if (settingsStore.autoLaunchAgentSessions) {
      for (const task of newTasks) {
        const prevStatus = previousStatuses.get(task.id)
        if (prevStatus && prevStatus !== 'done' && task.statut === 'done' && task.agent_assigne_id) {
          const agent = agents.value.find(a => a.id === task.agent_assigne_id)
          if (agent && tabsStore.hasAgentTerminal(agent.name)) {
            scheduleClose(agent.name)
          }
        }
      }
    }

    // --- T341: Auto-launch review session ---
    if (settingsStore.autoLaunchAgentSessions && settingsStore.autoReviewEnabled) {
      checkReviewThreshold(newTasks)
    }

    // Update tracking state
    knownTaskIds = currentIds
    previousStatuses = new Map(newTasks.map(t => [t.id, t.statut]))
  }, { deep: false })

  // Reset tracking when project changes
  watch(dbPath, () => {
    initialized = false
    knownTaskIds = new Set()
    previousStatuses = new Map()
    lastReviewLaunchedAt = 0
    for (const timer of closeTimers.values()) clearTimeout(timer)
    closeTimers.clear()
  })

  function checkReviewThreshold(currentTasks: Task[]): void {
    // Count non-archived done tasks
    const doneTasks = currentTasks.filter(t => t.statut === 'done')
    if (doneTasks.length < settingsStore.autoReviewThreshold) return

    // Cooldown check
    if (Date.now() - lastReviewLaunchedAt < REVIEW_COOLDOWN_MS) return

    // Find the review agent (review-master in solo mode, or review)
    const reviewAgent = agents.value.find(a => a.type === 'review')
    if (!reviewAgent) return

    // Don't launch if review session already active
    if (tabsStore.hasAgentTerminal(reviewAgent.name)) return

    lastReviewLaunchedAt = Date.now()
    launchReviewSession(reviewAgent, doneTasks)
  }

  async function launchReviewSession(agent: Agent, doneTasks: Task[]): Promise<void> {
    if (tabsStore.hasAgentTerminal(agent.name)) return

    try {
      const instances = await window.electronAPI.getClaudeInstances() as Array<{
        distro: string; version: string; isDefault: boolean; profiles: string[]
      }>
      if (instances.length === 0) return

      const instance = instances.find(i => i.isDefault) ?? instances[0]

      const promptResult = await window.electronAPI.getAgentSystemPrompt(dbPath.value!, agent.id)
      if (!promptResult.success) return

      // Build prompt listing task IDs and titles
      const taskList = doneTasks.map(t => `T${t.id} ${t.titre}`).join(', ')
      const userPrompt = `Audit les tâches terminées : ${taskList}. Valide ou rejette chacune.`
      const finalPrompt = await window.electronAPI.buildAgentPrompt(
        agent.name,
        userPrompt,
        dbPath.value ?? undefined,
        agent.id
      )

      const parts: string[] = []
      if (promptResult.systemPrompt) parts.push(promptResult.systemPrompt)
      if (promptResult.systemPromptSuffix) parts.push(promptResult.systemPromptSuffix)
      const fullSystemPrompt = parts.join('\n\n') || undefined

      const thinkingMode = (promptResult.thinkingMode as 'auto' | 'disabled') ?? 'auto'

      if (tabsStore.hasAgentTerminal(agent.name)) return

      tabsStore.addTerminal(
        agent.name,
        instance.distro,
        finalPrompt,
        fullSystemPrompt,
        thinkingMode
      )
    } catch (err) {
      console.warn('[autoLaunch] Failed to launch review session', err)
    }
  }

  async function launchAgentTerminal(agent: Agent, task: Task): Promise<void> {
    // Double-check guard right before launch (race condition protection)
    if (tabsStore.hasAgentTerminal(agent.name)) return

    try {
      // Get Claude instances to find default WSL distro
      const instances = await window.electronAPI.getClaudeInstances() as Array<{
        distro: string; version: string; isDefault: boolean; profiles: string[]
      }>
      if (instances.length === 0) return

      const instance = instances.find(i => i.isDefault) ?? instances[0]

      // Get agent system prompt and thinking mode
      const promptResult = await window.electronAPI.getAgentSystemPrompt(dbPath.value!, agent.id)
      if (!promptResult.success) return

      // Build the agent prompt with task context
      const userPrompt = `Tâches: #${task.id}[${task.statut}] -> Tu es agent ${agent.name}. Va voir ton prompt system dans la table agent.`
      const finalPrompt = await window.electronAPI.buildAgentPrompt(
        agent.name,
        userPrompt,
        dbPath.value ?? undefined,
        agent.id
      )

      // Build full system prompt
      const parts: string[] = []
      if (promptResult.systemPrompt) parts.push(promptResult.systemPrompt)
      if (promptResult.systemPromptSuffix) parts.push(promptResult.systemPromptSuffix)
      const fullSystemPrompt = parts.join('\n\n') || undefined

      const thinkingMode = (promptResult.thinkingMode as 'auto' | 'disabled') ?? 'auto'

      // Final guard before addTerminal
      if (tabsStore.hasAgentTerminal(agent.name)) return

      tabsStore.addTerminal(
        agent.name,
        instance.distro,
        finalPrompt,
        fullSystemPrompt,
        thinkingMode
      )
    } catch (err) {
      console.warn('[autoLaunch] Failed to launch terminal for agent', agent.name, err)
    }
  }

  function scheduleClose(agentName: string): void {
    // Cancel existing timer for this agent if any
    const existing = closeTimers.get(agentName)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      closeTimers.delete(agentName)
      const tab = tabsStore.tabs.find(t => t.type === 'terminal' && t.agentName === agentName)
      if (tab?.ptyId) {
        // Graceful close: send Ctrl+C then wait a bit before killing
        window.electronAPI.terminalWrite(tab.ptyId, '\x03')
        setTimeout(() => {
          if (tab.ptyId) window.electronAPI.terminalKill(tab.ptyId)
          tabsStore.closeTab(tab.id)
        }, 2000)
      } else if (tab) {
        tabsStore.closeTab(tab.id)
      }
    }, CLOSE_GRACE_MS)

    closeTimers.set(agentName, timer)
  }
}
