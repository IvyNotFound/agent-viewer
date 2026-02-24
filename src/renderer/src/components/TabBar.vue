<script setup lang="ts">
import { useTabsStore } from '@renderer/stores/tabs'
const store = useTabsStore()
</script>

<template>
  <div class="flex items-stretch gap-0.5 px-2 border-b border-zinc-700 bg-zinc-900 shrink-0 h-10">
    <button
      v-for="tab in store.tabs"
      :key="tab.id"
      :class="[
        'flex items-center gap-2 px-4 text-sm font-medium transition-all relative select-none rounded-t',
        store.activeTabId === tab.id
          ? 'text-zinc-100 bg-zinc-800 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-violet-400'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
      ]"
      @click="store.setActive(tab.id)"
    >
      <span class="text-base leading-none opacity-80">{{ tab.type === 'board' ? '⬡' : '⌨' }}</span>
      <span class="max-w-[140px] truncate">{{ tab.title }}</span>
      <span
        v-if="tab.type === 'terminal'"
        class="ml-0.5 flex items-center justify-center w-4 h-4 rounded opacity-40 hover:opacity-100 hover:text-red-400 hover:bg-zinc-700 transition-all text-xs"
        @click.stop="store.closeTab(tab.id)"
        title="Fermer"
      >✕</span>
    </button>

    <button
      class="ml-auto flex items-center gap-1.5 px-3 self-center text-sm text-zinc-400 hover:text-violet-300 hover:bg-zinc-800 rounded transition-all font-medium"
      style="height: 28px"
      @click="store.addTerminal()"
      title="Nouveau terminal WSL"
    >
      <span class="text-base leading-none">+</span>
      <span>WSL</span>
    </button>
  </div>
</template>
