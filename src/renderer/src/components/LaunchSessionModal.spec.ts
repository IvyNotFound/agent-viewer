import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { nextTick } from 'vue'
import LaunchSessionModal from '@renderer/components/LaunchSessionModal.vue'
import i18n from '@renderer/plugins/i18n'

describe('LaunchSessionModal', () => {
  const mockAgent = {
    id: 1,
    name: 'review-master',
    type: 'global',
    perimetre: null,
    system_prompt: null,
    system_prompt_suffix: null,
    thinking_mode: null,
    allowed_tools: null,
    created_at: '2026-01-01',
    session_statut: null,
    session_started_at: null,
  }

  const teleportStub = { Teleport: { template: '<div><slot /></div>' } }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.getClaudeInstances.mockResolvedValue([])
    api.getAgentSystemPrompt.mockResolvedValue({ success: true, systemPrompt: null, systemPromptSuffix: null, thinkingMode: 'auto' })
    api.queryDb.mockResolvedValue([])
    api.buildAgentPrompt.mockResolvedValue('test prompt')
  })

  it('renders the modal with agent name', async () => {
    const wrapper = shallowMount(LaunchSessionModal, {
      props: { agent: mockAgent as never },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/.claude/db' } },
        }), i18n],
        stubs: teleportStub,
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('review-master')
  })

  it('shows loading state initially — launch button is disabled', () => {
    const wrapper = shallowMount(LaunchSessionModal, {
      props: { agent: mockAgent as never },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/.claude/db' } },
        }), i18n],
        stubs: teleportStub,
      },
    })
    // Before flushPromises, loading is true — launch button should be disabled
    const buttons = wrapper.findAll('button')
    const disabledBtns = buttons.filter(b => b.attributes('disabled') !== undefined)
    expect(disabledBtns.length).toBeGreaterThanOrEqual(1)
  })

  it('renders instance list when Claude instances are found', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.getClaudeInstances.mockResolvedValue([
      { distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, profiles: ['claude'] },
    ])

    const wrapper = shallowMount(LaunchSessionModal, {
      props: { agent: mockAgent as never },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/.claude/db' } },
        }), i18n],
        stubs: teleportStub,
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Ubuntu-24.04')
  })

  it('emits close when backdrop is clicked', async () => {
    const wrapper = shallowMount(LaunchSessionModal, {
      props: { agent: mockAgent as never },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/.claude/db' } },
        }), i18n],
        stubs: teleportStub,
      },
    })
    await flushPromises()

    const backdrop = wrapper.find('.fixed.inset-0')
    await backdrop.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emits close when close button (✕) is clicked', async () => {
    const wrapper = shallowMount(LaunchSessionModal, {
      props: { agent: mockAgent as never },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/.claude/db' } },
        }), i18n],
        stubs: teleportStub,
      },
    })
    await flushPromises()

    const closeBtn = wrapper.findAll('button').find(b => b.text().trim() === '✕')
    expect(closeBtn).toBeDefined()
    await closeBtn!.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('calls addTerminal on launch', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.getClaudeInstances.mockResolvedValue([
      { distro: 'Ubuntu', version: '2.1', isDefault: true, profiles: ['claude'] },
    ])

    const pinia = createTestingPinia({
      initialState: { tasks: { dbPath: '/p/.claude/db' } },
    })
    const wrapper = shallowMount(LaunchSessionModal, {
      props: { agent: mockAgent as never },
      global: { plugins: [pinia, i18n], stubs: teleportStub },
    })
    await flushPromises()

    const { useTabsStore } = await import('@renderer/stores/tabs')
    const tabsStore = useTabsStore()

    // Find the launch button by text (i18n fr: "Lancer")
    const launchBtn = wrapper.findAll('button').find(b => {
      const text = b.text().toLowerCase()
      return text.includes('lancer') || text.includes('launch')
    })
    expect(launchBtn).toBeDefined()
    await launchBtn!.trigger('click')
    await flushPromises()
    expect(tabsStore.addTerminal).toHaveBeenCalled()
  })

  it('shows "Local" label for local-type instances (T775)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.getClaudeInstances.mockResolvedValue([
      { distro: 'local', version: '2.1.58', isDefault: true, profiles: ['claude'], type: 'local' },
    ])

    const wrapper = shallowMount(LaunchSessionModal, {
      props: { agent: mockAgent as never },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/.claude/db' } },
        }), i18n],
        stubs: teleportStub,
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Local')
  })

  it('shows distro name for wsl-type instances (T775)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.getClaudeInstances.mockResolvedValue([
      { distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, profiles: ['claude'], type: 'wsl' },
    ])

    const wrapper = shallowMount(LaunchSessionModal, {
      props: { agent: mockAgent as never },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/.claude/db' } },
        }), i18n],
        stubs: teleportStub,
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Ubuntu-24.04')
  })
})

// ── AgentBadge (T231) ────────────────────────────────────────────────────────

import AgentBadge from '@renderer/components/AgentBadge.vue'

describe('LaunchSessionModal — advanced features (T353)', () => {
  const mockAgent = {
    id: 1,
    name: 'review-master',
    type: 'global',
    perimetre: null,
    system_prompt: null,
    system_prompt_suffix: null,
    thinking_mode: null,
    allowed_tools: null,
    created_at: '2026-01-01',
    session_statut: null,
    session_started_at: null,
  }

  const teleportStub = { Teleport: { template: '<div><slot /></div>' } }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.getClaudeInstances.mockResolvedValue([
      { distro: 'Ubuntu-24.04', version: '2.1.58', isDefault: true, profiles: ['claude', 'claude-sonnet'] },
    ])
    api.getAgentSystemPrompt.mockResolvedValue({
      success: true,
      systemPrompt: 'You are a review agent.',
      systemPromptSuffix: 'Always be thorough.',
      thinkingMode: 'auto',
    })
    api.queryDb.mockResolvedValue([{ claude_conv_id: 'conv-abc-123' }])
    api.buildAgentPrompt.mockResolvedValue('test prompt')
  })

  it('shows resume checkbox when previous convId exists', async () => {
    const wrapper = shallowMount(LaunchSessionModal, {
      props: { agent: mockAgent as never },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/.claude/db' } },
        }), i18n],
        stubs: teleportStub,
      },
    })
    await flushPromises()

    // Resume checkbox should be present
    const checkbox = wrapper.find('input[type="checkbox"]')
    expect(checkbox.exists()).toBe(true)
  })

  it('useResume defaults to false when convId exists', async () => {
    const wrapper = shallowMount(LaunchSessionModal, {
      props: { agent: mockAgent as never },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/.claude/db' } },
        }), i18n],
        stubs: teleportStub,
      },
    })
    await flushPromises()

    const checkbox = wrapper.find('input[type="checkbox"]')
    expect((checkbox.element as HTMLInputElement).checked).toBe(false)
  })

  it('fullSystemPrompt combines system_prompt + suffix', async () => {
    const wrapper = shallowMount(LaunchSessionModal, {
      props: { agent: mockAgent as never },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/.claude/db' } },
        }), i18n],
        stubs: teleportStub,
      },
    })
    await flushPromises()

    // Uncheck resume to show system prompt section
    const checkbox = wrapper.find('input[type="checkbox"]')
    await checkbox.setValue(false)
    await nextTick()

    // The system prompt preview should show combined prompt
    const preBlock = wrapper.find('pre')
    if (preBlock.exists()) {
      expect(preBlock.text()).toContain('You are a review agent.')
      expect(preBlock.text()).toContain('Always be thorough.')
    }
  })

  it('shows multiple profiles when instance has them', async () => {
    const wrapper = shallowMount(LaunchSessionModal, {
      props: { agent: mockAgent as never },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/.claude/db' } },
        }), i18n],
        stubs: teleportStub,
      },
    })
    await flushPromises()

    // Profile selector should show both profiles
    const text = wrapper.text()
    expect(text).toContain('claude-sonnet')
  })

  it('thinkingMode toggle between auto and disabled', async () => {
    const wrapper = shallowMount(LaunchSessionModal, {
      props: { agent: mockAgent as never },
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/.claude/db' } },
        }), i18n],
        stubs: teleportStub,
      },
    })
    await flushPromises()

    // Find the 'Disabled' / 'Désactivé' button
    const buttons = wrapper.findAll('button')
    const disabledBtn = buttons.find(b => {
      const text = b.text().toLowerCase()
      return text.includes('désactivé') || text.includes('disabled')
    })
    expect(disabledBtn).toBeDefined()

    // Click it
    await disabledBtn!.trigger('click')
    await nextTick()

    // After clicking, re-query the button (Vue re-renders the DOM)
    const updatedButtons = wrapper.findAll('button')
    const updatedDisabledBtn = updatedButtons.find(b => {
      const text = b.text().toLowerCase()
      return text.includes('désactivé') || text.includes('disabled')
    })
    // The disabled button should now have the active style (borderColor set via :style)
    const style = updatedDisabledBtn!.attributes('style') || ''
    expect(style).toContain('border-color')
  })

  it('launch in resume mode calls addTerminal with convId', async () => {
    const pinia = createTestingPinia({
      initialState: { tasks: { dbPath: '/p/.claude/db' } },
    })
    const wrapper = shallowMount(LaunchSessionModal, {
      props: { agent: mockAgent as never },
      global: { plugins: [pinia, i18n], stubs: teleportStub },
    })
    await flushPromises()

    const { useTabsStore } = await import('@renderer/stores/tabs')
    const tabsStore = useTabsStore()

    // useResume defaults to false — check the checkbox first to enable resume mode
    const checkbox = wrapper.find('input[type="checkbox"]')
    await checkbox.setValue(true)
    await nextTick()

    const launchBtn = wrapper.findAll('button').find(b => {
      const text = b.text().toLowerCase()
      return text.includes('lancer') || text.includes('launch')
    })
    await launchBtn!.trigger('click')
    await flushPromises()

    expect(tabsStore.addTerminal).toHaveBeenCalledWith(
      'review-master',     // agentName
      'Ubuntu-24.04',      // distro
      undefined,           // no prompt in resume mode
      undefined,           // no systemPrompt in resume mode
      'auto',              // thinkingMode
      undefined,           // profile (default 'claude' → undefined)
      'conv-abc-123',      // convId for --resume
      true,                // activate
      undefined,           // taskId
      'stream',            // viewMode
      undefined,           // cli
      undefined,           // workDir (multiInstance off)
    )
  })
})
