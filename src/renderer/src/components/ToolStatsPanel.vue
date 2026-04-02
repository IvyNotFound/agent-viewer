<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToolStats } from '@renderer/composables/useToolStats'
import { toolColor } from '@renderer/composables/useHookEventDisplay'

const { t } = useI18n()
const { toolStats } = useToolStats()

type SortKey = 'calls' | 'errors' | 'errorRate' | 'avgDurationMs'
const sortKey = ref<SortKey>('calls')
const sortDesc = ref(true)

function setSort(key: SortKey): void {
  if (sortKey.value === key) {
    sortDesc.value = !sortDesc.value
  } else {
    sortKey.value = key
    sortDesc.value = true
  }
}

const sorted = computed(() => {
  return [...toolStats.value].sort((a, b) => {
    const av = a[sortKey.value] ?? -1
    const bv = b[sortKey.value] ?? -1
    return sortDesc.value ? (bv as number) - (av as number) : (av as number) - (bv as number)
  })
})

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function sortIcon(key: SortKey): string {
  if (sortKey.value !== key) return ''
  return sortDesc.value ? ' ↓' : ' ↑'
}
</script>

<template>
  <div class="tool-stats-panel">
    <!-- Header -->
    <div class="tool-stats-header">
      <h2 class="tool-stats-title">{{ t('toolStats.title') }}</h2>
    </div>
    <!-- Empty state -->
    <div v-if="toolStats.length === 0" class="tool-stats-empty">
      <p class="tool-stats-empty-text">{{ t('toolStats.empty') }}</p>
    </div>

    <!-- Table -->
    <div v-else class="tool-stats-body">
      <div class="tool-stats-table-wrap">
        <table class="tool-stats-table">
          <thead>
            <tr class="tool-stats-thead-row">
              <th class="tool-stats-th tool-stats-th--left" @click="setSort('calls')">
                {{ t('toolStats.tool') }}
              </th>
              <th class="tool-stats-th" @click="setSort('calls')">
                {{ t('toolStats.calls') }}{{ sortIcon('calls') }}
              </th>
              <th class="tool-stats-th" @click="setSort('errors')">
                {{ t('toolStats.errors') }}{{ sortIcon('errors') }}
              </th>
              <th class="tool-stats-th" @click="setSort('errorRate')">
                {{ t('toolStats.errorRate') }}{{ sortIcon('errorRate') }}
              </th>
              <th class="tool-stats-th" @click="setSort('avgDurationMs')">
                {{ t('toolStats.avgDuration') }}{{ sortIcon('avgDurationMs') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in sorted"
              :key="row.name"
              class="tool-stats-row"
            >
              <!-- Tool name -->
              <td class="tool-stats-td tool-stats-td--mono" :style="{ color: toolColor(row.name) }">{{ row.name }}</td>
              <!-- Calls -->
              <td class="tool-stats-td tool-stats-td--mono tool-stats-td--right tool-stats-td--muted">{{ row.calls }}</td>
              <!-- Errors -->
              <td
                class="tool-stats-td tool-stats-td--mono tool-stats-td--right"
                :class="row.errors > 0 ? 'tool-stats-td--error' : 'tool-stats-td--faint'"
              >
                {{ row.errors }}
              </td>
              <!-- Error rate -->
              <td
                class="tool-stats-td tool-stats-td--mono tool-stats-td--right"
                :class="row.errorRate > 0 ? 'tool-stats-td--error' : 'tool-stats-td--faint'"
              >
                {{ row.errors > 0 ? (row.errorRate * 100).toFixed(0) + '%' : '—' }}
              </td>
              <!-- Avg duration -->
              <td
                class="tool-stats-td tool-stats-td--mono tool-stats-td--right"
                :class="row.avgDurationMs !== null && row.avgDurationMs > 5000 ? 'tool-stats-td--warn' : 'tool-stats-td--faint'"
              >
                {{ formatDuration(row.avgDurationMs) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-stats-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--surface-base);
  color: var(--content-primary);
}
.tool-stats-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 12px 24px;
  border-bottom: 1px solid var(--edge-default);
}
.tool-stats-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--content-primary);
  margin: 0;
}
.tool-stats-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 48px;
}
.tool-stats-empty-text {
  font-size: 13px;
  color: var(--content-faint);
  font-style: italic;
  text-align: center;
  margin: 0;
  padding: 0 16px;
}
.tool-stats-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
.tool-stats-table-wrap {
  background: var(--surface-secondary);
  border-radius: 8px;
  border: 1px solid var(--edge-default);
  overflow-x: auto;
}
.tool-stats-table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}
.tool-stats-thead-row {
  border-bottom: 1px solid var(--edge-default);
}
.tool-stats-th {
  padding: 10px 16px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--content-muted);
  text-align: right;
  cursor: pointer;
  user-select: none;
  font-weight: 600;
  position: sticky;
  top: 0;
  background: var(--surface-secondary);
  transition: color 0.15s;
}
.tool-stats-th:hover { color: var(--content-secondary); }
.tool-stats-th--left { text-align: left; }
.tool-stats-row {
  border-bottom: 1px solid rgba(63, 63, 70, 0.5);
  transition: background-color 0.15s;
}
.tool-stats-row:last-child { border-bottom: none; }
.tool-stats-row:hover { background: rgba(63, 63, 70, 0.3); }
.tool-stats-td {
  padding: 8px 16px;
}
.tool-stats-td--mono { font-family: ui-monospace, monospace; }
.tool-stats-td--right { text-align: right; }
.tool-stats-td--muted { color: var(--content-tertiary); }
.tool-stats-td--faint { color: var(--content-faint); }
.tool-stats-td--error { color: #f87171; }
.tool-stats-td--warn { color: #fbbf24; }
</style>
