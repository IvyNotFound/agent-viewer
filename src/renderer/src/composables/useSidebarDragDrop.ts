/**
 * Composable: HTML5 drag-and-drop for moving agents between sidebar groups.
 *
 * Tracks the dragged agent id and the currently hovered drop target group.
 * On drop, calls `store.setAgentGroup(agentId, targetGroupId)` to persist
 * the new membership. Passing `targetGroupId = null` moves the agent to the
 * ungrouped section.
 */
import { ref } from 'vue'
import type { Agent } from '@renderer/types'
import { useTasksStore } from '@renderer/stores/tasks'

export function useSidebarDragDrop() {
  const store = useTasksStore()

  const dragAgentId = ref<number | null>(null)
  const dragOverGroupId = ref<number | null | '__ungrouped__'>(null)

  function onAgentDragStart(event: DragEvent, agent: Agent): void {
    dragAgentId.value = agent.id
    event.dataTransfer!.setData('agent-id', String(agent.id))
    event.dataTransfer!.effectAllowed = 'move'
  }

  function onGroupDragOver(event: DragEvent, groupId: number | null): void {
    event.preventDefault()
    dragOverGroupId.value = groupId === null ? '__ungrouped__' : groupId
    event.dataTransfer!.dropEffect = 'move'
  }

  function onGroupDragLeave(event: DragEvent): void {
    const target = event.currentTarget as HTMLElement
    // relatedTarget is null when dragging outside the window — contains(null) returns false → correct reset
    if (target.contains(event.relatedTarget as Node)) return
    dragOverGroupId.value = null
  }

  async function onGroupDrop(event: DragEvent, targetGroupId: number | null): Promise<void> {
    event.preventDefault()
    dragOverGroupId.value = null
    const agentId = Number(event.dataTransfer!.getData('agent-id'))
    dragAgentId.value = null
    if (!agentId) return
    await store.setAgentGroup(agentId, targetGroupId)
  }

  return {
    dragAgentId,
    dragOverGroupId,
    onAgentDragStart,
    onGroupDragOver,
    onGroupDragLeave,
    onGroupDrop,
  }
}
