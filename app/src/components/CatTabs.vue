<script setup lang="ts">
// The categories: Graphics, Audio, Text, Code. Each shows the sum of its kinds' counts (Graphics: models, skeletons, model
// textures and images). Left/right arrows move between them (roving tabindex).
import { ref, watch } from 'vue'
import { S, counts, setKind, booting } from '../state'
import { NAV, catOf, type Cat } from '../lib/nav'
import type { Kind } from '../lib/dcgs'

const root = ref<HTMLElement | null>(null)
// Coming back to Graphics returns to the graphics kind last open.
let graphics: Kind = 'models'
watch(() => S.kind, (k) => { if (catOf(k).key === 'graphics') graphics = k }, { immediate: true })
function go(c: Cat) { if (catOf(S.kind).key !== c.key) setKind(c.key === 'graphics' ? graphics : c.kinds[0].key) }
function key(e: KeyboardEvent, i: number) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const j = (i + (e.key === 'ArrowRight' ? 1 : NAV.length - 1)) % NAV.length
  go(NAV[j]); root.value?.querySelectorAll<HTMLElement>('button')[j]?.focus(); e.preventDefault()
}
</script>

<template>
  <nav ref="root" aria-label="Categories" role="tablist">
    <button v-for="(c, i) in NAV" :key="c.key" class="cat" type="button" role="tab"
            :aria-selected="catOf(S.kind).key === c.key" :tabindex="catOf(S.kind).key === c.key ? 0 : -1"
            @click="go(c)" @keydown="key($event, i)">
      {{ c.label }}<span v-if="!booting" class="n">{{ c.kinds.reduce((n, k) => n + counts[k.key], 0) }}</span>
    </button>
  </nav>
</template>
