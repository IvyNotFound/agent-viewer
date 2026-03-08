/**
 * Composable for lazy-loaded, paginated archived tasks.
 *
 * Independent of the main store refresh() — loads on demand via
 * the dedicated `tasks:getArchived` IPC handler.
 *
 * Usage:
 *   const pagination = useArchivedPagination()
 *   // Call loadPage(0) when archive tab becomes active
 *   // Filter changes and DB refreshes trigger auto-reload after first load
 */
import { ref, computed, watch } from 'vue'
import type { Task } from '@renderer/types'
import { useTasksStore } from '@renderer/stores/tasks'

export const PAGE_SIZE = 50

export function useArchivedPagination() {
  const store = useTasksStore()

  const page = ref(0)
  const archivedTasks = ref<Task[]>([])
  const total = ref(0)
  const loading = ref(false)

  // Guard: only auto-reload (on filter/db change) after first explicit loadPage() call
  let hasLoaded = false

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

  async function loadPage(p: number): Promise<void> {
    if (!store.dbPath) return
    loading.value = true
    page.value = p
    hasLoaded = true
    try {
      const result = await window.electronAPI.tasksGetArchived(store.dbPath, {
        page: p,
        pageSize: PAGE_SIZE,
        agentId: store.selectedAgentId ?? null,
        scope: store.selectedPerimetre ?? null,
      })
      archivedTasks.value = result.rows as Task[]
      total.value = result.total
    } catch (e) {
      console.error('[useArchivedPagination] loadPage error:', e)
    } finally {
      loading.value = false
    }
  }

  // Reset to page 0 when active filters change (only after first load)
  watch(
    () => [store.selectedAgentId, store.selectedPerimetre] as const,
    () => {
      if (hasLoaded) loadPage(0)
    }
  )

  // Refresh current page on DB changes (only after first load)
  watch(
    () => store.lastRefresh,
    () => {
      if (hasLoaded) loadPage(page.value)
    }
  )

  return { page, archivedTasks, total, totalPages, loading, loadPage }
}
