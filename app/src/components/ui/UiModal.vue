<script setup lang="ts">
// Reusable centred dialog: dimmed backdrop (click it to close), a title, a body slot and a
// right-aligned actions slot. Same look as the Translation tab's build pre-flight modal.
defineProps<{ title: string }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="ui-modal-backdrop" @click.self="$emit('close')">
    <div class="ui-modal" role="dialog" :aria-label="title">
      <h3 class="ui-modal__title">{{ title }}</h3>
      <slot />
      <div v-if="$slots.actions" class="ui-modal__actions"><slot name="actions" /></div>
    </div>
  </div>
</template>

<style scoped>
.ui-modal-backdrop {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(15, 23, 42, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.ui-modal {
  background: var(--surface); border: 1px solid var(--line-strong);
  border-radius: var(--r-lg); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
  padding: var(--sp-4); width: min(520px, 100%);
  font-family: var(--font-sans);
}
.ui-modal__title { margin: 0 0 var(--sp-3); font-size: 15px; font-weight: 600; color: var(--text); }
.ui-modal__actions { display: flex; justify-content: flex-end; gap: var(--sp-2); margin-top: var(--sp-4); }
</style>
