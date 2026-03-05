import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ContextMenu from '@renderer/components/ContextMenu.vue'
import TaskDetailModal from '@renderer/components/TaskDetailModal.vue'

describe('ContextMenu', () => {
  const teleportStub = { Teleport: { template: '<div><slot /></div>' } }

  const makeItems = () => [
    { label: 'Copy', action: vi.fn() },
    { label: 'Paste', action: vi.fn() },
    { label: 'Delete', action: vi.fn() },
  ]

  it('renders all items passed via props', () => {
    const items = makeItems()
    const wrapper = mount(ContextMenu, {
      props: { x: 100, y: 200, items },
      global: { stubs: teleportStub },
    })
    expect(wrapper.text()).toContain('Copy')
    expect(wrapper.text()).toContain('Paste')
    expect(wrapper.text()).toContain('Delete')
  })

  it('clicking an item calls item.action()', async () => {
    const items = makeItems()
    const wrapper = mount(ContextMenu, {
      props: { x: 100, y: 200, items },
      global: { stubs: teleportStub },
    })
    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    expect(items[0].action).toHaveBeenCalled()
  })

  it('clicking an item also emits close', async () => {
    const items = makeItems()
    const wrapper = mount(ContextMenu, {
      props: { x: 100, y: 200, items },
      global: { stubs: teleportStub },
    })
    const buttons = wrapper.findAll('button')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('Escape key emits close', async () => {
    const items = makeItems()
    const wrapper = mount(ContextMenu, {
      props: { x: 100, y: 200, items },
      global: { stubs: teleportStub },
    })
    // ContextMenu registers a keydown listener on document
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('clicking overlay emits close', async () => {
    const items = makeItems()
    const wrapper = mount(ContextMenu, {
      props: { x: 100, y: 200, items },
      global: { stubs: teleportStub },
    })
    const overlay = wrapper.find('.fixed.inset-0')
    await overlay.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('renders separator when item has separator: true', () => {
    const items = [
      { label: 'Copy', action: vi.fn() },
      { label: '', action: vi.fn(), separator: true },
      { label: 'Delete', action: vi.fn() },
    ]
    const wrapper = mount(ContextMenu, {
      props: { x: 100, y: 200, items },
      global: { stubs: teleportStub },
    })
    const separators = wrapper.findAll('.border-t')
    expect(separators.length).toBeGreaterThanOrEqual(1)
  })

})

// ══════════════════════════════════════════════════════════════════════════════
// T353 — Tests manquants : composants Vue critiques (P2)
// ══════════════════════════════════════════════════════════════════════════════

