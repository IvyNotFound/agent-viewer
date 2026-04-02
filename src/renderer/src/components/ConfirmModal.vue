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
      <v-card>
        <!-- Header -->
        <v-toolbar color="surface" density="compact">
          <v-toolbar-title>{{ props.title }}</v-toolbar-title>
        </v-toolbar>

        <!-- Body -->
        <v-card-text>
          <p class="text-body-2 text-medium-emphasis">{{ props.message }}</p>
        </v-card-text>

        <!-- Footer -->
        <v-card-actions>
          <v-spacer />
          <button
            class="btn-cancel text-body-2"
            @click="emit('cancel')"
          >
            {{ props.cancelLabel ?? t('common.cancel') }}
          </button>
          <button
            class="btn-confirm text-body-2"
            :class="props.danger ? 'btn-confirm--danger' : 'btn-confirm--primary'"
            @click="emit('confirm')"
          >
            {{ props.confirmLabel ?? t('common.confirm') }}
          </button>
        </v-card-actions>
      </v-card>
    </div>
  </v-dialog>
</template>

<style scoped>
.btn-cancel {
  padding: 8px 16px;
  border-radius: 8px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  transition: background-color 0.15s, color 0.15s;
}
.btn-cancel:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.87);
}

.btn-confirm {
  padding: 8px 16px;
  font-weight: 500;
  border-radius: 8px;
  color: #fff;
  transition: background-color 0.15s;
}
.btn-confirm--danger   { background-color: rgb(220 38 38); }
.btn-confirm--danger:hover   { background-color: rgb(239 68 68); }
.btn-confirm--primary  { background-color: rgb(var(--v-theme-primary)); }
.btn-confirm--primary:hover  { background-color: rgb(var(--v-theme-primary) / 0.85); }
</style>
