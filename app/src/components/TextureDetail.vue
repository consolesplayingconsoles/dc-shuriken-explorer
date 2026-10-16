<script setup lang="ts">
// A texture of the map: the image, how it is stored, and the models that use it.
import { computed, ref, watch } from 'vue'
import DetailHead from './DetailHead.vue'
import { built } from '../state'
import { textureUrl } from '../lib/source'
import { DT, PF, nameOf, type Item } from '../lib/dcgs'

const props = defineProps<{ m: Item }>()
const r = computed(() => props.m.row!)
const users = computed(() => {
  const file = r.value.file.toUpperCase()
  return built.value.items.filter((x) => x.kind === 'models' && !x.asm && x.id.startsWith(file + ':') && (x.texset || '') === (r.value.set || '') && x.textures && x.textures.includes(props.m.num!))
})
const label = (x: Item) => (x.named ? `${x.group} / ${x.subLabel || x.sub} / ${nameOf(x)}` : x.id)
const bad = ref(false)
const src = ref('')
watch(() => props.m.id, async (id) => {
  bad.value = false; src.value = ''
  const u = await textureUrl(r.value)
  if (props.m.id !== id) return
  if (u) src.value = u; else bad.value = true
}, { immediate: true })
const fmtInt = (n: number) => n.toLocaleString('en-US')
</script>

<template>
  <div class="detail">
    <DetailHead :m="m" :ref-text="r.texture_file + ':' + r.number" />
    <div class="grid">
      <div class="stack main-col">
        <section class="card"><div class="texbox">
          <div v-if="bad" class="notex">This format is not decoded</div>
          <img v-else-if="src" class="tex" alt="" :src="src" @error="bad = true">
        </div></section>
      </div>
      <div class="stack side-col">
        <section class="card"><div class="card-b"><dl class="facts">
          <div><dt>Size</dt><dd class="mono">{{ m.w }} x {{ m.h }}</dd></div>
          <div><dt>Format</dt><dd>{{ PF[Number(r.format)] || r.format }}</dd></div>
          <div><dt>Type</dt><dd>{{ DT[parseInt(r.type, 16)] || 'Type ' + r.type }}</dd></div>
          <div><dt>Bytes</dt><dd class="mono">{{ fmtInt(Number(r.size)) }}</dd></div>
          <div><dt>Offset</dt><dd class="mono">0x{{ r.offset.toUpperCase() }}</dd></div>
          <div><dt>Used By</dt><dd class="mono">{{ users.length }}</dd></div>
        </dl></div></section>
        <section v-if="users.length" class="card"><div class="card-b usedby">
          <a v-for="x in users.slice(0, 24)" :key="x.id" :href="'#' + encodeURIComponent(x.id)">{{ label(x) }}</a>
          <span v-if="users.length > 24" class="more">and {{ users.length - 24 }} more</span>
        </div></section>
      </div>
    </div>
  </div>
</template>
