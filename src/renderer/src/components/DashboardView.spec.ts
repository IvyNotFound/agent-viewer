import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import i18n from '@renderer/plugins/i18n'
import DashboardView from '@renderer/components/DashboardView.vue'

// Stub all async child components so they don't fail to resolve
const CHILD_STUBS = {
  DashboardOverview:  { template: '<div data-testid="stub-dashboard-overview" />' },
  TokenStatsView:     { template: '<div data-testid="stub-token-stats" />' },
  GitCommitList:      { template: '<div data-testid="stub-git-commit-list" />' },
  HookEventsView:     { template: '<div data-testid="stub-hook-events" />' },
  ToolStatsPanel:     { template: '<div data-testid="stub-tool-stats" />' },
  AgentLogsView:      { template: '<div data-testid="stub-agent-logs" />' },
  TopologyView:       { template: '<div data-testid="stub-topology" />' },
  OrgChartView:       { template: '<div data-testid="stub-orgchart" />' },
  TelemetryView:      { template: '<div data-testid="stub-telemetry" />' },
  TimelineView:       { template: '<div data-testid="stub-timeline" />' },
}

const BASE_TASKS_STATE = {
  tasks: { tasks: [], agents: [], stats: { todo: 0, in_progress: 0, done: 0, archived: 0, rejected: 0 } },
  project: { projectPath: '/tmp/test-project' },
}

describe('DashboardView (T1975)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // gitLog is not in the shared mock — add it per-suite
    ;(window.electronAPI as Record<string, ReturnType<typeof vi.fn>>).gitLog =
      vi.fn().mockResolvedValue([])
  })

  afterEach(() => {
    localStorage.clear()
  })

  function mountDashboard(storageTab?: string, overrideState?: Record<string, unknown>) {
    if (storageTab) localStorage.setItem('dashboard.activeSubTab', storageTab)
    const pinia = createTestingPinia({ initialState: { ...BASE_TASKS_STATE, ...overrideState } })
    return mount(DashboardView, {
      global: { plugins: [pinia, i18n], stubs: CHILD_STUBS },
    })
  }

  it('renders a sub-tab bar containing all expected tab labels', async () => {
    const wrapper = mountDashboard()
    await flushPromises()
    const text = wrapper.text()
    // Sub-tabs use i18n keys; 'Git' is hardcoded
    expect(text).toContain('Git')
    expect(wrapper.find('.dashboard-tabs').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows DashboardOverview stub when default tab is overview', async () => {
    const wrapper = mountDashboard()
    await flushPromises()
    expect(wrapper.find('[data-testid="stub-dashboard-overview"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not show git section when overview tab is active', async () => {
    const wrapper = mountDashboard()
    await flushPromises()
    expect(wrapper.find('.git-root').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows git section when activeSubTab is set to git via localStorage', async () => {
    const wrapper = mountDashboard('git')
    await flushPromises()
    expect(wrapper.find('.git-root').exists()).toBe(true)
    wrapper.unmount()
  })

  it('calls electronAPI.gitLog when git tab is active on mount', async () => {
    const gitLog = (window.electronAPI as Record<string, ReturnType<typeof vi.fn>>).gitLog
    const wrapper = mountDashboard('git')
    await flushPromises()
    expect(gitLog).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not call gitLog when overview tab is active', async () => {
    const gitLog = (window.electronAPI as Record<string, ReturnType<typeof vi.fn>>).gitLog
    const wrapper = mountDashboard()
    await flushPromises()
    expect(gitLog).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows no-project state when projectPath is null', async () => {
    const wrapper = mountDashboard('git', { project: { projectPath: null } })
    await flushPromises()
    // gitLog is not called; no-project error is shown
    const gitLog = (window.electronAPI as Record<string, ReturnType<typeof vi.fn>>).gitLog
    expect(gitLog).not.toHaveBeenCalled()
    // The git body renders the error slot
    expect(wrapper.find('.git-root').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders GitCommitList stub when gitLog returns commits', async () => {
    ;(window.electronAPI as Record<string, ReturnType<typeof vi.fn>>).gitLog.mockResolvedValueOnce([
      { hash: 'abc123', date: '2026-01-01T10:00:00Z', subject: 'Fix bug', author: 'dev', taskIds: [] },
    ])
    const wrapper = mountDashboard('git')
    await flushPromises()
    expect(wrapper.find('[data-testid="stub-git-commit-list"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not render DashboardOverview when git tab is active', async () => {
    const wrapper = mountDashboard('git')
    await flushPromises()
    expect(wrapper.find('[data-testid="stub-dashboard-overview"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('persists active tab to localStorage on mount', async () => {
    mountDashboard('telemetry')
    await flushPromises()
    expect(localStorage.getItem('dashboard.activeSubTab')).toBe('telemetry')
  })

  it('falls back to overview when saved tab is invalid', async () => {
    localStorage.setItem('dashboard.activeSubTab', 'invalid-tab-xyz')
    const pinia = createTestingPinia({ initialState: BASE_TASKS_STATE })
    const wrapper = mount(DashboardView, {
      global: { plugins: [pinia, i18n], stubs: CHILD_STUBS },
    })
    await flushPromises()
    // Invalid tab → falls back to overview → DashboardOverview stub is shown
    expect(wrapper.find('[data-testid="stub-dashboard-overview"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
