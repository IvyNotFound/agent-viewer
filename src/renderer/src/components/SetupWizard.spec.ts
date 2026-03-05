import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import SetupWizard from '@renderer/components/SetupWizard.vue'
import i18n from '@renderer/plugins/i18n'

describe('SetupWizard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.createProjectDb.mockResolvedValue({ success: true, dbPath: '/p/.claude/project.db' })
    api.fsWriteFile.mockResolvedValue({ success: true })
  })

  it('renders wizard with project path', () => {
    const wrapper = shallowMount(SetupWizard, {
      props: { projectPath: '/my/project', hasCLAUDEmd: false },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('/my/project')
  })

  it('emits skip when skip button is clicked', async () => {
    const wrapper = shallowMount(SetupWizard, {
      props: { projectPath: '/p', hasCLAUDEmd: false },
      global: { plugins: [i18n] },
    })

    const skipBtn = wrapper.findAll('button').find(b => {
      const text = b.text().toLowerCase()
      return text.includes('ignorer') || text.includes('passer') || text.includes('skip')
    })
    expect(skipBtn).toBeDefined()
    await skipBtn!.trigger('click')
    expect(wrapper.emitted('skip')).toBeTruthy()
  })

  it('calls createProjectDb when init button is clicked', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    const wrapper = shallowMount(SetupWizard, {
      props: { projectPath: '/p', hasCLAUDEmd: true },
      global: { plugins: [i18n] },
    })

    // Find the init/create button
    const initBtn = wrapper.findAll('button').find(b => {
      const style = b.attributes('class') || ''
      return style.includes('bg-violet-600')
    })
    expect(initBtn).toBeDefined()
    await initBtn!.trigger('click')
    await flushPromises()
    expect(api.createProjectDb).toHaveBeenCalledWith('/p')
  })

  it('emits done with projectPath and dbPath on success', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.createProjectDb.mockResolvedValue({ success: true, dbPath: '/p/.claude/project.db' })

    const wrapper = shallowMount(SetupWizard, {
      props: { projectPath: '/p', hasCLAUDEmd: true },
      global: { plugins: [i18n] },
    })

    const initBtn = wrapper.findAll('button').find(b => {
      const cls = b.attributes('class') || ''
      return cls.includes('bg-violet-600')
    })
    expect(initBtn).toBeDefined()
    await initBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('done')).toBeTruthy()
    expect(wrapper.emitted('done')![0]).toEqual([{ projectPath: '/p', dbPath: '/p/.claude/project.db' }])
  })

  it('shows error when createProjectDb fails', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.createProjectDb.mockResolvedValue({ success: false, error: 'Permission denied' })

    const wrapper = shallowMount(SetupWizard, {
      props: { projectPath: '/p', hasCLAUDEmd: true },
      global: { plugins: [i18n] },
    })

    const initBtn = wrapper.findAll('button').find(b => {
      const cls = b.attributes('class') || ''
      return cls.includes('bg-violet-600')
    })
    expect(initBtn).toBeDefined()
    await initBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Permission denied')
  })

  it('shows different header when hasCLAUDEmd is true vs false', () => {
    const wrapperWithClaude = shallowMount(SetupWizard, {
      props: { projectPath: '/p', hasCLAUDEmd: true },
      global: { plugins: [i18n] },
    })
    const wrapperWithout = shallowMount(SetupWizard, {
      props: { projectPath: '/p', hasCLAUDEmd: false },
      global: { plugins: [i18n] },
    })
    // Different hasCLAUDEmd should produce different content
    const textWith = wrapperWithClaude.text()
    const textWithout = wrapperWithout.text()
    expect(textWith).not.toBe(textWithout)
  })
})
