<script setup lang="ts">
// The 3D viewport card: the mesh of `meshId` (a model or an assembly), turned by dragging it, moved by dragging empty
// space (or shift, middle or right drag), zoomed with the wheel or the buttons; maximize fills the window.
// The tools slot sits after the read-out; `overlay` draws over the model in 2D (the skeleton tab's bones).
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UiSpinner from './ui/UiSpinner.vue'
import { Viewer } from '../lib/viewer'
import type { Mesh } from '../lib/api'
import { textureKey, textureUrl } from '../lib/source'
import { loadMesh, pieceTexture, theme } from '../state'

const props = defineProps<{
  meshId: string
  hide?: boolean                       // draw the mesh's frame only (the overlay alone)
  readout?: (triangles: number) => string
  overlay?: (c: CanvasRenderingContext2D, v: Viewer, W: number, H: number) => void
  tick?: unknown                       // anything the overlay depends on: a change redraws
  turnAnywhere?: boolean               // a press anywhere turns the view (nothing to hit when the mesh is hidden)
  live?: Mesh | null                   // replaces the mesh's vertices without moving the view (an animation frame)
}>()

const v = new Viewer()
const cv = ref<HTMLCanvasElement | null>(null)
const ov = ref<HTMLCanvasElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const read = ref('')
const max = ref(false)
v.onTexture = () => draw()
const texRows = new Map<string, Record<string, string>>()
v.resolve = (key) => { const r = texRows.get(key); return r ? textureUrl(r) : Promise.resolve(null) }

function draw() {
  if (!cv.value) return
  v.draw(props.hide)
  read.value = state.value === 'ready' ? (props.readout ? props.readout(v.n / 3) : (v.n / 3).toLocaleString('en-US') + ' triangles') : ''
  const o = ov.value
  if (!o) return
  const W = o.clientWidth, H = o.clientHeight, dpr = window.devicePixelRatio || 1
  o.width = Math.round(W * dpr); o.height = Math.round(H * dpr)
  const c = o.getContext('2d')!
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H)
  if (props.overlay && state.value === 'ready') props.overlay(c, v, W, H)
}

let seq = 0
async function show(id: string) {
  const mine = ++seq
  state.value = 'loading'; v.clear(); draw()
  try {
    const mesh = await loadMesh(id)
    if (mine !== seq) return
    v.setMesh(mesh, (pc) => { const r = pieceTexture(pc); if (!r) return null; const k = textureKey(r); texRows.set(k, r); return k })
    if (props.live) v.update(props.live)                      // a pose that arrived while this mesh loaded
    state.value = 'ready'; draw()
  } catch (e) {
    if (mine !== seq) return
    console.error(e); state.value = 'error'
  }
}

/* ── Pointer ── */
let drag: number[] | null = null, panning = false
function down(e: PointerEvent) {
  // A press on the model turns it; on empty space (or with shift, the middle or the right button) it moves the view.
  panning = e.shiftKey || e.button !== 0 || (!props.turnAnywhere && !v.hit(e.clientX, e.clientY))
  drag = [e.clientX, e.clientY]; cv.value!.setPointerCapture(e.pointerId)
  cv.value!.style.cursor = panning ? 'move' : 'grabbing'
}
function up() { drag = null; if (cv.value) cv.value.style.cursor = '' }
function move(e: PointerEvent) {
  if (!drag) return
  const dx = e.clientX - drag[0], dy = e.clientY - drag[1]
  if (panning) {
    const k = (2 * v.dist * Math.tan(0.4)) / Math.max(cv.value!.clientHeight, 1)
    v.pan[0] += dx * k; v.pan[1] -= dy * k
  } else {
    v.yaw -= dx * 0.01
    v.pitch = Math.max(-1.55, Math.min(1.55, v.pitch - dy * 0.01))
  }
  drag = [e.clientX, e.clientY]; draw()
}
function wheel(e: WheelEvent) { e.preventDefault(); v.zoom(Math.exp(e.deltaY * 0.001)); draw() }
function zoom(f: number) { v.zoom(f); draw() }
function fit() { v.fit(); draw() }
function maximize(on?: boolean) {
  max.value = on === undefined ? !max.value : on
  document.body.classList.toggle('has-max', max.value)
  requestAnimationFrame(draw)
}
function esc(e: KeyboardEvent) { if (e.key === 'Escape' && max.value) maximize(false) }

let ro: ResizeObserver | null = null
onMounted(() => {
  v.attach(cv.value!)
  ro = new ResizeObserver(() => draw()); ro.observe(stage.value!)
  document.addEventListener('keydown', esc)
  show(props.meshId)
})
onBeforeUnmount(() => { ro?.disconnect(); document.removeEventListener('keydown', esc); document.body.classList.remove('has-max') })
watch(() => props.meshId, (id) => show(id))
watch(() => [props.hide, props.tick, theme.value], () => draw())
watch(() => props.live, (m) => { if (m && state.value === 'ready') { v.update(m); draw() } })
</script>

<template>
  <section class="card viewport" :class="{ max }" aria-label="Preview">
    <div class="card-h vp-tools">
      <div class="vp-read">{{ read }}</div>
      <slot />
      <div class="zoom" role="group" aria-label="Zoom">
        <button class="ibtn" type="button" title="Zoom out" aria-label="Zoom out" @click="zoom(1.25)"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14M5 7h4"/></svg></button>
        <button class="ibtn" type="button" title="Zoom in" aria-label="Zoom in" @click="zoom(0.8)"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14M5 7h4M7 5v4"/></svg></button>
        <button class="ibtn" type="button" title="Reset view" aria-label="Reset view" @click="fit"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5"/><path d="M3 2.2v2.6h2.6"/></svg></button>
        <button class="ibtn" type="button" :title="max ? 'Restore' : 'Maximize'" :aria-label="max ? 'Restore' : 'Maximize'" :aria-pressed="max" @click="maximize()"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg></button>
      </div>
    </div>
    <div ref="stage" class="stage">
      <canvas ref="cv" @contextmenu.prevent @pointerdown="down" @pointerup="up" @pointermove="move" @wheel="wheel"></canvas>
      <canvas v-if="overlay" ref="ov" class="ov" aria-hidden="true"></canvas>
      <div v-if="$slots.corner" class="stage-corner"><slot name="corner" /></div>
      <div v-if="state === 'loading'" class="stage-msg"><UiSpinner :size="16" /><span>Loading Model</span></div>
      <div v-else-if="state === 'error'" class="stage-msg"><span>This model could not be loaded.</span></div>
    </div>
    <slot name="foot" />
  </section>
</template>
