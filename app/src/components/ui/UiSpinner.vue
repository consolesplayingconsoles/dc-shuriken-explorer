<script setup lang="ts">
// Canonical loading spinner — a rotating ring (quiet track + accent arc). Replaces
// the per-component border-spinners (tt-spinner, tt-tab-spin) and their duplicate
// @keyframes. `size` is the diameter in px. For spinners that sit ON a coloured
// button, UiButton keeps its own currentColor spinner (different context).
//   <UiSpinner :size="10" />
withDefaults(defineProps<{ size?: number }>(), { size: 14 })
</script>

<template>
  <span class="ui-spinner" :style="{ width: size + 'px', height: size + 'px' }" />
</template>

<style scoped>
.ui-spinner {
  display: inline-block;
  box-sizing: border-box;
  border: 2px solid var(--line-strong);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: ui-spin 0.8s linear infinite;
}
@keyframes ui-spin { to { transform: rotate(360deg); } }
</style>
