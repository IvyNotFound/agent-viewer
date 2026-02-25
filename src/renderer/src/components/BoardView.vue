<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTasksStore } from '@renderer/stores/tasks'
import { agentFg, agentBg, agentBorder } from '@renderer/utils/agentColor'
import StatusColumn from './StatusColumn.vue'

const store = useTasksStore()

type BoardTab = 'backlog' | 'archive'
const activeTab = ref<BoardTab>('backlog')

const columns = [
  { key: 'a_faire' as const,  title: 'À faire',  accentClass: 'bg-amber-500' },
  { key: 'en_cours' as const, title: 'En cours', accentClass: 'bg-emerald-500' },
  { key: 'terminé' as const,  title: 'Terminé',  accentClass: 'bg-zinc-500' },
]

const activeAgentName = computed(() =>
  store.selectedAgentId !== null
    ? (store.agents.find(a => Number(a.id) === Number(store.selectedAgentId))?.name ?? null)
    : null
)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const archivedByAgent = computed(() => {
  const groups = new Map<string, typeof store.tasksByStatus.archivé>()
  for (const task of store.tasksByStatus.archivé) {
    const key = task.agent_name ?? '(non assigné)'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(task)
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
})
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
      <!-- Sub-tabs -->
      <div class="flex items-center gap-1">
        <button
          v-for="tab in (['backlog', 'archive'] as BoardTab[])"
          :key="tab"
          :class="[
            'px-3 py-1 text-xs font-medium rounded-md transition-colors',
            activeTab === tab
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
          ]"
          @click="activeTab = tab"
        >
          {{ tab === 'backlog' ? 'Backlog' : `Archive (${store.tasksByStatus.archivé.length})` }}
        </button>
      </div>

      <!-- Active filters -->
      <div class="flex items-center gap-2 flex-wrap">
        <span
          v-if="activeAgentName"
          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 font-mono"
        >
          {{ activeAgentName }}
          <button class="hover:text-white transition-colors" @click="store.selectedAgentId = null">✕</button>
        </span>
        <span
          v-if="store.selectedPerimetre"
          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border font-mono"
          :style="{ color: agentFg(store.selectedPerimetre), backgroundColor: agentBg(store.selectedPerimetre), borderColor: agentBorder(store.selectedPerimetre) }"
        >
          {{ store.selectedPerimetre }}
          <button class="hover:text-white transition-colors" @click="store.selectedPerimetre = null">✕</button>
        </span>
        <div v-if="store.error" class="text-xs text-red-400">{{ store.error }}</div>
      </div>
    </div>

    <!-- Board view: 3 colonnes -->
    <div v-if="activeTab === 'backlog'" class="flex-1 min-h-0 p-4">
      <div class="flex gap-3 h-full">
        <StatusColumn
          v-for="col in columns"
          :key="col.key"
          :title="col.title"
          :statut="col.key"
          :tasks="store.tasksByStatus[col.key]"
          :accent-class="col.accentClass"
        />
      </div>
    </div>

    <!-- Archive view -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto px-4 py-3">
      <div v-if="store.tasksByStatus.archivé.length === 0" class="flex items-center justify-center h-full">
        <p class="text-sm text-zinc-600 italic">Aucun ticket archivé</p>
      </div>
      <div v-else class="flex flex-col gap-4">
        <!-- Group by agent -->
        <div v-for="[agentName, tasks] in archivedByAgent" :key="agentName">
          <!-- Group header -->
          <div class="flex items-center gap-2 mb-2">
            <span
              class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono border"
              :style="agentName !== '(non assigné)'
                ? { color: agentFg(agentName), backgroundColor: agentBg(agentName), borderColor: agentBorder(agentName) }
                : { color: '#71717a', backgroundColor: '#18181b', borderColor: '#3f3f46' }"
            >{{ agentName }}</span>
            <span class="text-[10px] text-zinc-600 font-mono">{{ tasks.length }} ticket{{ tasks.length > 1 ? 's' : '' }}</span>
          </div>
          <!-- Tasks in group -->
          <div class="space-y-1.5">
            <button
              v-for="task in tasks"
              :key="task.id"
              class="w-full text-left px-4 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-lg transition-colors group"
              @click="store.openTask(task)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-zinc-300 group-hover:text-zinc-100 truncate transition-colors">{{ task.titre }}</p>
                  <span v-if="task.perimetre" class="text-[10px] font-mono text-zinc-600 mt-1 block">{{ task.perimetre }}</span>
                </div>
                <div class="shrink-0 text-right">
                  <span class="text-[10px] text-zinc-600 font-mono">{{ formatDate(task.updated_at) }}</span>
                  <p class="text-[10px] text-zinc-700 font-mono mt-0.5">#{{ task.id }}</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
