/**
 * Tests for useModalEscape composable.
 *
 * useModalEscape registers a keydown listener on document that calls the
 * provided callback when the Escape key is pressed, and cleans up on unmount.
 *
 * Framework: Vitest (jsdom environment — default for renderer files)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useModalEscape } from './useModalEscape'

// ── Helper: mount a minimal component using useModalEscape ────────────────────

function mountWithEscape(onClose: () => void) {
  const Comp = defineComponent({
    setup() {
      useModalEscape(onClose)
    },
    render() {
      return h('div')
    },
  })
  return mount(Comp)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('composables/useModalEscape', () => {
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onClose = vi.fn()
  })

  it('calls onClose when Escape is pressed', () => {
    mountWithEscape(onClose)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose for other keys (Enter, ArrowDown, Space)', () => {
    mountWithEscape(onClose)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('removes the listener on unmount (no memory leak)', () => {
    const wrapper = mountWithEscape(onClose)

    // Unmount — onUnmounted removes the keydown listener
    wrapper.unmount()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose exactly once per Escape when multiple mounts exist', () => {
    const onClose2 = vi.fn()
    mountWithEscape(onClose)
    mountWithEscape(onClose2)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose2).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose after unmount while another instance is still mounted', () => {
    const onClose2 = vi.fn()
    const wrapper1 = mountWithEscape(onClose)
    mountWithEscape(onClose2)

    wrapper1.unmount()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(onClose).not.toHaveBeenCalled()
    expect(onClose2).toHaveBeenCalledTimes(1)
  })
})
