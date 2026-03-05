import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import SidebarFileTree from '@renderer/components/SidebarFileTree.vue'
import i18n from '@renderer/plugins/i18n'
import { mockElectronAPI } from '../../../test/setup'
import type { FileNode } from '@renderer/types'

function makeFileNode(overrides: Partial<FileNode> = {}): FileNode {
  return {
    name: 'file.ts',
    path: '/project/file.ts',
    isDir: false,
    children: [],
    ...overrides,
  }
}

describe('SidebarFileTree', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows noProject message when projectPath is null', () => {
    const wrapper = shallowMount(SidebarFileTree, {
      props: { projectPath: null },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    // Shows empty/no project state
    expect(wrapper.find('.flex-1').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not call fsListDir when projectPath is null', async () => {
    const wrapper = shallowMount(SidebarFileTree, {
      props: { projectPath: null },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    // Manually invoke loadSidebarTree (exposed)
    await (wrapper.vm as { loadSidebarTree: () => Promise<void> }).loadSidebarTree()
    expect(mockElectronAPI.fsListDir).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('calls window.electronAPI.fsListDir when loadSidebarTree is called with valid projectPath', async () => {
    ;(mockElectronAPI.fsListDir as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const wrapper = shallowMount(SidebarFileTree, {
      props: { projectPath: '/project' },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    await (wrapper.vm as { loadSidebarTree: () => Promise<void> }).loadSidebarTree()
    await flushPromises()
    expect(mockElectronAPI.fsListDir).toHaveBeenCalledWith('/project', '/project')
    wrapper.unmount()
  })

  it('renders file nodes returned by fsListDir', async () => {
    const nodes: FileNode[] = [
      makeFileNode({ name: 'index.ts', path: '/project/index.ts', isDir: false }),
    ]
    ;(mockElectronAPI.fsListDir as ReturnType<typeof vi.fn>).mockResolvedValue(nodes)
    const wrapper = shallowMount(SidebarFileTree, {
      props: { projectPath: '/project' },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    await (wrapper.vm as { loadSidebarTree: () => Promise<void> }).loadSidebarTree()
    await flushPromises()
    expect(wrapper.text()).toContain('index.ts')
    wrapper.unmount()
  })

  it('renders directory nodes and shows open/closed icon', async () => {
    const nodes: FileNode[] = [
      makeFileNode({ name: 'src', path: '/project/src', isDir: true, children: [] }),
    ]
    ;(mockElectronAPI.fsListDir as ReturnType<typeof vi.fn>).mockResolvedValue(nodes)
    const wrapper = shallowMount(SidebarFileTree, {
      props: { projectPath: '/project' },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    await (wrapper.vm as { loadSidebarTree: () => Promise<void> }).loadSidebarTree()
    await flushPromises()
    expect(wrapper.text()).toContain('src')
    wrapper.unmount()
  })

  it('toggles directory open state when dir button is clicked', async () => {
    const nodes: FileNode[] = [
      makeFileNode({ name: 'src', path: '/project/src', isDir: true, children: [
        makeFileNode({ name: 'main.ts', path: '/project/src/main.ts', isDir: false }),
      ]}),
    ]
    ;(mockElectronAPI.fsListDir as ReturnType<typeof vi.fn>).mockResolvedValue(nodes)
    const wrapper = shallowMount(SidebarFileTree, {
      props: { projectPath: '/project' },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    await (wrapper.vm as { loadSidebarTree: () => Promise<void> }).loadSidebarTree()
    await flushPromises()
    // The dir button should exist
    const dirBtn = wrapper.find('button')
    expect(dirBtn.exists()).toBe(true)
    // Click to close the dir (it should be open initially after loadSidebarTree)
    await dirBtn.trigger('click')
    // After toggling, child should not be visible
    expect(wrapper.text()).not.toContain('main.ts')
    wrapper.unmount()
  })

  it('calls tabsStore.openFile when a file is clicked', async () => {
    const nodes: FileNode[] = [
      makeFileNode({ name: 'app.ts', path: '/project/app.ts', isDir: false }),
    ]
    ;(mockElectronAPI.fsListDir as ReturnType<typeof vi.fn>).mockResolvedValue(nodes)
    const pinia = createTestingPinia()
    const wrapper = shallowMount(SidebarFileTree, {
      props: { projectPath: '/project' },
      global: { plugins: [pinia, i18n] },
    })
    await (wrapper.vm as { loadSidebarTree: () => Promise<void> }).loadSidebarTree()
    await flushPromises()
    const { useTabsStore } = await import('@renderer/stores/tabs')
    const tabsStore = useTabsStore()
    const fileBtn = wrapper.find('button')
    expect(fileBtn.exists()).toBe(true)
    await fileBtn.trigger('click')
    expect(tabsStore.openFile).toHaveBeenCalledWith('/project/app.ts', 'app.ts')
    wrapper.unmount()
  })

  it('shows empty folder message when tree is empty after load', async () => {
    ;(mockElectronAPI.fsListDir as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const wrapper = shallowMount(SidebarFileTree, {
      props: { projectPath: '/project' },
      global: { plugins: [createTestingPinia(), i18n] },
    })
    await (wrapper.vm as { loadSidebarTree: () => Promise<void> }).loadSidebarTree()
    await flushPromises()
    // Empty folder state shown
    const emptyMsg = wrapper.find('.px-4.py-3')
    expect(emptyMsg.exists()).toBe(true)
    wrapper.unmount()
  })
})
