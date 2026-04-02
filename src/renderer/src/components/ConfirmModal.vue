<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}>(), {
  danger: false,
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const { t } = useI18n()
</script>

<template>
  <v-dialog model-value max-width="384" @update:model-value="emit('cancel')">
    <!-- data-testid wrapper catches @click.self for test compat (Vuetify handles overlay in prod) -->
    <div data-testid="confirm-modal-wrapper" @click.self="emit('cancel')">
      <v-card class="flex flex-col overflow-hidden">
        <!-- Header -->
        <v-toolbar color="surface" density="compact">
          <v-toolbar-title class="text-sm font-semibold">{{ props.title }}</v-toolbar-title>
        </v-toolbar>

        <!-- Body -->
        <v-card-text>
          <p class="text-sm text-content-secondary">{{ props.message }}</p>
        </v-card-text>

        <!-- Footer -->
        <v-card-actions>
          <v-spacer />
          <button
            class="px-4 py-2 text-sm text-content-muted hover:text-content-secondary hover:bg-surface-secondary rounded-lg transition-colors"
            @click="emit('cancel')"
          >
            {{ props.cancelLabel ?? t('common.cancel') }}
          </button>
          <button
            class="px-4 py-2 text-sm font-medium text-white rounded-lg transition-all"
            :class="props.danger ? 'bg-red-600 hover:bg-red-500' : 'bg-violet-600 hover:bg-violet-500'"
            @click="emit('confirm')"
          >
            {{ props.confirmLabel ?? t('common.confirm') }}
          </button>
        </v-card-actions>
      </v-card>
    </div>
  </v-dialog>
</template>
