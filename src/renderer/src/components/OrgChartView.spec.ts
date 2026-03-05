import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import i18n from '@renderer/plugins/i18n'
import OrgChartView from '@renderer/components/OrgChartView.vue'

const AGENT_ROW = (overrides = {}) => ({
  id: 1,
  name: 'dev-front',
  type: 'dev',
  perimetre: 'front-vuejs',
  session_statut: null,
  tasks_in_progress: 0,
  tasks_todo: 0,
  ...overrides,
})

describe('OrgChartView (T921)', () => {
  beforeEach(() => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb = vi.fn()
  })

  it('renders SVG when agents returned (T921)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([AGENT_ROW()])

    const wrapper = mount(OrgChartView, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { dbPath: '/p/db' } } }), i18n],
      },
    })
    await flushPromises()
    expect(wrapper.find('svg').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows empty state when no agents (T921)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([])

    const wrapper = mount(OrgChartView, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { dbPath: '/p/db' } } }), i18n],
      },
    })
    await flushPromises()
    expect(wrapper.find('svg').exists()).toBe(false)
    const text = wrapper.text().toLowerCase()
    expect(text).toMatch(/aucun agent|no agents/)
    wrapper.unmount()
  })

  it('renders group headers for each perimetre (T921)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([
      AGENT_ROW({ id: 1, name: 'dev-front', perimetre: 'front-vuejs' }),
      AGENT_ROW({ id: 2, name: 'dev-back', perimetre: 'back-electron' }),
    ])

    const wrapper = mount(OrgChartView, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { dbPath: '/p/db' } } }), i18n],
      },
    })
    await flushPromises()
    const svgText = wrapper.find('svg').text()
    expect(svgText).toContain('front-vuejs')
    expect(svgText).toContain('back-electron')
    wrapper.unmount()
  })

  it('groups null-perimetre agents under Global (T921)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([
      AGENT_ROW({ id: 3, name: 'arch', perimetre: null }),
    ])

    const wrapper = mount(OrgChartView, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { dbPath: '/p/db' } } }), i18n],
      },
    })
    await flushPromises()
    expect(wrapper.find('svg').text()).toContain('Global')
    wrapper.unmount()
  })

  // Layout logic unit tests
  it('layout: positions multiple agents side by side within a group (T921)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([
      AGENT_ROW({ id: 1, name: 'agent-a', perimetre: 'front' }),
      AGENT_ROW({ id: 2, name: 'agent-b', perimetre: 'front' }),
    ])

    const wrapper = mount(OrgChartView, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { dbPath: '/p/db' } } }), i18n],
      },
    })
    await flushPromises()
    // Two agents in same group → expect two distinct SVG rects for agent cards
    const rects = wrapper.findAll('rect')
    // At least 3 rects: 1 group header + 2 agent cards
    expect(rects.length).toBeGreaterThanOrEqual(3)
    wrapper.unmount()
  })

  it('status: cyan for started session (T921)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([
      AGENT_ROW({ session_statut: 'started' }),
    ])

    const wrapper = mount(OrgChartView, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { dbPath: '/p/db' } } }), i18n],
      },
    })
    await flushPromises()
    // Status dot fill should be cyan
    const circles = wrapper.findAll('circle')
    const cyanCircle = circles.find(c => c.attributes('fill') === '#06b6d4')
    expect(cyanCircle).toBeDefined()
    wrapper.unmount()
  })

  it('status: red for blocked session (T921)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([
      AGENT_ROW({ session_statut: 'blocked' }),
    ])

    const wrapper = mount(OrgChartView, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { dbPath: '/p/db' } } }), i18n],
      },
    })
    await flushPromises()
    const circles = wrapper.findAll('circle')
    const redCircle = circles.find(c => c.attributes('fill') === '#ef4444')
    expect(redCircle).toBeDefined()
    wrapper.unmount()
  })

  it('status: green when agent has todo tasks and no active session (T921)', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.queryDb.mockResolvedValue([
      AGENT_ROW({ session_statut: null, tasks_todo: 2 }),
    ])

    const wrapper = mount(OrgChartView, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { dbPath: '/p/db' } } }), i18n],
      },
    })
    await flushPromises()
    const circles = wrapper.findAll('circle')
    const greenCircle = circles.find(c => c.attributes('fill') === '#22c55e')
    expect(greenCircle).toBeDefined()
    wrapper.unmount()
  })
})
