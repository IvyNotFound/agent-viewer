<script setup lang="ts">
import { computed } from 'vue'
import { useTasksStore } from '@renderer/stores/tasks'
import { agentFg, agentBg, agentBorder } from '@renderer/utils/agentColor'
import StatusColumn from './StatusColumn.vue'

const store = useTasksStore()

const columns = [
  { key: 'a_faire' as const,  title: 'À faire',  accentClass: 'bg-amber-500' },
  { key: 'en_cours' as const, title: 'En cours', accentClass: 'bg-emerald-500' },
  { key: 'terminé' as const,  title: 'Terminé',  accentClass: 'bg-zinc-500' },
  { key: 'validé' as const,   title: 'Validé',   accentClass: 'bg-violet-500' },
]

const activeAgentName = computed(() =>
  store.selectedAgentId !== null
    ? (store.agents.find(a => Number(a.id) === Number(store.selectedAgentId))?.name ?? null)
    : null
)
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
      <div class="flex items-center gap-2 flex-wrap">
        <h1 class="text-sm font-semibold text-zinc-200">Board des tâches</h1>
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
      </div>
      <div class="flex items-center gap-3">
        <div v-if="store.loading" class="flex items-center gap-1.5">
          <div class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"></div>
          <span class="text-xs text-zinc-500">Chargement…</span>
        </div>
        <div v-else-if="store.error" class="text-xs text-red-400">{{ store.error }}</div>
      </div>
    </div>

    <!-- Columns -->
    <div class="flex-1 min-h-0 p-4">
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
  </div>
</template>
