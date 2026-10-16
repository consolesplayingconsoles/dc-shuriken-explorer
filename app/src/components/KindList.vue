<script setup lang="ts">
// The kinds of the open category, above the search: label and count. An empty kind stays (its count reads 0).
import { S, counts, setKind, booting } from '../state'
import { KINDS, catOf } from '../lib/nav'
import { computed, ref } from 'vue'

const kinds = computed(() => catOf(S.kind).kinds)
const root = ref<HTMLElement | null>(null)
const emit = defineEmits<{ (e: 'down'): void }>()
function key(e: KeyboardEvent, i: number) {
  const rows = root.value ? [...root.value.querySelectorAll<HTMLElement>('.krow')] : []
  if (e.key === 'ArrowDown') {
    if (i + 1 < rows.length) { setKind(kinds.value[i + 1].key); rows[i + 1].focus() } else emit('down')
  } else if (e.key === 'ArrowUp' && i > 0) { setKind(kinds.value[i - 1].key); rows[i - 1].focus() } else return
  e.preventDefault()
}
const keyNum = (k: string) => KINDS.findIndex((x) => x.key === k) + 1
</script>

<template>
  <div v-if="kinds.length > 1" ref="root" class="kindlist" role="tablist" aria-orientation="vertical" aria-label="Kinds">
    <button v-for="(k, i) in kinds" :key="k.key" class="krow" :class="{ 'is-empty': !booting && !counts[k.key] }" type="button" role="tab"
            :aria-selected="S.kind === k.key" :tabindex="S.kind === k.key ? 0 : -1" :title="k.label + ' (' + keyNum(k.key) + ')'"
            @click="setKind(k.key)" @keydown="key($event, i)">
      <span class="label">{{ k.label }}</span>
      <span v-if="booting" class="count-skel"></span>
      <span v-else class="count">{{ counts[k.key] }}</span>
    </button>
  </div>
</template>
