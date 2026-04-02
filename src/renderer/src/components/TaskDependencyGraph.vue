<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TaskLink } from '@renderer/types'

const { t } = useI18n()

const props = defineProps<{
  taskId: number
  links: TaskLink[]
}>()

const emit = defineEmits<{
  (e: 'navigate', taskId: number): void
}>()

/** Link type values as stored in the DB. */
type LinkType = 'blocks' | 'depends_on' | 'related_to' | 'duplicates'

const LINK_TYPE_STYLE: Record<string, { color: string; background: string; border: string }> = {
  blocks:     { color: '#f87171', background: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)' },
  depends_on: { color: '#fb923c', background: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.3)' },
  related_to: { color: '#60a5fa', background: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)' },
  duplicates: { color: '#a1a1aa', background: 'rgba(113,113,122,0.12)', border: 'rgba(113,113,122,0.3)' },
}

const STATUS_STYLE: Record<string, { color: string; background: string; border: string }> = {
  todo:        { color: '#fbbf24', background: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)' },
  in_progress: { color: '#34d399', background: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' },
  done:        { color: '#a1a1aa', background: 'rgba(113,113,122,0.12)', border: 'rgba(113,113,122,0.3)' },
  archived:    { color: '#71717a', background: 'rgba(82,82,91,0.12)',    border: 'rgba(82,82,91,0.3)' },
}

const fallbackLink   = LINK_TYPE_STYLE.related_to
const fallbackStatus = STATUS_STYLE.todo

/** Tasks this task blocks or that this task depends on (outgoing) */
const outgoing = computed(() =>
  props.links.filter(l =>
    (l.type === 'blocks' && l.from_task === props.taskId) ||
    (l.type === 'depends_on' && l.to_task === props.taskId)
  )
)

/** Tasks that block this task or that this task depends on (incoming) */
const incoming = computed(() =>
  props.links.filter(l =>
    (l.type === 'blocks' && l.to_task === props.taskId) ||
    (l.type === 'depends_on' && l.from_task === props.taskId)
  )
)

/** Symmetric links: related_to, duplicates */
const related = computed(() =>
  props.links.filter(l =>
    (l.type === 'related_to' || l.type === 'duplicates') &&
    (l.from_task === props.taskId || l.to_task === props.taskId)
  )
)

const hasLinks = computed(() =>
  outgoing.value.length > 0 || incoming.value.length > 0 || related.value.length > 0
)

function linkedTaskId(link: TaskLink): number {
  return link.from_task === props.taskId ? link.to_task : link.from_task
}

function linkedTaskTitle(link: TaskLink): string {
  return link.from_task === props.taskId ? link.to_title : link.from_title
}

function linkedTaskStatus(link: TaskLink): string {
  return link.from_task === props.taskId ? link.to_status : link.from_status
}

function typeBadgeLabel(link: TaskLink): string {
  const type = link.type as LinkType
  const isSource = link.from_task === props.taskId
  if (type === 'blocks') return isSource ? t('taskDetail.blocks') : t('taskDetail.blockedBy')
  if (type === 'depends_on') return isSource ? t('taskDetail.blockedBy') : t('taskDetail.blocks')
  if (type === 'related_to') return t('taskDetail.relatedTo')
  if (type === 'duplicates') return 'duplicates'
  return type
}
</script>

<template>
  <div class="dep-graph">
    <!-- No links -->
    <p v-if="!hasLinks" class="no-links text-caption">
      {{ t('taskDetail.noDependencies') }}
    </p>

    <template v-else>
      <!-- Outgoing: this task blocks or depends on -->
      <div v-if="outgoing.length > 0" class="dep-section">
        <p class="dep-section-label text-overline">{{ t('taskDetail.blocks') }}</p>
        <div class="dep-list">
          <button
            v-for="link in outgoing"
            :key="link.id"
            class="dep-row"
            @click="emit('navigate', linkedTaskId(link))"
          >
            <span
              class="dep-badge"
              :style="{ color: (LINK_TYPE_STYLE[link.type] ?? fallbackLink).color, backgroundColor: (LINK_TYPE_STYLE[link.type] ?? fallbackLink).background, borderColor: (LINK_TYPE_STYLE[link.type] ?? fallbackLink).border }"
            >{{ typeBadgeLabel(link) }}</span>
            <span
              class="dep-badge dep-badge--mono"
              :style="{ color: (STATUS_STYLE[linkedTaskStatus(link)] ?? fallbackStatus).color, backgroundColor: (STATUS_STYLE[linkedTaskStatus(link)] ?? fallbackStatus).background, borderColor: (STATUS_STYLE[linkedTaskStatus(link)] ?? fallbackStatus).border }"
            >{{ linkedTaskStatus(link) }}</span>
            <span class="dep-title text-caption">
              #{{ linkedTaskId(link) }} {{ linkedTaskTitle(link) }}
            </span>
          </button>
        </div>
      </div>

      <!-- Incoming: blocked by or depended upon by -->
      <div v-if="incoming.length > 0" class="dep-section">
        <p class="dep-section-label text-overline">{{ t('taskDetail.blockedBy') }}</p>
        <div class="dep-list">
          <button
            v-for="link in incoming"
            :key="link.id"
            class="dep-row"
            @click="emit('navigate', linkedTaskId(link))"
          >
            <span
              class="dep-badge"
              :style="{ color: (LINK_TYPE_STYLE[link.type] ?? fallbackLink).color, backgroundColor: (LINK_TYPE_STYLE[link.type] ?? fallbackLink).background, borderColor: (LINK_TYPE_STYLE[link.type] ?? fallbackLink).border }"
            >{{ typeBadgeLabel(link) }}</span>
            <span
              class="dep-badge dep-badge--mono"
              :style="{ color: (STATUS_STYLE[linkedTaskStatus(link)] ?? fallbackStatus).color, backgroundColor: (STATUS_STYLE[linkedTaskStatus(link)] ?? fallbackStatus).background, borderColor: (STATUS_STYLE[linkedTaskStatus(link)] ?? fallbackStatus).border }"
            >{{ linkedTaskStatus(link) }}</span>
            <span class="dep-title text-caption">
              #{{ linkedTaskId(link) }} {{ linkedTaskTitle(link) }}
            </span>
          </button>
        </div>
      </div>

      <!-- Related: related_to, duplicates -->
      <div v-if="related.length > 0" class="dep-section">
        <p class="dep-section-label text-overline">{{ t('taskDetail.relatedTo') }}</p>
        <div class="dep-list">
          <button
            v-for="link in related"
            :key="link.id"
            class="dep-row"
            @click="emit('navigate', linkedTaskId(link))"
          >
            <span
              class="dep-badge"
              :style="{ color: (LINK_TYPE_STYLE[link.type] ?? fallbackLink).color, backgroundColor: (LINK_TYPE_STYLE[link.type] ?? fallbackLink).background, borderColor: (LINK_TYPE_STYLE[link.type] ?? fallbackLink).border }"
            >{{ link.type }}</span>
            <span
              class="dep-badge dep-badge--mono"
              :style="{ color: (STATUS_STYLE[linkedTaskStatus(link)] ?? fallbackStatus).color, backgroundColor: (STATUS_STYLE[linkedTaskStatus(link)] ?? fallbackStatus).background, borderColor: (STATUS_STYLE[linkedTaskStatus(link)] ?? fallbackStatus).border }"
            >{{ linkedTaskStatus(link) }}</span>
            <span class="dep-title text-caption">
              #{{ linkedTaskId(link) }} {{ linkedTaskTitle(link) }}
            </span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dep-graph {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.no-links {
  color: var(--content-faint);
  font-style: italic;
  margin: 0;
}

.dep-section {
  margin-bottom: 4px;
}

.dep-section-label {
  color: var(--content-faint);
  margin: 0 0 4px;
}

.dep-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dep-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background-color 0.15s;
}
.dep-row:hover {
  background-color: var(--surface-secondary);
}

.dep-badge {
  font-size: 0.5625rem;
  padding: 1px 6px;
  border-radius: 9999px;
  border: 1px solid;
  font-weight: 500;
  flex-shrink: 0;
}
.dep-badge--mono {
  border-radius: 3px;
  font-family: ui-monospace, monospace;
}

.dep-title {
  color: var(--content-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.15s;
}
.dep-row:hover .dep-title {
  color: var(--content-primary);
}
</style>
