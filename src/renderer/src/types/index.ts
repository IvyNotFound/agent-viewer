export interface Agent {
  id: number
  name: string
  type: string
  perimetre: string | null
  created_at: string
  session_statut?: 'en_cours' | 'terminé' | 'bloqué' | null
}

export interface Task {
  id: number
  titre: string
  description: string | null
  statut: 'a_faire' | 'en_cours' | 'terminé' | 'validé'
  agent_assigne_id: number | null
  agent_name: string | null
  agent_perimetre: string | null
  perimetre: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
}

export interface Lock {
  id: number
  fichier: string
  agent_id: number
  agent_name: string
  created_at: string
  released_at: string | null
}

export interface Stats {
  a_faire: number
  en_cours: number
  terminé: number
  validé: number
}
