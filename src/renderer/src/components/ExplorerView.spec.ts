import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import ExplorerView from '@renderer/components/ExplorerView.vue'
import i18n from '@renderer/plugins/i18n'

describe('ExplorerView', () => {
  const mockTree = [
    { name: 'src', path: '/p/src', isDir: true, children: [
      { name: 'main.ts', path: '/p/src/main.ts', isDir: false },
    ] },
    { name: 'README.md', path: '/p/README.md', isDir: false },
  ]

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    api.fsListDir.mockResolvedValue(mockTree)
    api.fsReadFile.mockResolvedValue({ success: true, content: 'hello world' })
  })

  it('calls fsListDir on mount when projectPath is set', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    shallowMount(ExplorerView, {
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { projectPath: '/p' } },
        }), i18n],
        stubs: { FileTreeNode: true },
      },
    })
    await flushPromises()
    expect(api.fsListDir).toHaveBeenCalledWith('/p', '/p')
  })

  it('does not call fsListDir when projectPath is empty', async () => {
    const api = window.electronAPI as Record<string, ReturnType<typeof vi.fn>>
    shallowMount(ExplorerView, {
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { projectPath: '' } },
        }), i18n],
        stubs: { FileTreeNode: true },
      },
    })
    await flushPromises()
    expect(api.fsListDir).not.toHaveBeenCalled()
  })

  it('shows "no project" message when projectPath is empty', async () => {
    const wrapper = shallowMount(ExplorerView, {
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { projectPath: '' } },
        }), i18n],
        stubs: { FileTreeNode: true },
      },
    })
    await flushPromises()
    // Should show noProject message (i18n fr: "Aucun projet ouvert")
    expect(wrapper.text()).toContain('Aucun projet')
  })

  it('shows "select a file" message when no file is selected', async () => {
    const wrapper = shallowMount(ExplorerView, {
      global: {
        plugins: [createTestingPinia({
          initialState: { tasks: { projectPath: '/p' } },
        }), i18n],
        stubs: { FileTreeNode: true },
      },
    })
    await flushPromises()
    // Content panel should show a message (i18n fr: "Sélectionner un fichier")
    const text = wrapper.text()
    expect(text).toContain('lectionner')
  })
})

// ── FileView (T244) ───────────────────────────────────────────────────────────

// Mock CodeMirror and all its dependencies before importing FileView
vi.mock('codemirror', () => {
  const EditorViewCtor = vi.fn().mockImplementation(function (this: Record<string, unknown>, opts: { state: unknown; parent: HTMLElement }) {
    const el = document.createElement('div')
    opts.parent.appendChild(el)
    this.state = opts.state ?? { doc: { length: 0, toString: () => '' } }
    this.dispatch = vi.fn()
    this.destroy = vi.fn()
    this.dom = el
    return this
  }) as unknown as Record<string, unknown>
  EditorViewCtor.updateListener = { of: vi.fn().mockReturnValue([]) }
  EditorViewCtor.theme = vi.fn().mockReturnValue([])
  return { EditorView: EditorViewCtor, basicSetup: [] }
})
vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: vi.fn().mockReturnValue({
      doc: { length: 0, toString: () => '' },
    }),
  },
}))
vi.mock('@codemirror/view', () => {
  class EditorView {
    static updateListener = { of: vi.fn().mockReturnValue([]) }
    static theme = vi.fn().mockReturnValue([])
    constructor() {}
    destroy() {}
    dispatch() {}
  }
  return {
    keymap: { of: vi.fn().mockReturnValue([]) },
    EditorView,
    lineNumbers: vi.fn().mockReturnValue([]),
    highlightActiveLineGutter: vi.fn().mockReturnValue([]),
    highlightSpecialChars: vi.fn().mockReturnValue([]),
    drawSelection: vi.fn().mockReturnValue([]),
    highlightActiveLine: vi.fn().mockReturnValue([]),
  }
})
