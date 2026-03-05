/**
 * IPC handlers — Agent & session management (barrel)
 *
 * Re-exports and registers all agent-related IPC handlers.
 * Sub-modules handle: CRUD, groups, sessions/tokens, tasks/perimetres.
 *
 * @module ipc-agents
 */

export { STANDARD_AGENT_SUFFIX } from './ipc-agent-crud'
import { registerAgentCrudHandlers } from './ipc-agent-crud'
import { registerAgentGroupHandlers } from './ipc-agent-groups'
import { registerAgentSessionHandlers } from './ipc-agent-sessions'
import { registerAgentTaskHandlers } from './ipc-agent-tasks'

/** Register all agent & session IPC handlers. */
export function registerAgentHandlers(): void {
  registerAgentCrudHandlers()
  registerAgentGroupHandlers()
  registerAgentSessionHandlers()
  registerAgentTaskHandlers()
}
