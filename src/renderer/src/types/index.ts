export interface Agent {
  id: number
  name: string
  type: string
  perimetre: string | null
  system_prompt: string | null
  system_prompt_suffix: string | null
  thinking_mode: 'auto' | 'disabled' | null
  allowed_tools: string | null
  created_at: string
  session_statut?: 'en_cours' | 'terminé' | 'bloqué' | null
  session_started_at?: string | null
  last_log_at?: string | null
}

/** Task statut values (English, as stored in DB from v0.4.0+). */
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'archived'

/** Task priority values. */
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical'

export interface Task {
  id: number
  titre: string
  description: string | null
  statut: TaskStatus
  agent_assigne_id: number | null
  agent_createur_id: number | null
  agent_valideur_id: number | null
  agent_name: string | null
  agent_createur_name: string | null
  agent_perimetre: string | null
  parent_task_id: number | null
  session_id: number | null
  perimetre: string | null
  effort: 1 | 2 | 3 | null
  priority: TaskPriority
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
  validated_at: string | null
}

export interface TaskComment {
  id: number
  task_id: number
  agent_id: number | null
  agent_name: string | null
  contenu: string
  created_at: string
}

export interface Lock {
  id: number
  fichier: string
  agent_id: number
  agent_name: string
  session_id: number | null
  created_at: string
  released_at: string | null
}

export interface Stats {
  todo: number
  in_progress: number
  done: number
  archived: number
}

export interface Perimetre {
  id: number
  name: string
  dossier: string | null
  techno: string | null
  description: string | null
  actif: number
}

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[]
}

/**
 * A Claude Code installation detected in a WSL distro.
 * Used by LaunchSessionModal to let the user pick which environment to launch Claude in.
 */
export interface ClaudeInstance {
  /** WSL distro name (e.g. "Ubuntu-24.04") */
  distro: string
  /** Claude Code version string (e.g. "2.1.58") */
  version: string
  /** Whether this is the default WSL distro */
  isDefault: boolean
  /** Wrapper scripts in ~/bin/ matching claude(-[a-z0-9-]+)? */
  profiles: string[]
}

export interface AgentLog {
  id: number
  session_id: number
  agent_id: number
  agent_name: string | null
  agent_type: string | null
  niveau: 'info' | 'warn' | 'error' | 'debug'
  action: string
  detail: string | null
  fichiers: string | null
  created_at: string
}
