<script setup lang="ts">
// Canonical icon button — collapses the scattered one-off icon buttons. The only
// real axis is the LOOK: `bordered` (surface + quiet border, the default) or
// `ghost` (transparent, faint → accent). Square-ish, one consistent size; the icon
// (glyph, emoji, or <svg>) goes in the slot. title/@click/etc. fall through.
//   <UiIconButton variant="ghost" title="Copy" @click="copy"><svg…/></UiIconButton>
// `active` = pressed/selected (accent fill, for toggles). `danger` = destructive
// affordance (red on hover, e.g. delete).
defineProps<{ variant?: 'bordered' | 'ghost'; disabled?: boolean; active?: boolean; danger?: boolean }>()
</script>

<template>
  <button class="ui-ibtn"
          :class="[`ui-ibtn--${variant || 'bordered'}`, { 'ui-ibtn--active': active, 'ui-ibtn--danger': danger }]"
          :disabled="disabled">
    <slot />
  </button>
</template>

<style scoped>
.ui-ibtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 26px; min-height: 26px;
  padding: 2px 4px;
  border-radius: var(--r-sm);
  font-size: 14px; line-height: 1;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}
.ui-ibtn:disabled { opacity: 0.5; cursor: not-allowed; }
.ui-ibtn--bordered {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
}
.ui-ibtn--bordered:hover:not(:disabled) {
  background: var(--surface-2);
  border-color: var(--line-strong);
}
.ui-ibtn--ghost {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-faint);
}
.ui-ibtn--ghost:hover:not(:disabled) {
  color: var(--accent);
  background: var(--accent-soft);
}
.ui-ibtn--active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}
.ui-ibtn--danger:hover:not(:disabled) {
  background: transparent;
  border-color: var(--bad);
  color: var(--bad);
}
</style>
