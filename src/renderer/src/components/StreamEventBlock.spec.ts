import { describe, it, expect } from 'vitest'
import { mount, shallowMount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createI18n } from 'vue-i18n'
import en from '@renderer/locales/en.json'
import StreamEventBlock from '@renderer/components/StreamEventBlock.vue'
import type { StreamEvent } from '@renderer/types/stream'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const pinia = createTestingPinia({ initialState: { settings: { theme: 'dark' } } })

const defaultAgentColors = {
  fg: '#00ff00',
  bg: '#003300',
  border: '#00aa00',
  onColor: '#ffffff',
  text: '#66bb6a',
  bubbleTextColor: '#ffffff',
}

function makeWrapper(event: StreamEvent, overrides: Record<string, unknown> = {}) {
  return mount(StreamEventBlock, {
    props: {
      event,
      collapsed: {},
      agentColors: defaultAgentColors,
      isInitVisible: true,
      initContext: undefined,
      ...overrides,
    },
    global: { plugins: [i18n, pinia] },
  })
}

/** shallowMount variant — auto-stubs child Vue components (StreamToolBlock, etc.) */
function makeShallow(event: StreamEvent, overrides: Record<string, unknown> = {}) {
  return shallowMount(StreamEventBlock, {
    props: {
      event,
      collapsed: {},
      agentColors: defaultAgentColors,
      isInitVisible: true,
      initContext: undefined,
      ...overrides,
    },
    global: { plugins: [i18n, pinia] },
  })
}

describe('StreamEventBlock (T1972)', () => {
  // ── system:init ────────────────────────────────────────────────────────────

  it('renders block-system-init when isInitVisible=true', () => {
    const event: StreamEvent = { type: 'system', subtype: 'init', session_id: 'abc12345-xxxx' }
    const wrapper = makeWrapper(event)
    expect(wrapper.find('[data-testid="block-system-init"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not render block-system-init when isInitVisible=false', () => {
    const event: StreamEvent = { type: 'system', subtype: 'init', session_id: 'abc12345-xxxx' }
    const wrapper = makeWrapper(event, { isInitVisible: false })
    expect(wrapper.find('[data-testid="block-system-init"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows session_id slice in system:init block', () => {
    const event: StreamEvent = { type: 'system', subtype: 'init', session_id: 'abc12345-session-id' }
    const wrapper = makeWrapper(event)
    expect(wrapper.find('[data-testid="block-system-init"]').text()).toContain('abc12345')
    wrapper.unmount()
  })

  it('shows ctx toggle button when initContext is present', () => {
    // v-btn is a Vuetify global component — renders as <v-btn> HTML element in test env
    const event: StreamEvent = { type: 'system', subtype: 'init', _id: 1 }
    const wrapper = makeWrapper(event, { initContext: 'Some context text' })
    const block = wrapper.find('[data-testid="block-system-init"]')
    expect(block.exists()).toBe(true)
    // The ctx button text "ctx" should appear in the block
    expect(block.text()).toContain('ctx')
    wrapper.unmount()
  })

  it('does not show ctx toggle button when initContext is absent', () => {
    const event: StreamEvent = { type: 'system', subtype: 'init', _id: 2 }
    const wrapper = makeWrapper(event, { initContext: undefined })
    const block = wrapper.find('[data-testid="block-system-init"]')
    expect(block.exists()).toBe(true)
    // No ctx text when no initContext
    expect(block.text()).not.toContain('ctx')
    wrapper.unmount()
  })

  it('emits toggle-collapsed with correct key when ctx button is clicked', async () => {
    // v-btn renders as <v-btn> HTML element — find via tag selector
    const event: StreamEvent = { type: 'system', subtype: 'init', _id: 42 }
    const wrapper = makeWrapper(event, { initContext: 'ctx text' })
    await wrapper.find('v-btn').trigger('click')
    const emitted = wrapper.emitted('toggle-collapsed')
    expect(emitted).toBeTruthy()
    expect((emitted![0] as unknown[])[0]).toBe('init-ctx-42')
    wrapper.unmount()
  })

  // ── error:spawn / error:exit ───────────────────────────────────────────────

  it('renders block-error for error:spawn with error text', () => {
    const event: StreamEvent = { type: 'error:spawn', error: 'spawn failed: ENOENT' }
    const wrapper = makeWrapper(event)
    const block = wrapper.find('[data-testid="block-error"]')
    expect(block.exists()).toBe(true)
    expect(block.text()).toContain('spawn failed: ENOENT')
    wrapper.unmount()
  })

  it('renders block-error for error:exit with error text', () => {
    const event: StreamEvent = { type: 'error:exit', error: 'process exited with code 1' }
    const wrapper = makeWrapper(event)
    const block = wrapper.find('[data-testid="block-error"]')
    expect(block.exists()).toBe(true)
    expect(block.text()).toContain('process exited with code 1')
    wrapper.unmount()
  })

  it('shows stderr in error:exit block when present', () => {
    const event: StreamEvent = { type: 'error:exit', error: 'exit 1', stderr: 'fatal: not a git repo' }
    const wrapper = makeWrapper(event)
    expect(wrapper.find('[data-testid="block-error"]').text()).toContain('fatal: not a git repo')
    wrapper.unmount()
  })

  // ── user bubble ────────────────────────────────────────────────────────────

  it('renders block-user for user event with text message', () => {
    const event: StreamEvent = {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', _html: '<p>Hello world</p>' }] },
    }
    const wrapper = makeWrapper(event)
    expect(wrapper.find('[data-testid="block-user"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not render block-user when message is absent', () => {
    const event: StreamEvent = { type: 'user' }
    const wrapper = makeWrapper(event)
    expect(wrapper.find('[data-testid="block-user"]').exists()).toBe(false)
    wrapper.unmount()
  })

  // ── assistant ──────────────────────────────────────────────────────────────

  it('renders assistant text block as block-text', () => {
    const event: StreamEvent = {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', _html: '<p>Hi</p>' }] },
    }
    const wrapper = makeWrapper(event)
    expect(wrapper.find('[data-testid="block-text"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders StreamToolBlock for tool_use block in assistant event', () => {
    // shallowMount auto-stubs child components including StreamToolBlock
    const event: StreamEvent = {
      type: 'assistant',
      _id: 5,
      message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] },
    }
    const wrapper = makeShallow(event)
    expect(wrapper.findComponent({ name: 'StreamToolBlock' }).exists()).toBe(true)
    wrapper.unmount()
  })

  // ── result ─────────────────────────────────────────────────────────────────

  it('renders block-result for result event', () => {
    const event: StreamEvent = { type: 'result', cost_usd: 0.0012, num_turns: 2, duration_ms: 3000 }
    const wrapper = makeWrapper(event)
    expect(wrapper.find('[data-testid="block-result"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows cost and turns in block-result', () => {
    const event: StreamEvent = { type: 'result', cost_usd: 0.0042, num_turns: 3 }
    const wrapper = makeWrapper(event)
    const block = wrapper.find('[data-testid="block-result"]')
    expect(block.text()).toContain('0.0042')
    expect(block.text()).toContain('3')
    wrapper.unmount()
  })

  // ── non-Claude CLI events (T1197) ──────────────────────────────────────────

  it('renders block-text-raw for type:text event', () => {
    const event: StreamEvent = { type: 'text', text: 'Hello from OpenCode!' }
    const wrapper = makeWrapper(event)
    expect(wrapper.find('[data-testid="block-text-raw"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders block-error-raw for type:error event', () => {
    const event: StreamEvent = { type: 'error', text: 'CLI error output' }
    const wrapper = makeWrapper(event)
    expect(wrapper.find('[data-testid="block-error-raw"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="block-error-raw"]').text()).toContain('CLI error output')
    wrapper.unmount()
  })
})
