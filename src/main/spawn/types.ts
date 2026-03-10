/**
 * Shared types for spawn strategies.
 *
 * @module spawn/types
 */
import type { ChildProcess } from 'child_process'
import type { CliAdapter } from '../../shared/cli-types'
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
