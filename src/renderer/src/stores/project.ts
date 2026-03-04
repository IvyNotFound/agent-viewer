/**
 * Pinia store for project-level state: active database path and project directory.
 *
 * Persists `projectPath` and `dbPath` to `localStorage` so they survive app restarts.
 * Acts as the single source of truth consumed by `useTasksStore` and `useAgentsStore`.
 *
 * @module stores/project
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useProjectStore = defineStore('project', () => {
  const projectPath = ref<string | null>(localStorage.getItem('projectPath'))
  const dbPath = ref<string | null>(localStorage.getItem('dbPath'))
  const setupWizardTarget = ref<{ projectPath: string; hasCLAUDEmd: boolean } | null>(null)

  /**
   * Updates the active project directory without triggering a database reload.
   * Used when the project folder is renamed or relocated after connection.
   * @param path - Absolute path to the project directory.
   */
  function setProjectPathOnly(path: string): void {
    projectPath.value = path
    localStorage.setItem('projectPath', path)
  }

  /**
   * Clears the setup wizard target, hiding the new-project wizard modal.
   */
  function closeWizard(): void {
    setupWizardTarget.value = null
  }

  return { projectPath, dbPath, setupWizardTarget, setProjectPathOnly, closeWizard }
})
