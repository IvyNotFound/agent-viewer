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
  if (rate === 0) return 'secondary'
  if (rate < 20) return 'warning'
  return 'error'
}

onMounted(fetchQuality)
watch(() => store.dbPath, fetchQuality)
</script>

<template>
  <v-card variant="outlined" rounded="lg">
    <!-- Header -->
    <v-card-title class="d-flex align-center justify-space-between py-3 px-4">
      <span class="text-body-2 font-weight-medium">{{ t('quality.title') }}</span>
      <v-btn icon="mdi-refresh" variant="text" size="small" @click="fetchQuality" />
    </v-card-title>

    <!-- Loading skeleton -->
    <v-card-text v-if="loading" class="pa-3">
      <v-skeleton-loader type="table-row@3" />
    </v-card-text>

    <!-- Error -->
    <v-card-text v-else-if="error">
      <v-alert variant="tonal" color="error" density="compact">
        {{ t('quality.error', { msg: error }) }}
      </v-alert>
    </v-card-text>

    <!-- Empty -->
    <v-card-text v-else-if="rows.length === 0" class="d-flex justify-center align-center">
      <span class="text-caption text-medium-emphasis font-italic">{{ t('quality.empty') }}</span>
    </v-card-text>

    <template v-else>
      <!-- Global indicator -->
      <v-card-text>
        <div class="d-flex align-center ga-2">
          <span class="text-body-2 text-medium-emphasis">{{ t('quality.rejectionRate') }}</span>
          <v-chip :color="rateColor(globalRejectionRate)" size="small" variant="tonal">
            {{ globalRejectionRate }}%
          </v-chip>
          <span v-if="!hasRejections" class="text-caption text-secondary font-italic">
            {{ t('quality.noRejections') }}
          </span>
        </div>
        <p class="text-caption text-medium-emphasis mt-1 mb-0">
          {{ t('quality.heuristicNote') }}
        </p>
      </v-card-text>
      <v-divider />

      <!-- Per-agent table — 4 cols: agent | count | bar | rate -->
      <v-card-text class="pa-0">
        <v-table density="compact">
          <thead>
            <tr>
              <th style="min-width: 120px">{{ t('quality.colAgent') }}</th>
              <th style="width: 90px; text-align: right">{{ t('quality.colRejections') }}</th>
              <th></th>
              <th style="width: 70px; text-align: right">{{ t('quality.colRate') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.agent_id">
              <td
                :style="{ color: agentAccent(row.agent_name), fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }"
                :title="row.agent_name"
                class="text-caption font-weight-medium"
              >{{ row.agent_name }}</td>
              <td class="text-right text-caption text-medium-emphasis" style="font-family: ui-monospace, monospace">
                {{ row.rejected_tasks }}/{{ row.total_tasks }}
              </td>
              <td class="px-2">
                <v-progress-linear
                  :model-value="row.rejection_rate"
                  :color="rateColor(row.rejection_rate)"
                  rounded
                  height="8"
                  bg-color="surface-variant"
                />
              </td>
              <td class="text-right">
                <v-chip :color="rateColor(row.rejection_rate)" size="x-small" variant="tonal">
                  {{ row.rejection_rate }}%
                </v-chip>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </template>
  </v-card>
</template>
