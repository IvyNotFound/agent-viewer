import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import SettingsModal from '@renderer/components/SettingsModal.vue'
import i18n from '@renderer/plugins/i18n'

describe('SettingsModal', () => {
  const teleportStub = { Teleport: { template: '<div><slot /></div>' } }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.getConfigValue.mockResolvedValue({ success: true, value: null })
  })

  it('renders settings title', async () => {
    const wrapper = shallowMount(SettingsModal, {
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/.claude/db' } },
        }), i18n],
        stubs: teleportStub,
      },
    })
    await flushPromises()
    const text = wrapper.text()
    // Should contain the settings title (i18n fr default: "Paramètres")
    expect(text).toContain('Param')
  })

  it('emits close when close button is clicked', async () => {
    const wrapper = shallowMount(SettingsModal, {
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { dbPath: '/p/.claude/db' } },
        }), i18n],
        stubs: teleportStub,
      },
    })
    await flushPromises()

    // Click the close (X) button in the header
    const closeBtn = wrapper.findAll('button').find(b => {
      const title = b.attributes('title') || ''
      return title.includes('fermer') || title.includes('Fermer') || title.includes('close')
    })
    expect(closeBtn).toBeDefined()
    await closeBtn!.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('calls setTheme when theme button is clicked', async () => {
    const pinia = createTestingPinia({
      initialState: { tasks: { dbPath: '/p/.claude/db' } },
    })
    const wrapper = shallowMount(SettingsModal, {
      global: { plugins: [pinia, i18n], stubs: teleportStub },
    })
    await flushPromises()

    const { useSettingsStore } = await import('@renderer/stores/settings')
    const settingsStore = useSettingsStore()

    // Find the theme buttons — look for Dark/Sombre or Light/Clair
    const themeButtons = wrapper.findAll('button')
    const darkBtn = themeButtons.find(b => b.text().includes('Dark') || b.text().includes('Sombre'))
    expect(darkBtn).toBeDefined()
    await darkBtn!.trigger('click')
    expect(settingsStore.setTheme).toHaveBeenCalledWith('dark')
  })

  it('calls setLanguage when language button is clicked', async () => {
    const pinia = createTestingPinia({
      initialState: { tasks: { dbPath: '/p/.claude/db' } },
    })
    const wrapper = shallowMount(SettingsModal, {
      global: { plugins: [pinia, i18n], stubs: teleportStub },
    })
    await flushPromises()

    const { useSettingsStore } = await import('@renderer/stores/settings')
    const settingsStore = useSettingsStore()

    // Find the English button
    const langBtn = wrapper.findAll('button').find(b => b.text().includes('English'))
    expect(langBtn).toBeDefined()
    await langBtn!.trigger('click')
    expect(settingsStore.setLanguage).toHaveBeenCalledWith('en')
  })

  it('shows version info', async () => {
    const wrapper = shallowMount(SettingsModal, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            tasks: { dbPath: '/p/.claude/db' },
            settings: { appInfo: { name: 'agent-viewer', version: '0.4.0' } },
          },
        }), i18n],
        stubs: teleportStub,
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('0.4.0')
  })
})
