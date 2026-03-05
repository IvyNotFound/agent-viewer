<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUpdater } from '@renderer/composables/useUpdater'

const { t } = useI18n()

const { status, progress, info, errorMessage, download, install, dismiss } = useUpdater()

const isVisible = computed(
  () =>
    status.value === 'available' ||
    status.value === 'downloading' ||
    status.value === 'downloaded' ||
    status.value === 'error',
)

const versionLabel = computed(() => (info.value?.version ? `v${info.value.version}` : ''))
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out overflow-hidden"
    enter-from-class="opacity-0 max-h-0 py-0"
    leave-active-class="transition-all duration-200 ease-in overflow-hidden"
    leave-to-class="opacity-0 max-h-0 py-0"
  >
    <div
      v-if="isVisible"
      class="flex items-center justify-between px-4 py-2 bg-violet-700 text-white text-sm shadow-lg shrink-0 max-h-12"
    >
      <!-- Available -->
      <template v-if="status === 'available'">
        <span>{{ t('update.available', { version: versionLabel }) }}</span>
        <button
          class="ml-4 px-3 py-1 bg-white text-violet-700 rounded font-medium hover:bg-violet-100 transition-colors text-xs"
          @click="download"
        >
          {{ t('update.download') }}
        </button>
      </template>

      <!-- Downloading -->
      <template v-else-if="status === 'downloading'">
        <span>{{ t('update.downloading') }}</span>
        <div class="flex items-center gap-2 ml-4">
          <div class="w-32 h-1.5 bg-violet-500 rounded-full overflow-hidden">
            <div
              class="h-full bg-white rounded-full transition-all duration-300"
              :style="{ width: `${progress}%` }"
            />
          </div>
          <span class="text-xs tabular-nums">{{ Math.round(progress) }}%</span>
        </div>
      </template>

      <!-- Downloaded -->
      <template v-else-if="status === 'downloaded'">
        <span>{{ t('update.ready', { version: versionLabel }) }}</span>
        <div class="flex items-center gap-2 ml-4">
          <button
            class="px-3 py-1 bg-white text-violet-700 rounded font-medium hover:bg-violet-100 transition-colors text-xs"
            @click="install"
          >
            {{ t('update.restart') }}
          </button>
          <button
            class="px-2 py-1 text-violet-200 hover:text-white transition-colors text-xs"
            @click="dismiss"
          >
            {{ t('update.later') }}
          </button>
        </div>
      </template>

      <!-- Error -->
      <template v-else-if="status === 'error'">
        <span class="text-red-200">{{ t('update.error', { msg: errorMessage ?? '' }) }}</span>
        <button
          class="ml-4 text-violet-200 hover:text-white transition-colors text-xs"
          @click="dismiss"
        >
          ✕
        </button>
      </template>
    </div>
  </Transition>
</template>
