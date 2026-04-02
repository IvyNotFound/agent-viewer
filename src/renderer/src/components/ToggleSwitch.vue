<script setup lang="ts">
defineProps<{ modelValue: boolean; disabled?: boolean }>()
defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    class="toggle-switch"
    :class="modelValue ? 'is-on' : 'is-off'"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="toggle-thumb" />
  </button>
</template>

<style scoped>
.toggle-switch {
  position: relative;
  flex-shrink: 0;
  width: 2.5rem;
  height: 1.25rem;
  border-radius: 9999px;
  border: none;
  outline: none;
  cursor: pointer;
  transition: background-color 0.2s;
  background-color: var(--surface-tertiary);
}
.toggle-switch:focus-visible {
  box-shadow: 0 0 0 2px rgb(var(--v-theme-primary, 124 58 237));
}
.toggle-switch.is-on {
  background-color: rgb(var(--v-theme-primary, 124 58 237));
}
.toggle-switch:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.toggle-thumb {
  position: absolute;
  top: 0.125rem;
  left: 0.125rem;
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  background-color: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
}
.is-on .toggle-thumb {
  transform: translateX(1.25rem);
}
</style>
