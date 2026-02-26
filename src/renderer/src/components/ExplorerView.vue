<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTasksStore } from '@renderer/stores/tasks'
import type { FileNode } from '@renderer/types'

const { t } = useI18n()
const store = useTasksStore()

const tree = ref<FileNode[]>([])
const openDirs = ref<Set<string>>(new Set())
const selectedPath = ref<string | null>(null)
const fileContent = ref<string>('')
const loadingFile = ref(false)
const loadingTree = ref(false)
const fileError = ref<string | null>(null)

const selectedName = computed(() =>
  selectedPath.value ? selectedPath.value.split(/[/\\]/).pop() ?? '' : ''
)

const isTextFile = (name: string): boolean => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ['ts', 'js', 'vue', 'json', 'md', 'txt', 'css', 'html', 'yaml', 'yml',
    'toml', 'sh', 'env', 'py', 'rs', 'go', 'sql', 'prisma', 'gitignore'].includes(ext)
}


async function loadTree(): Promise<void> {
  if (!store.projectPath) return
  loadingTree.value = true
  try {
    tree.value = (await window.electronAPI.fsListDir(store.projectPath, store.projectPath)) as FileNode[]
    // Expand root level dirs by default
    for (const node of tree.value) {
      if (node.isDir) openDirs.value.add(node.path)
    }
  } finally {
    loadingTree.value = false
  }
}

async function selectFile(node: FileNode): Promise<void> {
  if (node.isDir) {
    if (openDirs.value.has(node.path)) openDirs.value.delete(node.path)
    else openDirs.value.add(node.path)
    return
  }
  selectedPath.value = node.path
  fileContent.value = ''
  fileError.value = null
  if (!isTextFile(node.name)) {
    fileError.value = t('explorer.binaryFile')
    return
  }
  loadingFile.value = true
  try {
    const result = await window.electronAPI.fsReadFile(node.path, store.projectPath)
    if (result.success) fileContent.value = result.content ?? ''
    else fileError.value = result.error ?? t('explorer.readError')
  } finally {
    loadingFile.value = false
  }
}

function lineCount(content: string): number {
  return content.split('\n').length
}

onMounted(loadTree)
</script>

<template>
  <div class="flex-1 flex overflow-hidden">
    <!-- Tree panel -->
    <div class="w-64 shrink-0 border-r border-edge-subtle overflow-y-auto flex flex-col">
      <div class="flex items-center justify-between px-3 py-2.5 border-b border-edge-subtle shrink-0">
        <span class="text-xs font-semibold text-content-subtle uppercase tracking-wider">{{ t('explorer.files') }}</span>
        <button
          class="w-5 h-5 flex items-center justify-center rounded text-content-subtle hover:text-content-tertiary hover:bg-surface-secondary transition-colors"
          :title="t('common.refresh')"
          @click="loadTree"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
            <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
          </svg>
        </button>
      </div>
      <div v-if="loadingTree" class="flex-1 flex items-center justify-center">
        <span class="text-xs text-content-faint animate-pulse">{{ t('explorer.loading') }}</span>
      </div>
      <div v-else-if="!store.projectPath" class="flex-1 flex items-center justify-center px-4">
        <span class="text-xs text-content-faint text-center">{{ t('common.noProject') }}</span>
      </div>
      <div v-else class="flex-1 py-0.5 select-none">
        <FileTreeNode
          v-for="node in tree"
          :key="node.path"
          :node="node"
          :open-dirs="openDirs"
          :selected-path="selectedPath"
          :depth="0"
          @select="selectFile"
        />
      </div>
    </div>

    <!-- Content panel -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <div class="flex items-center gap-3 px-4 py-2.5 border-b border-edge-subtle shrink-0 min-h-[41px]">
        <span v-if="selectedPath" class="text-xs font-mono text-content-tertiary truncate">{{ selectedName }}</span>
        <span v-else class="text-xs text-content-faint">{{ t('explorer.selectFile') }}</span>
        <span v-if="fileContent" class="ml-auto text-xs text-content-faint shrink-0">
          {{ lineCount(fileContent) }} {{ t('explorer.lines') }}
        </span>
      </div>
      <div class="flex-1 overflow-auto">
        <div v-if="loadingFile" class="flex items-center justify-center h-full">
          <span class="text-xs text-content-faint animate-pulse">{{ t('explorer.reading') }}</span>
        </div>
        <div v-else-if="fileError" class="flex items-center justify-center h-full px-8">
          <span class="text-xs text-content-subtle italic text-center">{{ fileError }}</span>
        </div>
        <pre
          v-else-if="fileContent"
          class="text-xs font-mono text-content-tertiary leading-relaxed p-4 whitespace-pre-wrap break-words"
        >{{ fileContent }}</pre>
        <div v-else class="flex items-center justify-center h-full">
          <span class="text-xs text-content-dim">—</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
// Sub-component: recursive file tree node — VS Code-style rendering
import { defineComponent, h } from 'vue'

// File extension → icon color mapping (VS Code inspired)
const EXT_COLORS: Record<string, string> = {
  ts: '#3178c6', tsx: '#3178c6',
  js: '#f1e05a', jsx: '#f1e05a',
  vue: '#41b883',
  json: '#cbcb41',
  md: '#519aba', txt: '#519aba',
  css: '#563d7c', scss: '#c6538c', less: '#1d365d',
  html: '#e34c26', htm: '#e34c26',
  py: '#3572a5', rs: '#dea584', go: '#00add8',
  sql: '#e38c00', sh: '#89e051', bash: '#89e051',
  yaml: '#cb171e', yml: '#cb171e', toml: '#9c4221',
}

function fileIconColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_COLORS[ext] ?? '#9ca3af'
}

// SVG icon factories (VS Code style, inline)
function chevronSvg(open: boolean) {
  return h('svg', {
    viewBox: '0 0 16 16', fill: 'currentColor',
    class: ['w-3 h-3 shrink-0 transition-transform duration-150', open ? 'rotate-90' : ''],
    style: { color: 'var(--content-subtle)' },
  }, [
    h('path', { d: 'M6 4l4 4-4 4', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ])
}

function folderSvg(open: boolean) {
  return open
    ? h('svg', { viewBox: '0 0 16 16', fill: 'currentColor', class: 'w-4 h-4 shrink-0', style: { color: '#dcb67a' } }, [
        h('path', { d: 'M1.75 3A1.75 1.75 0 0 0 0 4.75v7.5C0 13.216.784 14 1.75 14h12.5A1.75 1.75 0 0 0 16 12.25v-6.5A1.75 1.75 0 0 0 14.25 4H8.22a.25.25 0 0 1-.177-.073L6.957 2.841A1.75 1.75 0 0 0 5.721 2.25H1.75zM1.5 4.75a.25.25 0 0 1 .25-.25h3.971c.067 0 .13.026.177.073l1.086 1.086A1.75 1.75 0 0 0 8.22 5.5h6.03a.25.25 0 0 1 .25.25v6.5a.25.25 0 0 1-.25.25H1.75a.25.25 0 0 1-.25-.25z' }),
      ])
    : h('svg', { viewBox: '0 0 16 16', fill: 'currentColor', class: 'w-4 h-4 shrink-0', style: { color: '#c09553' } }, [
        h('path', { d: 'M1.75 3A1.75 1.75 0 0 0 0 4.75v7.5C0 13.216.784 14 1.75 14h12.5A1.75 1.75 0 0 0 16 12.25v-6.5A1.75 1.75 0 0 0 14.25 4H8.22a.25.25 0 0 1-.177-.073L6.957 2.841A1.75 1.75 0 0 0 5.721 2.25H1.75zM1.5 4.75a.25.25 0 0 1 .25-.25h3.971c.067 0 .13.026.177.073l1.086 1.086A1.75 1.75 0 0 0 8.22 5.5h6.03a.25.25 0 0 1 .25.25v6.5a.25.25 0 0 1-.25.25H1.75a.25.25 0 0 1-.25-.25z' }),
      ])
}

function fileSvg(name: string) {
  return h('svg', { viewBox: '0 0 16 16', fill: 'currentColor', class: 'w-4 h-4 shrink-0', style: { color: fileIconColor(name) } }, [
    h('path', { d: 'M3.75 1.5a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25V5.414a.25.25 0 0 0-.073-.177L9.263 2.073a.25.25 0 0 0-.177-.073H3.75zM2 1.75C2 .784 2.784 0 3.75 0h5.586c.464 0 .909.184 1.237.513l3.164 3.163c.329.328.513.773.513 1.237v8.337A1.75 1.75 0 0 1 12.5 15h-9A1.75 1.75 0 0 1 2 13.25z' }),
  ])
}

const FileTreeNode = defineComponent({
  name: 'FileTreeNode',
  props: {
    node: { type: Object as () => FileNode, required: true },
    openDirs: { type: Object as () => Set<string>, required: true },
    selectedPath: { type: String as () => string | null, default: null },
    depth: { type: Number, default: 0 },
  },
  emits: ['select'],
  setup(props, { emit }) {
    return () => {
      const node = props.node
      const isOpen = node.isDir && props.openDirs.has(node.path)
      const isSelected = props.selectedPath === node.path
      const indent = props.depth * 16

      // Build indentation guides (thin vertical lines like VS Code)
      const guides: ReturnType<typeof h>[] = []
      for (let i = 0; i < props.depth; i++) {
        guides.push(h('span', {
          class: 'absolute top-0 bottom-0 w-px',
          style: { left: `${12 + i * 16}px`, backgroundColor: 'var(--edge-subtle)' },
        }))
      }

      const label = h('button', {
        class: [
          'w-full relative flex items-center gap-1.5 h-[22px] text-left text-[13px] leading-[22px] transition-colors',
          isSelected
            ? 'bg-surface-tertiary text-content-primary'
            : 'text-content-secondary hover:bg-surface-secondary/70',
        ],
        style: { paddingLeft: `${8 + indent}px` },
        onClick: () => emit('select', node),
      }, [
        ...guides,
        // Chevron (dirs only)
        node.isDir ? chevronSvg(isOpen) : h('span', { class: 'w-3 shrink-0' }),
        // Icon
        node.isDir ? folderSvg(isOpen) : fileSvg(node.name),
        // Label
        h('span', { class: 'truncate' }, node.name),
      ])

      const children = isOpen && node.children?.length
        ? node.children.map(child =>
            h(FileTreeNode, {
              key: child.path,
              node: child,
              openDirs: props.openDirs,
              selectedPath: props.selectedPath,
              depth: props.depth + 1,
              onSelect: (n: FileNode) => emit('select', n),
            })
          )
        : []

      return h('div', [label, ...children])
    }
  },
})

export { FileTreeNode }
</script>
