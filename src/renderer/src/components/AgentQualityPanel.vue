<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTasksStore } from '@renderer/stores/tasks'
import { agentAccent } from '@renderer/utils/agentColor'
import type { AgentQualityRow } from '@renderer/types'

const { t } = useI18n()
const store = useTasksStore()

const rows = ref<AgentQualityRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const globalRejectionRate = computed(() => {
  const total = rows.value.reduce((s, r) => s + r.total_tasks, 0)
  const rejected = rows.value.reduce((s, r) => s + r.rejected_tasks, 0)
  if (total === 0) return 0
  return Math.round((rejected / total) * 1000) / 10
})

const hasRejections = computed(() => rows.value.some(r => r.rejected_tasks > 0))

async function fetchQuality(): Promise<void> {
  if (!store.dbPath) return
  loading.value = true
  error.value = null
  try {
    const result = await window.electronAPI.tasksQualityStats(store.dbPath)
    if (!result.success) {
      error.value = result.error ?? 'Unknown error'
      rows.value = []
    } else {
      rows.value = result.rows as AgentQualityRow[]
    }
  } catch (err) {
    error.value = String(err)
    rows.value = []
  } finally {
    loading.value = false
  }
}

/* Status color for rejection rate — semantic indicator, not agent color.
   Values match project theme tokens: warning=#f59e0b, error=#ef4444 (same in both themes).
   Good (0%) uses emerald-300 as a neutral positive signal. */
function rateColor(rate: number): string {
  if (rate === 0) return '#6ee7b7'   // emerald-300 — zero rejections
  if (rate < 20) return '#f59e0b'   // amber-500 — matches project warning token
  return '#ef4444'                  // red-500 — matches project error token
}

onMounted(fetchQuality)
watch(() => store.dbPath, fetchQuality)
</script>

<template>
  <div class="quality-panel">
    <!-- Header -->
    <div class="quality-header">
      <h2 class="quality-title">{{ t('quality.title') }}</h2>
      <button class="quality-refresh-btn" @click="fetchQuality">{{ t('quality.refresh') }}</button>
    </div>

    <!-- Loading: skeleton grid (animate-pulse pattern) -->
    <div v-if="loading" class="quality-skeleton">
      <div v-for="i in 3" :key="i" class="quality-skeleton-row" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="quality-state">
      <p class="quality-state-text quality-state-text--error">{{ t('quality.error', { msg: error }) }}</p>
    </div>

    <!-- Empty -->
    <div v-else-if="rows.length === 0" class="quality-state">
      <p class="quality-state-text">{{ t('quality.empty') }}</p>
    </div>

    <template v-else>
      <!-- Global indicator -->
      <div class="quality-global">
        <div class="quality-global-rate">
          <span class="quality-rate-label">{{ t('quality.rejectionRate') }}</span>
          <span
            class="quality-rate-value"
            :style="{ color: rateColor(globalRejectionRate) }"
          >{{ globalRejectionRate }}%</span>
          <span v-if="!hasRejections" class="quality-no-rejections">{{ t('quality.noRejections') }}</span>
        </div>
        <p class="quality-heuristic-note">
          {{ t('quality.heuristicNote') }}
        </p>
      </div>

      <!-- Per-agent table — 4-column grid, mirrors .wl-table from WorkloadView -->
      <div class="quality-table">
        <!-- Column headers -->
        <div class="quality-cols quality-cols-head text-label-medium">
          <span>{{ t('quality.colAgent') }}</span>
          <span class="quality-right">{{ t('quality.colRejections') }}</span>
          <span></span>
          <span class="quality-right">{{ t('quality.colRate') }}</span>
        </div>

        <!-- Rows -->
        <div
          v-for="row in rows"
          :key="row.agent_id"
          class="quality-cols quality-cols-row"
        >
          <span
            class="quality-agent-name"
            :style="{ color: agentAccent(row.agent_name) }"
            :title="row.agent_name"
          >{{ row.agent_name }}</span>
          <span class="quality-count quality-right">{{ row.rejected_tasks }}/{{ row.total_tasks }}</span>
          <div class="quality-bar-bg">
            <div
              class="quality-bar-fill"
              :style="{
                width: row.rejection_rate + '%',
                backgroundColor: rateColor(row.rejection_rate)
              }"
            />
          </div>
          <span
            class="quality-rate quality-right"
            :style="{ color: rateColor(row.rejection_rate) }"
          >{{ row.rejection_rate }}%</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.quality-panel {
  display: flex;
  flex-direction: column;
  border-radius: var(--shape-sm);
  background: var(--surface-primary);
  border: 1px solid var(--edge-default);
  overflow: hidden;
}

/* ── Header ───────────────────────────────────────────────────────────────── */
.quality-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--edge-subtle);
}
.quality-title {
  margin: 0;
  font-size: 0.875rem;  /* 14px — body-2 equivalent */
  font-weight: 500;
  color: var(--content-secondary);
}
.quality-refresh-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  font-family: inherit;
  padding: 4px 8px;
  border-radius: var(--shape-xs);
  color: var(--content-subtle);
  transition: color var(--md-duration-short3) var(--md-easing-standard),
              background var(--md-duration-short3) var(--md-easing-standard);
}
.quality-refresh-btn:hover {
  color: var(--content-secondary);
  background: var(--bg-hover);
}

/* ── States ───────────────────────────────────────────────────────────────── */
.quality-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}
.quality-state-text {
  margin: 0;
  font-size: 0.75rem;
  color: var(--content-faint);
  font-style: italic;
}
.quality-state-text--error { color: #ef4444; }

/* ── Skeleton loading ─────────────────────────────────────────────────────── */
.quality-skeleton {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.quality-skeleton-row {
  height: 14px;
  border-radius: var(--shape-xs);
  background: var(--surface-tertiary);
  animation: quality-skeleton-pulse 1.5s ease-in-out infinite;
}
.quality-skeleton-row:nth-child(2) { animation-delay: 0.15s; width: 80%; }
.quality-skeleton-row:nth-child(3) { animation-delay: 0.30s; width: 65%; }
@keyframes quality-skeleton-pulse {
  0%, 100% { opacity: 0.6; }
  50%       { opacity: 0.25; }
}

/* ── Global rate ──────────────────────────────────────────────────────────── */
.quality-global {
  flex-shrink: 0;
  padding: 12px 16px;
  border-bottom: 1px solid var(--edge-subtle);
}
.quality-global-rate {
  display: flex;
  align-items: center;
  gap: 8px;
}
.quality-rate-label {
  font-size: 0.875rem;
  color: var(--content-faint);
}
.quality-rate-value {
  font-family: ui-monospace, monospace;
  font-size: 1rem;      /* 16px — replaces text-h6 */
  font-weight: 700;
}
.quality-no-rejections {
  font-size: 0.875rem;
  color: #6ee7b7;       /* emerald-300 — positive zero-rejection indicator */
  font-style: italic;
}
.quality-heuristic-note {
  margin: 4px 0 0 0;
  font-size: 0.75rem;
  color: var(--content-faint);
  font-style: italic;
}

/* ── Per-agent table — 4-column grid, aligned with .wl-table pattern ─────── */
.quality-table { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
.quality-cols {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) auto minmax(0, 2fr) minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}
.quality-cols-head {
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--content-faint);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--edge-subtle);
  align-items: end;
}
.quality-right { text-align: right; }
.quality-agent-name {
  font-size: 12px;
  font-family: ui-monospace, monospace;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.quality-count {
  font-size: 12px;
  color: var(--content-tertiary);
  font-family: ui-monospace, monospace;
  white-space: nowrap;
}
.quality-rate {
  font-size: 12px;
  font-family: ui-monospace, monospace;
  font-weight: 600;
}
.quality-bar-bg {
  height: 8px;
  background: var(--surface-tertiary);
  border-radius: var(--shape-full);
  overflow: hidden;
}
.quality-bar-fill {
  height: 100%;
  border-radius: var(--shape-full);
  transition: width var(--md-duration-medium4) var(--md-easing-emphasized-decelerate);
}
</style>
