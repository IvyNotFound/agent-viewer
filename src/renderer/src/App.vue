<script setup lang="ts">
import { useTasksStore } from '@renderer/stores/tasks'
import { useTabsStore } from '@renderer/stores/tabs'
import TitleBar from '@renderer/components/TitleBar.vue'
import Sidebar from '@renderer/components/Sidebar.vue'
import BoardView from '@renderer/components/BoardView.vue'
import DbSelector from '@renderer/components/DbSelector.vue'
import TabBar from '@renderer/components/TabBar.vue'
import TerminalView from '@renderer/components/TerminalView.vue'

const store = useTasksStore()
const tabsStore = useTabsStore()
</script>

<template>
  <div class="flex flex-col h-screen bg-zinc-900 text-zinc-100 select-none">
    <TitleBar />
    <div class="flex flex-1 overflow-hidden">
      <Sidebar />
      <main class="flex-1 flex flex-col overflow-hidden">
        <TabBar />
        <!-- Board tab -->
        <template v-if="tabsStore.activeTab.type === 'board'">
          <DbSelector v-if="!store.dbPath" />
          <BoardView v-else />
        </template>
        <!-- Terminal tabs (keep mounted to preserve session, hide inactive) -->
        <template v-for="tab in tabsStore.tabs.filter(t => t.type === 'terminal')" :key="tab.id">
          <div
            class="flex-1 overflow-hidden"
            :style="{ display: tabsStore.activeTabId === tab.id ? 'flex' : 'none' }"
          >
            <TerminalView :tab-id="tab.id" class="flex-1" />
          </div>
        </template>
      </main>
    </div>
  </div>
</template>
