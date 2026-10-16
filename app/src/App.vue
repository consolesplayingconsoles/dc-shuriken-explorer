<script setup lang="ts">
// The page: a header (categories, decomp folder, game, theme), the list beside the main pane, and the dialogs.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import BrandMark from './components/BrandMark.vue'
import UiSelect from './components/ui/UiSelect.vue'
import SideBar from './components/SideBar.vue'
import MainPane from './components/MainPane.vue'
import CatTabs from './components/CatTabs.vue'
import UiModal from './components/ui/UiModal.vue'
import UiButton from './components/ui/UiButton.vue'
import { S, openOverview, selectCategory, skipDecomp, chooseDecomp, openDisc, openRecent, removeGame, reopenMap, setKind, start, theme, select, byId } from './state'
import { KINDS, kindDef } from './lib/nav'
import { store } from './lib/store'

/* ── Theme ── */
const toTheme = computed(() => (theme.value === 'dark' ? 'light' : 'dark'))
function setTheme(t: string) { document.documentElement.setAttribute('data-theme', t); theme.value = t }
function switchTheme() {
  const t = toTheme.value
  setTheme(t)
  try { localStorage.setItem('cpc.ui.theme', t) } catch { /* ignore */ }
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  let saved: string | null = null
  try { saved = localStorage.getItem('cpc.ui.theme') } catch { /* ignore */ }
  if (!saved) setTheme(e.matches ? 'dark' : 'light')
})

/* ── The decomp label ── */
const opened = computed(() => {
  const m = S.map
  if (!m) return { text: '', title: '', cls: '' }
  return {
    text: { ready: (m.name || '') + (m.dir ? '' : ' (no rename)'), ask: (m.name || '') + ' (click to reopen)', missing: (m.name || '') + ' (not a decomp)', old: (m.name || '') + ' (needs an upgrade)', none: 'Choose Decomp' }[m.state],
    title: { ready: m.dir ? 'Decomp progress' : 'Opened for this session; choose the decomp folder to rename', ask: 'Allow reading the remembered folder again', missing: 'The remembered folder is not a decomp of this game', old: 'This decomp was made with an older version of the decomp kickoff', none: 'Choose the decomp folder of this game' }[m.state],
    cls: m.state === 'none' ? 'none' : m.state === 'ask' || m.state === 'old' ? 'ask' : '',
  }
})

/* ── Game ── */
// The open disc and the others this browser remembers; picking one reopens it.
const game = computed({
  get: () => S.opening || (S.disc ? S.disc.game : ''),
  set: (g: string) => { if (g && (!S.disc || g !== S.disc.game)) openRecent(g) },
})
const games = computed(() => {
  const list = [...S.recent]
  const cur = S.opening || (S.disc ? S.disc.game : '')
  if (cur && !list.includes(cur)) list.unshift(cur)
  return list
})

/* ── Resizing the list ── */
const SIDE_MIN = 220
const sideMax = () => Math.max(SIDE_MIN, Math.min(640, Math.round(innerWidth * 0.6)))
const sideW = ref(Number(store.get('sideW')) || 300)
const clampW = (w: number) => Math.max(SIDE_MIN, Math.min(sideMax(), Math.round(w)))
const dragging = ref(false)
const side = ref<InstanceType<typeof SideBar> | null>(null)
function rzDown(e: PointerEvent) { (e.target as HTMLElement).setPointerCapture(e.pointerId); dragging.value = true; e.preventDefault() }
function rzMove(e: PointerEvent) {
  if (!dragging.value) return
  const el = document.getElementById('side')
  if (el) sideW.value = clampW(e.clientX - el.getBoundingClientRect().left)
}
function rzUp() { dragging.value = false; store.set('sideW', sideW.value) }
function rzKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault(); sideW.value = clampW(sideW.value + (e.key === 'ArrowRight' ? 16 : -16)); store.set('sideW', sideW.value)
}
function rzReset() { sideW.value = clampW(300); store.set('sideW', sideW.value) }

/* ── Drawer (narrow screens) ── */
function toggleDrawer() {
  S.drawer = !S.drawer
  if (S.drawer) nextTick(() => side.value?.focusIn())
}

/* ── Keys: / and Cmd/Ctrl+K search; 1 to 6 jump to a kind ── */
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement, typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
  if (S.modal || S.ask) return
  if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
    if (matchMedia('(max-width: 860px)').matches) S.drawer = true
    nextTick(() => side.value?.focusSearch()); e.preventDefault(); return
  }
  if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && /^[1-6]$/.test(e.key)) {
    setKind(KINDS[Number(e.key) - 1].key); e.preventDefault()
  }
})
// A focused picker steps through its options with Up and Down (macOS would open its list instead); Space plays.
document.addEventListener('keydown', (e) => {
  const el = e.target as HTMLSelectElement
  if (!(el instanceof HTMLSelectElement) || el.classList.contains('game') || e.altKey || e.metaKey || e.ctrlKey) return   // not the game picker: each step would open a disc
  if (e.key === ' ') { e.preventDefault(); if (!S.modal && !S.ask && !S.onboard) S.playTick++; return }   // Space plays, as anywhere else
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  const i = el.selectedIndex + (e.key === 'ArrowDown' ? 1 : -1)
  if (i < 0 || i >= el.options.length || el.options[i].disabled) return
  el.selectedIndex = i
  el.dispatchEvent(new Event('change', { bubbles: true }))
}, true)
// Space plays or pauses what the main pane shows, unless a field, picker or button has the key.
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement
  if (e.key !== ' ' || e.defaultPrevented || S.modal || S.ask || S.onboard || e.metaKey || e.ctrlKey || e.altKey) return
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'AUDIO'].includes(t.tagName) || t.isContentEditable) return
  e.preventDefault(); S.playTick++
})
window.addEventListener('hashchange', () => {
  const id = decodeURIComponent(location.hash.slice(1))
  if (id === 'progress') { if (S.map && S.map.state === 'ready') openOverview(); return }
  if (id === S.sel) return
  if (byId.value.has(id)) select(id, true)
  else if (/^[gs]:/.test(id)) { const [g, s] = id.slice(2).split('|'); selectCategory(g, s) }
})

/* ── Rename dialog ── */
const askValue = ref('')
const askError = ref('')
const askInput = ref<HTMLInputElement | null>(null)
watch(() => S.ask, (a) => {
  if (!a) return
  askValue.value = a.value; askError.value = ''
  nextTick(() => { askInput.value?.focus(); askInput.value?.select() })
})
function askDone(v: string | null) {
  if (!S.ask) return
  if (v !== null && v.trim()) { askError.value = S.ask.check(v); if (askError.value) return }
  S.ask.done(v === null ? null : v.trim())                  // '' = clear the name
}
watch(askValue, () => (askError.value = ''))

onMounted(start)
</script>

<template>
  <header class="bar">
    <button class="icon-btn menu-btn" type="button" :aria-label="S.drawer ? 'Hide list' : 'Show list'" aria-controls="side" :aria-expanded="S.drawer" @click="toggleDrawer">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14"/></svg>
    </button>
    <span class="where">{{ kindDef(S.kind).label }}</span>
    <a class="brand" href="https://github.com/consolesplayingconsoles/dc-shuriken-explorer" target="_blank" rel="noopener" title="Shuriken Explorer on GitHub">
      <BrandMark />
      <span class="brand-name">Shuriken Explorer</span>
    </a>
    <CatTabs class="cats" />
    <div class="bar-end">
      <button v-if="S.map && S.map.state !== 'none'" class="opened" :class="opened.cls" type="button" :title="opened.title" @click="reopenMap">
        <svg v-if="S.map.state === 'ready'" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5"/></svg>{{ opened.text }}</button>
      <UiSelect v-if="games.length" v-model="game" class="game" aria-label="Game" :disabled="!!S.opening">
        <option v-if="!game" value="" disabled>Pick a Game</option>
        <option v-for="g in games" :key="g" :value="g">{{ g }}</option>
      </UiSelect>
      <button v-if="S.disc && S.recent.includes(S.disc.game)" class="icon-btn" type="button" aria-label="Remove Game" title="Remove this game from the list" :disabled="!!S.opening" @click="removeGame(S.disc.game)">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 6h11M8 6V4h4v2M6 6l.7 10h6.6L14 6M8.5 9v4.5M11.5 9v4.5"/></svg>
      </button>
      <button class="icon-btn" type="button" aria-label="Open Disc" title="Open a disc" :disabled="!!S.opening" @click="openDisc">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><circle cx="10" cy="10" r="2"/></svg>
      </button>
      <button class="icon-btn" type="button" :aria-label="'Switch to ' + toTheme + ' mode'" :title="'Switch to ' + toTheme + ' mode'" @click="switchTheme">
        <svg v-if="theme === 'dark'" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.5"/><path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6L16 16M4 16l1.4-1.4M14.6 5.4L16 4"/></svg>
        <svg v-else viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9z"/></svg>
      </button>
    </div>
  </header>

  <div class="shell" :style="{ '--side-w': sideW + 'px' }">
    <SideBar ref="side" />
    <div class="resizer" :class="{ drag: dragging }" role="separator" aria-orientation="vertical" aria-label="Resize the list" tabindex="0"
         @pointerdown="rzDown" @pointermove="rzMove" @pointerup="rzUp" @dblclick="rzReset" @keydown="rzKey"></div>
    <div class="scrim" :class="{ open: S.drawer }" @click="S.drawer = false"></div>
    <main class="main"><MainPane /></main>
  </div>

  <UiModal v-if="S.onboard === 'ask'" title="Add This Game's Decomp" @close="S.onboard = 'warn'">
    <p class="dlg-p">Most of what Shuriken Explorer shows comes from the game's decomp: names, textures, sounds, skeletons with
      their animations, and the game's code. Without it, only what can be found on the disc alone, which for many games is
      nothing.</p>
    <p class="dlg-p onboard-or">A game opens faster with its decomp: its assets are already mapped.</p>
    <p class="dlg-p onboard-or">Clone the game's decomp repository to this computer, then choose its folder.</p>
    <p class="dlg-p onboard-or">No decomp yet? Start one with <a href="https://github.com/consolesplayingconsoles/dc-decomp-kickoff" target="_blank" rel="noopener noreferrer">dc-decomp-kickoff</a>.</p>
    <template #actions>
      <UiButton @click="S.onboard = 'warn'">Skip</UiButton>
      <UiButton variant="primary" @click="chooseDecomp">Choose Folder</UiButton>
    </template>
  </UiModal>

  <UiModal v-if="S.onboard === 'warn'" title="Continue Without the Decomp?" @close="skipDecomp">
    <p class="dlg-p">Without it there are no names, textures, sounds, skeletons or code, and for many games nothing at all.
      To add it later, remove the game and open it again.</p>
    <template #actions>
      <UiButton @click="skipDecomp">Continue Without</UiButton>
    </template>
  </UiModal>

  <UiModal v-if="S.modal" :title="S.modal.title" @close="S.modal = null">
    <p class="dlg-p">{{ S.modal.body }}</p>
    <template #actions><UiButton @click="S.modal = null">Close</UiButton></template>
  </UiModal>

  <UiModal v-if="S.ask" :title="S.ask.title" @close="askDone(null)">
    <form id="ask-form" @submit.prevent="askDone(askValue)" @keydown.esc="askDone(null)">
      <div class="field-wrap">
        <input ref="askInput" v-model="askValue" class="field" type="text" autocomplete="off" spellcheck="false" maxlength="80"
               :aria-invalid="!!askError" aria-describedby="ask-error">
        <button v-if="askValue" class="field-clear" type="button" title="Clear" aria-label="Clear" @click="askValue = ''; askInput?.focus()">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>
        </button>
      </div>
      <p v-if="!askValue" class="field-hint">Saving with no name removes it.</p>
      <p v-if="askError" id="ask-error" class="field-error" role="alert">{{ askError }}</p>
    </form>
    <template #actions>
      <UiButton type="button" @click="askDone(null)">Cancel</UiButton>
      <UiButton variant="primary" type="submit" form="ask-form">Save</UiButton>
    </template>
  </UiModal>
</template>
