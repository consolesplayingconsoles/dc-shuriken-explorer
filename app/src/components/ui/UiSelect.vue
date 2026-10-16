<script setup lang="ts">
// Canonical dropdown. Mirrors Control.vue's select (the established pattern) but on
// WHITE, not grey — a grey field reads as disabled; white reads as active/ready.
// v-model-able: <UiSelect v-model="x"><option …/></UiSelect>
defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <select
    class="ui-select"
    :value="modelValue"
    :disabled="disabled"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <slot />
  </select>
</template>

<style scoped>
.ui-select {
  width: 100%;                     /* fill the container; the parent sets the width */
  font-family: var(--font-sans, inherit);
  font-size: 13px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 6px 10px;
  cursor: pointer;
}
.ui-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.ui-select:disabled {
  color: var(--text-faint);
  background: var(--surface-2);   /* grey == disabled, by design */
  cursor: not-allowed;
}
</style>
