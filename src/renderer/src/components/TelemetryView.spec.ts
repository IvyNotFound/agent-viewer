import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { nextTick } from 'vue'
import TelemetryView from '@renderer/components/TelemetryView.vue'
import { mockElectronAPI } from '../../../test/setup'

describe('TelemetryView (T842)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(mockElectronAPI.telemetryScan as ReturnType<typeof vi.fn>).mockResolvedValue({
      languages: [],
      totalFiles: 0,
      totalLines: 0,
      scannedAt: new Date().toISOString(),
    })
  })

  it('shows loading indicator (Scanning) while IPC is pending', async () => {
    // Make telemetryScan pending so loading stays true
    let resolve!: (v: unknown) => void
    ;(mockElectronAPI.telemetryScan as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(r => { resolve = r }),
    )
    const wrapper = mount(TelemetryView, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { projectPath: '/my/project', dbPath: '/my/project.db' } } })],
      },
    })
    // Wait one tick so onMounted → scan() → loading=true is processed
    await nextTick()
    const text = wrapper.text()
    // Loading state shows "Scanning" (button shows "Scanning…" or loading area shows "Scanning project…")
    expect(text).toMatch(/Scanning/)
    resolve({ languages: [], totalFiles: 0, totalLines: 0, scannedAt: new Date().toISOString() })
    await flushPromises()
    wrapper.unmount()
  })

  it('calls telemetryScan with projectPath on mount', async () => {
    const wrapper = mount(TelemetryView, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { projectPath: '/my/project', dbPath: '/my/project.db' } } })],
      },
    })
    await flushPromises()
    expect(mockElectronAPI.telemetryScan).toHaveBeenCalledWith('/my/project')
    wrapper.unmount()
  })

  it('displays languages sorted by lines (already sorted from IPC)', async () => {
    ;(mockElectronAPI.telemetryScan as ReturnType<typeof vi.fn>).mockResolvedValue({
      languages: [
        { name: 'TypeScript', color: '#3178c6', files: 50, lines: 10000, percent: 60 },
        { name: 'Vue', color: '#42b883', files: 30, lines: 5000, percent: 30 },
        { name: 'CSS', color: '#563d7c', files: 10, lines: 1000, percent: 10 },
      ],
      totalFiles: 90,
      totalLines: 16000,
      scannedAt: new Date().toISOString(),
    })
    const wrapper = mount(TelemetryView, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { projectPath: '/my/project', dbPath: '/my/project.db' } } })],
      },
    })
    await flushPromises()
    const text = wrapper.text()
    const tsIdx = text.indexOf('TypeScript')
    const vueIdx = text.indexOf('Vue')
    expect(tsIdx).toBeGreaterThanOrEqual(0)
    expect(vueIdx).toBeGreaterThan(tsIdx)
    wrapper.unmount()
  })

  it('displays formatted total LOC correctly', async () => {
    ;(mockElectronAPI.telemetryScan as ReturnType<typeof vi.fn>).mockResolvedValue({
      languages: [],
      totalFiles: 100,
      totalLines: 15000,
      scannedAt: new Date().toISOString(),
    })
    const wrapper = mount(TelemetryView, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { projectPath: '/my/project', dbPath: '/my/project.db' } } })],
      },
    })
    await flushPromises()
    // formatLines(15000) → '15.0k'
    expect(wrapper.text()).toContain('15.0k')
    wrapper.unmount()
  })

  it('displays error message when IPC throws', async () => {
    ;(mockElectronAPI.telemetryScan as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Scan failed'))
    const wrapper = mount(TelemetryView, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { projectPath: '/my/project', dbPath: '/my/project.db' } } })],
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Scan failed')
    wrapper.unmount()
  })

  it('shows "Open a project" guard when no projectPath', () => {
    const wrapper = mount(TelemetryView, {
      global: {
        plugins: [createTestingPinia({ initialState: { tasks: { projectPath: null, dbPath: null } } })],
      },
    })
    expect(wrapper.text()).toContain('Open a project')
    wrapper.unmount()
  })
})
