<script setup lang="ts">
// A dumped text file of the decomp, a page of lines at a time.
import { computed, ref, watch } from 'vue'
import DetailHead from './DetailHead.vue'
import UiButton from './ui/UiButton.vue'
import UiSpinner from './ui/UiSpinner.vue'
import UiSelect from './ui/UiSelect.vue'
import { S, decompBytes } from '../state'
import { textDefaults, textStrategies } from '../lib/plugins'
import { ENCODINGS, PAGE, SPLITS, lineSpans, pageLines, type Encoding, type Split } from '../lib/text'
import type { Item } from '../lib/dcgs'

const props = defineProps<{ m: Item }>()
const data = ref<Uint8Array | null>(null)
const spans = ref<Uint32Array>(new Uint32Array())
const missing = ref(false)
const page = ref(0)
const strategies = computed(() => textStrategies(S.disc ? S.disc.product : undefined, S.disc ? S.disc.version : undefined))
const enc = ref<string>('shift_jis')                         // an encoding of the core, or p:<key> for a reader a plugin adds
const plug = computed(() => strategies.value.find((x) => 'p:' + x.key === enc.value))
const split = ref<Split>('either')
const cut = () => { if (data.value && !plug.value) spans.value = lineSpans(data.value, split.value, enc.value as Encoding); page.value = 0 }
watch([enc, split], cut)
watch(() => props.m.id, async (id) => {
  data.value = null; missing.value = false; page.value = 0
  const d = await decompBytes(props.m.file!)
  if (props.m.id !== id) return
  if (!d) { missing.value = true; return }
  const own = strategies.value.find((x) => x.preferred && x.preferred(props.m.file!))       // a plugin's own reader is the default for the files it names,
  const def = textDefaults(S.disc ? S.disc.product : undefined, S.disc ? S.disc.version : undefined, props.m.file!)   // else the encoding and split it names
  enc.value = own ? 'p:' + own.key : def.encoding || 'shift_jis'
  split.value = def.split || 'either'
  data.value = d
  cut()
}, { immediate: true })
const decoded = computed(() => (plug.value && data.value ? plug.value.decode(data.value) : null))
const count = computed(() => (decoded.value ? decoded.value.length : spans.value.length / 2))
const pages = computed(() => Math.max(1, Math.ceil(count.value / PAGE)))
const first = computed(() => page.value * PAGE)
const last = computed(() => Math.min(count.value, first.value + PAGE))
const lines = computed(() => (decoded.value ? decoded.value.slice(first.value, last.value) : data.value ? pageLines(data.value, spans.value, first.value, last.value, enc.value as Encoding) : []))
// The page typed in the box: kept inside 1 to the last page, and back to the current one when it is not a number.
const goto = (e: Event) => {
  const el = e.target as HTMLInputElement, n = Math.floor(Number(el.value))
  page.value = Number.isFinite(n) ? Math.min(pages.value, Math.max(1, n)) - 1 : page.value
  el.value = String(page.value + 1)
}
const fmt = (n: number) => n.toLocaleString('en-US')
const at = (n: number) => (decoded.value ? '' : spans.value[2 * n].toString(16).toUpperCase().padStart(6, '0'))
</script>

<template>
  <div class="detail">
    <DetailHead :m="m" :ref-text="m.file" />
    <section class="card">
      <div class="card-h">
        <span class="card-t">{{ m.name }}</span>
        <span v-if="data" class="card-meta">{{ fmt(count) }} lines, {{ fmt(data.length) }} bytes</span>
      </div>
      <div v-if="missing" class="card-b notex">This file is not in the decomp's text-dump folder.</div>
      <div v-else-if="!data" class="card-b"><UiSpinner :size="16" /></div>
      <template v-else>
        <div class="card-b textopts">
          <label class="textopt"><span>Encoding</span><UiSelect v-model="enc" aria-label="Encoding"><option v-for="e in ENCODINGS" :key="e.key" :value="e.key">{{ e.label }}</option><option v-for="x in strategies" :key="x.key" :value="'p:' + x.key">{{ x.label }}</option></UiSelect></label>
          <label class="textopt"><span>Split lines at</span><UiSelect v-model="split" aria-label="Lines split at" :disabled="!!plug"><option v-for="x in SPLITS" :key="x.key" :value="x.key">{{ x.label }}</option></UiSelect></label>
        </div>
        <div v-if="!count" class="card-b notex">The file has no lines.</div>
        <div v-else class="textlines mono">
          <div v-for="(l, i) in lines" :key="first + i" class="textline"><span class="textline-n">{{ fmt(first + i + 1) }}</span><span class="textline-o">{{ at(first + i) }}</span><span class="textline-t">{{ l }}</span></div>
        </div>
        <div v-if="pages > 1" class="card-b textpager">
          <UiButton :disabled="page === 0" @click="page--">Previous</UiButton>
          <span class="card-meta textgo">Page <input class="pageno mono" type="number" min="1" :max="pages" :value="page + 1" aria-label="Page number" @change="goto" @keydown.enter="goto"> of {{ fmt(pages) }} (lines {{ fmt(first + 1) }} to {{ fmt(last) }})</span>
          <UiButton :disabled="page >= pages - 1" @click="page++">Next</UiButton>
        </div>
      </template>
    </section>
  </div>
</template>
