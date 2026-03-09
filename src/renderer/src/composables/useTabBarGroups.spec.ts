/**
 * Tests for useTabBarGroups composable (T1223)
 *
 * Covers:
 * - terminalTabs / fileTabs filtering (L26-L27)
 * - groupedTerminalTabs grouping by agentName
 * - sorting: active agent first, null last, then alphabetical
 * - activeAgentName with null activeTab (L43)
 * - toggleGroup / isGroupCollapsed
 * - isGroupActive (L73 — t.id === store.activeTabId)
 * - activateAgentGroup: empty group, collapsed, inactive group
 * - watch activeTabId: auto-expand new, auto-collapse old (L91-L103)
 * - watch groupedTerminalTabs.length: len <= 1 clears, len > 1 collapses inactive (L106-L114)
 * - tabStyleMap: with/without agentName, active vs inactive
 * - agentTabStyleMap: null name path + isActive path
 * - indicatorStyleMap: with/without agentName
 * - subTabLabel: taskId vs title (L172-L174)
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref, nextTick } from 'vue'
import { useTabsStore } from '@renderer/stores/tabs'

// ─── Mock electronAPI ─────────────────────────────────────────────────────────
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
  agentGroupsCreate: vi.fn().mockResolvedValue({ success: true, group: { id: 1, name: 'NewGroup', sort_order: 0, created_at: '' } }),
  agentGroupsRename: vi.fn().mockResolvedValue({ success: true }),
  agentGroupsDelete: vi.fn().mockResolvedValue({ success: true }),
  agentGroupsSetMember: vi.fn().mockResolvedValue({ success: true }),
  agentKill: vi.fn(),
}

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
})

// ─── Helper ───────────────────────────────────────────────────────────────────
function makeScrollContainer(scrollLeft = 0) {
  return ref<HTMLDivElement | null>({
    scrollLeft,
    scrollHeight: 100,
    scrollTop: 0,
    clientHeight: 100,
  } as unknown as HTMLDivElement)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useTabBarGroups', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  // ── terminalTabs / fileTabs filtering ────────────────────────────────────────
  describe('terminalTabs filtering (L26)', () => {
    it('excludes permanent tabs and non-terminal types', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { terminalTabs } = useTabBarGroups(scrollContainer)

      // Initial state: only permanent tabs (backlog, dashboard, timeline)
      expect(terminalTabs.value).toHaveLength(0)
    })

    it('includes terminal tabs that are not permanent', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { terminalTabs } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha')
      store.addTerminal('agent-beta')

      expect(terminalTabs.value).toHaveLength(2)
      expect(terminalTabs.value.every(t => t.type === 'terminal')).toBe(true)
    })

    it('excludes tabs with type !== terminal (file tabs)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { terminalTabs, fileTabs } = useTabBarGroups(scrollContainer)

      store.openFile('/path/to/file.ts', 'file.ts')
      store.addTerminal('agent-alpha')

      expect(terminalTabs.value).toHaveLength(1)
      expect(fileTabs.value).toHaveLength(1)
      expect(fileTabs.value[0].type).toBe('file')
    })
  })

  // ── Grouping by agentName ─────────────────────────────────────────────────
  describe('groupedTerminalTabs grouping', () => {
    it('groups tabs by agentName', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { groupedTerminalTabs } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha')
      store.addTerminal('agent-alpha')
      store.addTerminal('agent-beta')

      const alphaGroup = groupedTerminalTabs.value.find(g => g.agentName === 'agent-alpha')
      const betaGroup = groupedTerminalTabs.value.find(g => g.agentName === 'agent-beta')

      expect(alphaGroup?.tabs).toHaveLength(2)
      expect(betaGroup?.tabs).toHaveLength(1)
    })

    it('puts active agent group first (L50-L51)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { groupedTerminalTabs } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-beta', undefined, undefined, undefined, undefined, undefined, undefined, false)
      store.addTerminal('agent-alpha') // active (activate=true by default)

      expect(groupedTerminalTabs.value[0].agentName).toBe('agent-alpha')
    })

    it('puts null-agentName group last (L53-L54)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { groupedTerminalTabs } = useTabBarGroups(scrollContainer)

      store.addTerminal(undefined) // null agentName
      store.addTerminal('agent-alpha') // active

      const groups = groupedTerminalTabs.value
      expect(groups[groups.length - 1].agentName).toBeNull()
    })

    it('sorts remaining groups alphabetically (L55)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { groupedTerminalTabs } = useTabBarGroups(scrollContainer)

      // Add agents in non-alphabetical order, last active = agent-active
      store.addTerminal('zeta-agent', undefined, undefined, undefined, undefined, undefined, undefined, false)
      store.addTerminal('alpha-agent', undefined, undefined, undefined, undefined, undefined, undefined, false)
      store.addTerminal('agent-active') // active

      const groups = groupedTerminalTabs.value
      expect(groups[0].agentName).toBe('agent-active')
      expect(groups[1].agentName).toBe('alpha-agent')
      expect(groups[2].agentName).toBe('zeta-agent')
    })

    it('returns groups unchanged when no active agent (L48)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { groupedTerminalTabs } = useTabBarGroups(scrollContainer)

      // backlog is active (no agentName)
      store.setActive('backlog')
      store.addTerminal('agent-beta', undefined, undefined, undefined, undefined, undefined, undefined, false)
      store.addTerminal('agent-alpha', undefined, undefined, undefined, undefined, undefined, undefined, false)

      // With no active agent, groups are returned in insertion order
      expect(groupedTerminalTabs.value.some(g => g.agentName === 'agent-alpha')).toBe(true)
      expect(groupedTerminalTabs.value.some(g => g.agentName === 'agent-beta')).toBe(true)
    })
  })

  // ── activeAgentName ───────────────────────────────────────────────────────
  describe('activeAgentName (L43)', () => {
    it('returns null when activeTab has no agentName', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      store.setActive('backlog')
      const scrollContainer = makeScrollContainer()
      const { groupedTerminalTabs } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha', undefined, undefined, undefined, undefined, undefined, undefined, false)

      // No agent is active, groups not reordered
      expect(groupedTerminalTabs.value).toBeDefined()
    })

    it('returns agentName when activeTab has an agentName', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { groupedTerminalTabs } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha') // becomes active

      expect(groupedTerminalTabs.value[0].agentName).toBe('agent-alpha')
    })
  })

  // ── toggleGroup / isGroupCollapsed ────────────────────────────────────────
  describe('toggleGroup / isGroupCollapsed', () => {
    it('collapses a group that is expanded', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const scrollContainer = makeScrollContainer()
      const { toggleGroup, isGroupCollapsed } = useTabBarGroups(scrollContainer)

      expect(isGroupCollapsed('agent-alpha')).toBe(false)
      toggleGroup('agent-alpha')
      expect(isGroupCollapsed('agent-alpha')).toBe(true)
    })

    it('expands a group that is collapsed', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const scrollContainer = makeScrollContainer()
      const { toggleGroup, isGroupCollapsed } = useTabBarGroups(scrollContainer)

      toggleGroup('agent-alpha')
      expect(isGroupCollapsed('agent-alpha')).toBe(true)
      toggleGroup('agent-alpha')
      expect(isGroupCollapsed('agent-alpha')).toBe(false)
    })

    it('handles null agentName in toggle', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const scrollContainer = makeScrollContainer()
      const { toggleGroup, isGroupCollapsed } = useTabBarGroups(scrollContainer)

      expect(isGroupCollapsed(null)).toBe(false)
      toggleGroup(null)
      expect(isGroupCollapsed(null)).toBe(true)
    })
  })

  // ── isGroupActive (L73) ───────────────────────────────────────────────────
  describe('isGroupActive (L73)', () => {
    it('returns true when a tab in the group matches activeTabId', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { groupedTerminalTabs, isGroupActive } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha')
      const group = groupedTerminalTabs.value.find(g => g.agentName === 'agent-alpha')!
      store.setActive(group.tabs[0].id)

      expect(isGroupActive(group)).toBe(true)
    })

    it('returns false when no tab in the group is active (L73 EqualityOperator)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { groupedTerminalTabs, isGroupActive } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha', undefined, undefined, undefined, undefined, undefined, undefined, false)
      store.addTerminal('agent-beta') // active

      const group = groupedTerminalTabs.value.find(g => g.agentName === 'agent-alpha')!
      expect(isGroupActive(group)).toBe(false)
    })
  })

  // ── activateAgentGroup ────────────────────────────────────────────────────
  describe('activateAgentGroup', () => {
    it('does nothing when group has no tabs (L77)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { activateAgentGroup } = useTabBarGroups(scrollContainer)

      const initialActiveId = store.activeTabId
      activateAgentGroup({ agentName: 'agent-empty', tabs: [] })
      expect(store.activeTabId).toBe(initialActiveId)
    })

    it('expands collapsed group and sets first tab active (L79-L83)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { groupedTerminalTabs, isGroupCollapsed, toggleGroup, activateAgentGroup } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha', undefined, undefined, undefined, undefined, undefined, undefined, false)
      store.addTerminal('agent-beta') // active → triggers watch, alpha gets collapsed

      await nextTick()

      const alphaGroup = groupedTerminalTabs.value.find(g => g.agentName === 'agent-alpha')!
      // Manually collapse alpha to test
      if (!isGroupCollapsed('agent-alpha')) toggleGroup('agent-alpha')
      expect(isGroupCollapsed('agent-alpha')).toBe(true)

      activateAgentGroup(alphaGroup)
      expect(isGroupCollapsed('agent-alpha')).toBe(false)
      expect(store.activeTabId).toBe(alphaGroup.tabs[0].id)
    })

    it('does not call setActive when group is already active (L82)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { groupedTerminalTabs, activateAgentGroup } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha')
      const alphaGroup = groupedTerminalTabs.value.find(g => g.agentName === 'agent-alpha')!
      store.setActive(alphaGroup.tabs[0].id)

      const setActiveSpy = vi.spyOn(store, 'setActive')
      activateAgentGroup(alphaGroup)
      expect(setActiveSpy).not.toHaveBeenCalled()
    })

    it('restores scrollLeft after nextTick (L85-L87)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const container = { scrollLeft: 42 } as unknown as HTMLDivElement
      const scrollContainer = ref<HTMLDivElement | null>(container)
      const { groupedTerminalTabs, activateAgentGroup } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha', undefined, undefined, undefined, undefined, undefined, undefined, false)
      const alphaGroup = groupedTerminalTabs.value.find(g => g.agentName === 'agent-alpha')!

      activateAgentGroup(alphaGroup)
      await nextTick()

      expect(container.scrollLeft).toBe(42)
    })
  })

  // ── watch activeTabId (L91-L103) ──────────────────────────────────────────
  describe('watch activeTabId — auto-expand/collapse', () => {
    it('expands the group of the new active tab (L95)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { isGroupCollapsed, toggleGroup } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha')
      // Manually collapse alpha
      toggleGroup('agent-alpha')
      expect(isGroupCollapsed('agent-alpha')).toBe(true)

      // Activate a tab in agent-alpha
      const alphaTab = store.tabs.find(t => t.agentName === 'agent-alpha')!
      store.setActive(alphaTab.id)
      await nextTick()

      expect(isGroupCollapsed('agent-alpha')).toBe(false)
    })

    it('collapses old agent group when switching to a different agent (L99-L101)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { isGroupCollapsed } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha') // active
      store.addTerminal('agent-beta', undefined, undefined, undefined, undefined, undefined, undefined, false)

      await nextTick()

      // Switch active to beta
      const betaTab = store.tabs.find(t => t.agentName === 'agent-beta')!
      store.setActive(betaTab.id)
      await nextTick()

      // Alpha should be collapsed
      expect(isGroupCollapsed('agent-alpha')).toBe(true)
    })

    it('does not collapse null agentName old group (L99 condition)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { isGroupCollapsed } = useTabBarGroups(scrollContainer)

      // Start from backlog (null agentName), then switch to agent-alpha terminal
      store.addTerminal('agent-alpha', undefined, undefined, undefined, undefined, undefined, undefined, false)
      store.setActive('backlog')
      await nextTick()

      const alphaTab = store.tabs.find(t => t.agentName === 'agent-alpha')!
      store.setActive(alphaTab.id)
      await nextTick()

      // null group should NOT be collapsed (L99: oldAgentName !== null required)
      expect(isGroupCollapsed(null)).toBe(false)
    })
  })

  // ── watch groupedTerminalTabs.length (L106-L114) ──────────────────────────
  describe('watch groupedTerminalTabs.length', () => {
    it('clears collapsedAgents when len <= 1 (L107)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { isGroupCollapsed, collapsedAgents } = useTabBarGroups(scrollContainer)

      // With 0 terminal tabs, len = 0 — clear is called immediately (immediate: true)
      expect(collapsedAgents.value.size).toBe(0)
    })

    it('collapses non-active agents when len > 1 (L109-L113)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { isGroupCollapsed } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha') // active
      store.addTerminal('agent-beta', undefined, undefined, undefined, undefined, undefined, undefined, false)

      await nextTick()

      expect(isGroupCollapsed('agent-beta')).toBe(true)
      expect(isGroupCollapsed('agent-alpha')).toBe(false)
    })

    it('collapses all non-active when 3 groups (L109-L113)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { isGroupCollapsed } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha') // active
      store.addTerminal('agent-beta', undefined, undefined, undefined, undefined, undefined, undefined, false)
      store.addTerminal('agent-gamma', undefined, undefined, undefined, undefined, undefined, undefined, false)

      await nextTick()

      expect(isGroupCollapsed('agent-beta')).toBe(true)
      expect(isGroupCollapsed('agent-gamma')).toBe(true)
      expect(isGroupCollapsed('agent-alpha')).toBe(false)
    })
  })

  // ── tabStyleMap ───────────────────────────────────────────────────────────
  describe('tabStyleMap (L118-L138)', () => {
    it('returns empty object for inactive tab without agentName', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { tabStyleMap } = useTabBarGroups(scrollContainer)

      store.addTerminal(undefined) // null agentName
      const nullTab = store.tabs.find(t => t.type === 'terminal')!
      // Make another tab active so this one is inactive
      store.addTerminal('agent-beta')

      const style = tabStyleMap.value.get(nullTab.id)
      expect(style).toEqual({})
    })

    it('returns dark styles for active tab without agentName (isDark=true)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const { setDarkMode } = await import('@renderer/utils/agentColor')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { tabStyleMap } = useTabBarGroups(scrollContainer)

      setDarkMode(true)
      store.addTerminal(undefined) // null agentName, active
      const nullTab = store.tabs.find(t => t.type === 'terminal')!
      store.setActive(nullTab.id)

      const style = tabStyleMap.value.get(nullTab.id)
      expect(style).toEqual({ color: '#f4f4f5', backgroundColor: '#27272a' })
    })

    it('returns agent colors for active terminal tab with agentName', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const { agentFg, agentBg, setDarkMode } = await import('@renderer/utils/agentColor')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { tabStyleMap } = useTabBarGroups(scrollContainer)

      setDarkMode(true)
      store.addTerminal('agent-alpha')
      const tab = store.tabs.find(t => t.agentName === 'agent-alpha')!
      store.setActive(tab.id)

      const style = tabStyleMap.value.get(tab.id)
      expect(style).toEqual({ color: agentFg('agent-alpha'), backgroundColor: agentBg('agent-alpha') })
    })

    it('returns hsla styles for inactive tab with agentName in dark mode', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const { setDarkMode, agentHue } = await import('@renderer/utils/agentColor')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { tabStyleMap } = useTabBarGroups(scrollContainer)

      setDarkMode(true)
      store.addTerminal('agent-alpha', undefined, undefined, undefined, undefined, undefined, undefined, false)
      const tab = store.tabs.find(t => t.agentName === 'agent-alpha')!
      store.setActive('backlog')

      const style = tabStyleMap.value.get(tab.id)
      const h = agentHue('agent-alpha')
      expect(style).toEqual({
        color: `hsla(${h}, 65%, 65%, 0.65)`,
        backgroundColor: `hsla(${h}, 38%, 16%, 0.55)`,
      })
    })

    it('returns light mode hsla styles for inactive tab with agentName', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const { setDarkMode, agentHue } = await import('@renderer/utils/agentColor')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { tabStyleMap } = useTabBarGroups(scrollContainer)

      setDarkMode(false)
      store.addTerminal('agent-alpha', undefined, undefined, undefined, undefined, undefined, undefined, false)
      const tab = store.tabs.find(t => t.agentName === 'agent-alpha')!
      store.setActive('backlog')

      const style = tabStyleMap.value.get(tab.id)
      const h = agentHue('agent-alpha')
      expect(style).toEqual({
        color: `hsla(${h}, 55%, 40%, 0.7)`,
        backgroundColor: `hsla(${h}, 45%, 92%, 0.6)`,
      })
    })
  })

  // ── agentTabStyleMap ──────────────────────────────────────────────────────
  describe('agentTabStyleMap (L140-L159)', () => {
    it('uses isDark colors for null agentName group', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const { setDarkMode } = await import('@renderer/utils/agentColor')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { agentTabStyleMap } = useTabBarGroups(scrollContainer)

      setDarkMode(true)
      store.addTerminal(undefined)

      const style = agentTabStyleMap.value.get(null)
      expect(style).toEqual({ color: '#a1a1aa', backgroundColor: '#27272a' })
    })

    it('uses light mode colors for null agentName group', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const { setDarkMode } = await import('@renderer/utils/agentColor')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { agentTabStyleMap } = useTabBarGroups(scrollContainer)

      setDarkMode(false)
      store.addTerminal(undefined)

      const style = agentTabStyleMap.value.get(null)
      expect(style).toEqual({ color: '#52525b', backgroundColor: '#e4e4e7' })
    })

    it('uses agentFg/agentBg for active named group (L152-L153)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const { agentFg, agentBg, setDarkMode } = await import('@renderer/utils/agentColor')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { agentTabStyleMap } = useTabBarGroups(scrollContainer)

      setDarkMode(true)
      store.addTerminal('agent-active') // active

      const style = agentTabStyleMap.value.get('agent-active')
      expect(style).toEqual({ color: agentFg('agent-active'), backgroundColor: agentBg('agent-active') })
    })

    it('uses hsla for inactive named group in dark mode (L154-L155)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const { setDarkMode, agentHue } = await import('@renderer/utils/agentColor')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { agentTabStyleMap } = useTabBarGroups(scrollContainer)

      setDarkMode(true)
      store.addTerminal('agent-active') // active
      store.addTerminal('agent-inactive', undefined, undefined, undefined, undefined, undefined, undefined, false)

      await nextTick()

      const style = agentTabStyleMap.value.get('agent-inactive')
      const h = agentHue('agent-inactive')
      expect(style).toEqual({
        color: `hsla(${h}, 65%, 65%, 0.65)`,
        backgroundColor: `hsla(${h}, 38%, 16%, 0.55)`,
      })
    })
  })

  // ── indicatorStyleMap ─────────────────────────────────────────────────────
  describe('indicatorStyleMap (L161-L170)', () => {
    it('uses agentFg for tabs with agentName', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const { agentFg, setDarkMode } = await import('@renderer/utils/agentColor')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { indicatorStyleMap } = useTabBarGroups(scrollContainer)

      setDarkMode(true)
      store.addTerminal('agent-alpha')
      const tab = store.tabs.find(t => t.agentName === 'agent-alpha')!

      const style = indicatorStyleMap.value.get(tab.id)
      expect(style).toEqual({ backgroundColor: agentFg('agent-alpha') })
    })

    it('uses violet-400 for tabs without agentName', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { indicatorStyleMap } = useTabBarGroups(scrollContainer)

      store.addTerminal(undefined) // null agentName
      const tab = store.tabs.find(t => t.type === 'terminal')!

      const style = indicatorStyleMap.value.get(tab.id)
      expect(style).toEqual({ backgroundColor: '#a78bfa' })
    })
  })

  // ── subTabLabel (L172-L174) ───────────────────────────────────────────────
  describe('subTabLabel (L172-L174)', () => {
    it('returns #taskId when taskId is set', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { subTabLabel } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha', undefined, undefined, undefined, undefined, undefined, undefined, true, 42)
      const tab = store.tabs.find(t => t.agentName === 'agent-alpha')!

      expect(subTabLabel(tab)).toBe('#42')
    })

    it('returns tab.title when taskId is not set', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { subTabLabel } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha')
      const tab = store.tabs.find(t => t.agentName === 'agent-alpha')!

      expect(subTabLabel(tab)).toBe(tab.title)
    })

    it('returns tab.title when taskId is null (L173 — no taskId branch)', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { subTabLabel } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha')
      const tab = store.tabs.find(t => t.agentName === 'agent-alpha')!
      tab.taskId = null

      expect(subTabLabel(tab)).toBe(tab.title)
    })
  })

  // ── len <= 1 edge case ────────────────────────────────────────────────────
  describe('watch length — len=1 clears collapsedAgents (L107)', () => {
    it('clears collapsed set when only 1 group remains', async () => {
      const { useTabBarGroups } = await import('@renderer/composables/useTabBarGroups')
      const store = useTabsStore()
      const scrollContainer = makeScrollContainer()
      const { isGroupCollapsed, toggleGroup, groupedTerminalTabs } = useTabBarGroups(scrollContainer)

      store.addTerminal('agent-alpha')
      store.addTerminal('agent-beta', undefined, undefined, undefined, undefined, undefined, undefined, false)

      await nextTick()
      expect(isGroupCollapsed('agent-beta')).toBe(true)

      // Close beta — only 1 group left → collapsedAgents cleared
      const betaTab = store.tabs.find(t => t.agentName === 'agent-beta')!
      store.closeTab(betaTab.id)

      await nextTick()

      expect(groupedTerminalTabs.value).toHaveLength(1)
      expect(isGroupCollapsed('agent-alpha')).toBe(false)
    })
  })
})
