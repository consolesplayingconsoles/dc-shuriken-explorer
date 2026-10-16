<script setup lang="ts">
// Canonical button. secondary = the drawer's .nd__act (surface + quiet border,
// surface-2 on hover); primary = the terracotta accent. Pass variant; default
// secondary. Loading state is built in: `loading` shows a spinner (inherits the
// text colour, so it works on any variant) and disables the button; `loadingText`
// optionally swaps the label while loading.
//   <UiButton variant="primary" :loading="building" loading-text="Building…">Build ROM</UiButton>
defineProps<{
  disabled?: boolean
  variant?: 'primary' | 'secondary'
  loading?: boolean
  loadingText?: string
}>()
</script>

<template>
  <button
    class="ui-btn"
    :class="`ui-btn--${variant || 'secondary'}`"
    :disabled="disabled || loading"
  >
    <span v-if="loading" class="ui-btn__spin" />
    <template v-if="loading && loadingText">{{ loadingText }}</template>
    <slot v-else />
  </button>
</template>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: var(--font-sans, inherit);
  font-size: 13px;
  padding: 7px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s, opacity 0.1s;
}
.ui-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ui-btn--secondary:hover:not(:disabled) {
  background: var(--surface-2);
  border-color: var(--line-strong);
}
.ui-btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}
.ui-btn--primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.ui-btn__spin {
  display: inline-block;
  width: 12px; height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  opacity: 0.85;
  animation: ui-btn-spin 0.8s linear infinite;
}
@keyframes ui-btn-spin { to { transform: rotate(360deg); } }
</style>
