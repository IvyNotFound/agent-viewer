<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Tab } from '@renderer/stores/tabs'
import { agentFg } from '@renderer/utils/agentColor'
import { useConfirmDialog } from '@renderer/composables/useConfirmDialog'
import { useTabBarGroups } from '@renderer/composables/useTabBarGroups'
import ContextMenu from './ContextMenu.vue'
import type { ContextMenuItem } from './ContextMenu.vue'

const { t } = useI18n()
const { confirm } = useConfirmDialog()

const scrollContainer = ref<HTMLDivElement | null>(null)

const {
  store, terminalTabs, fileTabs,
  groupedTerminalTabs,
  toggleGroup, isGroupCollapsed, isGroupActive, activateAgentGroup,
  tabStyleMap, agentTabStyleMap, indicatorStyleMap, subTabLabel,
} = useTabBarGroups(scrollContainer)

async function openWslTerminal(): Promise<void> {
  await window.electronAPI.openWslTerminal()
}

// ── Scroll state ─────────────────────────────────────────────────────────────
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

function updateScrollState() {
  const el = scrollContainer.value
  if (!el) return
  canScrollLeft.value = el.scrollLeft > 1
  canScrollRight.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 1
}

function scrollBy(delta: number) {
  scrollContainer.value?.scrollBy({ left: delta, behavior: 'smooth' })
}

function onWheel(e: WheelEvent) {
  if (!scrollContainer.value) return
  e.preventDefault()
  scrollContainer.value.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX
}

let resizeObs: ResizeObserver | null = null
onMounted(() => {
  nextTick(updateScrollState)
  if (scrollContainer.value) {
    resizeObs = new ResizeObserver(updateScrollState)
    resizeObs.observe(scrollContainer.value)
  }
})
onUnmounted(() => { resizeObs?.disconnect() })
watch(() => [...terminalTabs.value, ...fileTabs.value].map(t => t.id).join(), () => nextTick(updateScrollState))

async function handleCloseTab(tab: Tab): Promise<void> {
  if (tab.type === 'file' && tab.dirty) {
    const ok = await confirm({
      title: t('tabBar.closeFileTitle'),
      message: t('tabBar.closeFileMessage', { title: tab.title }),
      detail: t('tabBar.closeFileDetail'),
      type: 'warning',
      confirmLabel: t('tabBar.closeFileConfirm'),
    })
    if (!ok) return
  }
  if (tab.type === 'terminal' && tab.streamId) {
    const ok = await confirm({
      title: t('tabBar.closeTerminalTitle'),
      message: t('tabBar.closeTerminalMessage'),
      type: 'danger',
      confirmLabel: t('tabBar.closeTerminalConfirm'),
    })
    if (!ok) return
  }
  store.closeTab(tab.id)
}

function onMiddleClick(e: MouseEvent, tab: Tab) {
  if (e.button === 1) {
    e.preventDefault()
    handleCloseTab(tab)
  }
}

// ── Context menu ─────────────────────────────────────────────────────────────
const contextMenu = ref<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

function openGroupMenu(event: MouseEvent, group: { agentName: string | null; tabs: Tab[] }): void {
  if (group.agentName === null) return
  contextMenu.value = {
    x: event.clientX,
    y: event.clientY,
    items: [
      {
        label: t('tabBar.closeGroupTabs', { count: group.tabs.length }),
        action: () => store.closeTabGroup(group.agentName),
      },
    ],
  }
}
</script>

<template>
  <div class="flex items-stretch border-b border-edge-default bg-surface-primary shrink-0 h-10">

    <!-- Onglet Backlog (fixe) -->
    <button
      :class="[
        'flex items-center gap-2 px-5 text-sm font-semibold transition-all relative select-none border-r border-edge-subtle shrink-0',
        store.activeTabId === 'backlog'
          ? 'text-content-primary bg-surface-secondary'
          : 'text-content-muted hover:text-content-secondary hover:bg-surface-secondary/50'
      ]"
      @click="store.setActive('backlog')"
    >
      <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 shrink-0">
        <rect x="1"  y="2" width="4" height="12" rx="1.5"/>
        <rect x="6"  y="2" width="4" height="8"  rx="1.5"/>
        <rect x="11" y="2" width="4" height="5"  rx="1.5"/>
      </svg>
      <span>{{ t('sidebar.backlog') }}</span>
      <span
        v-if="store.activeTabId === 'backlog'"
        class="absolute bottom-0 left-0 right-0 h-[2px] bg-content-faint"
      ></span>
    </button>

    <!-- Onglet Stat (fixe) -->
    <button
      :class="[
        'flex items-center gap-2 px-5 text-sm font-semibold transition-all relative select-none border-r border-edge-subtle shrink-0',
        store.activeTabId === 'dashboard'
          ? 'text-content-primary bg-surface-secondary'
          : 'text-content-muted hover:text-content-secondary hover:bg-surface-secondary/50'
      ]"
      @click="store.setActive('dashboard')"
    >
      <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 shrink-0">
        <path d="M0 11l4-5 3 3 4-6 5 3v5H0z"/>
      </svg>
      <span>{{ t('sidebar.dashboard') }}</span>
      <span
        v-if="store.activeTabId === 'dashboard'"
        class="absolute bottom-0 left-0 right-0 h-[2px] bg-content-faint"
      ></span>
    </button>

    <!-- Scroll left arrow -->
    <button
      v-show="canScrollLeft"
      class="flex items-center justify-center w-6 shrink-0 text-content-subtle hover:text-content-secondary hover:bg-surface-secondary/60 transition-colors"
      @click="scrollBy(-120)"
    >
      <svg viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
        <path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
      </svg>
    </button>

    <!-- Onglets (scrollable) -->
    <div
      ref="scrollContainer"
      class="scroll-container flex items-stretch gap-0.5 px-1.5 flex-1 min-w-0 overflow-x-scroll"
      @wheel="onWheel"
      @scroll="updateScrollState"
    >
      <!-- Onglets fichiers -->
      <button
        v-for="tab in fileTabs"
        :key="tab.id"
        :class="[
          'relative flex items-center gap-1.5 px-3 text-sm font-medium transition-all select-none rounded-t shrink-0 cursor-pointer mr-0.5',
          store.activeTabId === tab.id
            ? 'text-content-primary bg-surface-secondary'
            : 'text-content-muted hover:text-content-secondary hover:bg-surface-secondary/50'
        ]"
        :title="tab.title"
        :aria-label="t('explorer.files') + ': ' + tab.title"
        @click="store.setActive(tab.id)"
        @mousedown="onMiddleClick($event, tab)"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 shrink-0 text-content-subtle">
          <path d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2L9.5 1.5z"/>
        </svg>
        <span class="truncate max-w-[120px] font-mono text-xs">{{ tab.title }}</span>
        <span v-if="tab.dirty" class="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" :title="t('tabBar.unsaved')" />
        <span
          class="flex items-center justify-center w-4 h-4 rounded opacity-40 hover:opacity-100 hover:text-red-400 hover:bg-black/20 transition-all text-xs cursor-pointer ml-4"
          :title="t('tabBar.closeTab')"
          @click.stop="handleCloseTab(tab)"
        >✕</span>
        <span
          v-if="store.activeTabId === tab.id"
          class="absolute bottom-0 left-0 right-0 h-[2px] bg-content-faint"
        ></span>
      </button>

      <!-- Groupe agent -->
      <div
        v-for="(group, groupIdx) in groupedTerminalTabs"
        :key="group.agentName ?? '__misc__'"
        class="flex items-stretch gap-0.5 shrink-0"
        :class="groupIdx < groupedTerminalTabs.length - 1 ? 'mr-3' : ''"
      >
        <!-- Onglet-agent (bouton principal du groupe) -->
        <button
          class="relative flex items-center gap-1.5 px-3 text-sm font-semibold transition-all select-none rounded-t shrink-0 cursor-pointer"
          :style="agentTabStyleMap.get(group.agentName)"
          @click="activateAgentGroup(group)"
          @contextmenu.prevent="openGroupMenu($event, group)"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 shrink-0 text-violet-500 dark:text-zinc-300">
            <polyline points="2,5 6.5,8 2,11"/>
            <line x1="8.5" y1="11" x2="14" y2="11"/>
          </svg>
          <span class="opacity-50 select-none">·</span>
          <span class="truncate max-w-[80px]">{{ group.agentName ?? '?' }}</span>
          <svg
            viewBox="0 0 16 16" fill="currentColor"
            class="w-2.5 h-2.5 shrink-0 transition-transform duration-150"
            :class="isGroupCollapsed(group.agentName) ? '' : '-rotate-90'"
            @click.stop="toggleGroup(group.agentName)"
          >
            <path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
          </svg>
          <span
            v-if="isGroupCollapsed(group.agentName)"
            class="text-[10px] font-mono opacity-70 shrink-0"
          >{{ group.tabs.length }}</span>
          <span
            v-if="isGroupActive(group)"
            class="absolute bottom-0 left-0 right-0 h-[2px]"
            :style="group.agentName ? { backgroundColor: agentFg(group.agentName) } : { backgroundColor: '#a78bfa' }"
          ></span>
        </button>

        <!-- Sous-onglets session (masqués si groupe collapsé) -->
        <template v-if="!isGroupCollapsed(group.agentName)">
          <template v-for="tab in group.tabs" :key="tab.id">
            <button
              v-if="isGroupActive(group)"
              class="relative flex items-center gap-1.5 px-4 min-w-[90px] text-sm font-medium transition-all select-none rounded-t shrink-0 cursor-pointer"
              :style="tabStyleMap.get(tab.id)"
              :title="subTabLabel(tab)"
              @click="store.setActive(tab.id)"
              @mousedown="onMiddleClick($event, tab)"
            >
              <span class="font-mono text-xs shrink-0">{{ subTabLabel(tab) }}</span>
              <span v-if="tab.dirty" class="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" :title="t('tabBar.unsaved')" />
              <span
                class="flex items-center justify-center w-4 h-4 rounded opacity-40 hover:opacity-100 hover:text-red-400 hover:bg-black/20 transition-all text-xs cursor-pointer ml-4"
                :title="t('tabBar.closeTab')"
                @click.stop="handleCloseTab(tab)"
              >✕</span>
              <span
                class="absolute bottom-0 left-0 right-0 h-[2px]"
                :style="indicatorStyleMap.get(tab.id)"
              ></span>
            </button>
            <button
              v-else
              class="relative flex items-center justify-center w-4 h-6 self-center transition-all select-none rounded shrink-0 cursor-pointer"
              :title="subTabLabel(tab)"
              @click="store.setActive(tab.id)"
              @mousedown="onMiddleClick($event, tab)"
            >
              <span
                class="w-1.5 h-1.5 rounded-full opacity-70 hover:opacity-100 transition-opacity"
                :class="tab.dirty ? 'bg-amber-400' : ''"
                :style="tab.dirty ? {} : indicatorStyleMap.get(tab.id)"
              ></span>
            </button>
          </template>
        </template>
      </div>
    </div>

    <!-- Scroll right arrow -->
    <button
      v-show="canScrollRight"
      class="flex items-center justify-center w-6 shrink-0 text-content-subtle hover:text-content-secondary hover:bg-surface-secondary/60 transition-colors"
      @click="scrollBy(120)"
    >
      <svg viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
        <path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
      </svg>
    </button>

    <!-- Bouton + WSL -->
    <button
      class="flex items-center gap-1.5 px-3 self-center text-sm font-semibold text-violet-700 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/40 hover:border-violet-500/60 dark:text-violet-300 dark:border-violet-500/30 dark:hover:border-violet-500/50 rounded transition-all ml-1 mr-2 shrink-0 cursor-pointer"
      style="height: 28px"
      :title="t('tabBar.openWslTerminal')"
      @click="openWslTerminal()"
    >
      <span class="text-base leading-none">+</span>
      <span>WSL</span>
    </button>
    <div class="w-3 shrink-0"></div>

  </div>

  <!-- Menu contextuel groupe d'onglets -->
  <ContextMenu
    v-if="contextMenu"
    :x="contextMenu.x"
    :y="contextMenu.y"
    :items="contextMenu.items"
    @close="contextMenu = null"
  />
</template>

<style scoped>
/* Hide native scrollbar on the tab scroll container — custom arrows handle navigation */
.scroll-container::-webkit-scrollbar {
  display: none;
}
.scroll-container {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}
</style>
