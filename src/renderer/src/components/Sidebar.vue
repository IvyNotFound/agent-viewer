<script setup lang="ts">
import { computed } from 'vue'
import { useTasksStore } from '@renderer/stores/tasks'
import { agentFg, agentBg, agentBorder } from '@renderer/utils/agentColor'

const store = useTasksStore()

const lastRefreshStr = computed(() => {
  if (!store.lastRefresh) return '—'
  return store.lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
})

const projectName = computed(() => {
  if (!store.projectPath) return null
  return store.projectPath.split(/[\\/]/).filter(Boolean).pop() ?? store.projectPath
})

function isAgentSelected(id: number | string): boolean {
  return store.selectedAgentId !== null && Number(store.selectedAgentId) === Number(id)
}

function taskCountFor(perimetre: string): number {
  return store.tasks.filter(t => t.perimetre === perimetre).length
}

function isLockOld(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > 30 * 60 * 1000
}
</script>

<template>
  <aside class="w-72 shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col overflow-hidden">
    <!-- DB selector -->
    <div class="px-4 py-3 border-b border-zinc-800">
      <button
        class="w-full text-left text-sm text-zinc-500 hover:text-zinc-300 transition-colors truncate"
        @click="store.selectProject()"
        :title="store.projectPath ?? 'Sélectionner un projet'"
      >
        <span class="text-zinc-600">Projet :</span>
        {{ projectName ?? 'Sélectionner…' }}
        <span v-if="store.dbPath" class="block text-xs text-zinc-600 truncate mt-0.5" :title="store.dbPath">
          {{ store.dbPath.split(/[\\/]/).slice(-2).join('/') }}
        </span>
      </button>
    </div>

    <!-- Error -->
    <div v-if="store.error" class="px-3 py-2 bg-red-950/40 border-b border-red-800/50">
      <p class="text-xs text-red-400 break-all">{{ store.error }}</p>
    </div>

    <!-- Stats -->
    <div class="px-4 py-3 border-b border-zinc-800">
      <p class="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Stats</p>
      <div class="grid grid-cols-2 gap-2">
        <div class="bg-zinc-800 rounded-lg px-3 py-2">
          <p class="text-base font-semibold text-amber-400 font-mono">{{ store.stats.a_faire }}</p>
          <p class="text-xs text-zinc-500">À faire</p>
        </div>
        <div class="bg-zinc-800 rounded-lg px-3 py-2">
          <p class="text-base font-semibold text-emerald-400 font-mono">{{ store.stats.en_cours }}</p>
          <p class="text-xs text-zinc-500">En cours</p>
        </div>
        <div class="bg-zinc-800 rounded-lg px-3 py-2">
          <p class="text-base font-semibold text-zinc-400 font-mono">{{ store.stats.terminé }}</p>
          <p class="text-xs text-zinc-500">Terminé</p>
        </div>
        <div class="bg-zinc-800 rounded-lg px-3 py-2">
          <p class="text-base font-semibold text-violet-400 font-mono">{{ store.stats.validé }}</p>
          <p class="text-xs text-zinc-500">Validé</p>
        </div>
      </div>
    </div>

    <!-- Périmètres -->
    <div class="px-4 py-3 border-b border-zinc-800">
      <div class="flex items-center justify-between mb-3">
        <p class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Périmètres</p>
        <button
          v-if="store.selectedPerimetre !== null"
          class="text-xs text-violet-400 hover:text-violet-300 transition-colors"
          @click="store.selectedPerimetre = null"
        >reset</button>
      </div>
      <div class="flex flex-col gap-1">
        <button
          v-for="p in store.perimetres"
          :key="p"
          :class="[
            'flex items-center justify-between px-2 py-1.5 rounded-md text-left transition-colors cursor-pointer',
            store.selectedPerimetre === p ? 'ring-1 ring-zinc-600' : 'hover:bg-zinc-900'
          ]"
          :style="store.selectedPerimetre === p ? { backgroundColor: agentBg(p), borderColor: agentBorder(p) } : {}"
          @click="store.togglePerimetreFilter(p)"
        >
          <span
            class="text-sm font-mono truncate"
            :style="{ color: agentFg(p) }"
          >{{ p }}</span>
          <span
            class="text-xs font-mono ml-2 px-1.5 py-0.5 rounded shrink-0"
            :style="{ color: agentFg(p), backgroundColor: agentBg(p) }"
          >{{ taskCountFor(p) }}</span>
        </button>
        <div v-if="store.perimetres.length === 0" class="text-sm text-zinc-600">Aucun périmètre</div>
      </div>
    </div>

    <!-- Agents -->
    <div class="px-4 py-3 border-b border-zinc-800 flex-1 overflow-y-auto min-h-0">
      <div class="flex items-center justify-between mb-3">
        <p class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Agents</p>
        <button
          v-if="store.selectedAgentId !== null"
          class="text-xs text-violet-400 hover:text-violet-300 transition-colors"
          @click="store.selectedAgentId = null"
        >reset</button>
      </div>
      <div class="space-y-0.5">
        <button
          v-for="agent in store.agents"
          :key="agent.id"
          :class="[
            'w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors cursor-pointer',
            isAgentSelected(agent.id) ? 'bg-zinc-800 ring-1 ring-zinc-600' : 'hover:bg-zinc-900'
          ]"
          @click="store.toggleAgentFilter(agent.id)"
        >
          <span class="relative shrink-0 flex items-center justify-center w-2.5 h-2.5">
            <span
              v-if="agent.session_statut === 'en_cours'"
              class="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping"
              :style="{ backgroundColor: agentFg(agent.name) }"
            ></span>
            <span
              class="relative w-2.5 h-2.5 rounded-full"
              :style="{ backgroundColor: agentFg(agent.name) }"
            ></span>
          </span>
          <span
            :class="['text-sm truncate font-mono', isAgentSelected(agent.id) ? 'text-zinc-100' : 'text-zinc-400']"
          >{{ agent.name }}</span>
        </button>
        <div v-if="store.agents.length === 0" class="text-sm text-zinc-600 px-2">Aucun agent</div>
      </div>
    </div>

    <!-- Locks actifs -->
    <div v-if="store.locks.length > 0" class="px-4 py-3 border-t border-zinc-800">
      <p class="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Locks actifs</p>
      <div class="space-y-1">
        <div
          v-for="lock in store.locks"
          :key="lock.id"
          :class="['text-sm truncate font-mono', isLockOld(lock.created_at) ? 'text-red-400' : 'text-zinc-400']"
          :title="lock.fichier"
        >
          {{ lock.fichier.split('/').pop() }}
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="px-4 py-2 border-t border-zinc-800">
      <p class="text-xs text-zinc-600">MAJ {{ lastRefreshStr }}</p>
    </div>
  </aside>
</template>
