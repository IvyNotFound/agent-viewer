import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildTree, MAX_TREE_DEPTH } from '@renderer/utils/taskTree'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    titre: 'Fix login bug',
    description: 'Users cannot login with special chars',
    statut: 'todo',
    perimetre: 'front-vuejs',
    effort: 2,
    agent_assigne_id: 1,
    agent_name: 'dev-front',
    agent_createur_id: null,
    agent_createur_name: null,
    agent_perimetre: null,
    parent_task_id: null,
    session_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    started_at: null,
    completed_at: null,
    validated_at: null,
    ...overrides,
  } as Task
}

// ── StatusColumn ──────────────────────────────────────────────────────────────

describe('buildTree', () => {
  it('returns flat tasks (no parents) as roots', () => {
    const tasks = [makeTask({ id: 1 }), makeTask({ id: 2 }), makeTask({ id: 3 })]
    const roots = buildTree(tasks)
    expect(roots).toHaveLength(3)
    expect(roots.every(r => r.children.length === 0)).toBe(true)
  })

  it('nests a child under its parent', () => {
    const tasks = [
      makeTask({ id: 1, parent_task_id: null }),
      makeTask({ id: 2, parent_task_id: 1 }),
    ]
    const roots = buildTree(tasks)
    expect(roots).toHaveLength(1)
    expect(roots[0].id).toBe(1)
    expect(roots[0].children).toHaveLength(1)
    expect(roots[0].children[0].id).toBe(2)
  })

  it('treats tasks with unknown parent_task_id as roots', () => {
    const tasks = [makeTask({ id: 1, parent_task_id: 999 })]
    const roots = buildTree(tasks)
    expect(roots).toHaveLength(1)
    expect(roots[0].id).toBe(1)
  })

  it('guards against direct cycle (A → B → A)', () => {
    const tasks = [
      makeTask({ id: 1, parent_task_id: 2 }),
      makeTask({ id: 2, parent_task_id: 1 }),
    ]
    // Should not throw and result must be finite
    const roots = buildTree(tasks)
    expect(roots.length).toBeGreaterThan(0)
    // Neither node should appear as a child of the other AND as a root simultaneously
    const allIds = roots.flatMap(r => [r.id, ...r.children.map(c => c.id)])
    const uniqueIds = new Set(allIds)
    expect(uniqueIds.size).toBe(allIds.length) // no duplicates
  })

  it('promotes nodes beyond MAX_TREE_DEPTH to roots', () => {
    // Build a chain of MAX_TREE_DEPTH + 1 nodes
    const tasks = Array.from({ length: MAX_TREE_DEPTH + 2 }, (_, i) =>
      makeTask({ id: i + 1, parent_task_id: i === 0 ? null : i })
    )
    const roots = buildTree(tasks)
    // The deepest node(s) should be promoted to root since they exceed MAX_TREE_DEPTH
    const deepNode = tasks[MAX_TREE_DEPTH + 1]
    const promotedRoot = roots.find(r => r.id === deepNode.id)
    expect(promotedRoot).toBeDefined()
  })

  it('assigns correct depth values', () => {
    const tasks = [
      makeTask({ id: 1, parent_task_id: null }),
      makeTask({ id: 2, parent_task_id: 1 }),
      makeTask({ id: 3, parent_task_id: 2 }),
    ]
    const roots = buildTree(tasks)
    expect(roots[0].depth).toBe(0)
    expect(roots[0].children[0].depth).toBe(1)
    expect(roots[0].children[0].children[0].depth).toBe(2)
  })

  it('handles empty array', () => {
    expect(buildTree([])).toEqual([])
  })

  it('sorts children by id', () => {
    const tasks = [
      makeTask({ id: 1, parent_task_id: null }),
      makeTask({ id: 5, parent_task_id: 1 }),
      makeTask({ id: 3, parent_task_id: 1 }),
      makeTask({ id: 4, parent_task_id: 1 }),
    ]
    const roots = buildTree(tasks)
    const childIds = roots[0].children.map(c => c.id)
    expect(childIds).toEqual([3, 4, 5])
  })
})
