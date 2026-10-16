<script setup lang="ts">
// Canonical soft-badge pill: one shape and one tone vocabulary for every status label in
// the app (it unified RobutekControl's rb-pill and the Roomba telemetry badges).
//
// `tone` names a CONCEPT, not a colour, and each one is a token trio in style.css
// (--<tone>, --<tone>-soft, --<tone>-ink) so a pill, a dot and a row tint of the same
// status match: ok = done/live/released, warn = held back or needing a decision,
// bad = failed/lost/refused, accent = Pluto's own voice (not a status), idle = none yet.
// The background and the text come from the same trio, which is what the hardcoded
// fallbacks here used to get wrong.
defineProps<{ tone?: 'ok' | 'warn' | 'bad' | 'accent' | 'idle' }>()
</script>

<template>
  <span class="uip" :class="'is-' + (tone || 'idle')"><slot /></span>
</template>

<style scoped>
.uip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px;
  background: var(--surface-3); color: var(--text-muted);
}
.uip.is-ok     { background: var(--ok-soft);     color: var(--ok-ink); }
.uip.is-warn   { background: var(--warn-soft);   color: var(--warn-ink); }
.uip.is-bad    { background: var(--bad-soft);    color: var(--bad-ink); }
.uip.is-accent { background: var(--accent-soft); color: var(--accent-hover); }
.uip.is-idle   { background: var(--surface-3);   color: var(--text-muted); }
</style>
