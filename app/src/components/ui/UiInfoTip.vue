<script setup lang="ts">
// A small info icon whose note shows at once on hover or keyboard focus (a native title
// waits about a second and is easy to miss). The note goes in the slot; `align` picks the
// side the bubble grows from.
//   <UiInfoTip>Released together with the Japanese version.</UiInfoTip>
defineProps<{ align?: 'left' | 'right' }>()
</script>

<template>
  <span class="ui-tip" tabindex="0">
    <svg class="ui-tip__ic" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.4" />
      <rect x="7.25" y="7" width="1.5" height="4.5" rx="0.75" fill="currentColor" />
      <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
    </svg>
    <span class="ui-tip__bubble" :class="'ui-tip__bubble--' + (align || 'left')" role="tooltip"><slot /></span>
  </span>
</template>

<style scoped>
.ui-tip { position: relative; display: inline-flex; align-items: center; color: var(--text-faint); outline: none; }
.ui-tip__ic { width: 14px; height: 14px; }
.ui-tip:hover, .ui-tip:focus-visible { color: var(--text-muted); }
.ui-tip__bubble {
  position: absolute; top: calc(100% + 6px); z-index: 20;
  width: max-content; max-width: 280px; padding: 6px 10px;
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
  box-shadow: var(--shadow); color: var(--text-muted);
  font-size: 12px; font-weight: 400; line-height: 1.45; white-space: normal;
  opacity: 0; visibility: hidden; transition: opacity 0.1s;
}
.ui-tip__bubble--left { left: -6px; }
.ui-tip__bubble--right { right: -6px; }
.ui-tip:hover .ui-tip__bubble, .ui-tip:focus-visible .ui-tip__bubble { opacity: 1; visibility: visible; }
</style>
