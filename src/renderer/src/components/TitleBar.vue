<script setup lang="ts">
const api = window.electronAPI
</script>

<template>
  <div
    class="flex items-center justify-between h-9 bg-zinc-950 px-4 shrink-0"
    style="-webkit-app-region: drag"
  >
    <div class="flex items-center gap-2">
      <div class="w-2 h-2 rounded-full bg-violet-500"></div>
      <span class="text-xs font-semibold text-zinc-400 tracking-widest uppercase">agent-viewer</span>
    </div>
    <div class="flex items-center gap-1" style="-webkit-app-region: no-drag">
      <button
        class="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors text-xs"
        @click="api.windowMinimize()"
      >−</button>
      <button
        class="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors text-xs"
        @click="api.windowMaximize()"
      >□</button>
      <button
        class="w-7 h-7 flex items-center justify-center rounded hover:bg-red-600 text-zinc-500 hover:text-white transition-colors text-xs"
        @click="api.windowClose()"
      >✕</button>
    </div>
  </div>
</template>
