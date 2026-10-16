<script setup lang="ts">
// The sidebar: the open category's kinds (Graphics), the search, and the open kind's items as a tree
// (group > sub-group > item). Narrow screens show it as a drawer, with the categories at its top.
import { computed, nextTick, ref, watch } from 'vue'
import KindList from './KindList.vue'
import CatTabs from './CatTabs.vue'
import { S, kindItems, hiddenCount, booting, select, toggleOpen, renameSound, renameImage, renameTable, renameSub, canRename, byId } from '../state'
import { kindDef } from '../lib/nav'
import { nameOf, type Item } from '../lib/dcgs'
import { audioUrl } from '../lib/source'

const list = ref<HTMLElement | null>(null)
const search = ref<HTMLInputElement | null>(null)

const esc = (t: string) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const ws = computed(() => S.q.toLowerCase().split(/\s+/).filter(Boolean))
const searching = computed(() => ws.value.length > 0)
function matches(m: Item) {
  if (S.q.includes('|')) return (m.group + '|' + m.sub).toLowerCase().includes(S.q.trim().toLowerCase())   // a copied group|sub id
  const hay = [m.name, m.hex, m.sub, m.subLabel, m.group, m.id].join(' ').toLowerCase()
  return ws.value.every((w) => hay.includes(w))
}
function hl(text: string) {
  if (!ws.value.length) return esc(text)
  const low = text.toLowerCase(), hits = new Array(text.length).fill(false)
  ws.value.forEach((w) => { let i = low.indexOf(w); while (i >= 0) { hits.fill(true, i, i + w.length); i = low.indexOf(w, i + 1) } })
  let out = '', on = false
  for (let i = 0; i < text.length; i++) {
    if (hits[i] !== on) { out += on ? '</mark>' : '<mark>'; on = hits[i] }
    out += esc(text[i])
  }
  return out + (on ? '</mark>' : '')
}

interface Sub { name: string; label: string; key: string; items: Item[] }
interface Group { name: string; key: string; subs: Sub[]; n: number }
const groups = computed<Group[]>(() => {
  const gs = new Map<string, Map<string, Item[]>>()
  for (const m of kindItems.value) {
    if (searching.value && !matches(m)) continue
    if (!gs.has(m.group)) gs.set(m.group, new Map())
    const subs = gs.get(m.group)!
    if (!subs.has(m.sub)) subs.set(m.sub, [])
    subs.get(m.sub)!.push(m)
  }
  return [...gs].map(([g, subs]) => {
    const ss = [...subs].map(([s, items]) => ({ name: s, label: items[0].subLabel || '', key: 's:' + g + '|' + s, items }))
    return { name: g, key: 'g:' + g, subs: ss, n: ss.reduce((a, s) => a + s.items.length, 0) }
  })
})
const gOpen = (g: Group) => searching.value || (S.open.has(g.key) || !S.open.has('x' + g.key))
const sOpen = (s: Sub) => searching.value || S.open.has(s.key)
const idm = (m: Item) => [m.name ? m.hex : '', m.dur].filter(Boolean).join('  ')
const editTable = (s: Sub) => canRename.value && s.items[0] && (s.items[0].table || (s.items[0].kind === 'models' && /^0x[0-9a-f]+$/i.test(s.name)))
function renameRow(g: Group, s: Sub) { if (s.items[0].table) renameTable(g.name, s.label || s.name, s.items[0].table); else renameSub(g.name, s.name, s.label || s.name) }
const editSound = (m: Item) => ((m.kind === 'audio' && !m.bank) || m.kind === 'images') && canRename.value
const renameItem = (m: Item) => (m.kind === 'images' ? renameImage(m) : renameSound(m))

/* ── Copy ── */
const copied = ref('')
function copyId(text: string) {
  navigator.clipboard?.writeText(text).catch(() => { /* clipboard unavailable */ })
  copied.value = text; setTimeout(() => { if (copied.value === text) copied.value = '' }, 1200)
}

/* ── Play a sound from its row (one at a time; the same button stops it) ── */
const playing = ref('')
let player: HTMLAudioElement | null = null
const playable = (m: Item) => m.kind === 'audio' && !m.bank && !!m.row && m.row.format === 'ADX'
async function playRow(m: Item) {
  if (player) { player.pause(); player = null }
  if (playing.value === m.id) { playing.value = ''; return }
  playing.value = m.id
  const url = await audioUrl(m.row!)
  if (playing.value !== m.id) return
  if (!url) { playing.value = ''; return }
  const a = new Audio(url)
  player = a
  a.onended = () => { if (player === a) { player = null; playing.value = '' } }
  a.play().catch(() => { if (player === a) { player = null; playing.value = '' } })
}

/* ── Rows and keys ── */
const narrow = () => matchMedia('(max-width: 860px)').matches
function rowFor(key: string | null) { return key && list.value ? list.value.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) : null }
function focusRow(key: string | null) {
  const r = rowFor(key)
  if (!r || !list.value) return false
  list.value.querySelectorAll<HTMLElement>('[tabindex="0"]').forEach((x) => (x.tabIndex = -1))
  r.tabIndex = 0; r.focus(); r.scrollIntoView({ block: 'nearest' })
  return true
}
function pick(id: string) { select(id); if (narrow()) S.drawer = false }
function toggle(key: string, on?: boolean) {
  toggleOpen(key, on === undefined ? rowFor(key)?.getAttribute('aria-expanded') !== 'true' : on)
  nextTick(() => focusRow(key))
}
function click(key: string) {
  if (key.startsWith('i:')) pick(key.slice(2))
  else if (!searching.value) toggle(key)
}
let pending = 0
function keydown(e: KeyboardEvent) {
  const r = (e.target as HTMLElement).closest<HTMLElement>('.row')
  if (!r || !list.value) return
  const rows = [...list.value.querySelectorAll<HTMLElement>('.row')]
  const i = rows.indexOf(r), key = r.dataset.key!, item = key.startsWith('i:')
  const go = (j: number) => {
    const t = rows[Math.max(0, Math.min(rows.length - 1, j))]
    focusRow(t.dataset.key!)
    if (t.dataset.key!.startsWith('i:')) {
      clearTimeout(pending)
      const id = t.dataset.key!.slice(2)
      pending = window.setTimeout(() => select(id), 90)
    }
  }
  switch (e.key) {
    case 'ArrowDown': go(i + 1); break
    case 'ArrowUp': if (i === 0) search.value?.focus(); else go(i - 1); break
    case 'Home': go(0); break
    case 'End': go(rows.length - 1); break
    case 'ArrowRight':
      if (!item && r.getAttribute('aria-expanded') === 'false') toggle(key, true)
      else if (!item) go(i + 1)
      break
    case 'ArrowLeft':
      if (!item && r.getAttribute('aria-expanded') === 'true' && !searching.value) toggle(key, false)
      else {
        const lvl = Number(r.getAttribute('aria-level'))
        for (let j = i - 1; j >= 0; j--) if (Number(rows[j].getAttribute('aria-level')) < lvl) { focusRow(rows[j].dataset.key!); break }
      }
      break
    case 'Enter':
      if (item) { select(key.slice(2)); if (narrow()) S.drawer = false } else if (!searching.value) toggle(key)
      break
    case ' ':                                               // an item: play or pause it (selected first); a group: open or close
      if (item) { if (S.sel !== key.slice(2)) select(key.slice(2)); nextTick(() => S.playTick++) } else if (!searching.value) toggle(key)
      break
    case 'Escape': if (narrow()) S.drawer = false; else search.value?.focus(); break
    default: return
  }
  e.preventDefault()
}
function searchKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    const r = list.value?.querySelector<HTMLElement>('.row.item') || list.value?.querySelector<HTMLElement>('.row')
    if (r) focusRow(r.dataset.key!); e.preventDefault()
  } else if (e.key === 'Enter') {
    const r = list.value?.querySelector<HTMLElement>('.row.item')
    if (r) { pick(r.dataset.key!.slice(2)); focusRow(r.dataset.key!) }
  } else if (e.key === 'Escape') {
    if (S.q) { S.q = ''; nextTick(() => rowFor(S.sel ? 'i:' + S.sel : null)?.scrollIntoView({ block: 'center' })) }
    else { search.value?.blur(); if (narrow()) S.drawer = false }
    e.preventDefault()
  }
}
watch(() => S.q, () => { if (list.value) list.value.scrollTop = 0 })
// The selected row is kept in view (a selection from the hash, a breadcrumb or a key).
watch(() => S.sel, () => nextTick(() => {
  const r = rowFor(S.sel ? 'i:' + S.sel : null)
  if (r && document.activeElement !== r) r.scrollIntoView({ block: 'nearest' })
}))
// A breadcrumb asked to show a row: once it is drawn, put it at the top of the list and focus it.
watch(() => S.reveal, (key) => {
  if (!key) return
  if (S.q) S.q = ''
  nextTick(() => {
    const r = rowFor(key)
    if (r && list.value) {
      list.value.scrollTop += r.getBoundingClientRect().top - list.value.getBoundingClientRect().top - (key.startsWith('s:') ? 34 : 0)   // under the sticky group row
      list.value.querySelectorAll<HTMLElement>('[tabindex="0"]').forEach((x) => (x.tabIndex = -1))
      r.tabIndex = 0; r.focus({ preventScroll: true })
    }
    S.reveal = ''
  })
})
const curKey = computed(() => (S.sel && byId.value.has(S.sel) ? 'i:' + S.sel : groups.value[0] ? groups.value[0].key : ''))

defineExpose({
  focusSearch() { search.value?.focus(); search.value?.select() },
  focusIn() { if (!focusRow(S.sel ? 'i:' + S.sel : null)) search.value?.focus() },
})
const empty = computed(() => !booting.value && !kindItems.value.length)
</script>

<template>
  <aside id="side" class="side" :class="{ open: S.drawer }" :aria-label="kindDef(S.kind).label">
    <CatTabs class="cats-drawer" />
    <KindList @down="search?.focus()" />
    <div class="search">
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l4 4"/></svg>
      <input ref="search" v-model="S.q" type="search" :placeholder="'Search ' + kindDef(S.kind).label" autocomplete="off" spellcheck="false"
             :aria-label="'Search ' + kindDef(S.kind).label" :disabled="empty" @keydown="searchKey">
      <kbd>/</kbd>
    </div>
    <button v-if="hiddenCount" class="hiddenbtn" type="button" @click="S.showHidden = !S.showHidden">{{ S.showHidden ? 'Hide' : 'Show' }} {{ hiddenCount.toLocaleString('en-US') }} hidden</button>
    <div ref="list" class="list" role="tree" :aria-label="kindDef(S.kind).label" @keydown="keydown">
      <template v-if="booting"><div v-for="i in 12" :key="i" class="skel"></div></template>
      <template v-else-if="!empty">
        <div v-if="!groups.length" class="list-empty">No Matches</div>
        <div v-for="g in groups" :key="g.key" class="grp">
          <button class="row group" type="button" role="treeitem" aria-level="1" :data-key="g.key" :aria-selected="S.sel === g.key" :tabindex="curKey === g.key ? 0 : -1"
                  :aria-expanded="gOpen(g)" @click="click(g.key)">
            <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>
            <span class="label">{{ g.name }}</span>
            <span class="rowcopy" role="button" tabindex="-1" :title="'Copy id: ' + g.name" aria-label="Copy id" @click.stop="copyId(g.name)">
              <svg v-if="copied === g.name" viewBox="0 0 16 16" aria-hidden="true" class="ok"><path d="M3 8.5l3 3 7-7"/></svg>
              <svg v-else viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5H5"/></svg>
            </span>
            <span class="count">{{ g.n }}</span>
          </button>
          <template v-if="gOpen(g)">
            <div v-for="s in g.subs" :key="s.key" class="sb">
              <button class="row sub" type="button" role="treeitem" aria-level="2" :data-key="s.key" :aria-selected="S.sel === s.key" :tabindex="curKey === s.key ? 0 : -1"
                      :aria-expanded="sOpen(s)" @click="click(s.key)">
                <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>
                <span class="label" v-html="hl(s.label || s.name)"></span>
                <span v-if="s.label" class="idm">{{ s.name }}</span>
                <span class="rowcopy" role="button" tabindex="-1" :title="'Copy id: ' + g.name + '|' + s.name" aria-label="Copy id" @click.stop="copyId(g.name + '|' + s.name)">
                  <svg v-if="copied === g.name + '|' + s.name" viewBox="0 0 16 16" aria-hidden="true" class="ok"><path d="M3 8.5l3 3 7-7"/></svg>
                  <svg v-else viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5H5"/></svg>
                </span>
                <span v-if="editTable(s)" class="rowedit" role="button" tabindex="-1" title="Rename" aria-label="Rename"
                      @click.stop="renameRow(g, s)">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z"/></svg>
                </span>
                <span class="count">{{ s.items.length }}</span>
              </button>
              <template v-if="sOpen(s)">
                <button v-for="m in s.items" :key="m.id" class="row item" type="button" role="treeitem" aria-level="3" :data-key="'i:' + m.id"
                        :tabindex="curKey === 'i:' + m.id ? 0 : -1" :aria-selected="m.id === S.sel" @click="click('i:' + m.id)">
                  <span v-if="playable(m)" class="rowplay" :class="{ on: playing === m.id }" role="button" tabindex="-1"
                        :title="playing === m.id ? 'Stop' : 'Play'" :aria-label="playing === m.id ? 'Stop' : 'Play'" @click.stop="playRow(m)">
                    <svg v-if="playing === m.id" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1"/></svg>
                    <svg v-else viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z"/></svg>
                  </span>
                  <span class="label" v-html="hl(nameOf(m))"></span>
                  <span v-if="idm(m)" class="idm">{{ idm(m) }}</span>
                  <span v-if="editSound(m)" class="rowedit" role="button" tabindex="-1" title="Rename" aria-label="Rename" @click.stop="renameItem(m)">
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z"/></svg>
                  </span>
                </button>
              </template>
            </div>
          </template>
        </div>
      </template>
    </div>
  </aside>
</template>
