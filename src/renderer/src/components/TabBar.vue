<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTabsStore } from '@renderer/stores/tabs'
import type { Tab } from '@renderer/stores/tabs'
import { agentFg, agentBg, agentHue } from '@renderer/utils/agentColor'

const store = useTabsStore()

const terminalTabs = computed(() => store.tabs.filter(t => t.type === 'terminal'))

// ── Drag & drop ──────────────────────────────────────────────────────────────
const draggedId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)

function onDragStart(e: DragEvent, tabId: string) {
  draggedId.value = tabId
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tabId)
  }
}

function onDragOver(e: DragEvent, tabId: string) {
  if (!draggedId.value || draggedId.value === tabId) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropTargetId.value = tabId
}

function onDrop(e: DragEvent, tabId: string) {
  e.preventDefault()
  if (!draggedId.value || draggedId.value === tabId) return
  store.reorderTab(draggedId.value, tabId)
  draggedId.value = null
  dropTargetId.value = null
}

function onDragEnd() {
  draggedId.value = null
  dropTargetId.value = null
}

// ── Styles dynamiques ────────────────────────────────────────────────────────
function tabStyle(tab: Tab): Record<string, string> {
  const isActive = store.activeTabId === tab.id
  if (!tab.agentName) {
    return isActive ? { color: '#f4f4f5', backgroundColor: '#27272a' } : {}
  }
  const h = agentHue(tab.agentName)
  if (isActive) {
    return {
      color: agentFg(tab.agentName),
      backgroundColor: agentBg(tab.agentName),
    }
  }
  // Inactif mais agent connu : teinte subtile
  return {
    color: `hsla(${h}, 65%, 65%, 0.65)`,
    backgroundColor: `hsla(${h}, 38%, 16%, 0.55)`,
  }
}

function indicatorStyle(tab: Tab): Record<string, string> {
  if (tab.agentName) return { backgroundColor: agentFg(tab.agentName) }
  return { backgroundColor: '#a78bfa' } // violet-400
}
</script>

<template>
  <div class="flex items-stretch border-b border-zinc-700 bg-zinc-900 shrink-0 h-10">

    <!-- Onglet Board (fixe, non déplaçable) -->
    <button
      :class="[
        'flex items-center gap-2 px-5 text-sm font-semibold transition-all relative select-none border-r border-zinc-800 shrink-0',
        store.activeTabId === 'board'
          ? 'text-zinc-100 bg-zinc-800'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
      ]"
      @click="store.setActive('board')"
    >
      <!-- Icône kanban -->
      <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 shrink-0">
        <rect x="1"  y="2" width="4" height="12" rx="1.5"/>
        <rect x="6"  y="2" width="4" height="8"  rx="1.5"/>
        <rect x="11" y="2" width="4" height="5"  rx="1.5"/>
      </svg>
      <span>Board</span>
      <!-- Indicateur actif -->
      <span
        v-if="store.activeTabId === 'board'"
        class="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-500"
      ></span>
    </button>

    <!-- Onglets terminaux (déplaçables) -->
    <div class="flex items-stretch gap-0.5 px-1.5 flex-1 min-w-0 overflow-x-auto">
      <button
        v-for="tab in terminalTabs"
        :key="tab.id"
        draggable="true"
        :class="[
          'relative flex items-center gap-2 px-3 text-sm font-medium transition-all select-none rounded-t shrink-0',
          store.activeTabId !== tab.id && !tab.agentName ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60' : '',
          draggedId === tab.id ? 'opacity-40' : '',
          dropTargetId === tab.id && draggedId !== tab.id ? 'ring-1 ring-inset ring-violet-500/50' : '',
          'cursor-grab active:cursor-grabbing',
        ]"
        :style="tabStyle(tab)"
        @click="store.setActive(tab.id)"
        @dragstart="onDragStart($event, tab.id)"
        @dragover="onDragOver($event, tab.id)"
        @dragleave="dropTargetId = null"
        @drop="onDrop($event, tab.id)"
        @dragend="onDragEnd"
      >
        <!-- Icône terminal >_ -->
        <span class="flex items-center justify-center w-5 h-5 rounded shrink-0 bg-black/25">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3">
            <polyline points="2,5 6.5,8 2,11"/>
            <line x1="8.5" y1="11" x2="14" y2="11"/>
          </svg>
        </span>
        <span class="max-w-[120px] truncate">{{ tab.title }}</span>
        <!-- Fermer -->
        <span
          class="ml-0.5 flex items-center justify-center w-4 h-4 rounded opacity-40 hover:opacity-100 hover:text-red-400 hover:bg-black/20 transition-all text-xs cursor-pointer"
          @click.stop="store.closeTab(tab.id)"
          title="Fermer"
        >✕</span>
        <!-- Indicateur actif -->
        <span
          v-if="store.activeTabId === tab.id"
          class="absolute bottom-0 left-0 right-0 h-[2px]"
          :style="indicatorStyle(tab)"
        ></span>
      </button>
    </div>

    <!-- Bouton + WSL -->
    <button
      class="flex items-center gap-1.5 px-3 self-center text-sm font-semibold text-violet-300 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 hover:border-violet-500/50 rounded transition-all mr-2 shrink-0 cursor-pointer"
      style="height: 28px"
      @click="store.addTerminal()"
      title="Nouveau terminal WSL"
    >
      <span class="text-base leading-none">+</span>
      <span>WSL</span>
    </button>
    <div class="w-3 shrink-0"></div>

  </div>
</template>
