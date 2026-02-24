<script setup lang="ts">
import type { Task } from '@renderer/types'
import AgentBadge from './AgentBadge.vue'
import { useTasksStore } from '@renderer/stores/tasks'

const props = defineProps<{ task: Task }>()
const store = useTasksStore()

const PERIMETRE_COLORS: Record<string, string> = {
  'front-vuejs': 'bg-sky-500/15 text-sky-300',
  'back-electron': 'bg-violet-500/15 text-violet-300',
  'back-python': 'bg-amber-500/15 text-amber-300',
  'back-node': 'bg-emerald-500/15 text-emerald-300',
}

function perimetreColor(p: string | null): string {
  return p ? (PERIMETRE_COLORS[p] ?? 'bg-zinc-700 text-zinc-300') : 'bg-zinc-700 text-zinc-300'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <div
    class="bg-zinc-800 border border-zinc-700 rounded-lg p-3 hover:border-zinc-600 transition-colors cursor-pointer"
    @click="store.openTask(task)"
  >
    <p class="text-sm text-zinc-100 font-medium leading-snug mb-2">{{ task.titre }}</p>

    <!-- Commentaire initial (tronqué à 3 lignes) -->
    <p
      v-if="task.commentaire"
      class="text-xs text-zinc-400 leading-relaxed mb-2 line-clamp-3 whitespace-pre-line"
    >{{ task.commentaire }}</p>

    <div class="flex flex-wrap gap-1 mb-2">
      <span
        v-if="task.perimetre"
        :class="['text-xs px-1.5 py-0.5 rounded font-mono', perimetreColor(task.perimetre)]"
      >{{ task.perimetre }}</span>
      <AgentBadge v-if="task.agent_name" :name="task.agent_name" :perimetre="task.agent_perimetre" />
    </div>

    <!-- Dates -->
    <div class="flex flex-col gap-0.5 mt-2 pt-2 border-t border-zinc-700/50">
      <p class="text-xs text-zinc-500">
        <span class="text-zinc-400">Créé</span> {{ formatDate(task.created_at) }}
      </p>
      <p class="text-xs text-zinc-500">
        <span class="text-zinc-400">Modifié</span> {{ formatDate(task.updated_at) }}
      </p>
    </div>
  </div>
</template>
