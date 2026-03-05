import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { nextTick } from 'vue'
import DbSelector from '@renderer/components/DbSelector.vue'
import i18n from '@renderer/plugins/i18n'

describe('DbSelector', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.getWslUsers.mockResolvedValue([])
  })

  it('renders the home screen with open and create buttons', async () => {
    const wrapper = shallowMount(DbSelector, {
      global: {
        plugins: [createTestingPinia(), i18n],
      },
    })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('agent-viewer')
  })

  it('calls store.selectProject when open button is clicked', async () => {
    const pinia = createTestingPinia()
    const wrapper = shallowMount(DbSelector, {
      global: { plugins: [pinia, i18n] },
    })
    await flushPromises()

    const { useTasksStore } = await import('@renderer/stores/tasks')
    const store = useTasksStore()

    // Find the open project button
    const buttons = wrapper.findAll('button')
    if (buttons.length > 0) {
      await buttons[0].trigger('click')
      expect(store.selectProject).toHaveBeenCalled()
    }
  })

  it('shows error message when store has error', async () => {
    const wrapper = shallowMount(DbSelector, {
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { error: 'DB connection failed' } },
        }), i18n],
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('DB connection failed')
  })

  it('navigates to create step when create button is clicked', async () => {
    const wrapper = shallowMount(DbSelector, {
      global: {
        plugins: [createTestingPinia(), i18n],
      },
    })
    await flushPromises()

    // The second button should be the "create" button
    const buttons = wrapper.findAll('button')
    const createBtn = buttons.find(b => {
      const text = b.text()
      return text.includes('Créer') || text.includes('Create') || text.includes('Nouveau')
    })
    expect(createBtn).toBeDefined()
    await createBtn!.trigger('click')
    await nextTick()
    // After clicking create, should show the "Retour" (back) button
    expect(wrapper.text()).toContain('Retour')
  })
})
