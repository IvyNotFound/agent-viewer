import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import StreamView from '@renderer/components/StreamView.vue'
import { mockElectronAPI } from '../../../test/setup'
import i18n from '@renderer/plugins/i18n'

describe('StreamView — hidden-tab eviction (T962)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('evicts events to MAX_EVENTS_HIDDEN (200) when tab becomes inactive', async () => {
    let streamCallback: ((e: Record<string, unknown>) => void) | null = null
    vi.mocked(mockElectronAPI.agentCreate).mockResolvedValue('agent-stream-1')
    vi.mocked(mockElectronAPI.onAgentStream).mockReset()
    vi.mocked(mockElectronAPI.onAgentStream).mockImplementation((_id, cb) => {
      streamCallback = cb as (e: Record<string, unknown>) => void
      return () => {}
    })
    vi.mocked(mockElectronAPI.onAgentConvId).mockReturnValue(() => {})
    vi.mocked(mockElectronAPI.onAgentExit).mockReturnValue(() => {})

    // T1855: activeTabId must match terminalId so events are not evicted inline during injection
    const pinia = createTestingPinia({
      stubActions: false,
      initialState: {
        tabs: {
          activeTabId: 'test-terminal-1',
          tabs: [{
            id: 'test-terminal-1',
            type: 'terminal',
            title: 'test',
            ptyId: null,
            agentName: 'test-agent',
            wslDistro: null,
            autoSend: null,
            systemPrompt: null,
            thinkingMode: null,
            convId: null,
            viewMode: 'stream' as const,
          }],
        },
      },
    })

    const wrapper = mount(StreamView, {
      props: { terminalId: 'test-terminal-1' },
      global: { plugins: [pinia, i18n] },
    })
    await flushPromises()

    // Inject 300 result events (above MAX_EVENTS_HIDDEN=200 to trigger eviction)
    for (let i = 0; i < 300; i++) {
      streamCallback?.({ type: 'result', num_turns: i })
    }
    await flushPromises()
    expect(wrapper.findAll('[data-testid="block-result"]').length).toBe(300)

    // Activate then deactivate the tab via real store action (updates ref.value, triggers watcher)
    const store = pinia._s.get('tabs') as { setActive: (id: string) => void; activeTabId: string }
    store.setActive('test-terminal-1')
    await flushPromises()
    expect(store.activeTabId).toBe('test-terminal-1')
    store.setActive('other-tab')
    await flushPromises()
    expect(store.activeTabId).toBe('other-tab')

    expect(wrapper.findAll('[data-testid="block-result"]').length).toBeLessThanOrEqual(200)
    wrapper.unmount()
  })

  it('skips renderMarkdown for hidden tabs and renders on activation (T1855)', async () => {
    let streamCallback: ((e: Record<string, unknown>) => void) | null = null
    vi.mocked(mockElectronAPI.agentCreate).mockResolvedValue('agent-stream-2')
    vi.mocked(mockElectronAPI.onAgentStream).mockReset()
    vi.mocked(mockElectronAPI.onAgentStream).mockImplementation((_id, cb) => {
      streamCallback = cb as (e: Record<string, unknown>) => void
      return () => {}
    })
    vi.mocked(mockElectronAPI.onAgentConvId).mockReturnValue(() => {})
    vi.mocked(mockElectronAPI.onAgentExit).mockReturnValue(() => {})

    // Start with another tab active — terminal is hidden
    const pinia = createTestingPinia({
      stubActions: false,
      initialState: {
        tabs: {
          activeTabId: 'backlog',
          tabs: [
            { id: 'backlog', type: 'backlog', title: 'Backlog', ptyId: null, agentName: null, wslDistro: null, autoSend: null, systemPrompt: null, thinkingMode: null, permanent: true },
            { id: 'test-terminal-2', type: 'terminal', title: 'test', ptyId: null, agentName: 'test-agent', wslDistro: null, autoSend: null, systemPrompt: null, thinkingMode: null, convId: null, viewMode: 'stream' as const },
          ],
        },
      },
    })

    const wrapper = mount(StreamView, {
      props: { terminalId: 'test-terminal-2' },
      global: { plugins: [pinia, i18n] },
    })
    await flushPromises()

    // Inject an assistant text event while tab is hidden
    streamCallback?.({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Deferred content' }] },
    })
    await flushPromises()

    // Block exists but _html was not rendered (v-html is empty)
    const blockBeforeActivation = wrapper.find('[data-testid="block-text"]')
    expect(blockBeforeActivation.exists()).toBe(true)
    expect(blockBeforeActivation.text()).toBe('')

    // Activate the tab — watcher should render _html
    const store = pinia._s.get('tabs') as { setActive: (id: string) => void }
    store.setActive('test-terminal-2')
    await flushPromises()

    const blockAfterActivation = wrapper.find('[data-testid="block-text"]')
    expect(blockAfterActivation.exists()).toBe(true)
    expect(blockAfterActivation.text()).toContain('Deferred content')
    wrapper.unmount()
  })

  it('applies inline eviction for hidden tabs during flushEvents (T1855)', async () => {
    let streamCallback: ((e: Record<string, unknown>) => void) | null = null
    vi.mocked(mockElectronAPI.agentCreate).mockResolvedValue('agent-stream-3')
    vi.mocked(mockElectronAPI.onAgentStream).mockReset()
    vi.mocked(mockElectronAPI.onAgentStream).mockImplementation((_id, cb) => {
      streamCallback = cb as (e: Record<string, unknown>) => void
      return () => {}
    })
    vi.mocked(mockElectronAPI.onAgentConvId).mockReturnValue(() => {})
    vi.mocked(mockElectronAPI.onAgentExit).mockReturnValue(() => {})

    // Start with another tab active — terminal is hidden
    const pinia = createTestingPinia({
      stubActions: false,
      initialState: {
        tabs: {
          activeTabId: 'backlog',
          tabs: [
            { id: 'backlog', type: 'backlog', title: 'Backlog', ptyId: null, agentName: null, wslDistro: null, autoSend: null, systemPrompt: null, thinkingMode: null, permanent: true },
            { id: 'test-terminal-3', type: 'terminal', title: 'test', ptyId: null, agentName: 'test-agent', wslDistro: null, autoSend: null, systemPrompt: null, thinkingMode: null, convId: null, viewMode: 'stream' as const },
          ],
        },
      },
    })

    const wrapper = mount(StreamView, {
      props: { terminalId: 'test-terminal-3' },
      global: { plugins: [pinia, i18n] },
    })
    await flushPromises()

    // Inject 300 events while tab is hidden — should be evicted inline to MAX_EVENTS_HIDDEN (200)
    for (let i = 0; i < 300; i++) {
      streamCallback?.({ type: 'result', num_turns: i })
    }
    await flushPromises()

    // Hidden tabs get inline eviction at MAX_EVENTS_HIDDEN (200)
    expect(wrapper.findAll('[data-testid="block-result"]').length).toBeLessThanOrEqual(200)
    wrapper.unmount()
  })
})
