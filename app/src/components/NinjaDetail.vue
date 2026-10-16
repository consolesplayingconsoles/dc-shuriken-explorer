<script setup lang="ts">
// A Ninja model with motions: its object tree is the skeleton. The bones are drawn over the model, a picked bone is thicker and
// labelled (not told by colour alone), and any of the model's motions plays on both, in place.
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import DetailHead from './DetailHead.vue'
import Viewport from './Viewport.vue'
import UiSelect from './ui/UiSelect.vue'
import UiIconButton from './ui/UiIconButton.vue'
import { S, byId, canRename, loadMesh, ninjaFrame, ninjaMotions, renameModel, type NinjaFrame, type NinjaMotion } from '../state'
import { store } from '../lib/store'
import { css, type Viewer } from '../lib/viewer'
import type { Item } from '../lib/dcgs'
import type { Mesh } from '../lib/api'

const props = defineProps<{ m: Item }>()
const id = computed(() => props.m.ninja!)

/* ── The model and its bones ── */
const base = shallowRef<Mesh | null>(null)
const joints = computed(() => (base.value && base.value.joints) || [])
const tree = computed(() => {                                    // depth first, each bone with its depth
  const out: { id: number; depth: number }[] = [], kids = new Map<number, number[]>()
  joints.value.forEach((j, i) => kids.set(j.parent, [...(kids.get(j.parent) || []), i]))
  const walk = (p: number, depth: number) => (kids.get(p) || []).forEach((i) => { out.push({ id: i, depth }); walk(i, depth + 1) })
  walk(-1, 0)
  return out
})
const boneName = (i: number) => 'Bone ' + i
function pickBone(i: number) { S.bone = S.bone === i ? null : i }

/* ── Motions ── */
let raf = 0, t0 = 0, f0 = 0
const motions = ref<NinjaMotion[]>([])
const motionKey = ref('')                                          // the picked motion: its file and offset
const frame = ref(0)
const playing = ref(false)
const posed = shallowRef<NinjaFrame | null>(null)
const motion = computed(() => motions.value.find((x) => x.key === motionKey.value) || null)
const last = computed(() => (motion.value ? motion.value.frames - 1 : 0))
const label = (x: NinjaMotion) => '#' + (motions.value.indexOf(x) + 1) + ' · ' + x.frames + ' frames'

watch(id, async (mid) => {
  stop(); posed.value = null; base.value = null; motions.value = []; motionKey.value = ''; frame.value = 0; S.bone = null
  const [m, list] = await Promise.all([loadMesh(mid), ninjaMotions(mid)])
  if (id.value !== mid) return
  base.value = m; motions.value = list
  const first = list.find((x) => x.moving) || list[0]
  motionKey.value = first ? first.key : ''
}, { immediate: true })
watch([motionKey, frame], async () => {
  if (!motionKey.value) { posed.value = null; return }
  const mid = id.value, k = motionKey.value, f = frame.value
  const got = await ninjaFrame(mid, k, f)
  if (id.value === mid && motionKey.value === k && frame.value === f) posed.value = got
})
watch(motionKey, () => { const was = playing.value; stop(); frame.value = 0; if (was) play() })

// The posed model: the base mesh with the frame's vertices (same pieces, same triangles).
const live = computed<Mesh | null>(() => (base.value && posed.value ? { ...base.value, position: posed.value.position, normal: posed.value.normal } : null))
const at = computed(() => (posed.value ? posed.value.joints : joints.value))

/* ── Playback: 30 frames a second ── */
const repeat = ref(store.get<boolean>('repeat') !== false)
watch(repeat, (v) => store.set('repeat', v))
function step(t: number) {
  if (!playing.value || !motion.value) return
  const span = Math.max(1, motion.value.frames), n = f0 + Math.floor((t - t0) * 0.03)
  if (!repeat.value && n >= span - 1) { frame.value = span - 1; return stop() }
  frame.value = n % span
  raf = requestAnimationFrame(step)
}
function play() {
  if (!motion.value || playing.value) return playing.value ? stop() : undefined
  if (!repeat.value && frame.value >= last.value) frame.value = 0
  playing.value = true; t0 = performance.now(); f0 = frame.value
  raf = requestAnimationFrame(step)
}
function toggle() { if (playing.value) stop(); else play() }
function stop() { playing.value = false; cancelAnimationFrame(raf) }
function scrub(e: Event) { stop(); frame.value = Number((e.target as HTMLInputElement).value) }
onBeforeUnmount(stop)
watch(() => S.playTick, () => toggle())                         // Space

/* ── Bones over the model ── */
const hideBones = ref(store.get<boolean>('hideBones') === true)
watch(hideBones, (v) => store.set('hideBones', v))
function overlay(c: CanvasRenderingContext2D, v: Viewer, W: number, H: number) {
  if (hideBones.value) return
  const js = at.value, pts = js.map((j) => v.project(j.p, W, H))
  const ink = css('--text'), halo = css('--surface'), accent = css('--accent')
  c.lineCap = 'round'
  for (const pass of [0, 1]) {
    js.forEach((j, i) => {
      const p = pts[i], q = j.parent >= 0 ? pts[j.parent] : null
      if (!p || !q) return
      const sel = i === S.bone
      c.strokeStyle = pass ? (sel ? accent : ink) : halo; c.lineWidth = (sel ? 4 : 2) + (pass ? 0 : 3)
      c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(p[0], p[1]); c.stroke()
    })
  }
  pts.forEach((p, i) => {
    if (!p || i === S.bone) return
    c.fillStyle = halo; c.strokeStyle = ink; c.lineWidth = 1.5
    c.beginPath(); c.arc(p[0], p[1], 3.5, 0, 7); c.fill(); c.stroke()
  })
  const p = S.bone !== null ? pts[S.bone] : null
  if (S.bone !== null && p) {
    c.fillStyle = accent; c.strokeStyle = halo; c.lineWidth = 2
    c.beginPath(); c.arc(p[0], p[1], 6.5, 0, 7); c.fill(); c.stroke()
    c.font = '600 12px ' + css('--font-sans'); c.lineWidth = 4; c.lineJoin = 'round'
    const t = boneName(S.bone)
    c.strokeText(t, p[0] + 11, p[1] + 4); c.fillStyle = ink; c.fillText(t, p[0] + 11, p[1] + 4)
  }
}
const readout = (tris: number) => joints.value.length + ' bones · ' + tris.toLocaleString('en-US') + ' triangles'
</script>

<template>
  <div class="detail">
    <DetailHead :m="m" :rename="canRename && m.ninja && byId.get(m.ninja) ? () => renameModel(byId.get(m.ninja!)!) : undefined" />
    <div class="grid">
      <div class="stack main-col">
        <Viewport :mesh-id="id" :overlay="overlay" :readout="readout" :tick="[S.bone, frame, motionKey, hideBones, posed]" :live="live">
          <template #corner>
            <label class="vp-repeat"><input v-model="hideBones" type="checkbox"> Hide Skeleton</label>
          </template>
          <template #foot>
            <div class="vp-foot">
              <UiIconButton :title="playing ? 'Pause' : 'Play'" :aria-label="playing ? 'Pause' : 'Play'" :disabled="!motion" @click="toggle">
                <svg v-if="playing" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="4" y="3" width="3" height="10" rx="0.8"/><rect x="9" y="3" width="3" height="10" rx="0.8"/></svg>
                <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z"/></svg>
              </UiIconButton>
              <UiSelect v-model="motionKey" class="vp-motion" aria-label="Motion" :disabled="!motions.length">
                <option v-for="x in motions" :key="x.key" :value="x.key">{{ label(x) }}</option>
              </UiSelect>
              <input class="vp-scrub" type="range" min="0" :max="last" :value="frame" :disabled="!motion" aria-label="Frame" @input="scrub">
              <span class="vp-frame mono">{{ frame + 1 }} / {{ last + 1 }}</span>
              <label class="vp-repeat"><input v-model="repeat" type="checkbox"> Repeat</label>
            </div>
          </template>
        </Viewport>
      </div>
      <div class="stack side-col">
        <section class="card"><div class="card-b"><dl class="facts">
          <div><dt>Bones</dt><dd class="mono">{{ joints.length }}</dd></div>
          <div><dt>Motions</dt><dd class="mono">{{ motions.length }}</dd></div>
          <div><dt>Group</dt><dd>{{ m.group }}</dd></div>
        </dl></div></section>
        <section class="card"><div class="card-b bones" aria-label="Bones">
          <button v-for="t in tree" :key="t.id" class="bone" type="button" :aria-pressed="t.id === S.bone"
                  :style="{ paddingLeft: 8 + t.depth * 14 + 'px' }" @click="pickBone(t.id)">
            <span class="label">{{ boneName(t.id) }}</span><span class="idm">{{ t.id }}</span>
          </button>
        </div></section>
      </div>
    </div>
  </div>
</template>
