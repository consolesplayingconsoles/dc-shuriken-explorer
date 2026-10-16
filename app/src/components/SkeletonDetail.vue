<script setup lang="ts">
// A rig: its bones drawn over one character of its assembled group (or alone), and the bone tree; a picked bone is
// thicker, larger and labelled in the view (not told by colour alone). Any motion of the rig's motion file plays on
// both, in place; it opens on the pose the decomp's map was built from. A rig without a known motion format shows its
// bind pose.
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import DetailHead from './DetailHead.vue'
import Viewport from './Viewport.vue'
import UiSelect from './ui/UiSelect.vue'
import UiIconButton from './ui/UiIconButton.vue'
import UiCopyButton from './ui/UiCopyButton.vue'
import { S, built, byId, rigChar, motionsOf, motionAt, partMesh, canRename, renameMotion, type MotionRef } from '../state'
import { boneName, boneOfPart, bonesOf, joints, type Bone, type Item } from '../lib/dcgs'
import { frameCount, pose, poseE16, posedMesh, type Motion, type Placed } from '../lib/pose'
import { store } from '../lib/store'
import { css, type Viewer } from '../lib/viewer'
import type { Mesh } from '../lib/api'

const props = defineProps<{ m: Item }>()
const r = computed(() => props.m.rig!)
const pick = computed({
  get: () => rigChar(r.value.name, r.value.chars[0]),
  set: (k: string) => { S.rigPick.set(r.value.name, k) },
})
const alone = computed(() => pick.value === '')
const shownOn = computed(() => pick.value || r.value.chars[0])
const bones = computed(() => bonesOf(r.value, shownOn.value))
const charLabel = (k: string) => { const a = byId.value.get('asm:' + k); return (a && a.subLabel) || built.value.asm.get(k)!.sub }
// The tree, depth first, each bone with its depth.
const tree = computed(() => {
  const out: { b: Bone; depth: number }[] = []
  const walk = (p: number | null, depth: number) => bones.value.filter((b) => b.parent === p).forEach((b) => { out.push({ b, depth }); walk(b.id, depth + 1) })
  walk(null, 0)
  return out
})
function pickBone(id: number) { S.bone = S.bone === id ? null : id }

/* ── Motions ── */
let raf = 0, t0 = 0, r0 = 1                 // playback (below)
const motions = ref<MotionRef[]>([])
const motionKey = ref('')
const motion = shallowRef<Motion | null>(null)
const record = ref(1)
const playing = ref(false)
const playable = computed(() => (r.value.motionFormat === 'v' || r.value.motionFormat === 'e16') && !!r.value.motionFile)
const addr = (off: string) => (motions.value.find((x) => x.offset === off) || { addr: off.toUpperCase() }).addr
const last = computed(() => (motion.value ? frameCount(motion.value) : 1))
const motionName = (off: string) => built.value.motionNames.get(r.value.motionFile + ':' + off) || ''
const motionLabel = (x: MotionRef) => (motionName(x.offset) ? motionName(x.offset) + '  ' + addr(x.offset) : addr(x.offset)) + ' · ' + x.count + ' frames'
function renameCurrent() { if (motionKey.value) renameMotion(r.value.motionFile, motionKey.value, motionName(motionKey.value) || addr(motionKey.value)) }

watch(r, async (rig) => {
  stop(); motion.value = null
  motions.value = []
  if (!playable.value) { motionKey.value = ''; return }
  const all = await motionsOf(rig.motionFile, rig.motionFormat)
  if (r.value !== rig) return
  // a node tree's file can hold motions of other skeletons: only those with its bone count
  const list = rig.motionFormat === 'e16' ? all.filter((x) => x.bones === rig.motionBones.length) : all
  motions.value = list
  if (list.some((x) => x.offset === motionKey.value)) {     // the same rig reloaded (e.g. after a rename): stay on its motion and frame
    motion.value = await motionAt(rig.motionFile, motionKey.value, rig.motionFormat)
    return
  }
  const own = rig.poseOffset
  motionKey.value = list.some((x) => x.offset === own) ? own : list[0] ? list[0].offset : ''
  record.value = rig.poseRecord
}, { immediate: true })
watch(motionKey, async (k) => {
  const was = playing.value                                  // a new motion keeps playing if the last one was
  stop()
  if (!k) { motion.value = null; return }
  const rig = r.value, mo = await motionAt(rig.motionFile, k, rig.motionFormat)
  if (motionKey.value !== k || r.value !== rig) return
  motion.value = mo
  record.value = was ? 1 : Math.min(Math.max(1, record.value), frameCount(mo))
  if (was) play()
})

// The posed bones of the current record (null until the motion is in, and for a bind pose).
const world = computed<Map<number, Placed> | null>(() => {
  const m = motion.value
  if (!m) return null
  if (m.format === 'e16') return poseE16(r.value, shownOn.value.slice(shownOn.value.indexOf('|') + 1), bones.value, built.value.asm.get(shownOn.value)!, m, record.value - 1)
  return pose(bones.value, m, record.value)
})

/* ── The character on the posed bones ── */
const parts = shallowRef<Map<string, Mesh> | null>(null)
watch(shownOn, async (k) => {
  parts.value = null
  const a = built.value.asm.get(k)!
  const ms = await Promise.all(a.parts.map((p) => partMesh(p.id)))
  if (shownOn.value === k) parts.value = new Map(a.parts.map((p, i) => [p.id, ms[i]]))
}, { immediate: true })
const boneOf = (part: string) => boneOfPart(bones.value, part)
const live = computed<Mesh | null>(() => (world.value && parts.value && !alone.value ? posedMesh(built.value.asm.get(shownOn.value)!, parts.value, boneOf, world.value, r.value.welds.get(shownOn.value.slice(shownOn.value.indexOf('|') + 1)) || [], motion.value?.format === 'e16') : null))

/* ── Playback: 60 records a second, record 0 is never played ── */
// Repeat (on unless turned off, remembered in this browser): off, a motion stops on its last frame.
const repeat = ref(store.get<boolean>('repeat') !== false)
watch(repeat, (v) => store.set('repeat', v))
function frame(t: number) {
  if (!playing.value || !motion.value) return
  const span = frameCount(motion.value), step = r0 - 1 + Math.floor((t - t0) * 0.06)
  if (!repeat.value && step >= span - 1) { record.value = span; return stop() }
  record.value = 1 + (step % span)
  raf = requestAnimationFrame(frame)
}
function play() {
  if (!motion.value) return
  if (playing.value) return stop()
  if (!repeat.value && record.value >= last.value) record.value = 1      // played to the end: from the start again
  playing.value = true; t0 = performance.now(); r0 = record.value
  raf = requestAnimationFrame(frame)
}
function stop() { playing.value = false; cancelAnimationFrame(raf) }
function scrub(e: Event) { stop(); record.value = Number((e.target as HTMLInputElement).value) }
onBeforeUnmount(stop)
watch(() => S.playTick, () => play())                      // Space

/* ── Bones over the model ── */
// Hide Skeleton (off unless turned on, remembered in this browser): the character alone; the skeleton alone always shows.
const hideBones = ref(store.get<boolean>('hideBones') === true)
watch(hideBones, (v) => store.set('hideBones', v))
function overlay(c: CanvasRenderingContext2D, v: Viewer, W: number, H: number) {
  if (hideBones.value && !alone.value) return
  const bs = bones.value, at = new Map<number, number[]>()
  const pos = world.value ? new Map([...world.value].map(([id, p]) => [id, p.t])) : joints(bs, built.value.asm.get(shownOn.value)!)
  for (const [id, p] of pos) { const q = v.project(p, W, H); if (q) at.set(id, q) }
  const ink = css('--text'), halo = css('--surface'), accent = css('--accent')
  c.lineCap = 'round'
  for (const pass of [0, 1]) {
    for (const b of bs) {
      const p = at.get(b.id), q = b.parent !== null ? at.get(b.parent) : undefined
      if (!p || !q) continue
      const sel = b.id === S.bone
      c.strokeStyle = pass ? (sel ? accent : ink) : halo; c.lineWidth = (sel ? 4 : 2) + (pass ? 0 : 3)
      c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(p[0], p[1]); c.stroke()
    }
  }
  for (const b of bs) {
    const p = at.get(b.id)
    if (!p || b.id === S.bone) continue
    c.fillStyle = halo; c.strokeStyle = ink; c.lineWidth = 1.5
    c.beginPath(); c.arc(p[0], p[1], 3.5, 0, 7); c.fill(); c.stroke()
  }
  const b = bs.find((x) => x.id === S.bone), p = b && at.get(b.id)
  if (b && p) {
    c.fillStyle = accent; c.strokeStyle = halo; c.lineWidth = 2
    c.beginPath(); c.arc(p[0], p[1], 6.5, 0, 7); c.fill(); c.stroke()
    c.font = '600 12px ' + css('--font-sans'); c.lineWidth = 4; c.lineJoin = 'round'
    const t = boneName(b)
    c.strokeText(t, p[0] + 11, p[1] + 4); c.fillStyle = ink; c.fillText(t, p[0] + 11, p[1] + 4)
  }
}
const readout = (tris: number) => bones.value.length + ' bones' + (alone.value ? '' : ' · ' + tris.toLocaleString('en-US') + ' triangles')
</script>

<template>
  <div class="detail">
    <DetailHead :m="m" />
    <div class="grid">
      <div class="stack main-col">
        <Viewport :mesh-id="'asm:' + shownOn" :hide="alone" :turn-anywhere="alone" :overlay="overlay" :readout="readout"
                  :tick="[S.bone, pick, record, motion, hideBones]" :live="live">
          <UiSelect v-model="pick" class="vp-pick" aria-label="Show the skeleton on">
            <option value="">Skeleton Only</option>
            <option v-for="k in r.chars" :key="k" :value="k">{{ charLabel(k) }}</option>
          </UiSelect>
          <template v-if="!alone" #corner>
            <label class="vp-repeat"><input v-model="hideBones" type="checkbox"> Hide Skeleton</label>
          </template>
          <template v-if="playable" #foot>
            <div class="vp-foot">
              <UiIconButton :title="playing ? 'Pause' : 'Play'" :aria-label="playing ? 'Pause' : 'Play'" :disabled="!motion" @click="play">
                <svg v-if="playing" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="4" y="3" width="3" height="10" rx="0.8"/><rect x="9" y="3" width="3" height="10" rx="0.8"/></svg>
                <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z"/></svg>
              </UiIconButton>
              <UiSelect v-model="motionKey" class="vp-motion" aria-label="Motion" :disabled="!motions.length">
                <option v-for="x in motions" :key="x.offset" :value="x.offset">{{ motionLabel(x) }}</option>
              </UiSelect>
              <UiCopyButton v-if="motionKey" :text="r.motionFile + ':' + motionKey" />
              <UiIconButton v-if="canRename" variant="ghost" title="Rename this motion" aria-label="Rename this motion" :disabled="!motionKey" @click="renameCurrent">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z"/></svg>
              </UiIconButton>
              <input class="vp-scrub" type="range" min="1" :max="last" :value="record" :disabled="!motion" aria-label="Frame" @input="scrub">
              <span class="vp-frame mono">{{ record }} / {{ last }}</span>
              <label class="vp-repeat"><input v-model="repeat" type="checkbox"> Repeat</label>
            </div>
          </template>
        </Viewport>
      </div>
      <div class="stack side-col">
        <section class="card"><div class="card-b"><dl class="facts">
          <div><dt>Bones</dt><dd class="mono">{{ bones.length }}</dd></div>
          <div><dt>Characters</dt><dd class="mono">{{ r.chars.length }}</dd></div>
          <div><dt>Motions</dt><dd class="mono">{{ playable ? motions.length : 0 }}</dd></div>
          <div><dt>Pose</dt><dd>{{ playable ? 'Animated' : 'Bind Pose' }}</dd></div>
          <div><dt>Parts Of</dt><dd>{{ r.group }}</dd></div>
        </dl></div></section>
        <section class="card"><div class="card-b bones" aria-label="Bones">
          <button v-for="t in tree" :key="t.b.id" class="bone" type="button" :aria-pressed="t.b.id === S.bone"
                  :style="{ paddingLeft: 8 + t.depth * 14 + 'px' }" @click="pickBone(t.b.id)">
            <span class="label">{{ boneName(t.b) }}</span><span class="idm">{{ t.b.id }}</span>
          </button>
        </div></section>
      </div>
    </div>
  </div>
</template>
