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

/** Link type values as stored in the DB (with accents). */
type LinkType = 'bloque' | 'dépend_de' | 'lié_à' | 'duplique'

const LINK_TYPE_COLOR: Record<string, string> = {
  'bloque':    'bg-red-500/20 text-red-400 border-red-500/30',
  'dépend_de': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'lié_à':     'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'duplique':  'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
}

const STATUS_COLOR: Record<string, string> = {
  todo:        'bg-amber-500/20 text-amber-400 border-amber-500/30',
  in_progress: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  done:        'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  archived:    'bg-zinc-700/20 text-zinc-500 border-zinc-700/30',
}

/** Tasks this task blocks or that this task depends on (outgoing) */
const outgoing = computed(() =>
  props.links.filter(l =>
    (l.type === 'bloque' && l.from_task === props.taskId) ||
    (l.type === 'dépend_de' && l.to_task === props.taskId)
  )
)

/** Tasks that block this task or that this task depends on (incoming) */
const incoming = computed(() =>
  props.links.filter(l =>
    (l.type === 'bloque' && l.to_task === props.taskId) ||
    (l.type === 'dépend_de' && l.from_task === props.taskId)
  )
)

/** Symmetric links: lié_à, duplique */
const related = computed(() =>
  props.links.filter(l =>
    (l.type === 'lié_à' || l.type === 'duplique') &&
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
  return link.from_task === props.taskId ? link.to_titre : link.from_titre
}

function linkedTaskStatut(link: TaskLink): string {
  return link.from_task === props.taskId ? link.to_statut : link.from_statut
}

function typeBadgeLabel(link: TaskLink): string {
  const type = link.type as LinkType
  const isSource = link.from_task === props.taskId
  if (type === 'bloque') return isSource ? t('taskDetail.blocks') : t('taskDetail.blockedBy')
  if (type === 'dépend_de') return isSource ? t('taskDetail.blockedBy') : t('taskDetail.blocks')
  if (type === 'lié_à') return t('taskDetail.relatedTo')
  if (type === 'duplique') return 'duplique'
  return type
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <!-- No links -->
    <p v-if="!hasLinks" class="text-xs text-content-faint italic">
      {{ t('taskDetail.noDependencies') }}
    </p>

    <template v-else>
      <!-- Outgoing: this task blocks or depends on -->
      <div v-if="outgoing.length > 0" class="mb-1">
        <p class="text-[10px] text-content-faint mb-1">{{ t('taskDetail.blocks') }}</p>
        <div class="space-y-1">
          <button
            v-for="link in outgoing"
            :key="link.id"
            class="w-full flex items-center gap-1.5 text-left hover:bg-surface-secondary rounded px-1 py-0.5 transition-colors group"
            @click="emit('navigate', linkedTaskId(link))"
          >
            <span :class="['text-[9px] px-1.5 py-0.5 rounded-full border font-medium shrink-0', LINK_TYPE_COLOR[link.type] ?? LINK_TYPE_COLOR['lié_à']]">
              {{ typeBadgeLabel(link) }}
            </span>
            <span :class="['text-[9px] px-1 py-0.5 rounded border font-mono shrink-0', STATUS_COLOR[linkedTaskStatut(link)] ?? STATUS_COLOR.todo]">
              {{ linkedTaskStatut(link) }}
            </span>
            <span class="text-xs text-content-secondary truncate group-hover:text-content-primary transition-colors">
              #{{ linkedTaskId(link) }} {{ linkedTaskTitle(link) }}
            </span>
          </button>
        </div>
      </div>

      <!-- Incoming: blocked by or depended upon by -->
      <div v-if="incoming.length > 0" class="mb-1">
        <p class="text-[10px] text-content-faint mb-1">{{ t('taskDetail.blockedBy') }}</p>
        <div class="space-y-1">
          <button
            v-for="link in incoming"
            :key="link.id"
            class="w-full flex items-center gap-1.5 text-left hover:bg-surface-secondary rounded px-1 py-0.5 transition-colors group"
            @click="emit('navigate', linkedTaskId(link))"
          >
            <span :class="['text-[9px] px-1.5 py-0.5 rounded-full border font-medium shrink-0', LINK_TYPE_COLOR[link.type] ?? LINK_TYPE_COLOR['lié_à']]">
              {{ typeBadgeLabel(link) }}
            </span>
            <span :class="['text-[9px] px-1 py-0.5 rounded border font-mono shrink-0', STATUS_COLOR[linkedTaskStatut(link)] ?? STATUS_COLOR.todo]">
              {{ linkedTaskStatut(link) }}
            </span>
            <span class="text-xs text-content-secondary truncate group-hover:text-content-primary transition-colors">
              #{{ linkedTaskId(link) }} {{ linkedTaskTitle(link) }}
            </span>
          </button>
        </div>
      </div>

      <!-- Related: lié_à, duplique -->
      <div v-if="related.length > 0">
        <p class="text-[10px] text-content-faint mb-1">{{ t('taskDetail.relatedTo') }}</p>
        <div class="space-y-1">
          <button
            v-for="link in related"
            :key="link.id"
            class="w-full flex items-center gap-1.5 text-left hover:bg-surface-secondary rounded px-1 py-0.5 transition-colors group"
            @click="emit('navigate', linkedTaskId(link))"
          >
            <span :class="['text-[9px] px-1.5 py-0.5 rounded-full border font-medium shrink-0', LINK_TYPE_COLOR[link.type] ?? LINK_TYPE_COLOR['lié_à']]">
              {{ link.type }}
            </span>
            <span :class="['text-[9px] px-1 py-0.5 rounded border font-mono shrink-0', STATUS_COLOR[linkedTaskStatut(link)] ?? STATUS_COLOR.todo]">
              {{ linkedTaskStatut(link) }}
            </span>
            <span class="text-xs text-content-secondary truncate group-hover:text-content-primary transition-colors">
              #{{ linkedTaskId(link) }} {{ linkedTaskTitle(link) }}
            </span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
