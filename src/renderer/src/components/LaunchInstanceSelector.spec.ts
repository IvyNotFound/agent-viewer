import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@renderer/locales/en.json'
import LaunchInstanceSelector from '@renderer/components/LaunchInstanceSelector.vue'
import type { CliInstance } from '@shared/cli-types'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const WSL_INSTANCE: CliInstance = {
  cli: 'claude',
  distro: 'Ubuntu-24.04',
  version: '2.1.58',
  isDefault: true,
  type: 'wsl',
}

const LOCAL_INSTANCE: CliInstance = {
  cli: 'codex',
  distro: 'local',
  version: '1.0.0',
  isDefault: false,
  type: 'local',
}

const BASE_PROPS = {
  modelValue: null as CliInstance | null,
  instances: [] as CliInstance[],
  loading: false,
  agentName: 'review-master',
  noInstanceText: 'No CLI found',
}

describe('LaunchInstanceSelector (T1975)', () => {
  // ── Loading state ───────────────────────────────────────────────────────────

  it('shows loading text when loading=true', () => {
    const wrapper = mount(LaunchInstanceSelector, {
      props: { ...BASE_PROPS, loading: true },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('Loading')
    wrapper.unmount()
  })

  it('does not show instance rows when loading=true', () => {
    const wrapper = mount(LaunchInstanceSelector, {
      props: { ...BASE_PROPS, instances: [WSL_INSTANCE], loading: true },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.instance-row').exists()).toBe(false)
    wrapper.unmount()
  })

  // ── Empty state ─────────────────────────────────────────────────────────────

  it('shows noInstanceText when instances is empty and not loading', () => {
    const wrapper = mount(LaunchInstanceSelector, {
      props: { ...BASE_PROPS, noInstanceText: 'No CLI found' },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('No CLI found')
    wrapper.unmount()
  })

  it('does not show noInstanceText when instances are present', () => {
    const wrapper = mount(LaunchInstanceSelector, {
      props: { ...BASE_PROPS, instances: [WSL_INSTANCE] },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).not.toContain('No CLI found')
    wrapper.unmount()
  })

  // ── Instance list rendering ─────────────────────────────────────────────────

  it('renders one row per instance', () => {
    const wrapper = mount(LaunchInstanceSelector, {
      props: { ...BASE_PROPS, instances: [WSL_INSTANCE, LOCAL_INSTANCE] },
      global: { plugins: [i18n] },
    })
    expect(wrapper.findAll('.instance-row')).toHaveLength(2)
    wrapper.unmount()
  })

  it('renders a radio input for each instance', () => {
    const wrapper = mount(LaunchInstanceSelector, {
      props: { ...BASE_PROPS, instances: [WSL_INSTANCE] },
      global: { plugins: [i18n] },
    })
    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios).toHaveLength(1)
    wrapper.unmount()
  })

  it('renders the CLI badge for each instance', () => {
    const wrapper = mount(LaunchInstanceSelector, {
      props: { ...BASE_PROPS, instances: [WSL_INSTANCE] },
      global: { plugins: [i18n] },
    })
    // CLI_BADGE['claude'] = 'C'
    expect(wrapper.find('.cli-badge').text()).toBe('C')
    wrapper.unmount()
  })

  it('renders version badge for each instance', () => {
    const wrapper = mount(LaunchInstanceSelector, {
      props: { ...BASE_PROPS, instances: [WSL_INSTANCE] },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.version-badge').text()).toContain('2.1.58')
    wrapper.unmount()
  })

  it('shows "default" badge for default WSL instances', () => {
    const defaultWsl: CliInstance = { ...WSL_INSTANCE, isDefault: true, type: 'wsl' }
    const wrapper = mount(LaunchInstanceSelector, {
      props: { ...BASE_PROPS, instances: [defaultWsl] },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.default-badge').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not show "default" badge for local (non-WSL) instances', () => {
    const wrapper = mount(LaunchInstanceSelector, {
      props: { ...BASE_PROPS, instances: [LOCAL_INSTANCE] },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.default-badge').exists()).toBe(false)
    wrapper.unmount()
  })

  // ── Selection state ─────────────────────────────────────────────────────────

  it('selected instance row does not have instance-row--idle class', () => {
    const wrapper = mount(LaunchInstanceSelector, {
      props: { ...BASE_PROPS, instances: [WSL_INSTANCE], modelValue: WSL_INSTANCE },
      global: { plugins: [i18n] },
    })
    const row = wrapper.find('.instance-row')
    expect(row.classes()).not.toContain('instance-row--idle')
    wrapper.unmount()
  })

  it('unselected instance row has instance-row--idle class', () => {
    const wrapper = mount(LaunchInstanceSelector, {
      props: { ...BASE_PROPS, instances: [WSL_INSTANCE], modelValue: null },
      global: { plugins: [i18n] },
    })
    const row = wrapper.find('.instance-row')
    expect(row.classes()).toContain('instance-row--idle')
    wrapper.unmount()
  })

  // ── Emit update:modelValue ──────────────────────────────────────────────────

  it('emits update:modelValue with the clicked instance when radio changes', async () => {
    const wrapper = mount(LaunchInstanceSelector, {
      props: { ...BASE_PROPS, instances: [WSL_INSTANCE] },
      global: { plugins: [i18n] },
    })
    const radio = wrapper.find('input[type="radio"]')
    await radio.trigger('change')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([WSL_INSTANCE])
    wrapper.unmount()
  })

  it('emits correct instance when multiple are present and second is clicked', async () => {
    const wrapper = mount(LaunchInstanceSelector, {
      props: { ...BASE_PROPS, instances: [WSL_INSTANCE, LOCAL_INSTANCE] },
      global: { plugins: [i18n] },
    })
    const radios = wrapper.findAll('input[type="radio"]')
    await radios[1].trigger('change')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([LOCAL_INSTANCE])
    wrapper.unmount()
  })

  // ── Section header ──────────────────────────────────────────────────────────

  it('renders the "Instance" section title', () => {
    const wrapper = mount(LaunchInstanceSelector, {
      props: BASE_PROPS,
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.section-title').text()).toContain('Instance')
    wrapper.unmount()
  })
})
