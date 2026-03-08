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

// ── buildGroupLayout ──────────────────────────────────────────────────────────

describe('buildGroupLayout', () => {
  it('returns key = String(group.id)', () => {
    const group = makeGroup({ id: 7 })
    const map = new Map<number, AgentRow[]>()
    const g = buildGroupLayout(group, 0, 0, map, 0)
    expect(g.key).toBe('7')
  })

  it('returns label = group.name', () => {
    const group = makeGroup({ name: 'MyGroup' })
    const map = new Map<number, AgentRow[]>()
    const g = buildGroupLayout(group, 0, 0, map, 0)
    expect(g.label).toBe('MyGroup')
  })

  it('returns given x, y, depth', () => {
    const group = makeGroup({ id: 1 })
    const map = new Map<number, AgentRow[]>()
    const g = buildGroupLayout(group, 50, 100, map, 2)
    expect(g.x).toBe(50)
    expect(g.y).toBe(100)
    expect(g.depth).toBe(2)
  })

  // No agents, no children
  it('group with 0 agents: width = CARD_W + NESTING_PAD*2 (contentW fallback)', () => {
    const group = makeGroup({ id: 1, children: [] })
    const map = new Map<number, AgentRow[]>()
    const g = buildGroupLayout(group, 0, 0, map, 0)
    expect(g.w).toBe(CARD_W + NESTING_PAD * 2)
  })

  it('group with 0 agents: height without children', () => {
    const group = makeGroup({ id: 1, children: [] })
    const map = new Map<number, AgentRow[]>()
    const g = buildGroupLayout(group, 0, 0, map, 0)
    // n=0 → agentsRowH=0, childrenMaxH=0
    const expectedH = NESTING_PAD + GROUP_HEADER_H + CHILD_V_GAP + 0 + 0 + NESTING_PAD
    expect(g.h).toBe(expectedH)
  })

  // 1 agent
  it('group with 1 agent: width = CARD_W + NESTING_PAD*2', () => {
    const group = makeGroup({ id: 1, children: [] })
    const map = new Map([[1, [makeAgent({ id: 10 })]]])
    const g = buildGroupLayout(group, 0, 0, map, 0)
    expect(g.w).toBe(CARD_W + NESTING_PAD * 2)
  })

  it('group with 1 agent: height includes agentsRowH = CARD_H + CHILD_V_GAP', () => {
    const group = makeGroup({ id: 1, children: [] })
    const map = new Map([[1, [makeAgent({ id: 10 })]]])
    const g = buildGroupLayout(group, 0, 0, map, 0)
    const agentsRowH = CARD_H + CHILD_V_GAP
    const expectedH = NESTING_PAD + GROUP_HEADER_H + CHILD_V_GAP + agentsRowH + 0 + NESTING_PAD
    expect(g.h).toBe(expectedH)
  })

  // n agents → width = n*CARD_W + (n-1)*H_GAP + NESTING_PAD*2
  it('group with n agents: width = n*CARD_W + (n-1)*H_GAP + NESTING_PAD*2', () => {
    const group = makeGroup({ id: 1, children: [] })
    const agents = [makeAgent({ id: 1 }), makeAgent({ id: 2 }), makeAgent({ id: 3 })]
    const map = new Map([[1, agents]])
    const g = buildGroupLayout(group, 0, 0, map, 0)
    const expectedW = 3 * CARD_W + 2 * H_GAP + NESTING_PAD * 2
    expect(g.w).toBe(expectedW)
  })

  // Agent X positions
  it('first agent x = innerX = groupX + NESTING_PAD', () => {
    const group = makeGroup({ id: 1, children: [] })
    const map = new Map([[1, [makeAgent({ id: 10 })]]])
    const g = buildGroupLayout(group, 20, 0, map, 0)
    expect(g.agents[0].x).toBe(20 + NESTING_PAD)
  })

  it('second agent x = innerX + CARD_W + H_GAP', () => {
    const group = makeGroup({ id: 1, children: [] })
    const map = new Map([[1, [makeAgent({ id: 1 }), makeAgent({ id: 2 })]]])
    const g = buildGroupLayout(group, 0, 0, map, 0)
    const innerX = 0 + NESTING_PAD
    expect(g.agents[1].x).toBe(innerX + CARD_W + H_GAP)
  })

  it('third agent x = innerX + 2*(CARD_W + H_GAP)', () => {
    const group = makeGroup({ id: 1, children: [] })
    const agents = [makeAgent({ id: 1 }), makeAgent({ id: 2 }), makeAgent({ id: 3 })]
    const map = new Map([[1, agents]])
    const g = buildGroupLayout(group, 0, 0, map, 0)
    const innerX = NESTING_PAD
    expect(g.agents[2].x).toBe(innerX + 2 * (CARD_W + H_GAP))
  })

  // Agent Y position
  it('agent y = groupY + NESTING_PAD + GROUP_HEADER_H + CHILD_V_GAP', () => {
    const group = makeGroup({ id: 1, children: [] })
    const map = new Map([[1, [makeAgent({ id: 10 })]]])
    const g = buildGroupLayout(group, 0, 50, map, 0)
    const innerY = 50 + NESTING_PAD + GROUP_HEADER_H + CHILD_V_GAP
    expect(g.agents[0].y).toBe(innerY)
  })

  // Children Y position
  it('first child is placed below agents row: childY = innerY + agentsRowH', () => {
    const childGroup = makeGroup({ id: 2, name: 'Child', children: [] })
    const parentGroup = makeGroup({ id: 1, children: [childGroup] })
    const map = new Map([[1, [makeAgent({ id: 10 })]]])
    const g = buildGroupLayout(parentGroup, 0, 0, map, 0)
    const innerY = NESTING_PAD + GROUP_HEADER_H + CHILD_V_GAP
    const agentsRowH = CARD_H + CHILD_V_GAP
    const childrenY = innerY + agentsRowH
    expect(g.children[0].y).toBe(childrenY)
  })

  it('child with no parent agents: childY = innerY (agentsRowH=0)', () => {
    const childGroup = makeGroup({ id: 2, name: 'Child', children: [] })
    const parentGroup = makeGroup({ id: 1, children: [childGroup] })
    const map = new Map<number, AgentRow[]>() // no agents
    const g = buildGroupLayout(parentGroup, 0, 0, map, 0)
    const innerY = NESTING_PAD + GROUP_HEADER_H + CHILD_V_GAP
    expect(g.children[0].y).toBe(innerY)
  })

  // Children X position (side by side)
  it('first child x = innerX = groupX + NESTING_PAD', () => {
    const childGroup = makeGroup({ id: 2, children: [] })
    const parentGroup = makeGroup({ id: 1, children: [childGroup] })
    const map = new Map<number, AgentRow[]>()
    const g = buildGroupLayout(parentGroup, 30, 0, map, 0)
    expect(g.children[0].x).toBe(30 + NESTING_PAD)
  })

  it('second child x = first child x + first child w + CHILD_H_GAP', () => {
    const child1 = makeGroup({ id: 2, children: [] })
    const child2 = makeGroup({ id: 3, children: [] })
    const parentGroup = makeGroup({ id: 1, children: [child1, child2] })
    // child1 gets 1 agent → width = CARD_W + NESTING_PAD*2
    const map = new Map([[2, [makeAgent({ id: 10 })]]])
    const g = buildGroupLayout(parentGroup, 0, 0, map, 0)
    const child1W = g.children[0].w
    expect(g.children[1].x).toBe(NESTING_PAD + child1W + CHILD_H_GAP)
  })

  // contentW = Math.max(agentsRowW, childrenTotalW, CARD_W)
  it('contentW takes max of agentsRowW and childrenTotalW', () => {
    // 3 agents → agentsRowW = 3*CARD_W + 2*H_GAP
    // no children → childrenTotalW = 0
    // contentW = agentsRowW
    const group = makeGroup({ id: 1, children: [] })
    const agents = [makeAgent({ id: 1 }), makeAgent({ id: 2 }), makeAgent({ id: 3 })]
    const map = new Map([[1, agents]])
    const g = buildGroupLayout(group, 0, 0, map, 0)
    const agentsRowW = 3 * CARD_W + 2 * H_GAP
    expect(g.w).toBe(agentsRowW + NESTING_PAD * 2)
  })

  it('contentW uses CARD_W as minimum even with 0 agents and 0 children', () => {
    const group = makeGroup({ id: 1, children: [] })
    const map = new Map<number, AgentRow[]>()
    const g = buildGroupLayout(group, 0, 0, map, 0)
    expect(g.w).toBe(CARD_W + NESTING_PAD * 2)
  })

  // Height with children
  it('group with 1 child: height includes childrenMaxH', () => {
    const childGroup = makeGroup({ id: 2, children: [] })
    const parentGroup = makeGroup({ id: 1, children: [childGroup] })
    const map = new Map<number, AgentRow[]>()
    const g = buildGroupLayout(parentGroup, 0, 0, map, 0)
    const childH = g.children[0].h
    // n=0 → agentsRowH=0
    const expectedH = NESTING_PAD + GROUP_HEADER_H + CHILD_V_GAP + 0 + childH + NESTING_PAD
    expect(g.h).toBe(expectedH)
  })

  it('group with 2 children: height uses Math.max of children heights', () => {
    const child1 = makeGroup({ id: 2, children: [] })
    const child2 = makeGroup({ id: 3, children: [] })
    // child2 gets agents so it's taller
    const parentGroup = makeGroup({ id: 1, children: [child1, child2] })
    const map = new Map([[3, [makeAgent({ id: 10 }), makeAgent({ id: 11 })]]])
    const g = buildGroupLayout(parentGroup, 0, 0, map, 0)
    const maxChildH = Math.max(g.children[0].h, g.children[1].h)
    const expectedH = NESTING_PAD + GROUP_HEADER_H + CHILD_V_GAP + 0 + maxChildH + NESTING_PAD
    expect(g.h).toBe(expectedH)
  })

  // Depth increment
  it('children get depth+1', () => {
    const childGroup = makeGroup({ id: 2, children: [] })
    const parentGroup = makeGroup({ id: 1, children: [childGroup] })
    const map = new Map<number, AgentRow[]>()
    const g = buildGroupLayout(parentGroup, 0, 0, map, 0)
    expect(g.depth).toBe(0)
    expect(g.children[0].depth).toBe(1)
  })

  it('nested children get depth+2', () => {
    const grandchild = makeGroup({ id: 3, children: [] })
    const child = makeGroup({ id: 2, children: [grandchild] })
    const parent = makeGroup({ id: 1, children: [child] })
    const map = new Map<number, AgentRow[]>()
    const g = buildGroupLayout(parent, 0, 0, map, 0)
    expect(g.children[0].depth).toBe(1)
    expect(g.children[0].children[0].depth).toBe(2)
  })
})

// ── flattenGroups ─────────────────────────────────────────────────────────────

describe('flattenGroups', () => {
  function makeLayoutGroup(key: string, children: LayoutGroup[] = []): LayoutGroup {
    return { key, label: key, x: 0, y: 0, w: 100, h: 100, depth: 0, agents: [], children }
  }

  it('returns empty array for empty input', () => {
    expect(flattenGroups([])).toHaveLength(0)
  })

  it('returns single group with no children', () => {
    const g = makeLayoutGroup('a')
    expect(flattenGroups([g])).toEqual([g])
  })

  it('returns parent before children', () => {
    const child = makeLayoutGroup('b')
    const parent = makeLayoutGroup('a', [child])
    const result = flattenGroups([parent])
    expect(result[0].key).toBe('a')
    expect(result[1].key).toBe('b')
  })

  it('flattens deeply nested groups in depth-first order', () => {
    const grandchild = makeLayoutGroup('c')
    const child = makeLayoutGroup('b', [grandchild])
    const parent = makeLayoutGroup('a', [child])
    const result = flattenGroups([parent])
    expect(result.map(g => g.key)).toEqual(['a', 'b', 'c'])
  })

  it('flattens multiple top-level groups', () => {
    const g1 = makeLayoutGroup('a')
    const g2 = makeLayoutGroup('b')
    const result = flattenGroups([g1, g2])
    expect(result.map(g => g.key)).toEqual(['a', 'b'])
  })

  it('total count matches all nodes', () => {
    const gc1 = makeLayoutGroup('c1')
    const gc2 = makeLayoutGroup('c2')
    const child = makeLayoutGroup('b', [gc1, gc2])
    const parent = makeLayoutGroup('a', [child])
    expect(flattenGroups([parent])).toHaveLength(4)
  })
})
