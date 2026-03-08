import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import ConfirmModal from '@renderer/components/ConfirmModal.vue'
import i18n from '@renderer/plugins/i18n'

describe('ConfirmModal (T675)', () => {
  const teleportStub = { Teleport: { template: '<div><slot /></div>' } }

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders title and message when mounted', () => {
    const wrapper = mount(ConfirmModal, {
      props: { title: 'Supprimer', message: 'Voulez-vous vraiment supprimer ?' },
      global: { plugins: [i18n], stubs: teleportStub },
    })
    expect(wrapper.text()).toContain('Supprimer')
    expect(wrapper.text()).toContain('Voulez-vous vraiment supprimer ?')
  })

  it('emits confirm when OK button clicked', async () => {
    const wrapper = mount(ConfirmModal, {
      props: { title: 'Confirmation', message: 'Continuer ?' },
      global: { plugins: [i18n], stubs: teleportStub },
    })
    const buttons = wrapper.findAll('button')
    const confirmBtn = buttons[buttons.length - 1]
    await confirmBtn.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('emits cancel when Annuler button clicked', async () => {
    const wrapper = mount(ConfirmModal, {
      props: { title: 'Confirmation', message: 'Continuer ?' },
      global: { plugins: [i18n], stubs: teleportStub },
    })
    const buttons = wrapper.findAll('button')
    const cancelBtn = buttons[0]
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('emits cancel when backdrop clicked', async () => {
    const wrapper = mount(ConfirmModal, {
      props: { title: 'Confirmation', message: 'Continuer ?' },
      global: { plugins: [i18n], stubs: teleportStub },
    })
    const backdrop = wrapper.find('.fixed.inset-0')
    await backdrop.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
