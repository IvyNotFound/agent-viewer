<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TaskNode } from '@renderer/utils/taskTree'
import { useTasksStore } from '@renderer/stores/tasks'
import AgentBadge from './AgentBadge.vue'
import { perimeterFg, perimeterBg, perimeterBorder } from '@renderer/utils/agentColor'
import { parseUtcDate } from '@renderer/utils/parseDate'

const { t, locale } = useI18n()

const props = defineProps<{
  node: TaskNode
}>()

const store = useTasksStore()

const expanded = ref(true)
const hasChildren = computed(() => props.node.children.length > 0)

function toggle(): void {
  if (hasChildren.value) expanded.value = !expanded.value
}

function formatDate(iso: string): string {
  const loc = locale.value === 'fr' ? 'fr-FR' : 'en-US'
  return parseUtcDate(iso).toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const EFFORT_LABEL: Record<number, string> = { 1: 'S', 2: 'M', 3: 'L' }
const EFFORT_COLOR: Record<number, string> = { 1: 'secondary', 2: 'warning', 3: 'error' }
</script>

<template>
  <div class="tree-node-wrapper">
    <!-- Node row — cursor-pointer kept for test selector compatibility -->
    <div
      class="node-row cursor-pointer"
      :class="node.depth > 0 ? 'node-row--child ml-4 pl-3' : ''"
      @click="store.openTask(node)"
    >
      <!-- Expand/collapse toggle -->
      <v-btn
        v-if="hasChildren"
        icon
        variant="text"
        density="compact"
        class="expand-btn"
        :title="expanded ? t('common.collapse') : t('common.expand')"
        @click.stop="toggle"
      >
        <v-icon
          class="expand-icon"
          :class="expanded ? 'expanded' : ''"
          size="14"
        >mdi-chevron-right</v-icon>
      </v-btn>
      <!-- Leaf spacer -->
      <span v-else class="leaf-spacer" />

      <!-- Card content -->
      <div class="node-content">
        <!-- Title row -->
        <div class="node-title-row ga-2">
          <p class="node-title text-body-2">{{ node.title }}</p>
          <!-- Badges -->
          <div class="node-badges ga-1">
            <v-chip
              v-if="node.effort"
              size="x-small"
              variant="tonal"
              :color="EFFORT_COLOR[node.effort]"
              density="compact"
            >{{ EFFORT_LABEL[node.effort] }}</v-chip>
            <span class="task-id">#{{ node.id }}</span>
          </div>
        </div>

        <!-- Meta: perimetre + agent + date -->
        <div class="node-meta">
          <v-chip
            v-if="node.scope"
            size="x-small"
            variant="outlined"
            rounded="sm"
            :style="{
              color: perimeterFg(node.scope),
              borderColor: perimeterBorder(node.scope),
              backgroundColor: perimeterBg(node.scope),
            }"
          >{{ node.scope }}</v-chip>
          <AgentBadge v-if="node.agent_name" :name="node.agent_name" :perimetre="node.agent_scope" class="agent-badge-sm" />
          <span class="node-date">{{ formatDate(node.updated_at) }}</span>
        </div>

        <!-- Children count hint when collapsed -->
        <p v-if="hasChildren && !expanded" class="children-hint text-caption font-weight-medium">
          {{ t('task.subtasks', node.children.length, { named: { n: node.children.length } }) }}
        </p>
      </div>
    </div>

    <!-- Recursive children -->
    <div v-if="hasChildren && expanded" class="node-children">
      <TaskTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
      />
    </div>
  </div>
</template>

<style scoped>
/* cursor-pointer kept as utility for test selector compatibility */
.cursor-pointer { cursor: pointer; }

.tree-node-wrapper {
  display: flex;
  flex-direction: column;
}

.node-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  border-radius: 8px;
  padding: 6px 8px;
  transition: background-color 0.15s;
}
.node-row:hover {
  background-color: var(--surface-secondary);
}

.node-row--child {
  border-left: 1px solid var(--edge-subtle);
}

.expand-btn {
  flex-shrink: 0;
  width: 1rem !important;
  height: 1rem !important;
  min-width: 1rem !important;
  min-height: 0 !important;
  color: var(--content-subtle) !important;
  padding: 0 !important;
  margin-top: 2px;
  transition: color 0.15s;
}
.expand-btn:hover {
  color: var(--content-muted) !important;
}

.expand-icon {
  width: 0.75rem;
  height: 0.75rem;
  transition: transform 0.15s;
}
.expand-icon.expanded {
  transform: rotate(90deg);
}

.leaf-spacer {
  flex-shrink: 0;
  width: 1rem;
}

.node-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.node-title-row {
  display: flex;
  align-items: flex-start;
}

.node-title {
  color: var(--content-primary);
  font-weight: 500;
  line-height: 1.4;
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
  margin: 0;
}

.node-badges {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.task-id {
  font-size: 0.625rem;
  color: var(--content-faint);
  font-family: ui-monospace, monospace;
}

.node-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.node-date {
  font-size: 0.625rem;
  color: var(--content-muted);
  font-family: ui-monospace, monospace;
  margin-left: auto;
}

.children-hint {
  color: var(--content-subtle);
  font-style: italic;
  margin: 0;
}

.node-children {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 2px;
}
</style>
