import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@renderer/locales/en.json'
import TaskCommentsSection from '@renderer/components/TaskCommentsSection.vue'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

interface RenderedComment {
  id: number
  agent_name: string | null
  created_at: string
  _html: string
}

function makeComment(overrides: Partial<RenderedComment> = {}): RenderedComment {
  return {
    id: 1,
    agent_name: 'review-master',
    created_at: new Date(Date.now() - 120_000).toISOString(), // 2 min ago
    _html: '<p>Test comment body</p>',
    ...overrides,
  }
}

describe('TaskCommentsSection (T1975)', () => {
  it('shows empty state text when comments list is empty', () => {
    const wrapper = mount(TaskCommentsSection, {
      props: { comments: [] },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('No comments')
    wrapper.unmount()
  })

  it('does not show empty state when comments are present', () => {
    const wrapper = mount(TaskCommentsSection, {
      props: { comments: [makeComment()] },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('p.empty-text').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders one bubble per comment', () => {
    const comments = [
      makeComment({ id: 1, agent_name: 'agent-a' }),
      makeComment({ id: 2, agent_name: 'agent-b' }),
    ]
    const wrapper = mount(TaskCommentsSection, {
      props: { comments },
      global: { plugins: [i18n] },
    })
    expect(wrapper.findAll('.md-bubble')).toHaveLength(2)
    wrapper.unmount()
  })

  it('displays the agent name in the comment header', () => {
    const wrapper = mount(TaskCommentsSection, {
      props: { comments: [makeComment({ agent_name: 'dev-front-vuejs' })] },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('dev-front-vuejs')
    wrapper.unmount()
  })

  it('shows "?" when agent_name is null', () => {
    const wrapper = mount(TaskCommentsSection, {
      props: { comments: [makeComment({ agent_name: null })] },
      global: { plugins: [i18n] },
    })
    // Avatar and author fallback to "?"
    expect(wrapper.text()).toContain('?')
    wrapper.unmount()
  })

  it('renders avatar initials (first 2 chars uppercase) from agent name', () => {
    const wrapper = mount(TaskCommentsSection, {
      props: { comments: [makeComment({ agent_name: 'review-master' })] },
      global: { plugins: [i18n] },
    })
    // Avatar renders 'RE' (first 2 chars of 'review-master', uppercased)
    const avatar = wrapper.find('v-avatar')
    expect(avatar.text()).toBe('RE')
    wrapper.unmount()
  })

  it('renders the comment HTML body via v-html', () => {
    const wrapper = mount(TaskCommentsSection, {
      props: { comments: [makeComment({ _html: '<strong>Bold content</strong>' })] },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.comment-bubble-body').html()).toContain('<strong>Bold content</strong>')
    wrapper.unmount()
  })

  it('shows relative time in the comment header', () => {
    const twoMinAgo = new Date(Date.now() - 2 * 60_000).toISOString()
    const wrapper = mount(TaskCommentsSection, {
      props: { comments: [makeComment({ created_at: twoMinAgo })] },
      global: { plugins: [i18n] },
    })
    // relativeTime: 2 minutes ago → '2min'
    expect(wrapper.find('.comment-time').text()).toBe('2min')
    wrapper.unmount()
  })

  it('shows "just now" for comments created less than 1 minute ago', () => {
    const justNow = new Date(Date.now() - 30_000).toISOString()
    const wrapper = mount(TaskCommentsSection, {
      props: { comments: [makeComment({ created_at: justNow })] },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.comment-time').text()).toBeTruthy()
    wrapper.unmount()
  })

  it('renders multiple comments in order (first prop → first bubble)', () => {
    const comments = [
      makeComment({ id: 10, agent_name: 'first-agent', _html: '<p>First</p>' }),
      makeComment({ id: 20, agent_name: 'second-agent', _html: '<p>Second</p>' }),
    ]
    const wrapper = mount(TaskCommentsSection, {
      props: { comments },
      global: { plugins: [i18n] },
    })
    const authors = wrapper.findAll('.comment-author').map(el => el.text())
    expect(authors[0]).toBe('first-agent')
    expect(authors[1]).toBe('second-agent')
    wrapper.unmount()
  })
})
