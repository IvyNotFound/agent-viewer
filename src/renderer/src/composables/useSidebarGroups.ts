/**
 * Composable: agent group management (rename, create, delete) in the Sidebar (T815).
 */
import { ref, nextTick } from 'vue'
import { useTasksStore } from '@renderer/stores/tasks'

export function useSidebarGroups() {
  const store = useTasksStore()

  const confirmDeleteGroup = ref<{ groupId: number } | null>(null)

  // ── Inline rename ───────────────────────────────────────────────────────────
  const renamingGroupId = ref<number | null>(null)
  const renameGroupName = ref('')
  const renameGroupInputEl = ref<HTMLInputElement | null>(null)

  async function startRename(group: { id: number; name: string }): Promise<void> {
    renamingGroupId.value = group.id
    renameGroupName.value = group.name
    await nextTick()
    renameGroupInputEl.value?.focus()
  }

  async function confirmRename(groupId: number): Promise<void> {
    const name = renameGroupName.value.trim()
    if (name) await store.renameAgentGroup(groupId, name)
    renamingGroupId.value = null
  }

  function cancelRename(): void {
    renamingGroupId.value = null
  }

  // ── Create group ────────────────────────────────────────────────────────────
  const creatingGroup = ref(false)
  const newGroupName = ref('')
  const createGroupInputEl = ref<HTMLInputElement | null>(null)

  async function startCreateGroup(): Promise<void> {
    creatingGroup.value = true
    newGroupName.value = ''
    await nextTick()
    createGroupInputEl.value?.focus()
  }

  async function confirmCreateGroup(): Promise<void> {
    const name = newGroupName.value.trim()
    if (name) await store.createAgentGroup(name)
    creatingGroup.value = false
  }

  function cancelCreateGroup(): void {
    creatingGroup.value = false
  }

  // ── Delete group ────────────────────────────────────────────────────────────
  async function handleDeleteGroup(groupId: number): Promise<void> {
    const members = store.agentGroups.find(g => g.id === groupId)?.members ?? []
    if (members.length > 0) {
      confirmDeleteGroup.value = { groupId }
      return
    }
    await store.deleteAgentGroup(groupId)
  }

  async function onConfirmDeleteGroup(): Promise<void> {
    if (!confirmDeleteGroup.value) return
    await store.deleteAgentGroup(confirmDeleteGroup.value.groupId)
    confirmDeleteGroup.value = null
  }

  return {
    confirmDeleteGroup,
    renamingGroupId,
    renameGroupName,
    renameGroupInputEl,
    startRename,
    confirmRename,
    cancelRename,
    creatingGroup,
    newGroupName,
    createGroupInputEl,
    startCreateGroup,
    confirmCreateGroup,
    cancelCreateGroup,
    handleDeleteGroup,
    onConfirmDeleteGroup,
  }
}
