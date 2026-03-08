import { describe, it, expect } from 'vitest'
import {
  dotStatus,
  buildGroupLayout,
  buildFlatGroup,
  flattenGroups,
  CARD_W,
  CARD_H,
  H_GAP,
  NESTING_PAD,
  GROUP_HEADER_H,
  CHILD_V_GAP,
  CHILD_H_GAP,
} from './orgChartLayout'
import type { AgentRow, LayoutGroup } from './orgChartLayout'
import type { AgentGroup } from '@renderer/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 1,
    name: 'agent',
    type: 'dev',
    scope: null,
    session_status: null,
    tasks_in_progress: 0,
    tasks_todo: 0,
    ...overrides,
  }
}

function makeGroup(overrides: Partial<AgentGroup> = {}): AgentGroup {
  return {
    id: 1,
    name: 'Group',
    sort_order: 0,
    parent_id: null,
    created_at: '2024-01-01',
    members: [],
    children: [],
    ...overrides,
  }
}

// ── dotStatus ─────────────────────────────────────────────────────────────────

describe('dotStatus', () => {
  it('returns red when session is blocked', () => {
    expect(dotStatus(makeAgent({ session_status: 'blocked' }))).toBe('red')
  })

  it('returns cyan when session is started', () => {
    expect(dotStatus(makeAgent({ session_status: 'started' }))).toBe('cyan')
  })

  it('returns green when tasks_todo > 0 and no session', () => {
    expect(dotStatus(makeAgent({ tasks_todo: 3 }))).toBe('green')
  })

  it('returns green over cyan when tasks_todo > 0 (priority order)', () => {
    // tasks_todo check comes before tasks_in_progress in code
    expect(dotStatus(makeAgent({ tasks_todo: 1, tasks_in_progress: 1 }))).toBe('green')
  })

  it('returns cyan when tasks_in_progress > 0 (and no session, no tasks_todo)', () => {
    expect(dotStatus(makeAgent({ tasks_in_progress: 2 }))).toBe('cyan')
  })

  it('returns gray when session_status is null and no tasks', () => {
    expect(dotStatus(makeAgent({ session_status: null }))).toBe('gray')
  })

  it('returns yellow for other session statuses (e.g. completed)', () => {
    expect(dotStatus(makeAgent({ session_status: 'completed' }))).toBe('yellow')
  })

  it('returns yellow for unknown session status with no tasks', () => {
    expect(dotStatus(makeAgent({ session_status: 'unknown_status', tasks_todo: 0, tasks_in_progress: 0 }))).toBe('yellow')
  })

  it('blocked takes priority over tasks_todo', () => {
    expect(dotStatus(makeAgent({ session_status: 'blocked', tasks_todo: 5 }))).toBe('red')
  })

  it('started takes priority over tasks_todo', () => {
    expect(dotStatus(makeAgent({ session_status: 'started', tasks_todo: 5 }))).toBe('cyan')
  })
})

// ── buildFlatGroup ────────────────────────────────────────────────────────────

describe('buildFlatGroup', () => {
  it('returns correct key and label', () => {
    const g = buildFlatGroup('my-key', 'My Label', [], 0, 0)
    expect(g.key).toBe('my-key')
    expect(g.label).toBe('My Label')
  })

  it('returns depth=0', () => {
    const g = buildFlatGroup('k', 'L', [], 0, 0)
    expect(g.depth).toBe(0)
  })

  it('returns x and y as given', () => {
    const g = buildFlatGroup('k', 'L', [], 42, 99)
    expect(g.x).toBe(42)
    expect(g.y).toBe(99)
  })

  it('returns empty agents for empty group', () => {
    const g = buildFlatGroup('k', 'L', [], 0, 0)
    expect(g.agents).toHaveLength(0)
  })

  it('returns empty children', () => {
    const g = buildFlatGroup('k', 'L', [], 0, 0)
    expect(g.children).toHaveLength(0)
  })

  // Width: 0 agents → contentW = CARD_W (fallback), w = CARD_W + NESTING_PAD * 2
  it('width fallback to CARD_W when 0 agents', () => {
    const g = buildFlatGroup('k', 'L', [], 0, 0)
    expect(g.w).toBe(CARD_W + NESTING_PAD * 2)
  })

  // Width: 1 agent → contentW = CARD_W, w = CARD_W + NESTING_PAD * 2
  it('width = CARD_W + NESTING_PAD * 2 for 1 agent', () => {
    const g = buildFlatGroup('k', 'L', [makeAgent()], 0, 0)
    expect(g.w).toBe(CARD_W + NESTING_PAD * 2)
  })

  // Width: n agents → contentW = n * CARD_W + (n-1) * H_GAP
  it('width = n*CARD_W + (n-1)*H_GAP + NESTING_PAD*2 for n agents', () => {
    const agents = [makeAgent({ id: 1 }), makeAgent({ id: 2 }), makeAgent({ id: 3 })]
    const g = buildFlatGroup('k', 'L', agents, 0, 0)
    const expectedContentW = 3 * CARD_W + 2 * H_GAP
    expect(g.w).toBe(expectedContentW + NESTING_PAD * 2)
  })

  // Height is fixed: NESTING_PAD + GROUP_HEADER_H + CHILD_V_GAP + CARD_H + NESTING_PAD
  it('height is fixed regardless of agent count', () => {
    const expectedH = NESTING_PAD + GROUP_HEADER_H + CHILD_V_GAP + CARD_H + NESTING_PAD
    expect(buildFlatGroup('k', 'L', [], 0, 0).h).toBe(expectedH)
    expect(buildFlatGroup('k', 'L', [makeAgent()], 0, 0).h).toBe(expectedH)
    expect(buildFlatGroup('k', 'L', [makeAgent({ id: 1 }), makeAgent({ id: 2 })], 0, 0).h).toBe(expectedH)
  })

  // Agent X position: x + NESTING_PAD + i * (CARD_W + H_GAP)
  it('first agent x = groupX + NESTING_PAD', () => {
    const groupX = 100
    const g = buildFlatGroup('k', 'L', [makeAgent()], groupX, 0)
    expect(g.agents[0].x).toBe(groupX + NESTING_PAD)
  })

  it('second agent x = groupX + NESTING_PAD + CARD_W + H_GAP', () => {
    const groupX = 50
    const agents = [makeAgent({ id: 1 }), makeAgent({ id: 2 })]
    const g = buildFlatGroup('k', 'L', agents, groupX, 0)
    expect(g.agents[1].x).toBe(groupX + NESTING_PAD + CARD_W + H_GAP)
  })

  it('third agent x = groupX + NESTING_PAD + 2*(CARD_W + H_GAP)', () => {
    const groupX = 0
    const agents = [makeAgent({ id: 1 }), makeAgent({ id: 2 }), makeAgent({ id: 3 })]
    const g = buildFlatGroup('k', 'L', agents, groupX, 0)
    expect(g.agents[2].x).toBe(groupX + NESTING_PAD + 2 * (CARD_W + H_GAP))
  })

  // Agent Y position: y + NESTING_PAD + GROUP_HEADER_H + CHILD_V_GAP
  it('agent y = groupY + NESTING_PAD + GROUP_HEADER_H + CHILD_V_GAP', () => {
    const groupY = 200
    const g = buildFlatGroup('k', 'L', [makeAgent()], 0, groupY)
    expect(g.agents[0].y).toBe(groupY + NESTING_PAD + GROUP_HEADER_H + CHILD_V_GAP)
  })

  it('all agents share the same y', () => {
    const agents = [makeAgent({ id: 1 }), makeAgent({ id: 2 }), makeAgent({ id: 3 })]
    const g = buildFlatGroup('k', 'L', agents, 0, 10)
    const expectedY = 10 + NESTING_PAD + GROUP_HEADER_H + CHILD_V_GAP
    for (const a of g.agents) {
      expect(a.y).toBe(expectedY)
    }
  })

  it('agent status is delegated to dotStatus', () => {
    const g = buildFlatGroup('k', 'L', [makeAgent({ session_status: 'blocked' })], 0, 0)
    expect(g.agents[0].status).toBe('red')
  })

  it('agent id and name are preserved', () => {
    const g = buildFlatGroup('k', 'L', [makeAgent({ id: 42, name: 'my-agent' })], 0, 0)
    expect(g.agents[0].id).toBe(42)
    expect(g.agents[0].name).toBe('my-agent')
  })
})
