import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import AgentLogsView from '@renderer/components/AgentLogsView.vue'
import i18n from '@renderer/plugins/i18n'

describe('AgentLogsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([])
  })

  it('renders level filter buttons (all, info, warn, error, debug)', () => {
    const wrapper = shallowMount(AgentLogsView, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            tasks: { dbPath: '/p/.claude/db', agents: [] },
            tabs: { activeTabId: 'dashboard' },
          },
        }), i18n],
        stubs: { TokenStatsView: true },
      },
    })
    const text = wrapper.text()
    expect(text).toContain('all')
    expect(text).toContain('info')
    expect(text).toContain('warn')
    expect(text).toContain('error')
    expect(text).toContain('debug')
  })

  it('renders sub-tab navigation (logs and token stats)', () => {
    const wrapper = shallowMount(AgentLogsView, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            tasks: { dbPath: '/p/.claude/db', agents: [] },
            tabs: { activeTabId: 'dashboard' },
          },
        }), i18n],
        stubs: { TokenStatsView: true },
      },
    })
    const buttons = wrapper.findAll('button')
    // At least 2 sub-tab buttons (logs and tokenStats)
    expect(buttons.length).toBeGreaterThanOrEqual(2)
  })

  it('shows reset button when a filter is active and resets on click', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([{ total: 0 }])

    const wrapper = mount(AgentLogsView, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            tasks: { dbPath: '/p/.claude/db', agents: [] },
            tabs: { activeTabId: 'dashboard' },
          },
        }), i18n],
        stubs: { TokenStatsView: true },
      },
    })
    await flushPromises()

    // Reset button should not be visible initially (filters at default)
    expect(wrapper.find('button[title]').exists()).toBe(true)
    const resetBefore = wrapper.findAll('button').find(b => b.text().includes('réinitialiser') || b.text().includes('reset'))
    expect(resetBefore).toBeUndefined()

    // Click 'error' level filter
    const errorBtn = wrapper.findAll('button').find(b => b.text() === 'error')
    await errorBtn!.trigger('click')
    await flushPromises()

    // Reset button should now be visible
    const resetBtn = wrapper.findAll('button').find(b => b.text().includes('réinitialiser') || b.text().includes('reset'))
    expect(resetBtn).toBeDefined()

    // Click reset button
    await resetBtn!.trigger('click')
    await flushPromises()

    // Reset button should disappear again
    const resetAfter = wrapper.findAll('button').find(b => b.text().includes('réinitialiser') || b.text().includes('reset'))
    expect(resetAfter).toBeUndefined()
  })

  it('calls queryDb to fetch logs when dbPath is set', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([])

    shallowMount(AgentLogsView, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            tasks: { dbPath: '/p/.claude/db', agents: [] },
            tabs: { activeTabId: 'dashboard' },
          },
        }), i18n],
        stubs: { TokenStatsView: true },
      },
    })
    await flushPromises()
    expect(api.queryDb).toHaveBeenCalled()
  })
})
