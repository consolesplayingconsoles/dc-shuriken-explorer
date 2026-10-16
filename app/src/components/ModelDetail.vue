<script setup lang="ts">
// A model, or an assembly of model parts.
import DetailHead from './DetailHead.vue'
import Viewport from './Viewport.vue'
import { canRename, renameModel } from '../state'
import type { Item } from '../lib/dcgs'

defineProps<{ m: Item }>()
const fmtInt = (n: number) => n.toLocaleString('en-US')
const fmtNum = (n: number) => String(parseFloat(n.toFixed(Math.abs(n) >= 100 ? 1 : 3)))
</script>

<template>
  <div class="detail">
    <DetailHead :m="m" :rename="canRename && !m.asm ? () => renameModel(m) : undefined" />
    <div class="grid">
      <div class="stack main-col"><Viewport :mesh-id="m.id" /></div>
      <div class="stack side-col">
        <section class="card"><div class="card-b"><dl class="facts">
          <div><dt>Group</dt><dd>{{ m.group }}</dd></div>
          <div><dt>Pieces</dt><dd class="mono">{{ fmtInt(m.records || 0) }}</dd></div>
          <div><dt>Size</dt><dd class="mono">{{ fmtInt(m.bytes || 0) }} B</dd></div>
          <div><dt>Radius</dt><dd class="mono">{{ fmtNum(m.radius || 0) }}</dd></div>
        </dl></div></section>
      </div>
    </div>
  </div>
</template>
