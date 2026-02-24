import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type TabType = 'board' | 'terminal'

export interface Tab {
  id: string
  type: TabType
  title: string
  ptyId: string | null
}

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<Tab[]>([
    { id: 'board', type: 'board', title: 'Board', ptyId: null }
  ])
  const activeTabId = ref<string>('board')

  const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) ?? tabs.value[0])

  function setActive(id: string): void {
    activeTabId.value = id
  }

  function addTerminal(): void {
    const id = `term-${Date.now()}`
    const n = tabs.value.filter(t => t.type === 'terminal').length + 1
    tabs.value.push({ id, type: 'terminal', title: `WSL ${n}`, ptyId: null })
    activeTabId.value = id
  }

  function setPtyId(tabId: string, ptyId: string): void {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab) tab.ptyId = ptyId
  }

  function closeTab(id: string): void {
    if (id === 'board') return
    const idx = tabs.value.findIndex(t => t.id === id)
    if (idx === -1) return
    tabs.value.splice(idx, 1)
    if (activeTabId.value === id) {
      activeTabId.value = tabs.value[Math.max(0, idx - 1)]?.id ?? 'board'
    }
  }

  function renameTab(id: string, title: string): void {
    const tab = tabs.value.find(t => t.id === id)
    if (tab && title.trim()) tab.title = title.trim()
  }

  return { tabs, activeTabId, activeTab, setActive, addTerminal, setPtyId, closeTab, renameTab }
})
