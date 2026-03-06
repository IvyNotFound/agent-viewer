<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTasksStore } from '@renderer/stores/tasks'
import { useAgentsStore } from '@renderer/stores/agents'
import { agentFg } from '@renderer/utils/agentColor'

const { t } = useI18n()
const store = useTasksStore()
const agentStore = useAgentsStore()

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentRow {
  id: number
  name: string
  type: string
  perimetre: string | null
  session_statut: string | null
  tasks_in_progress: number
  tasks_todo: number
}

type DotStatus = 'cyan' | 'green' | 'yellow' | 'red' | 'gray'

interface LayoutNode {
  id: number
  name: string
  type: string
  status: DotStatus
  x: number
  y: number
}

interface LayoutGroup {
  key: string
  label: string
  x: number
  y: number
  w: number
  agents: LayoutNode[]
}

// ── Data ──────────────────────────────────────────────────────────────────────

const agents = ref<AgentRow[]>([])
const loading = ref(false)

async function fetchData(): Promise<void> {
  if (!store.dbPath) return
  loading.value = true
  try {
    const [result] = await Promise.all([
      window.electronAPI.queryDb(
        store.dbPath,
        `SELECT a.id, a.name, a.type, a.perimetre,
                s.statut as session_statut,
                (SELECT COUNT(*) FROM tasks WHERE agent_assigne_id = a.id AND statut = 'in_progress') as tasks_in_progress,
                (SELECT COUNT(*) FROM tasks WHERE agent_assigne_id = a.id AND statut = 'todo') as tasks_todo
         FROM agents a
         LEFT JOIN sessions s ON s.id = (
           SELECT s2.id FROM sessions s2 WHERE s2.agent_id = a.id
           ORDER BY s2.started_at DESC LIMIT 1
         )
         ORDER BY a.name`,
        []
      ) as Promise<AgentRow[]>,
      agentStore.fetchAgentGroups(),
    ])
    agents.value = result
  } catch {
    agents.value = []
  } finally {
    loading.value = false
  }
}

// ── Status ────────────────────────────────────────────────────────────────────

function dotStatus(agent: AgentRow): DotStatus {
  if (agent.session_statut === 'blocked') return 'red'
  if (agent.session_statut === 'started') return 'cyan'
  if (agent.tasks_todo > 0) return 'green'
  if (agent.tasks_in_progress > 0) return 'cyan'
  if (!agent.session_statut) return 'gray'
  return 'yellow'
}

const DOT_COLORS: Record<DotStatus, string> = {
  cyan: '#06b6d4',
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
  gray: '#52525b',
}

// ── Layout ────────────────────────────────────────────────────────────────────

const CARD_W = 148
const CARD_H = 68
const H_GAP = 14
const V_GAP = 72
const GROUP_H = 38
const GROUP_H_GAP = 22
const PADDING = 32

function buildGroupColumn(
  key: string,
  label: string,
  groupAgents: AgentRow[],
  curX: number,
): LayoutGroup {
  const n = groupAgents.length
  const groupW = Math.max(CARD_W, n * CARD_W + (n - 1) * H_GAP)
  const nodes: LayoutNode[] = groupAgents.map((a, i) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    status: dotStatus(a),
    x: curX + i * (CARD_W + H_GAP),
    y: PADDING + GROUP_H + V_GAP,
  }))
  return { key, label, x: curX, y: PADDING, w: groupW, agents: nodes }
}

const layout = computed<{ groups: LayoutGroup[]; totalW: number; totalH: number }>(() => {
  const groups: LayoutGroup[] = []
  let curX = PADDING

  if (agentStore.agentGroups.length > 0) {
    // Group agents by agent_groups membership
    const agentGroupMap = new Map<number, number>() // agentId → groupId
    for (const group of agentStore.agentGroups) {
      for (const member of group.members) {
        agentGroupMap.set(member.agent_id, group.id)
      }
    }

    const sortedGroups = [...agentStore.agentGroups].sort((a, b) => a.sort_order - b.sort_order)

    for (const group of sortedGroups) {
      const groupAgents = agents.value.filter(a => agentGroupMap.get(a.id) === group.id)
      if (groupAgents.length === 0) continue
      const col = buildGroupColumn(String(group.id), group.name, groupAgents, curX)
      groups.push(col)
      curX += col.w + GROUP_H_GAP
    }

    // Ungrouped agents
    const ungrouped = agents.value.filter(a => !agentGroupMap.has(a.id))
    if (ungrouped.length > 0) {
      const col = buildGroupColumn('__ungrouped__', t('orgchart.ungrouped'), ungrouped, curX)
      groups.push(col)
      curX += col.w + GROUP_H_GAP
    }
  } else {
    // Fallback: group by perimetre
    const grouped = new Map<string, AgentRow[]>()
    for (const a of agents.value) {
      const key = a.perimetre ?? '__global__'
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(a)
    }

    const sortedKeys = [...grouped.keys()].sort((a, b) => {
      if (a === '__global__') return 1
      if (b === '__global__') return -1
      return a.localeCompare(b)
    })

    for (const key of sortedKeys) {
      const label = key === '__global__' ? t('topology.global') : key
      const col = buildGroupColumn(key, label, grouped.get(key)!, curX)
      groups.push(col)
      curX += col.w + GROUP_H_GAP
    }
  }

  const totalW = groups.length > 0 ? curX - GROUP_H_GAP + PADDING : PADDING * 2
  const totalH = PADDING + GROUP_H + V_GAP + CARD_H + PADDING

  return { groups, totalW, totalH }
})

// ── Pan/zoom ──────────────────────────────────────────────────────────────────

const transform = ref({ x: 0, y: 0, scale: 1 })
const dragging = ref(false)
const dragStart = ref({ mx: 0, my: 0, tx: 0, ty: 0 })
const svgEl = ref<SVGSVGElement | null>(null)

function onWheel(e: WheelEvent): void {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  transform.value.scale = Math.min(2, Math.max(0.15, transform.value.scale * delta))
}

function onMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return
  dragging.value = true
  dragStart.value = { mx: e.clientX, my: e.clientY, tx: transform.value.x, ty: transform.value.y }
}

function onMouseMove(e: MouseEvent): void {
  if (!dragging.value) return
  transform.value.x = dragStart.value.tx + (e.clientX - dragStart.value.mx)
  transform.value.y = dragStart.value.ty + (e.clientY - dragStart.value.my)
}

function onMouseUp(): void {
  dragging.value = false
}

function fitView(): void {
  if (!svgEl.value) return
  const { totalW, totalH } = layout.value
  const rect = svgEl.value.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0 || totalW === 0 || totalH === 0) return
  const scale = Math.min(1, Math.min(rect.width / totalW, rect.height / totalH) * 0.92)
  transform.value = {
    x: (rect.width - totalW * scale) / 2,
    y: (rect.height - totalH * scale) / 2,
    scale,
  }
}

// ── Lifecycle & auto-refresh ──────────────────────────────────────────────────

let refreshTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await fetchData()
  fitView()
  refreshTimer = setInterval(fetchData, 5000)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('mousemove', onMouseMove)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('mousemove', onMouseMove)
})

watch(() => store.dbPath, async () => { await fetchData(); fitView() })

// ── Connector path helpers ────────────────────────────────────────────────────

function connectorPath(gx: number, gw: number, gy: number, nx: number, ny: number): string {
  const px = gx + gw / 2
  const py = gy + GROUP_H
  const cx = nx + CARD_W / 2
  const cy = ny
  const midY = py + (cy - py) / 2
  return `M ${px} ${py} L ${px} ${midY} L ${cx} ${midY} L ${cx} ${cy}`
}


</script>

<template>
  <div class="flex flex-col h-full bg-surface-primary overflow-hidden">
    <!-- Header -->
    <div class="shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-edge-subtle bg-surface-base">
      <div class="flex items-center gap-3">
        <h2 class="text-sm font-semibold text-content-secondary">{{ t('orgchart.agentsTitle') }}</h2>
        <span v-if="loading" class="text-[10px] text-content-faint animate-pulse">•••</span>
      </div>
      <div class="flex items-center gap-2">
        <!-- Legend -->
        <div class="hidden sm:flex items-center gap-3 mr-3">
          <span v-for="(color, key) in DOT_COLORS" :key="key" class="flex items-center gap-1 text-[10px] text-content-faint">
            <span class="w-2 h-2 rounded-full inline-block" :style="{ background: color }"></span>
            <span>{{ key === 'cyan' ? t('orgchart.status.active') : key === 'green' ? t('orgchart.status.todo') : key === 'yellow' ? t('orgchart.status.idle') : key === 'red' ? t('orgchart.status.blocked') : t('orgchart.status.inactive') }}</span>
          </span>
        </div>
        <button
          class="px-2.5 py-1 text-xs bg-surface-secondary hover:bg-surface-tertiary text-content-muted rounded transition-colors"
          @click="fitView"
        >Fit</button>
        <button
          class="px-2.5 py-1 text-xs text-content-subtle hover:text-content-secondary transition-colors"
          @click="fetchData"
        >↻</button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!loading && agents.length === 0" class="flex items-center justify-center flex-1">
      <p class="text-sm text-content-faint italic">{{ t('orgchart.noAgents') }}</p>
    </div>

    <!-- SVG Canvas -->
    <svg
      v-else
      ref="svgEl"
      class="flex-1 w-full"
      :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
      @wheel.passive="onWheel"
      @mousedown="onMouseDown"
    >
      <g :transform="`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`">
        <!-- Connector lines -->
        <template v-for="group in layout.groups" :key="`conn-${group.key}`">
          <path
            v-for="node in group.agents"
            :key="`path-${node.id}`"
            :d="connectorPath(group.x, group.w, group.y, node.x, node.y)"
            fill="none"
            stroke="#3f3f46"
            stroke-width="1.5"
          />
        </template>

        <!-- Group headers -->
        <g v-for="group in layout.groups" :key="`grp-${group.key}`">
          <rect
            :x="group.x"
            :y="group.y"
            :width="group.w"
            :height="GROUP_H"
            rx="7"
            fill="#27272a"
            stroke="#3f3f46"
            stroke-width="1"
          />
          <text
            :x="group.x + group.w / 2"
            :y="group.y + GROUP_H / 2 + 4"
            text-anchor="middle"
            font-size="11"
            font-family="ui-monospace, monospace"
            font-weight="600"
            fill="#a1a1aa"
          >{{ group.label }}</text>
        </g>

        <!-- Agent cards -->
        <g
          v-for="node in layout.groups.flatMap(g => g.agents)"
          :key="`card-${node.id}`"
        >
          <!-- Card background -->
          <rect
            :x="node.x"
            :y="node.y"
            :width="CARD_W"
            :height="CARD_H"
            rx="8"
            fill="#1c1c1e"
            stroke="#3f3f46"
            stroke-width="1"
          />
          <!-- Status dot -->
          <circle
            :cx="node.x + CARD_W - 12"
            :cy="node.y + 12"
            r="5"
            :fill="DOT_COLORS[node.status]"
          >
            <animate
              v-if="node.status === 'cyan'"
              attributeName="opacity"
              values="1;0.4;1"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
          <!-- Agent name -->
          <text
            :x="node.x + 10"
            :y="node.y + 22"
            font-size="12"
            font-family="ui-monospace, monospace"
            font-weight="700"
            :fill="agentFg(node.name)"
          >{{ node.name.length > 16 ? node.name.slice(0, 15) + '…' : node.name }}</text>
          <!-- Type label -->
          <text
            :x="node.x + 10"
            :y="node.y + 38"
            font-size="10"
            font-family="ui-monospace, monospace"
            fill="#71717a"
          >{{ node.type }}</text>
          <!-- Status label -->
          <text
            :x="node.x + 10"
            :y="node.y + 56"
            font-size="10"
            font-family="ui-sans-serif, system-ui, sans-serif"
            :fill="DOT_COLORS[node.status]"
          >{{ node.status === 'cyan' ? t('orgchart.status.active') : node.status === 'green' ? t('orgchart.status.todoAssigned') : node.status === 'yellow' ? t('orgchart.status.idle') : node.status === 'red' ? t('orgchart.status.blocked') : t('orgchart.status.inactive') }}</text>
        </g>
      </g>
    </svg>
  </div>
</template>
