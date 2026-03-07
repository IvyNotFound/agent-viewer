/**
 * Git worktree manager for agent session isolation.
 *
 * Creates an isolated git worktree before spawning a CLI session and removes it
 * when the session ends. Works for all CLI adapters (Claude, Codex, Gemini, etc.)
 * without adapter-specific changes.
 *
 * Worktree location: <repoRoot>/../agent-worktrees/<sessionId>
 * Branch name: agent/<sessionId>
 *
 * @module worktree-manager
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execFileAsync = promisify(execFile)

export interface WorktreeInfo {
  /** Absolute path to the created worktree directory. */
  path: string
  /** Name of the branch created for this worktree. */
  branch: string
}

/**
 * Create an isolated git worktree for an agent session.
 *
 * Branch: agent/<sessionId>
 * Path: <repoRoot>/../agent-worktrees/<sessionId>
 *
 * If the branch already exists (session restart), falls back to attaching
 * the existing branch without -b.
 *
 * @throws if git is unavailable or the repo root is invalid
 */
export async function createWorktree(repoRoot: string, sessionId: number): Promise<WorktreeInfo> {
  const branch = `agent/${sessionId}`
  const wtPath = path.resolve(repoRoot, '..', 'agent-worktrees', String(sessionId))

  try {
    await execFileAsync('git', ['-C', repoRoot, 'worktree', 'add', '-b', branch, wtPath, 'HEAD'])
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Branch already exists (session restart) — attach without -b
    if (msg.includes('already exists') || msg.includes('already linked') || msg.includes('already checked out')) {
      await execFileAsync('git', ['-C', repoRoot, 'worktree', 'add', wtPath, branch])
    } else {
      throw err
    }
  }

  return { path: wtPath, branch }
}

/**
 * Remove the worktree and its branch after a session ends.
 * Errors are swallowed — removal is best-effort.
 */
export async function removeWorktree(repoRoot: string, sessionId: number): Promise<void> {
  const branch = `agent/${sessionId}`
  const wtPath = path.resolve(repoRoot, '..', 'agent-worktrees', String(sessionId))

  try {
    await execFileAsync('git', ['-C', repoRoot, 'worktree', 'remove', '--force', wtPath])
  } catch { /* already removed or missing — ignore */ }

  try {
    await execFileAsync('git', ['-C', repoRoot, 'branch', '-D', branch])
  } catch { /* already deleted or missing — ignore */ }
}

/**
 * Prune stale worktree administrative files.
 * Call at app startup to clean up orphaned worktrees from crashed sessions.
 */
export async function pruneWorktrees(repoRoot: string): Promise<void> {
  await execFileAsync('git', ['-C', repoRoot, 'worktree', 'prune'])
}
