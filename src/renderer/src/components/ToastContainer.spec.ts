import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ToastContainer from '@renderer/components/ToastContainer.vue'
import { useToast } from '@renderer/composables/useToast'

// Custom stubs that render all slots (default + named) without needing Vuetify plugin
const vuetifyStubs = {
  VSnackbar: {
    name: 'VSnackbar',
    props: ['modelValue', 'color', 'timeout', 'location'],
    template: '<div v-if="modelValue" :data-color="color" :data-timeout="timeout"><slot /><slot name="actions" /></div>',
  },
  VBtn: {
    name: 'VBtn',
    template: '<button @click="$emit(\'click\')"><slot /></button>',
  },
  VIcon: {
    name: 'VIcon',
    template: '<span><slot /></span>',
  },
}

function mountContainer() {
  return mount(ToastContainer, {
    global: { stubs: vuetifyStubs },
  })
}

describe('ToastContainer', () => {
  beforeEach(() => {
    const { toasts } = useToast()
    toasts.value.splice(0, toasts.value.length)
  })

  afterEach(() => {
    const { toasts } = useToast()
    toasts.value.splice(0, toasts.value.length)
  })

  it('renders no snackbars when toasts array is empty', () => {
    const wrapper = mountContainer()
    expect(wrapper.findAllComponents({ name: 'VSnackbar' })).toHaveLength(0)
  })

  it('renders one VSnackbar per toast', async () => {
    const { push } = useToast()
    push('Error happened', 'error', 999999)
    push('Warning here', 'warn', 999999)
    const wrapper = mountContainer()
    await nextTick()
    expect(wrapper.findAllComponents({ name: 'VSnackbar' })).toHaveLength(2)
  })

  it('passes correct color prop per type (error→error, warn→warning, info→surface-variant)', async () => {
    const { push } = useToast()
    push('err', 'error', 999999)
    push('wrn', 'warn', 999999)
    push('inf', 'info', 999999)
    const wrapper = mountContainer()
    await nextTick()
    const snackbars = wrapper.findAllComponents({ name: 'VSnackbar' })
    expect(snackbars[0].props('color')).toBe('error')
    expect(snackbars[1].props('color')).toBe('warning')
    expect(snackbars[2].props('color')).toBe('surface-variant')
  })

  it('displays toast message in snackbar content', async () => {
    const { push } = useToast()
    push('My important message', 'info', 999999)
    const wrapper = mountContainer()
    await nextTick()
    expect(wrapper.text()).toContain('My important message')
  })

  it('clicking the close button dismisses the toast', async () => {
    const { push, toasts } = useToast()
    push('dismiss me', 'error', 999999)
    expect(toasts.value).toHaveLength(1)
    const wrapper = mountContainer()
    await nextTick()
    const btn = wrapper.find('button')
    await btn.trigger('click')
    await nextTick()
    expect(toasts.value).toHaveLength(0)
  })

  it('passes timeout=-1 so the composable controls auto-dismiss', async () => {
    const { push } = useToast()
    push('timed', 'info', 999999)
    const wrapper = mountContainer()
    await nextTick()
    const snackbar = wrapper.findComponent({ name: 'VSnackbar' })
    expect(snackbar.props('timeout')).toBe(-1)
  })
})
