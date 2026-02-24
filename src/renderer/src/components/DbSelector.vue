<script setup lang="ts">
import { useTasksStore } from '@renderer/stores/tasks'
const store = useTasksStore()
</script>

<template>
  <div class="h-full flex items-center justify-center">
    <div class="text-center space-y-4 max-w-sm px-6">
      <div class="w-12 h-12 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center mx-auto">
        <span class="text-violet-400 text-xl">⬡</span>
      </div>
      <div>
        <h2 class="text-lg font-semibold text-zinc-100 mb-1">agent-viewer</h2>
        <p class="text-sm text-zinc-500">
          Sélectionne un répertoire de projet — l'outil trouvera automatiquement
          la base de données dans <code class="text-zinc-400 bg-zinc-800 px-1 rounded text-xs">.claude/</code>.
        </p>
      </div>
      <button
        class="bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors w-full"
        @click="store.selectProject()"
      >
        Ouvrir un projet
      </button>
      <p v-if="store.error" class="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded px-3 py-2">
        {{ store.error }}
      </p>
    </div>
  </div>
</template>
