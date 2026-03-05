import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import ToggleSwitch from '@renderer/components/ToggleSwitch.vue'
import { buildTree, MAX_TREE_DEPTH } from '@renderer/utils/taskTree'

describe('ToggleSwitch (T675)', () => {
  it('renders in off position when modelValue=false', () => {
    const wrapper = mount(ToggleSwitch, {
      props: { modelValue: false },
    })
    const btn = wrapper.find('button[role="switch"]')
    expect(btn.attributes('aria-checked')).toBe('false')
    expect(btn.classes()).toContain('bg-surface-tertiary')
  })

  it('renders in on position when modelValue=true', () => {
    const wrapper = mount(ToggleSwitch, {
      props: { modelValue: true },
    })
    const btn = wrapper.find('button[role="switch"]')
    expect(btn.attributes('aria-checked')).toBe('true')
    expect(btn.classes()).toContain('bg-violet-600')
  })

  it('emits update:modelValue with toggled value on click', async () => {
    const wrapper = mount(ToggleSwitch, {
      props: { modelValue: false },
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([true])
  })
})

