import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import StreamInputBar from '@renderer/components/StreamInputBar.vue'

describe('StreamInputBar (T842)', () => {
  const defaultProps = {
    isStreaming: false,
    ptyId: null,
    agentStopped: false,
    sessionId: 'sess-1',
    accentFg: '#00ff00',
  }

  it('renders a textarea for text input', () => {
    const wrapper = mount(StreamInputBar, { props: defaultProps })
    expect(wrapper.find('textarea').exists()).toBe(true)
    wrapper.unmount()
  })

  it('emits send with the text when Enter is pressed', async () => {
    const wrapper = mount(StreamInputBar, { props: defaultProps })
    const textarea = wrapper.find('textarea')
    await textarea.setValue('Hello world')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false })
    expect(wrapper.emitted('send')).toBeTruthy()
    expect(wrapper.emitted('send')![0]).toEqual(['Hello world'])
    wrapper.unmount()
  })

  it('emits send with text when send button is clicked', async () => {
    const wrapper = mount(StreamInputBar, { props: defaultProps })
    await wrapper.find('textarea').setValue('Click send')
    await wrapper.find('[data-testid="send-button"]').trigger('click')
    expect(wrapper.emitted('send')).toBeTruthy()
    expect(wrapper.emitted('send')![0]).toEqual(['Click send'])
    wrapper.unmount()
  })

  it('resets the input after send', async () => {
    const wrapper = mount(StreamInputBar, { props: defaultProps })
    const textarea = wrapper.find('textarea')
    await textarea.setValue('Reset me')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false })
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
    wrapper.unmount()
  })

  it('does not emit send when sessionId is null', async () => {
    const wrapper = mount(StreamInputBar, {
      props: { ...defaultProps, sessionId: null },
    })
    await wrapper.find('textarea').setValue('No session')
    await wrapper.find('[data-testid="send-button"]').trigger('click')
    expect(wrapper.emitted('send')).toBeFalsy()
    wrapper.unmount()
  })

  it('does not emit send when text is empty', async () => {
    const wrapper = mount(StreamInputBar, { props: defaultProps })
    await wrapper.find('[data-testid="send-button"]').trigger('click')
    expect(wrapper.emitted('send')).toBeFalsy()
    wrapper.unmount()
  })

  it('shows stop button when isStreaming && ptyId && !agentStopped', () => {
    const wrapper = mount(StreamInputBar, {
      props: { ...defaultProps, isStreaming: true, ptyId: 'pty-1', agentStopped: false },
    })
    expect(wrapper.find('[data-testid="stop-button"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('emits stop when stop button clicked', async () => {
    const wrapper = mount(StreamInputBar, {
      props: { ...defaultProps, isStreaming: true, ptyId: 'pty-1', agentStopped: false },
    })
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    expect(wrapper.emitted('stop')).toBeTruthy()
    wrapper.unmount()
  })
})
