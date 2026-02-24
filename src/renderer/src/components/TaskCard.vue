<script setup lang="ts">
import type { Task } from '@renderer/types'
import AgentBadge from './AgentBadge.vue'

const props = defineProps<{ task: Task }>()

const PERIMETRE_COLORS: Record<string, string> = {
  'front-vuejs': 'bg-sky-500/15 text-sky-300',
  'back-electron': 'bg-violet-500/15 text-violet-300',
  'back-python': 'bg-amber-500/15 text-amber-300',
  'back-node': 'bg-emerald-500/15 text-emerald-300',
}

function perimetreColor(p: string | null): string {
  return p ? (PERIMETRE_COLORS[p] ?? 'bg-zinc-700 text-zinc-300') : 'bg-zinc-700 text-zinc-300'
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  return `il y a ${Math.floor(h / 24)}j`
}
</script>

<template>
  <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-3 hover:border-zinc-600 transition-colors cursor-default">
    <p class="text-sm text-zinc-100 font-medium leading-snug mb-2">{{ task.titre }}</p>

    <div class="flex flex-wrap gap-1 mb-2">
      <span
        v-if="task.perimetre"
        :class="['text-xs px-1.5 py-0.5 rounded font-mono', perimetreColor(task.perimetre)]"
      >{{ task.perimetre }}</span>
      <AgentBadge v-if="task.agent_name" :name="task.agent_name" :perimetre="task.agent_perimetre" />
    </div>

    <p class="text-xs text-zinc-500">{{ relativeTime(task.updated_at) }}</p>
  </div>
</template>
