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

function rateColor(rate: number): string {
  if (rate === 0) return 'rgb(var(--v-theme-secondary))'
  if (rate < 20) return 'rgb(var(--v-theme-warning))'
  return 'rgb(var(--v-theme-error))'
}

onMounted(fetchQuality)
watch(() => store.dbPath, fetchQuality)
</script>

<template>
  <div class="quality-panel">
    <!-- Header -->
    <div class="quality-header py-3 px-4">
      <h2 class="quality-title text-body-2 font-weight-medium">{{ t('quality.title') }}</h2>
      <v-btn variant="text" size="small" class="text-overline" @click="fetchQuality">{{ t('quality.refresh') }}</v-btn>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="quality-state pa-8">
      <p class="quality-state-text quality-state-text--pulse text-caption">{{ t('quality.loading') }}</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="quality-state pa-8">
      <p class="quality-state-text quality-state-text--error text-caption">{{ t('quality.error', { msg: error }) }}</p>
    </div>

    <!-- Empty -->
    <div v-else-if="rows.length === 0" class="quality-state pa-8">
      <p class="quality-state-text text-caption">{{ t('quality.empty') }}</p>
    </div>

    <template v-else>
      <!-- Global indicator -->
      <div class="quality-global py-3 px-4">
        <div class="quality-global-rate ga-4">
          <span class="quality-rate-label text-overline">{{ t('quality.rejectionRate') }}</span>
          <span
            class="quality-rate-value"
            :style="{ color: rateColor(globalRejectionRate) }"
          >{{ globalRejectionRate }}%</span>
          <span v-if="!hasRejections" class="quality-no-rejections text-overline">{{ t('quality.noRejections') }}</span>
        </div>
        <p class="quality-heuristic-note text-overline mt-1">
          {{ t('quality.heuristicNote') }}
        </p>
      </div>

      <!-- Agent list -->
      <v-list density="compact" class="pa-0">
        <v-list-item v-for="row in rows" :key="row.agent_id" class="px-4 py-2">
          <div class="d-flex align-center justify-space-between mb-1">
            <span
              class="text-caption font-weight-medium"
              :style="{ color: agentAccent(row.agent_name) }"
            >{{ row.agent_name }}</span>
            <div class="d-flex align-center ga-2">
              <span class="text-caption text-disabled">
                {{ row.rejected_tasks }}/{{ row.total_tasks }}
              </span>
              <span
                class="text-caption font-weight-medium"
                :style="{ color: rateColor(row.rejection_rate) }"
              >{{ row.rejection_rate }}%</span>
            </div>
          </div>
          <v-progress-linear
            :model-value="row.rejection_rate"
            :color="rateColor(row.rejection_rate)"
            bg-color="rgba(var(--v-border-color), var(--v-border-opacity))"
            rounded
            height="3"
          />
        </v-list-item>
      </v-list>
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
.quality-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--edge-subtle);
}
.quality-title {
  color: var(--content-secondary);
  margin: 0;
}
.quality-state {
  display: flex;
  align-items: center;
  justify-content: center;
}
.quality-state-text {
  color: var(--content-faint);
  font-style: italic;
  margin: 0;
}
.quality-state-text--pulse { animation: quality-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
.quality-state-text--error { color: rgb(var(--v-theme-error)); }
@keyframes quality-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.quality-global {
  flex-shrink: 0;
  border-bottom: 1px solid var(--edge-subtle);
}
.quality-global-rate {
  display: flex;
  align-items: center;
}
.quality-rate-label {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--content-faint);
  font-weight: 600;
}
.quality-rate-value {
  font-size: 18px; /* display metric — above MD3 type scale, kept intentionally */
  font-family: ui-monospace, monospace;
  font-weight: 700;
}
.quality-no-rejections {
  color: rgb(var(--v-theme-secondary));
  font-style: italic;
}
.quality-heuristic-note {
  color: var(--content-faint);
  margin: 0;
  font-style: italic;
}
</style>
