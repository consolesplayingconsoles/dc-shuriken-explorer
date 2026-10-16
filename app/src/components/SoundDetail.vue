<script setup lang="ts">
// A sound of the map: played when it is ADX (or a plain PCM WAV), listed otherwise.
import { computed, ref, watch } from 'vue'
import DetailHead from './DetailHead.vue'
import { S, canRename, renameSound } from '../state'
import { audioUrl } from '../lib/source'
import type { Item } from '../lib/dcgs'

const props = defineProps<{ m: Item }>()
const r = computed(() => props.m.row!)
const ch = computed(() => Number(r.value.channels))
const tries = (f: string) => f === 'ADX' || f === 'WAV'                       // formats the worker may be able to play (a WAV only when it is plain PCM)
const why = computed(() => (props.m.bank ? r.value.format + 's are listed, not decoded' : !tries(r.value.format) ? r.value.format + ' streams are listed, not decoded' : ''))
const bad = ref(false)
const src = ref('')
watch(() => props.m.id, async (id) => {
  bad.value = false; src.value = ''
  if (why.value) return
  const u = await audioUrl(r.value)
  if (props.m.id !== id) return
  if (u) src.value = u; else bad.value = true
}, { immediate: true })
// Space: play or pause (once the sound is loaded)
const player = ref<HTMLAudioElement | null>(null)
const want = ref(false)                                      // asked before the sound was ready: it plays when it is
watch(() => S.playTick, () => { const p = player.value; if (p) { if (p.paused) p.play().catch(() => {}); else p.pause() } else want.value = true })
watch(() => props.m.id, () => (want.value = false))
const fmtInt = (n: number) => n.toLocaleString('en-US')
</script>

<template>
  <div class="detail">
    <DetailHead :m="m" :ref-text="m.ref" :rename="canRename && !m.bank ? () => renameSound(m) : undefined" />
    <div class="grid">
      <div class="stack main-col">
        <section class="card"><div class="audiobox">
          <div v-if="why || bad" class="notex">{{ why || 'This sound is not decoded' }}</div>
          <audio v-else-if="src" ref="player" :key="m.id" :autoplay="want" controls preload="metadata" :src="src" @error="bad = true"></audio>
        </div></section>
      </div>
      <div class="stack side-col">
        <section class="card"><div class="card-b"><dl class="facts">
          <div><dt>Format</dt><dd>{{ r.format }}</dd></div>
          <template v-if="!m.bank">
            <div><dt>Length</dt><dd class="mono">{{ m.dur }}</dd></div>
            <div><dt>Channels</dt><dd>{{ ch === 1 ? 'Mono' : ch === 2 ? 'Stereo' : ch }}</dd></div>
            <div><dt>Rate</dt><dd class="mono">{{ fmtInt(Number(r.rate)) }} Hz</dd></div>
            <div><dt>Samples</dt><dd class="mono">{{ fmtInt(Number(r.samples)) }}</dd></div>
          </template>
          <div><dt>Bytes</dt><dd class="mono">{{ fmtInt(Number(r.bytes)) }}</dd></div>
          <div><dt>Offset</dt><dd class="mono">0x{{ r.offset.toUpperCase() }}</dd></div>
        </dl></div></section>
      </div>
    </div>
  </div>
</template>
