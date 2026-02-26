<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Task } from '@renderer/types'
import AgentBadge from './AgentBadge.vue'
import { useTasksStore } from '@renderer/stores/tasks'
import { perimeterFg, perimeterBg, perimeterBorder } from '@renderer/utils/agentColor'

const { t, locale } = useI18n()
defineProps<{ task: Task }>()
const store = useTasksStore()

function formatDate(iso: string): string {
  const loc = locale.value === 'fr' ? 'fr-FR' : 'en-US'
  return new Date(iso).toLocaleString(loc, {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const EFFORT_LABEL: Record<number, string> = { 1: 'S', 2: 'M', 3: 'L' }
const EFFORT_BADGE: Record<number, string> = {
  1: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  2: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  3: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const PRIORITY_BADGE: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high:     'bg-orange-500/20 text-orange-400 border-orange-500/30',
  normal:   'bg-surface-tertiary text-content-muted border-edge-default',
  low:      '',
}
const PRIORITY_LABEL: Record<string, string> = {
  critical: '!!',
  high:     '!',
  normal:   '—',
  low:      '',
}
</script>

<template>
  <div
    class="bg-surface-secondary border border-edge-default rounded-lg p-3 hover:border-content-faint transition-colors cursor-pointer min-h-[120px] flex flex-col"
    @click="store.openTask(task)"
  >
    <!-- Top row: title + effort/priority -->
    <div class="flex items-start justify-between gap-2 mb-2">
      <p class="text-sm text-content-primary font-medium leading-snug flex-1 min-w-0">{{ task.titre }}</p>
      <div class="flex items-center gap-1 shrink-0">
        <span
          v-if="task.priority && task.priority !== 'normal' && task.priority !== 'low'"
          :class="['text-xs font-bold px-1.5 py-0.5 rounded font-mono border', PRIORITY_BADGE[task.priority]]"
        >{{ PRIORITY_LABEL[task.priority] }}</span>
        <span
          v-if="task.effort"
          :class="['text-xs font-bold px-1.5 py-0.5 rounded font-mono border', EFFORT_BADGE[task.effort]]"
        >{{ EFFORT_LABEL[task.effort] }}</span>
      </div>
    </div>

    <!-- Badges: perimeter + agent -->
    <div v-if="task.perimetre || task.agent_name" class="flex flex-wrap gap-1 mb-2">
      <span
        v-if="task.perimetre"
        class="text-xs px-1.5 py-0.5 rounded font-mono border"
        :style="{
          color: perimeterFg(task.perimetre),
          backgroundColor: perimeterBg(task.perimetre),
          borderColor: perimeterBorder(task.perimetre),
        }"
      >{{ task.perimetre }}</span>
      <AgentBadge v-if="task.agent_name" :name="task.agent_name" :perimetre="task.agent_perimetre" />
    </div>

    <!-- Footer: dates left, #id right -->
    <div :class="['flex items-end justify-between gap-2 mt-auto pt-2', (task.perimetre || task.agent_name) && 'border-t border-edge-default/50']">
      <div class="flex flex-col gap-0.5">
        <p class="text-xs text-content-subtle">
          <span class="text-content-muted">{{ t('taskDetail.created') }}</span> {{ formatDate(task.created_at) }}
        </p>
        <p class="text-xs text-content-subtle">
          <span class="text-content-muted">{{ t('taskDetail.updated') }}</span> {{ formatDate(task.updated_at) }}
        </p>
      </div>
      <span class="text-xs text-content-faint font-mono shrink-0">#{{ task.id }}</span>
    </div>
  </div>
</template>
