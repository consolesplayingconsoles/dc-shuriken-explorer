<script setup lang="ts">
// A picture of the disc: the image, how it is stored, and where.
import { computed, ref, watch } from 'vue'
import DetailHead from './DetailHead.vue'
import { imageUrl } from '../lib/source'
import { canRename, renameImage } from '../state'
import { DT, PF, type Item } from '../lib/dcgs'

const props = defineProps<{ m: Item }>()
const p = computed(() => props.m.pic!)
const bad = ref(false)
const src = ref('')
const pal = ref('')
watch(() => props.m.id, async (id) => {
  bad.value = false; src.value = ''; pal.value = ''
  const r = await imageUrl(p.value)
  if (props.m.id !== id) return
  if (r.url) { src.value = r.url; pal.value = r.palette } else bad.value = true
}, { immediate: true })
const KIND: Record<string, string> = { gif: 'GIF', jpg: 'JPEG', png: 'PNG' }
const fmtInt = (n: number) => n.toLocaleString('en-US')
</script>

<template>
  <div class="detail">
    <DetailHead :m="m" :ref-text="p.file + ':0x' + p.offset.toString(16).toUpperCase()" :rename="canRename ? () => renameImage(m) : undefined" />
    <div class="grid">
      <div class="stack main-col">
        <section class="card"><div class="texbox">
          <div v-if="bad" class="notex">This format is not decoded</div>
          <img v-else-if="src" class="tex" alt="" :src="src" @error="bad = true">
        </div></section>
      </div>
      <div class="stack side-col">
        <section class="card"><div class="card-b"><dl class="facts">
          <div><dt>Size</dt><dd class="mono">{{ p.w }} x {{ p.h }}</dd></div>
          <template v-if="p.kind === 'pvr'">
            <div><dt>Format</dt><dd>{{ PF[p.pf] || p.pf }}</dd></div>
            <div><dt>Type</dt><dd>{{ DT[p.dt] || 'Type ' + p.dt }}</dd></div>
          </template>
          <div v-else><dt>Format</dt><dd>{{ KIND[p.kind] }}</dd></div>
          <div><dt>Bytes</dt><dd class="mono">{{ fmtInt(p.bytes) }}</dd></div>
          <div><dt>Offset</dt><dd class="mono">0x{{ p.offset.toString(16).toUpperCase() }}</dd></div>
          <div class="wide"><dt>File</dt><dd class="mono">{{ p.file }}</dd></div>
          <div v-if="pal" class="wide"><dt>Palette</dt><dd class="mono">{{ pal === 'none' ? 'None found, shown in greys' : pal }}</dd></div>
        </dl></div></section>
      </div>
    </div>
  </div>
</template>
