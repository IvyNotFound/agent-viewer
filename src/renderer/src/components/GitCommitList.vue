<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { parseUtcDate } from '@renderer/utils/parseDate'

interface GitCommit {
  hash: string
  date: string
  subject: string
  author: string
  taskIds: number[]
}

const props = defineProps<{
  commits: GitCommit[]
  /** When set, only show commits mentioning this task id */
  filterTaskId?: number
}>()

const emit = defineEmits<{
  openTask: [id: number]
}>()

const { locale } = useI18n()

const visibleCommits = computed(() => {
  if (props.filterTaskId == null) return props.commits
  return props.commits.filter(c => c.taskIds.includes(props.filterTaskId!))
})

function formatDate(iso: string): string {
  const d = parseUtcDate(iso)
  const dateLocale = locale.value === 'fr' ? 'fr-FR' : 'en-US'
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' })
}
</script>

<template>
  <div class="overflow-y-auto">
    <div
      v-for="commit in visibleCommits"
      :key="commit.hash"
      class="flex items-start gap-2 px-3 py-2 border-b border-edge-subtle last:border-b-0 hover:bg-surface-secondary/30 transition-colors"
    >
      <!-- Hash -->
      <code class="text-[10px] text-content-faint font-mono w-14 shrink-0 mt-0.5 select-all">{{ commit.hash.slice(0, 7) }}</code>

      <!-- Subject + author -->
      <div class="flex-1 min-w-0">
        <p class="text-xs text-content-tertiary truncate">{{ commit.subject }}</p>
        <p class="text-[10px] text-content-faint font-mono mt-0.5">
          <span>{{ commit.author }}</span>
          <span class="mx-1 opacity-50">·</span>
          <span>{{ formatDate(commit.date) }}</span>
        </p>
      </div>

      <!-- Task badges -->
      <div class="flex flex-wrap gap-1 shrink-0">
        <button
          v-for="id in commit.taskIds"
          :key="id"
          class="text-[10px] px-1.5 py-0.5 rounded font-mono bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-colors"
          @click="emit('openTask', id)"
        >T{{ id }}</button>
      </div>
    </div>
  </div>
</template>
