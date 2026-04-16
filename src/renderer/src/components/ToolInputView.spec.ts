import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import ToolInputView from '@renderer/components/ToolInputView.vue'

const pinia = createTestingPinia({ initialState: { settings: { theme: 'dark' } } })

function makeWrapper(toolName: string, toolInput: Record<string, unknown>) {
  return mount(ToolInputView, {
    props: { toolName, toolInput },
    global: {
      plugins: [pinia],
      stubs: { VIcon: true },
    },
  })
}

describe('ToolInputView (T1972)', () => {
  // ── Edit ───────────────────────────────────────────────────────────────────

  it('renders diff-view for Edit tool with old_string/new_string', () => {
    const wrapper = makeWrapper('Edit', {
      file_path: '/src/foo.ts',
      old_string: 'const x = 1',
      new_string: 'const x = 2',
    })
    expect(wrapper.find('.diff-view').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows file_path for Edit tool', () => {
    const wrapper = makeWrapper('Edit', {
      file_path: '/src/foo.ts',
      old_string: 'a',
      new_string: 'b',
    })
    expect(wrapper.find('.tool-filepath').text()).toBe('/src/foo.ts')
    wrapper.unmount()
  })

  // ── Write ──────────────────────────────────────────────────────────────────

  it('renders diff-view with add lines for Write tool', () => {
    const wrapper = makeWrapper('Write', {
      file_path: '/src/bar.ts',
      content: 'line1\nline2\nline3',
    })
    expect(wrapper.find('.diff-view').exists()).toBe(true)
    const addLines = wrapper.findAll('.diff-add')
    expect(addLines.length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('shows file_path for Write tool', () => {
    const wrapper = makeWrapper('Write', {
      file_path: '/out/file.ts',
      content: 'hello',
    })
    expect(wrapper.find('.tool-filepath').text()).toBe('/out/file.ts')
    wrapper.unmount()
  })

  // ── Bash ───────────────────────────────────────────────────────────────────

  it('renders tool-command pre for Bash tool', () => {
    const wrapper = makeWrapper('Bash', { command: 'npm run test' })
    expect(wrapper.find('.tool-command').exists()).toBe(true)
    expect(wrapper.find('.tool-command').text()).toContain('npm run test')
    wrapper.unmount()
  })

  it('renders empty command for Bash with no command field', () => {
    const wrapper = makeWrapper('Bash', {})
    expect(wrapper.find('.tool-command').exists()).toBe(true)
    wrapper.unmount()
  })

  // ── Read ───────────────────────────────────────────────────────────────────

  it('renders file_path for Read tool', () => {
    const wrapper = makeWrapper('Read', { file_path: '/src/index.ts' })
    expect(wrapper.find('.tool-filepath').text()).toBe('/src/index.ts')
    wrapper.unmount()
  })

  it('shows offset and limit for Read tool when present', () => {
    const wrapper = makeWrapper('Read', { file_path: '/x.ts', offset: 10, limit: 50 })
    const meta = wrapper.find('.tool-meta')
    expect(meta.exists()).toBe(true)
    expect(meta.text()).toContain('10')
    expect(meta.text()).toContain('50')
    wrapper.unmount()
  })

  // ── Grep ───────────────────────────────────────────────────────────────────

  it('renders pattern and path for Grep tool', () => {
    const wrapper = makeWrapper('Grep', { pattern: 'TODO', path: '/src' })
    expect(wrapper.find('.tool-pattern').text()).toContain('TODO')
    expect(wrapper.find('.tool-filepath').text()).toContain('/src')
    wrapper.unmount()
  })

  // ── Glob ───────────────────────────────────────────────────────────────────

  it('renders pattern and path for Glob tool', () => {
    const wrapper = makeWrapper('Glob', { pattern: '**/*.ts', path: '/src' })
    expect(wrapper.find('.tool-pattern').text()).toContain('**/*.ts')
    expect(wrapper.find('.tool-filepath').text()).toContain('/src')
    wrapper.unmount()
  })

  // ── Agent ──────────────────────────────────────────────────────────────────

  it('renders subagent_type and description for Agent tool', () => {
    const wrapper = makeWrapper('Agent', {
      subagent_type: 'general-purpose',
      description: 'Find the bug in login',
    })
    expect(wrapper.find('.tool-pattern').text()).toContain('general-purpose')
    expect(wrapper.find('.tool-meta').text()).toContain('Find the bug in login')
    wrapper.unmount()
  })

  // ── TodoWrite ──────────────────────────────────────────────────────────────

  it('renders todo list for TodoWrite with todos array', () => {
    const wrapper = makeWrapper('TodoWrite', {
      todos: [
        { content: 'Task one', status: 'completed' },
        { content: 'Task two', status: 'in_progress' },
        { content: 'Task three', status: 'pending' },
      ],
    })
    expect(wrapper.find('.todo-list').exists()).toBe(true)
    const items = wrapper.findAll('.todo-item')
    expect(items.length).toBe(3)
    wrapper.unmount()
  })

  it('limits TodoWrite list to TODO_MAX_ITEMS (30) and shows overflow message', () => {
    const todos = Array.from({ length: 35 }, (_, i) => ({ content: `Task ${i}`, status: 'pending' }))
    const wrapper = makeWrapper('TodoWrite', { todos })
    const items = wrapper.findAll('.todo-item')
    expect(items.length).toBe(30)
    expect(wrapper.text()).toContain('5 more items')
    wrapper.unmount()
  })

  it('shows strikethrough for completed todo items', () => {
    const wrapper = makeWrapper('TodoWrite', {
      todos: [{ content: 'Done task', status: 'completed' }],
    })
    expect(wrapper.find('.todo-done').exists()).toBe(true)
    wrapper.unmount()
  })

  // ── ToolSearch ─────────────────────────────────────────────────────────────

  it('renders query for ToolSearch tool', () => {
    const wrapper = makeWrapper('ToolSearch', { query: 'select:Read,Edit', max_results: 5 })
    expect(wrapper.find('.tool-pattern').text()).toContain('select:Read,Edit')
    wrapper.unmount()
  })

  // ── Fallback / MCP ─────────────────────────────────────────────────────────

  it('renders raw JSON fallback for unknown tool', () => {
    const wrapper = makeWrapper('UnknownTool', { foo: 'bar', baz: 42 })
    const pre = wrapper.find('pre')
    expect(pre.exists()).toBe(true)
    expect(pre.text()).toContain('"foo"')
    expect(pre.text()).toContain('"bar"')
    wrapper.unmount()
  })

  it('renders raw JSON fallback for MCP tool (contains ":")', () => {
    const wrapper = makeWrapper('mcp__server__tool_name', { param: 'value' })
    const pre = wrapper.find('pre')
    expect(pre.exists()).toBe(true)
    expect(pre.text()).toContain('"param"')
    wrapper.unmount()
  })
})
