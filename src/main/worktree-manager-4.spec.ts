/**
 * Targeted tests to kill remaining surviving mutants in worktree-manager.ts (T1320).
 *
 * Focuses on:
 * - LogicalOperator L103: worktreeLine && branchLine (AND must not become OR)
 * - err reject path L95: reject called on git error in removeWorktreeByPath
 * - createWorktree idempotence when "already exists" in error message
 * - removeWorktree session scenarios (via pruneOrphanedWorktrees)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'

// ── child_process mock ────────────────────────────────────────────────────────

const mockExecFile = vi.hoisted(() => vi.fn())

vi.mock('child_process', () => ({
  default: { execFile: mockExecFile },
  execFile: mockExecFile,
}))

// ── db mock ───────────────────────────────────────────────────────────────────

const mockQueryLive = vi.hoisted(() => vi.fn())

vi.mock('./db', () => ({
  queryLive: mockQueryLive,
}))

import { removeWorktreeByPath, removeWorktree, createWorktree, pruneOrphanedWorktrees } from './worktree-manager'

type Cb = (err: Error | null, stdout?: string, stderr?: string) => void

const REPO = '/fake/base-repo'

// ── LogicalOperator L103: worktreeLine && branchLine ─────────────────────────
// The mutation worktreeLine && branchLine → worktreeLine || branchLine would
// match blocks where ONLY a branchLine is present (no worktreeLine).
// We verify that such a block does NOT trigger branch deletion.

describe('removeWorktreeByPath — LogicalOperator L103 (AND not OR)', () => {
  const TARGET = path.resolve('/fake/target')

  beforeEach(() => vi.clearAllMocks())

  it('does NOT detect when only branchLine is present (no worktreeLine in block)', async () => {
    // Block has a branch line but no worktree line → should NOT match even if path would match
    const output = [
      // First block: only branchLine, no worktreeLine
      'HEAD abc123',
      'branch refs/heads/agent/orphan-branch',
      '',
      // Second block: real worktree, different path
      `worktree /other/path`,
      'HEAD def456',
      'branch refs/heads/main',
      '',
    ].join('\n')

    let n = 0
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Cb) => {
      n++
      if (n === 1) cb(null, output) // list --porcelain
      else cb(null)
    })

    await removeWorktreeByPath(REPO, TARGET)

    // No branch found → only list + worktree remove (no branch -D)
    expect(mockExecFile).toHaveBeenCalledTimes(2)
    const [, removeArgs] = mockExecFile.mock.calls[1] as [string, string[], Cb]
    // Should NOT attempt to delete 'agent/orphan-branch'
    expect(removeArgs).not.toContain('agent/orphan-branch')
  })

  it('detects when BOTH worktreeLine AND branchLine are present for target', async () => {
    // Both present → should match and delete the correct branch
    const output = [
      `worktree ${TARGET}`,
      'HEAD abc123',
      'branch refs/heads/agent/correct-branch',
      '',
    ].join('\n')

    let n = 0
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Cb) => {
      n++
      if (n === 1) cb(null, output)
      else cb(null)
    })

    await removeWorktreeByPath(REPO, TARGET)

    // list + worktree remove + branch -D
    expect(mockExecFile).toHaveBeenCalledTimes(3)
    const [, branchArgs] = mockExecFile.mock.calls[2] as [string, string[], Cb]
    expect(branchArgs).toContain('agent/correct-branch')
  })

  it('does NOT set branch from non-target block with only branchLine when target block also exists', async () => {
    // A block with no worktreeLine but has branchLine should not "steal" the branch name
    // With OR mutation, the first block's branch would be used incorrectly
    const output = [
      // Block 1: only branch, no worktree line (no path match possible)
      'HEAD abc',
      'branch refs/heads/agent/wrong-branch',
      '',
      // Block 2: actual target
      `worktree ${TARGET}`,
      'HEAD def',
      'branch refs/heads/agent/right-branch',
      '',
    ].join('\n')

    let n = 0
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Cb) => {
      n++
      if (n === 1) cb(null, output)
      else cb(null)
    })

    await removeWorktreeByPath(REPO, TARGET)

    // Should delete the right branch, not the wrong one
    expect(mockExecFile).toHaveBeenCalledTimes(3)
    const [, branchArgs] = mockExecFile.mock.calls[2] as [string, string[], Cb]
    expect(branchArgs).toContain('agent/right-branch')
    expect(branchArgs).not.toContain('agent/wrong-branch')
  })

  it('does NOT match non-target worktreeLine even when branchLine present (path check in AND)', async () => {
    // Block has both worktreeLine and branchLine, but path doesn't match target
    // AND ensures path check still applies; OR would bypass path check
    const output = [
      `worktree /completely/different/path`,
      'HEAD abc',
      'branch refs/heads/agent/foreign-branch',
      '',
      `worktree ${TARGET}`,
      'HEAD def',
      'branch refs/heads/agent/target-branch',
      '',
    ].join('\n')

    let n = 0
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Cb) => {
      n++
      if (n === 1) cb(null, output)
      else cb(null)
    })

    await removeWorktreeByPath(REPO, TARGET)

    expect(mockExecFile).toHaveBeenCalledTimes(3)
    const [, branchArgs] = mockExecFile.mock.calls[2] as [string, string[], Cb]
    expect(branchArgs).toContain('agent/target-branch')
    expect(branchArgs).not.toContain('agent/foreign-branch')
  })
})

// ── err reject path L95: Promise reject on execFile error ────────────────────

describe('removeWorktreeByPath — err reject path L95', () => {
  const TARGET = path.resolve('/fake/target')

  beforeEach(() => vi.clearAllMocks())

  it('swallows the error and continues when git list fails with an Error object', async () => {
    let n = 0
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Cb) => {
      n++
      if (n === 1) {
        // Trigger the reject path explicitly — cb called with Error
        cb(new Error('fatal: not a git repository'))
      } else {
        cb(null)
      }
    })

    // Should NOT throw; error in the list call is caught by the outer try/catch
    await expect(removeWorktreeByPath(REPO, TARGET)).resolves.toBeUndefined()

    // list (fails) + worktree remove (still called)
    expect(mockExecFile).toHaveBeenCalledTimes(2)
  })

  it('resolve path is called (not reject) when git list succeeds with empty stdout', async () => {
    let n = 0
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Cb) => {
      n++
      if (n === 1) cb(null, '', '') // resolve path with empty output
      else cb(null)
    })

    await expect(removeWorktreeByPath(REPO, TARGET)).resolves.toBeUndefined()
    // list + worktree remove (no branch -D — no match in empty output)
    expect(mockExecFile).toHaveBeenCalledTimes(2)
  })
})

// ── createWorktree — "already exists" idempotence ────────────────────────────

describe('createWorktree — "already exists" path idempotence', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is idempotent when error message is exactly "already exists"', async () => {
    let n = 0
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Cb) => {
      n++
      if (n === 1) cb(new Error('already exists'))
      else cb(null)
    })

    const result = await createWorktree(REPO, 42)
    expect(result).toEqual({
      path: path.resolve(REPO, '..', 'agent-worktrees', '42'),
      branch: 'agent/42',
    })
    expect(mockExecFile).toHaveBeenCalledTimes(2)
    // Second call must not have -b
    const [, secondArgs] = mockExecFile.mock.calls[1] as [string, string[], Cb]
    expect(secondArgs).not.toContain('-b')
  })
})

// ── removeWorktree — session scenarios (via pruneOrphanedWorktrees) ──────────

describe('pruneOrphanedWorktrees — removeWorktree with and without session', () => {
  const DB_PATH = '/fake/db'

  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryLive.mockResolvedValue([])
  })

  it('calls removeWorktree (worktree remove + branch -D) when session is present and ended', async () => {
    const output = [
      'worktree /fake/agent-worktrees/300',
      'HEAD abc',
      'branch refs/heads/agent/300',
      '',
    ].join('\n')
    // Session present + ended
    mockQueryLive.mockResolvedValueOnce([{ ended_at: '2025-01-01 10:00:00', status: 'completed' }])
    let n = 0
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Cb) => {
      n++
      if (n === 1) cb(null, output)
      else cb(null)
    })

    await pruneOrphanedWorktrees(REPO, DB_PATH)

    // list + worktree remove + branch -D + prune
    expect(mockExecFile).toHaveBeenCalledTimes(4)
    expect(mockQueryLive).toHaveBeenCalledWith(DB_PATH, expect.any(String), [300])
  })

  it('calls removeWorktree when session is absent from DB (orphaned)', async () => {
    const output = [
      'worktree /fake/agent-worktrees/400',
      'HEAD abc',
      'branch refs/heads/agent/400',
      '',
    ].join('\n')
    // Session absent
    mockQueryLive.mockResolvedValueOnce([])
    let n = 0
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Cb) => {
      n++
      if (n === 1) cb(null, output)
      else cb(null)
    })

    await pruneOrphanedWorktrees(REPO, DB_PATH)

    // list + worktree remove + branch -D + prune
    expect(mockExecFile).toHaveBeenCalledTimes(4)
  })

  it('does NOT call removeWorktree when session is active (no crash)', async () => {
    const output = [
      'worktree /fake/agent-worktrees/500',
      'HEAD abc',
      'branch refs/heads/agent/500',
      '',
    ].join('\n')
    // Active session
    mockQueryLive.mockResolvedValueOnce([{ ended_at: null, status: 'started' }])
    let n = 0
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: Cb) => {
      n++
      if (n === 1) cb(null, output)
      else cb(null)
    })

    await pruneOrphanedWorktrees(REPO, DB_PATH)

    // list + prune only (no removeWorktree)
    expect(mockExecFile).toHaveBeenCalledTimes(2)
  })
})
