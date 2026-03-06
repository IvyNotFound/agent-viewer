<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CliType, CliInstance } from '@shared/cli-types'

const props = defineProps<{
  instances: CliInstance[]
  enabled: CliType[]
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'toggle', cli: CliType): void
}>()

const { t } = useI18n()

interface CliMeta {
  cli: CliType
  label: string
  vendor: string
}

const CLI_META: CliMeta[] = [
  { cli: 'claude',    label: 'Claude Code',   vendor: 'Anthropic' },
  { cli: 'codex',     label: 'Codex CLI',     vendor: 'OpenAI' },
  { cli: 'gemini',    label: 'Gemini CLI',    vendor: 'Google' },
  { cli: 'opencode',  label: 'OpenCode',      vendor: 'SST' },
  { cli: 'aider',     label: 'Aider',         vendor: 'Paul Gauthier' },
  { cli: 'goose',     label: 'Goose',         vendor: 'Block' },
]

function instancesFor(cli: CliType): CliInstance[] {
  return props.instances.filter(i => i.cli === cli)
}

function versionLabel(cli: CliType): string {
  const found = instancesFor(cli)
  if (found.length === 0) return t('settings.cliNotDetected')
  const v = found[0].version
  const count = found.length
  return count > 1 ? `v${v} (×${count})` : `v${v}`
}

function isDetected(cli: CliType): boolean {
  return instancesFor(cli).length > 0
}

function isEnabled(cli: CliType): boolean {
  return props.enabled.includes(cli)
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <!-- Refresh button -->
    <div class="flex justify-end mb-2">
      <button
        :disabled="loading"
        class="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-surface-secondary hover:bg-surface-tertiary text-content-muted hover:text-content-primary border border-edge-subtle rounded-md transition-colors disabled:opacity-50"
        @click="emit('refresh')"
      >
        <!-- spinner while loading -->
        <svg
          v-if="loading"
          class="w-3 h-3 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
        <svg v-else viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
          <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
          <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
        </svg>
        {{ loading ? t('settings.cliRefreshing') : t('settings.cliRefresh') }}
      </button>
    </div>

    <!-- CLI rows -->
    <div
      v-for="meta in CLI_META"
      :key="meta.cli"
      class="flex items-center justify-between py-2 px-3 rounded-md bg-surface-secondary border border-edge-subtle"
    >
      <!-- Left: name + vendor + version badge -->
      <div class="flex items-center gap-2 min-w-0">
        <div class="flex flex-col min-w-0">
          <span class="text-sm font-medium text-content-primary leading-tight">{{ meta.label }}</span>
          <span class="text-[10px] text-content-subtle leading-tight">{{ meta.vendor }}</span>
        </div>
        <span
          :class="[
            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0',
            isDetected(meta.cli)
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'bg-surface-tertiary text-content-faint border border-edge-subtle'
          ]"
        >
          {{ versionLabel(meta.cli) }}
        </span>
      </div>

      <!-- Right: toggle -->
      <button
        :title="isEnabled(meta.cli) ? t('settings.cliEnabled') : t('settings.cliDisabled')"
        :class="[
          'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
          isEnabled(meta.cli) ? 'bg-violet-600' : 'bg-surface-tertiary border border-edge-default'
        ]"
        role="switch"
        :aria-checked="isEnabled(meta.cli)"
        @click="emit('toggle', meta.cli)"
      >
        <span
          :class="[
            'pointer-events-none inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform duration-200',
            isEnabled(meta.cli) ? 'translate-x-4' : 'translate-x-0.5'
          ]"
        />
      </button>
    </div>
  </div>
</template>
