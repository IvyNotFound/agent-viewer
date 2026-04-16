/**
 * Shared types for spawn strategies.
 *
 * @module spawn/types
 */
import type { ChildProcess } from 'child_process'
import type { CliAdapter, TokenCounts } from '../../shared/cli-types'
import type { WorktreeInfo } from '../worktree-manager'
import type { AgentCreateOpts } from '../agent-stream-registry'

/** Inputs forwarded to every spawn strategy. */
export interface SpawnInput {
  id: string
  adapter: CliAdapter
  validConvId: string | undefined
  opts: AgentCreateOpts
  worktreeInfo: WorktreeInfo | undefined
  spTempFile: string | undefined
  settingsTempFile: string | undefined
}

/** Output from a spawn strategy: the spawned process + optional script path to clean up. */
export interface SpawnOutput {
  proc: ChildProcess
  scriptTempFile: string | undefined
}

export type SpawnFn = (input: SpawnInput) => SpawnOutput

/**
 * Data stored per singleShotStdin agent (opencode, gemini) to allow re-spawning
 * on follow-up messages in the same StreamView tab (T1991).
 */
export interface SinglshotRespawnData {
  wcId: number
  spawnFn: SpawnFn
  worktreeInfo: WorktreeInfo | undefined
  originalOpts: AgentCreateOpts
  prevTokenAccum: TokenCounts
}
