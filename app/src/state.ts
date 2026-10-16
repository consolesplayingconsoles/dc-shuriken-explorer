// The page's state and what changes it: the open game, the decomp's map, the open kind and the selected item.
import { computed, reactive, ref, shallowRef } from 'vue'
import type { Mesh } from './lib/api'
import { call, forgetDisc, forgetUrls, openFiles, pickDisc, recentDiscs, rememberDisc, reopenFiles, rigsFor, scanDisc } from './lib/source'
import { mapVersion, readsMap, build, parseDcgs, texKey, tidy, nameOf, writeRule, type Built, type Item, type Kind } from './lib/dcgs'
import type { Motion } from './lib/pose'
import { KINDS } from './lib/nav'
import { codeItems, functionsOf, names as codeNamesOf, type CodeFiles } from './lib/code'
import { textItems, TEXT_DIR } from './lib/text'
import { applyHidden } from './lib/plugins'

/** Where a decomp's files are read from (a folder of this computer). */
interface Source {
  name: string
  read(path: string): Promise<string | null>     // a text file by its path in the decomp, or null
  list(dir: string): Promise<string[]>            // every file path under a folder of the decomp (recursive)
  bytes(path: string): Promise<Uint8Array | null> // a file's bytes by its path in the decomp, or null
}
import { idb, store } from './lib/store'

export interface MapState {
  state: 'ready' | 'ask' | 'missing' | 'old' | 'none'
  version?: string               // an 'old' map's version
  name?: string
  text?: string
  rules?: string
  dir?: FileSystemDirectoryHandle | null
  code?: CodeFiles               // the decomp's code files
  src?: Source                   // where its files are read from
  readme?: string                // its README (the progress block)
  textFiles?: string[]           // the files of its text-dump folder
}

const EMPTY_BUILT: Built = { items: [], asm: new Map(), tex: new Map(), rigs: new Map(), motionNames: new Map() }

export const S = reactive({
  disc: null as { game: string; sha1: string; product: string; version: string } | null,   // the open disc
  recent: [] as string[],         // discs this browser can reopen (newest first)
  map: null as MapState | null,
  kind: (store.get<Kind>('tab') && KINDS.some((k) => k.key === store.get<Kind>('tab')) ? store.get<Kind>('tab') : 'models') as Kind,
  sel: null as string | null,
  q: '',
  open: new Set<string>(store.get<string[]>('open') || []),
  opening: '' as string,          // the game being opened (the main pane shows it while the disc is read)
  loading: true,                  // a load is running: list and counts are not ready yet
  modal: null as { title: string; body: string } | null,
  ask: null as { title: string; value: string; check: (v: string) => string; done: (v: string | null) => void } | null,
  rigPick: new Map<string, string>(),   // rig name -> the assembly it is shown on, '' for the skeleton alone
  bone: null as number | null,          // the bone picked in the open skeleton
  drawer: false,
  reveal: '',
  playTick: 0,
  showHidden: false,              // the list shows the items a plugin hid
  overview: false,                // the decomp's overview (its progress) in the main pane                    // Space: play or pause what the main pane shows (a motion, a sound)
  onboard: '' as '' | 'ask' | 'warn',   // asking for the decomp of a disc just opened (or warning after Skip)                     // a list row to show (a group or sub-group key), from the breadcrumbs
})
export const built = shallowRef<Built>(EMPTY_BUILT)
export const byId = computed(() => new Map(built.value.items.map((m) => [m.id, m])))
export const counts = computed(() => {
  const c: Record<string, number> = {}
  for (const k of KINDS) c[k.key] = 0
  for (const m of built.value.items) if (!m.hidden) c[m.kind]++
  return c as Record<Kind, number>
})
/** How many items of the open kind a plugin hid. */
export const hiddenCount = computed(() => built.value.items.filter((m) => m.kind === S.kind && m.hidden).length)
// Nothing to show yet (first load, or a game opening); a reload of the same game keeps what is on screen.
export const booting = computed(() => S.loading && !built.value.items.length)
export const kindItems = computed(() => built.value.items.filter((m) => m.kind === S.kind && (S.showHidden || !m.hidden)))
export const selected = computed(() => (S.sel ? byId.value.get(S.sel) || null : null))
// A selected category (a group `g:<group>` or sub-group `s:<group>|<sub>` of the open kind) and what it holds.
export const selectedCategory = computed(() => {
  const k = S.sel
  if (!k || !(k.startsWith('g:') || k.startsWith('s:'))) return null
  const [group, sub] = k.slice(2).split('|')
  const items = kindItems.value.filter((m) => m.group === group && (sub === undefined || m.sub === sub))
  return items.length ? { key: k, group, sub, items } : null
})
export const meshes = new Map<string, Mesh>()
export const theme = ref(document.documentElement.getAttribute('data-theme') || 'light')
const lastSel = new Map<Kind, string>()

export function modal(title: string, body: string) { S.modal = { title, body } }
// Asks for a name, tidied; `taken` says whether another item of the same collection already has it (names are unique
// within a collection: a motion file's motions, an archive's sounds, a sub-group's models, a group's tables).
// Resolves to the name, '' to clear it, or null when cancelled.
// `taken` returns the item that already has the name (e.g. "sound #12 in SND_UPEN2.AFS"), or '' when it is free.
export function askName(title: string, value: string, taken: (name: string) => string): Promise<string | null> {
  const check = (v: string) => { const who = taken(tidy(v)); return who ? '\u201c' + tidy(v) + '\u201d is already the name of ' + who + '.' : '' }
  return new Promise((done) => { S.ask = { title, value, check, done: (v) => { S.ask = null; done(v) } } })
}
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/* ── The decomp map ──────────────────────────────────────── */
const dcgsKey = (sha: string) => 'game.' + sha
const SESSION_MAPS = new Map<string, { name: string; text: string }>()
// The text of dir/<names...>, or null when it is not there.
async function readIn(dir: FileSystemDirectoryHandle, ...names: string[]): Promise<string | null> {
  try {
    let d = dir
    for (const n of names.slice(0, -1)) d = await d.getDirectoryHandle(n)
    return await (await (await d.getFileHandle(names[names.length - 1])).getFile()).text()
  } catch { return null }
}
type PermHandle = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: string }): Promise<string>
  requestPermission(o: { mode: string }): Promise<string>
}
// A folder of this computer as a decomp source (folder access: Chrome, Edge).
type Iter = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> }
function folderSource(dir: FileSystemDirectoryHandle): Source {
  return {
    name: dir.name,
    read: (path) => readIn(dir, ...path.split('/')),
    async bytes(path) {
      try {
        let d = dir
        const names = path.split('/')
        for (const n of names.slice(0, -1)) d = await d.getDirectoryHandle(n)
        return new Uint8Array(await (await (await d.getFileHandle(names[names.length - 1])).getFile()).arrayBuffer())
      } catch { return null }
    },
    async list(path) {
      const out: string[] = []
      let d: FileSystemDirectoryHandle
      try { d = dir; for (const n of path.split('/')) d = await d.getDirectoryHandle(n) } catch { return out }
      const walk = async (h: FileSystemDirectoryHandle, at: string) => {
        for await (const e of (h as Iter).values()) {
          if (e.kind === 'file') out.push(at + '/' + e.name)
          else await walk(e as FileSystemDirectoryHandle, at + '/' + e.name)
        }
      }
      await walk(d, path)
      return out
    },
  }
}
// The decomp's code files: the function list, names, the equivalence list, the C sources and the test case files.
async function readCode(src: Source): Promise<CodeFiles | undefined> {
  const functions = await src.read('functions.txt')
  if (functions === null) return undefined
  const sources = new Map<string, string>(), cases = new Map<string, string[]>()
  for (const path of (await src.list('src')).filter((x) => /^src\/[^/]+\.c$/.test(x))) sources.set(path.slice(4), (await src.read(path)) || '')
  for (const path of (await src.list('tests')).filter((x) => /^tests\/[^/]+\/[^/]+\.json$/.test(x))) {
    const fn = path.split('/')[2].slice(0, -5)
    if (!cases.has(fn)) cases.set(fn, [])
    cases.get(fn)!.push(path)
  }
  return { functions, symbols: (await src.read('symbols.txt')) || '', globals: (await src.read('globals.txt')) || '',
    equivalent: (await src.read('tests/equivalent.txt')) || '', sources, cases }
}
// A source's map, rules and code (the map's version decides whether it can be read).
async function fromSource(src: Source, dir: FileSystemDirectoryHandle | null): Promise<MapState> {
  const text = await src.read('model-map/game.dcgs')
  if (text === null) return { state: 'missing', name: src.name, dir }
  const v = mapVersion(text)
  if (!readsMap(v)) return { state: 'old', name: src.name, dir, version: v }
  return { state: 'ready', name: src.name, text, rules: (await src.read('models.txt')) || '', dir, src, code: await readCode(src), readme: (await src.read('README.md')) || '', textFiles: await src.list(TEXT_DIR) }
}
/** A text file of the open decomp folder (e.g. a test case), or null. */
export async function decompFile(path: string): Promise<string | null> {
  return S.map && S.map.src ? S.map.src.read(path) : null
}
/** The bytes of a file of the open decomp folder, or null. */
export async function decompBytes(path: string): Promise<Uint8Array | null> {
  return S.map && S.map.src ? S.map.src.bytes(path) : null
}
export const codeNames = computed(() => (S.map && S.map.code ? codeNamesOf(S.map.code) : new Map<number, string>()))
export const exeBase = ref(0)

async function loadMap(sha: string): Promise<MapState> {
  const h = await idb.get<PermHandle>(dcgsKey(sha))
  if (h && h.kind === 'directory') {
    let perm = 'prompt'
    try { perm = await h.queryPermission({ mode: 'readwrite' }) } catch { /* treat as prompt */ }
    if (perm !== 'granted') return { state: 'ask', name: h.name, dir: h }
    return fromSource(folderSource(h), h)
  }
  if (h) await idb.del(dcgsKey(sha))                       // a handle from an older version: forget it
  const mem = SESSION_MAPS.get(sha)                         // no folder access in this browser: until the page closes
  if (mem) return { state: 'ready', name: mem.name, text: mem.text, rules: '', dir: null }
  return { state: 'none' }
}
// Checks a game.dcgs against the open disc; remembers the folder it came from (or the text for this session) and reloads.
async function acceptMap(text: string, name: string, dir: FileSystemDirectoryHandle | null) {
  const kept = S.map && S.map.state !== 'none' ? ' ' + S.map.name + ' stays open.' : ''
  if (!S.disc) return
  const d = parseDcgs(text)
  if (d.version && !readsMap(d.version)) return modal('Upgrade the Decomp', name + ' was made with version ' + d.version + ' of the decomp kickoff. Upgrade it with the skill, then open it again.' + kept)
  if (!d.sections.models) return modal('Not a Decomp', name + ' is not a decomp map.' + kept)
  if (!d.sha || d.sha !== S.disc.sha1) return modal('Different Game', name + ' is a decomp of another game or another release of it.' + kept)
  if (dir) await idb.set(dcgsKey(d.sha), dir); else SESSION_MAPS.set(d.sha, { name, text })
  S.onboard = ''
  await load()
}
/** Without the decomp, for this game: not asked again when it is opened. */
export function skipDecomp() {
  if (S.disc) store.set('skipped', [...new Set([...(store.get<string[]>('skipped') || []), S.disc.sha1])])
  S.onboard = ''
  if (!scanned) void load()                                  // the disc was waiting for this answer
}
export async function chooseDecomp() {                       // the question stays open until a decomp is accepted: a cancel or an error leaves it to try again
  const w = window as unknown as { showDirectoryPicker?: (o: object) => Promise<FileSystemDirectoryHandle> }
  if (!w.showDirectoryPicker) return pickFile()
  let dir: FileSystemDirectoryHandle
  try { dir = await w.showDirectoryPicker({ id: 'dcgs-decomp', mode: 'readwrite' }) } catch { return }   // cancelled
  const text = await readIn(dir, 'model-map', 'game.dcgs')
  if (text === null) {
    return modal('Not a Decomp', dir.name + ' is not a decomp folder, or its setup has not been run yet.')
  }
  await acceptMap(text, dir.name, dir)
}
function pickFile() {                                        // browsers without folder access
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.dcgs'
  input.onchange = async () => {
    const f = input.files && input.files[0]
    if (!f) return
    if (!/\.dcgs$/i.test(f.name)) return modal('Not a Decomp', f.name + ' is not a decomp map.')
    await acceptMap(await f.text(), f.name, null)
  }
  input.click()
}
// A remembered folder whose permission lapsed: one click on the label asks again.
/** The decomp's progress, at its own address (#progress) so a reload comes back to it. */
export function openOverview() {
  S.overview = true
  if (location.hash !== '#progress') history.replaceState(null, '', pageUrl('#progress'))
}
export async function reopenMap() {
  const m = S.map
  if (m && m.state === 'ready') { openOverview(); return }   // the decomp's name: its overview
  if (m && m.state === 'none') { S.onboard = 'ask'; return }
  if (!m || m.state !== 'ask' || !m.dir) return
  try { if ((await (m.dir as PermHandle).requestPermission({ mode: 'readwrite' })) === 'granted') await load() } catch { /* declined */ }
}

/** The page's address for a hash: it names the open game (?game=), so a link opens that game; the root names none. */
function pageUrl(hash: string): string {
  return location.pathname + (S.disc ? '?game=' + encodeURIComponent(S.disc.game) : '') + hash
}

/* ── Loading ─────────────────────────────────────────────── */
let models: Item[] = []                                       // the disc's models as scanned (built afresh on every load)
let pictures: Record<string, string>[] = []                    // the disc's pictures as scanned: the Images of a game with no decomp
let sounds: Record<string, string>[] = []                      // the disc's sounds as scanned: the Sounds of a game with no decomp
let ninjaRigs: { id: string; motions: number }[] = []             // Ninja models that have motions: the disc's skeletons
let scanned: { pictures: boolean; sounds: boolean } | null = null   // whether the disc was scanned since it opened, and whether that scan looked for pictures and sounds
export async function load() {
  if (!S.disc) { S.loading = false; return }
  S.loading = true
  S.map = await loadMap(S.disc.sha1)
  const parsed = S.map.text ? parseDcgs(S.map.text) : null
  const sections = parsed && readsMap(parsed.version) ? parsed.sections : {}
  // The disc is scanned now that its decomp is known: a map that lists the pictures spares the scan for them.
  if (!scanned || (!scanned.pictures && !sections.images) || (!scanned.sounds && !sections.audio)) {
    let sc: Awaited<ReturnType<typeof scanDisc>>
    try { sc = await scanDisc(!!sections.images, !!sections.audio) } catch (e) {
      S.loading = false; S.opening = ''
      return modal('Could Not Read the Disc', (e as Error).message)
    }
    models = sc.models; pictures = sc.pictures; sounds = sc.sounds; ninjaRigs = sc.rigs; scanned = { pictures: !sections.images, sounds: !sections.audio }
  }
  const pairs = (S.map.rules || '').split('\n').map((l) => l.replace(/#.*/, '').trim().split(/\s+/))         // `motions <model file> <motion file>`
    .filter((t) => t[0] === 'motions' && t.length === 3).map((t) => [t[1], t[2]] as [string, string])
  if (pairs.length) ninjaRigs = await rigsFor(pairs)            // the scan paired by file sets alone; the decomp's rules may add more
  if (!sections.images) sections.images = pictures                // a plain disc: its own pictures and sounds; a decomp's map names them
  if (!sections.audio) sections.audio = sounds
  const b = build(models.map((m) => ({ ...m })), sections, S.map.rules || '',
    [...(S.map.code ? codeItems(functionsOf(S.map.code)) : []), ...textItems(S.map.textFiles || [])], ninjaRigs)
  applyHidden(S.disc ? S.disc.product : undefined, S.disc ? S.disc.version : undefined, b.items)
  built.value = b
  exeBase.value = parsed ? parsed.base : 0
  S.loading = false
  const want = decodeURIComponent(location.hash.slice(1))
  const m = byId.value.get(want)
  if (m) { setKind(m.kind, false); select(m.id, true) } else setKind(S.kind, false)
  if (want === 'progress' && S.map && S.map.state === 'ready') openOverview()
  if (/^[gs]:/.test(want)) { const [g, s] = want.slice(2).split('|'); if (kindItems.value.some((x) => x.group === g)) selectCategory(g, s) }
}

async function openWith(files: File[], dir: Parameters<typeof rememberDisc>[1], name: string) {
  motionLists.clear(); motionData.clear(); forgetUrls(); exeBytes = null
  meshes.clear(); lastSel.clear(); S.sel = null; S.bone = null; S.rigPick.clear()
  S.opening = name; S.map = null; S.loading = true
  built.value = EMPTY_BUILT                                  // nothing of the previous game stays visible
  let o: { game: string; sha1: string; product: string; version: string }
  scanned = null
  try { o = await openFiles(files) } catch (e) {
    S.opening = ''; S.loading = false
    if (!S.disc) built.value = EMPTY_BUILT
    return modal('Could Not Open the Disc', (e as Error).message)
  }
  models = []; pictures = []; sounds = []; ninjaRigs = []
  S.disc = { game: name, sha1: o.sha1, product: o.product || '', version: o.version || '' }
  history.replaceState(null, '', pageUrl(location.hash))
  await rememberDisc(name, dir)
  S.recent = (await recentDiscs()).map((r) => r.name)
  // A disc with no decomp in this browser: ask for it first, unless it was skipped for this game before; the disc loads once that is settled.
  if ((await loadMap(o.sha1)).state === 'none' && !(store.get<string[]>('skipped') || []).includes(o.sha1)) { S.opening = ''; S.onboard = 'ask'; return }
  await load()
  S.opening = ''
}
/** Asks for a game's folder and opens its disc. */
export async function openDisc() {
  const got = await pickDisc()
  if (got) await openWith(got.files, got.dir, got.name)
}
/** Opens a disc this browser remembers (asking for its folder again if the browser needs it). */
// A browser that keeps no folders (Firefox, Safari) asks for the game's folder again: the picker opens for it.
export async function openRecent(name: string) {
  const r = (await recentDiscs()).find((x) => x.name === name)
  if (!r) return
  if (!r.dir) return openDisc()
  const files = await reopenFiles(r, true)
  if (files) await openWith(files, r.dir, name)
}
/** Removes a game from the list, with its remembered decomp (the page then reloads: the root shows the picker). */
export async function removeGame(name: string) {
  if (S.disc && S.disc.game === name) {                       // the game's decomp goes with it, so importing it again asks again
    await idb.del(dcgsKey(S.disc.sha1)); SESSION_MAPS.delete(S.disc.sha1)
    store.set('skipped', (store.get<string[]>('skipped') || []).filter((x) => x !== S.disc!.sha1))
  }
  await forgetDisc(name)
  history.replaceState(null, '', location.pathname)
  location.reload()
}
/** On start: the game named in the address (?game=) opens by itself when the browser still allows it; the root opens nothing. */
export async function start() {
  const list = await recentDiscs()
  S.recent = list.map((r) => r.name)
  const want = new URLSearchParams(location.search).get('game')
  const r = want ? list.find((x) => x.name === want) : undefined
  const files = r ? await reopenFiles(r, false) : null
  if (r && files) await openWith(files, r.dir, r.name)
  else S.loading = false
}

/* ── Kinds and selection ─────────────────────────────────── */
export function setKind(k: Kind, user = true) {
  if (S.sel) { const cur = byId.value.get(S.sel); if (cur) lastSel.set(cur.kind, cur.id) }
  S.kind = k; store.set('tab', k)
  if (user) S.q = ''
  const items = kindItems.value
  const keep = S.sel && items.some((m) => m.id === S.sel) ? S.sel : lastSel.get(k)
  if (keep && byId.value.has(keep)) return select(keep, true)
  const first = k === 'models' ? items.filter((m) => (m.bytes || 0) <= 65536).sort((x, y) => (y.bytes || 0) - (x.bytes || 0))[0] : items[0]
  if (first) select(first.id, true)
  else { S.sel = null; history.replaceState(null, '', pageUrl('')) }
}

export function select(id: string, reveal = false) {
  S.overview = false
  const m = byId.value.get(id)
  if (!m) return
  if (m.kind !== S.kind) { S.kind = m.kind; store.set('tab', m.kind) }
  S.sel = id
  if (location.hash.slice(1) !== id) history.replaceState(null, '', pageUrl('#' + id))
  if (reveal) {
    S.open.add('g:' + m.group); S.open.delete('xg:' + m.group)
    S.open.add('s:' + m.group + '|' + m.sub)
  }
}

/** Selects a group or sub-group (the breadcrumbs): expanded and shown in the list, its contents in the main pane. */
export function selectCategory(group: string, sub?: string) {
  S.overview = false
  revealInList(group, sub)
  S.sel = sub !== undefined ? 's:' + group + '|' + sub : 'g:' + group
  if (location.hash.slice(1) !== S.sel) history.replaceState(null, '', pageUrl('#' + encodeURIComponent(S.sel)))
}
/** Opens a group or sub-group in the list and brings its row into view. */
export function revealInList(group: string, sub?: string) {
  S.open.add('g:' + group); S.open.delete('xg:' + group)
  if (sub !== undefined) S.open.add('s:' + group + '|' + sub)
  store.set('open', [...S.open])
  S.reveal = sub !== undefined ? 's:' + group + '|' + sub : 'g:' + group
  if (matchMedia('(max-width: 860px)').matches) S.drawer = true
}
export function toggleOpen(key: string, on?: boolean) {
  const isGroup = key.startsWith('g:')
  const now = on === undefined ? !S.open.has(key) : on
  if (now) S.open.add(key); else S.open.delete(key)
  if (isGroup) { if (now) S.open.delete('x' + key); else S.open.add('x' + key) }
  store.set('open', [...S.open])
}

/* ── Renaming (rules written into the decomp's models.txt) ─ */
async function rule(kind: 'name' | 'table' | 'sound' | 'motion' | 'image' | 'note', key: string, rest: string) {
  if (!S.map || !S.map.dir) return
  try { await writeRule(S.map.dir, kind, key, rest) } catch (e) { return modal('Could Not Save', 'The name could not be saved in the decomp folder.') }
  await load()
}
export async function renameModel(m: Item) {
  const v0 = await askName('Name This Model', nameOf(m), (n) => {
    const x = built.value.items.find((x) => x.kind === 'models' && !x.asm && x.id !== m.id && x.group === m.group && x.sub === m.sub && same(x.name, n))
    return x ? 'model ' + x.hex + ' in ' + (m.subLabel || m.sub) : ''
  })
  if (v0 === null) return                                   // cancelled; '' clears the name
  const v = tidy(v0)
  const i = m.id.lastIndexOf(':')
  await rule('name', m.id.slice(0, i) + ' ' + m.id.slice(i + 1), v)
}
export async function renameSound(m: Item) {
  const v0 = await askName('Name This Sound', nameOf(m), (n) => {
    const x = built.value.items.find((x) => x.kind === 'audio' && x.id !== m.id && x.file === m.file && same(x.name, n))
    return x ? 'sound ' + x.hex + ' in ' + m.file : ''
  })
  if (v0 === null) return                                   // cancelled; '' clears the name
  const v = tidy(v0)
  await rule('sound', m.file + ' ' + m.num, v)
}
export async function renameImage(m: Item) {
  const v0 = await askName('Name This Image', nameOf(m), (n) => {
    const x = built.value.items.find((x) => x.kind === 'images' && x.id !== m.id && x.group === m.group && same(x.name, n))
    return x ? 'image ' + (x.hex || x.sub) + ' in ' + m.group : ''
  })
  if (v0 === null) return                                   // cancelled; '' clears the name
  const v = tidy(v0)
  const i = m.id.lastIndexOf(':')
  await rule('image', m.id.slice(4, i) + ' ' + m.id.slice(i + 1), v)
}
export async function renameTable(group: string, sub: string, addr: string) {
  const v0 = await askName('Name This Table', sub, (n) => {
    const x = built.value.items.find((x) => x.kind === 'models' && x.group === group && x.table && x.table !== addr && same(x.subLabel, n))
    return x ? 'table ' + x.sub + ' in ' + group : ''
  })
  if (v0 === null) return                                   // cancelled; '' clears the name
  const v = tidy(v0)
  await rule('table', addr, v ? group.replace(/ /g, '_') + ' ' + v.replace(/ /g, '_') : '')
}
// A sub-group without a table (e.g. a character 0x00): a `note` naming exactly that id.
export async function renameSub(group: string, sub: string, label: string) {
  const v0 = await askName('Name This Sub-Group', label, (n) => {
    const x = built.value.items.find((x) => x.kind === 'models' && x.group === group && x.sub !== sub && same(x.subLabel, n))
    return x ? x.sub + ' in ' + group : ''
  })
  if (v0 === null) return
  await rule('note', group.replace(/ /g, '_') + ' ' + sub, tidy(v0))
}
export async function renameMotion(file: string, offset: string, current: string) {
  const file0 = file.toUpperCase()
  const v0 = await askName('Name This Motion', current, (n) => {
    const hit = [...built.value.motionNames].find(([k, name]) => k.startsWith(file0 + ':') && k !== file0 + ':' + offset && same(name, n))
    return hit ? 'motion ' + hit[0].slice(file0.length + 1) + ' in ' + file0 : ''
  })
  if (v0 === null) return                                   // cancelled; '' clears the name
  const v = tidy(v0)
  await rule('motion', file.toUpperCase() + ' ' + offset, v)
}
export const canRename = computed(() => !!(S.map && S.map.dir && S.map.state === 'ready'))

/* ── Ninja skeletons: a model's own motions, posed by the worker ── */
export interface NinjaMotion { key: string; frames: number; kinds: string; moving: number }   // key: the motion's file and offset
export interface NinjaFrame { position: number[]; normal: number[]; joints: { parent: number; p: number[] }[] }
export const ninjaMotions = (id: string) => call<NinjaMotion[]>('ninjaMotions', id)
export const ninjaFrame = (id: string, motion: string, frame: number) => call<NinjaFrame>('ninjaFrame', id, motion, frame)

/* ── Meshes ──────────────────────────────────────────────── */
export async function partMesh(id: string): Promise<Mesh> {
  if (!meshes.has(id)) {
    const d = await call<Mesh>('mesh', id)
    const set = (byId.value.get(id) || { texset: '' }).texset || ''
    d.pieces.forEach((pc) => { pc.file = id.slice(0, id.lastIndexOf(':')); pc.set = set })
    meshes.set(id, d)
  }
  return meshes.get(id)!
}
// A model's mesh; an assembly's is its parts, each moved by its matrix.
export async function loadMesh(id: string): Promise<Mesh> {
  if (!id.startsWith('asm:')) return partMesh(id)
  const key = 'mesh:' + id
  if (meshes.has(key)) return meshes.get(key)!
  const a = built.value.asm.get(id.slice(4))!
  const out: Mesh = { position: [], normal: [], uv: [], pieces: [] }
  const ms = await Promise.all(a.parts.map((p) => partMesh(p.id)))
  a.parts.forEach((p, k) => {
    const d = ms[k], m = p.m, base = out.position.length / 3
    for (let i = 0; i < d.position.length; i += 3) {
      const x = d.position[i], y = d.position[i + 1], z = d.position[i + 2]
      out.position.push(m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11])
      const nx = d.normal[i], ny = d.normal[i + 1], nz = d.normal[i + 2]
      out.normal.push(m[0] * nx + m[1] * ny + m[2] * nz, m[4] * nx + m[5] * ny + m[6] * nz, m[8] * nx + m[9] * ny + m[10] * nz)
    }
    d.uv.forEach((u) => out.uv.push(u))
    d.pieces.forEach((pc) => out.pieces.push({ texture: pc.texture, tsp: pc.tsp, list: pc.list, colour: pc.colour, file: pc.file, set: pc.set, index: pc.index.map((i) => i + base) }))
  })
  meshes.set(key, out)
  return out
}
export function pieceTexture(pc: Mesh['pieces'][number]): Record<string, string> | null {
  return pc.texture >= 0 && pc.file ? built.value.tex.get(texKey(pc.file, pc.set || '', pc.texture)) || null : null
}
export const rigChar = (name: string, first: string) => (S.rigPick.has(name) ? S.rigPick.get(name)! : first)

/* ── Motions (read from the disc as asked, kept for the page's life) ── */
export interface MotionRef { offset: string; addr: string; frames: number; bones: number; count: number }
const motionLists = new Map<string, Promise<MotionRef[]>>()
const motionData = new Map<string, Promise<Motion>>()
export function motionsOf(file: string, format: string): Promise<MotionRef[]> {
  const k = file + '|' + format
  if (!motionLists.has(k)) motionLists.set(k, call<MotionRef[]>('motions', file.toUpperCase(), format))
  return motionLists.get(k)!
}
export function motionAt(file: string, offset: string, format: string): Promise<Motion> {
  const k = file + ':' + offset + '|' + format
  if (!motionData.has(k)) motionData.set(k, call<Motion>('motion', file.toUpperCase(), parseInt(offset, 16), format))
  return motionData.get(k)!
}

/* ── The executable's bytes (for disassembly), once per disc ── */
let exeBytes: Promise<Uint8Array> | null = null
export function executable(): Promise<Uint8Array> {
  if (!exeBytes) exeBytes = call<Uint8Array>('bytes', '1ST_READ.BIN')
  return exeBytes
}
