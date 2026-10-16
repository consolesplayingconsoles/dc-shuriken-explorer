// The disc the page shows: read by a worker from the user's own files. Browsers with folder access (Chrome, Edge)
// remember the folders of recent discs, so a disc reopens with one click; the others pick the folder each visit.
import { ref } from 'vue'
import { idb, store } from './store'
import type { Item, Picture } from './dcgs'

const worker = new Worker(new URL('../disc/worker.ts', import.meta.url), { type: 'module' })
let seq = 0
const waiting = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>()
export const progress = ref(0)                 // 0..1 while a disc is being scanned
worker.onmessage = (e: MessageEvent<{ id?: number; value?: unknown; error?: string; progress?: number }>) => {
  const d = e.data
  if (d.progress !== undefined) { progress.value = d.progress; return }
  const w = waiting.get(d.id!)
  if (!w) return
  waiting.delete(d.id!)
  if (d.error !== undefined) w.fail(new Error(d.error)); else w.ok(d.value)
}
export function call<T>(op: string, ...args: unknown[]): Promise<T> {
  return new Promise((ok, fail) => { const id = ++seq; waiting.set(id, { ok: ok as (v: unknown) => void, fail }); worker.postMessage({ id, op, args }) })
}

export interface Opened { game: string; sha1: string; product: string; version: string }
export interface Scanned { models: Item[]; pictures: Record<string, string>[]; sounds: Record<string, string>[]; rigs: { id: string; motions: number }[] }
export async function openFiles(files: File[]): Promise<Opened> {
  progress.value = 0
  return call<Opened>('open', files)
}
/** The open disc's models, and its pictures and sounds unless skipped (the decomp's map lists them). */
export function scanDisc(skipPictures: boolean, skipSounds: boolean): Promise<Scanned> {
  progress.value = 0
  return call<Scanned>('scanDisc', skipPictures, skipSounds)
}
/** The skeletons of the scanned disc under the decomp's `motions` rules. */
export function rigsFor(pairs: [string, string][]): Promise<Scanned['rigs']> {
  return call<Scanned['rigs']>('rigsFor', pairs)
}

/* ── Recent discs: names in every browser; folder access kept too where the browser can (Chrome, Edge) ── */
type Perm = { queryPermission(o: { mode: string }): Promise<string>; requestPermission(o: { mode: string }): Promise<string> }
type Dir = FileSystemDirectoryHandle & Perm & { values(): AsyncIterable<FileSystemHandle> }
export interface Recent { name: string; dir: Dir | null }
const RECENT = 'discs', NAMES = 'recentDiscs', KEEP = 8
export const canRemember = typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
// Newest first: the names this browser has opened, each with its folder when the browser keeps folders.
export async function recentDiscs(): Promise<Recent[]> {
  const dirs = ((await idb.get<{ name: string; dir: Dir }[]>(RECENT)) || [])
  const names = store.get<string[]>(NAMES) || dirs.map((r) => r.name)
  return names.slice(0, KEEP).map((name) => ({ name, dir: (dirs.find((r) => r.name === name) || { dir: null }).dir }))
}
async function remember(name: string, dir: Dir) {
  const list = ((await idb.get<{ name: string; dir: Dir }[]>(RECENT)) || []).filter((r) => r.name !== name)
  await idb.set(RECENT, [{ name, dir }, ...list].slice(0, KEEP))
}
async function filesIn(dir: Dir): Promise<File[]> {
  const out: File[] = []
  for await (const h of dir.values()) if (h.kind === 'file') out.push(await (h as FileSystemFileHandle).getFile())
  return out
}
/** Asks for a game folder: remembered where the browser can; null when cancelled. The game is named after its folder. */
export async function pickDisc(): Promise<{ files: File[]; dir: Dir | null; name: string } | null> {
  if (canRemember) {
    let dir: Dir
    try { dir = await (window as unknown as { showDirectoryPicker(o: object): Promise<Dir> }).showDirectoryPicker({ id: 'disc', mode: 'read' }) } catch { return null }
    return { files: await filesIn(dir), dir, name: dir.name }
  }
  return new Promise((done) => {
    const input = document.createElement('input')
    input.type = 'file'; input.multiple = true
    input.setAttribute('webkitdirectory', '')
    input.onchange = () => {
      const fs = input.files ? [...input.files] : []
      done(fs.length ? { files: fs, dir: null, name: fs[0].webkitRelativePath.split('/')[0] || fs[0].name } : null)
    }
    input.oncancel = () => done(null)
    input.click()
  })
}
/** The files of a remembered disc, asking for permission again when the browser needs it (null when refused). */
export async function reopenFiles(r: Recent, ask: boolean): Promise<File[] | null> {
  if (!r.dir) return null                                      // a browser that keeps no folders
  let perm = 'prompt'
  try { perm = await r.dir.queryPermission({ mode: 'read' }) } catch { /* treat as prompt */ }
  if (perm !== 'granted' && ask) { try { perm = await r.dir.requestPermission({ mode: 'read' }) } catch { /* refused */ } }
  return perm === 'granted' ? filesIn(r.dir) : null
}
/** Forgets a game: its name and its remembered folder (the disc and the decomp are untouched). */
export async function forgetDisc(name: string) {
  store.set(NAMES, (store.get<string[]>(NAMES) || []).filter((n) => n !== name))
  await idb.set(RECENT, ((await idb.get<{ name: string; dir: Dir }[]>(RECENT)) || []).filter((r) => r.name !== name))
}
export async function rememberDisc(name: string, dir: Dir | null) {
  store.set(NAMES, [name, ...(store.get<string[]>(NAMES) || []).filter((n) => n !== name)].slice(0, KEEP))
  if (dir) await remember(name, dir)
}

/* ── Images and sounds as object URLs (made once per disc) ── */
const urls = new Map<string, Promise<string | null>>()
export function blobUrl(key: string, make: () => Promise<Blob | null>): Promise<string | null> {
  if (!urls.has(key)) urls.set(key, make().then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null))
  return urls.get(key)!
}
export function forgetUrls() {
  for (const p of urls.values()) p.then((u) => u && URL.revokeObjectURL(u))
  urls.clear()
}
export const textureKey = (r: Record<string, string>) => ['tex', r.texture_file.toUpperCase(), r.offset, r.width, r.height, r.type, r.format].join('|')
export function textureUrl(r: Record<string, string>): Promise<string | null> {
  return blobUrl(textureKey(r), () => call<Blob | null>('texture', r.texture_file.toUpperCase(), parseInt(r.offset, 16), Number(r.width), Number(r.height), parseInt(r.type, 16), Number(r.format)))
}
const palettes = new Map<string, string>()                     // picture key -> the palette it was shown with
/** A picture of the disc as an object URL (null when its format is not decoded), and the palette it was shown with. */
export async function imageUrl(p: Picture): Promise<{ url: string | null; palette: string }> {
  const key = ['img', p.file, p.offset].join('|')
  const url = await blobUrl(key, async () => {
    const r = await call<{ blob: Blob; palette: string } | null>('image', p.file, p.offset, p.kind, p.w, p.h, p.dt, p.pf, p.bytes)
    if (r) palettes.set(key, r.palette)
    return r ? r.blob : null
  })
  return { url, palette: palettes.get(key) || '' }
}
export function audioUrl(r: Record<string, string>): Promise<string | null> {
  return blobUrl(['snd', r.file.toUpperCase(), r.offset, r.bytes, r.format].join('|'), () => call<Blob | null>('audio', r.file.toUpperCase(), parseInt(r.offset, 16), Number(r.bytes), r.format))
}
