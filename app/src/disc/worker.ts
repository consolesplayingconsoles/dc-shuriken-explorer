// The open disc lives here, off the page's thread: scanning a disc for models takes seconds.
// Requests mirror what the page needs: open, mesh, texture, image, audio, motions, motion, floats.
import { Disc, HD_START, type DiscFile } from './gdi'
import { Words, mesh, type Found } from './nlmodel'
import { decode, palette } from './pvr'
import { mesh as ninjaMesh, meshRaw, type Found as Ninja } from './ninja'
import { find as findNinjaMotions, findImages as findMotionImages, imageKeys, keys as motionKeys } from './njmotion'
import { poseAt } from './ninjapose'
import { decompress } from './prs'
import { blockAt } from './pressed'
import { find as findPictures, type Found as Pic } from './pictures'
import { find as findSounds } from './sounds'
import { STRETCH, starts as stretchStarts } from './stretch'
import { ModelScan, scanBuffer } from './scan'
import { mesh as md3Mesh } from './md3'
import { mesh as taggedMesh } from './tagged'
import { taggedTransform } from '../lib/plugins'
import { mesh as prmMesh } from './prm'
import { mesh as tr4Mesh, page as tr4Page } from './tr4'
import { memberAt } from './zip'
import { toWav } from './adx'
import { decode as adpcm, wav as pcmWav } from './adpcm'
import { find as findMotions, frames } from './vmotion'
import { find as findE16, keys as e16Keys } from './e16motion'

const SKIP = ['.ADX', '.SFD', '.WAV', '.MP2', '.AHX', '.SFA']

let disc: Disc | null = null
let files = new Map<string, DiscFile>()
const words = new Map<string, Words>()                  // files read whole (scanned for models, or asked for)
const found = new Map<string, { file: string; m: Found }>()
const ninja = new Map<string, { file: string; m: Ninja }>()     // Ninja chunk models
const trees = new Map<string, { file: string; offset: number; base: number; nodes: number }>()  // object trees stored as the game's memory image, with the address of their file's first byte
const poses = new Map<string, import('./njmotion').Keys[]>()      // the keys of motions asked for
const md3s = new Map<string, { file: string; offset: number }>()      // Quake 3 models
const taggedModels = new Map<string, { file: string; offset: number; size: number; tag: string }>()      // models of a tagged model block
let nodeTransform: ReturnType<typeof taggedTransform>                  // the game plugin's transform for tagged model nodes
const decomp = new Map<string, Uint8Array>()                       // decompressed .PRS files asked for since the disc opened
const motionLists = new Map<string, { offset: number; frames: number; bones: number; addr: number; count: number }[]>()

// A file's bytes as the game sees them: a .PRS file (Sega's compression) is decompressed, so offsets into it are offsets into the
// decompressed data. One that does not decompress is taken as it is.
const plain = (name: string, raw: Uint8Array): Uint8Array => (name.endsWith('.PRS') ? decompress(raw) || raw : raw)
// A pressed block of a file is a file of its own, named `file@hexoffset` (the offset of its tag): it is decompressed again from there.
const blockOf = (name: string): { parent: string; at: number } | null => {
  const cut = name.lastIndexOf('@')
  return cut > 0 && !files.has(name) ? { parent: name.slice(0, cut), at: parseInt(name.slice(cut + 1), 16) } : null
}
async function blockBytes(parent: string, at: number): Promise<Uint8Array> {
  const f = files.get(parent)
  if (!f) throw new Error('No file ' + parent + ' on this disc.')
  if (/\.ZIP$/i.test(parent)) {                                  // a member of a ZIP archive
    const m = memberAt(await fileBytes(parent), at)
    if (m) return m.data
    throw new Error('No member at ' + parent + '@' + at.toString(16) + '.')
  }
  if (parent.endsWith('.PRS')) {
    const b = blockAt((await fileBytes(parent)).subarray(at), 0)
    if (b) return b.data
  } else {
    const head = await disc!.part(f, at, Math.min(32, f.size - at))
    const size = head.length >= 20 ? new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(16, false) : 0
    const tries = size > 0 && size < 64 << 20 ? [(size * 9 >> 3) + 256, STRETCH] : [STRETCH]
    for (const n of tries) {
      const b = blockAt(await disc!.part(f, at, Math.min(f.size - at, n)), 0)
      if (b) return b.data
    }
  }
  throw new Error('No block at ' + parent + '@' + at.toString(16) + '.')
}
async function fileBytes(name: string): Promise<Uint8Array> {
  if (!decomp.has(name)) {
    const blk = blockOf(name)
    if (decomp.size > 16) decomp.clear()
    if (blk) decomp.set(name, await blockBytes(blk.parent, blk.at))
    else {
      const f = files.get(name)
      if (!f) throw new Error('No file ' + name + ' on this disc.')
      decomp.set(name, plain(name, await disc!.read(f.lba, f.size)))
    }
  }
  return decomp.get(name)!
}
async function wordsOf(name: string): Promise<Words> {
  if (!words.has(name)) words.set(name, new Words(await fileBytes(name)))
  return words.get(name)!
}
const hex6 = (n: number) => '0x' + n.toString(16).toUpperCase().padStart(6, '0')

// A picture the disc holds, as a row of the map's [images] section.
const picRow = (file: string, x: Pic) => ({ file, offset: x.offset.toString(16), kind: x.kind, width: String(x.w), height: String(x.h),
  type: x.dt.toString(16), format: String(x.pf), bytes: String(x.bytes), name: x.name })

// A file's set: its folder and its name without the trailing counter ('HB00A009' and 'HB00A000' are one set), a stream of a file alone.
// Motions pair with the models of their set that have as many objects as they have nodes.
const setOf = (fn: string): string => {
  if (fn.includes('@')) return fn
  const slash = fn.lastIndexOf('/'), dot = fn.lastIndexOf('.')
  const stem = fn.slice(slash + 1, dot > slash ? dot : fn.length).replace(/\d+$/, '')
  return fn.slice(0, slash + 1) + (stem || fn.slice(slash + 1))
}
const found_ninja: { id: string; file: string; objects: number }[] = []
const found_motions: { file: string; nodes: number }[] = []
const found_trees: { id: string; file: string; objects: number }[] = []
const setMotions = new Map<string, Set<string>>()              // set -> the files of it that hold motions

// The models a scan found in the file `fn`, added to the list the page shows.
function take(fn: string, scan: ModelScan, list: object[]) {
  for (const t of scan.sortedTrees()) {
    const id = fn + ':' + t.offset.toString(16)
    trees.set(id, { file: fn, offset: t.offset, base: t.base, nodes: t.nodes })
    found_trees.push({ id, file: fn, objects: t.nodes })
    list.push({ id, group: fn, sub: hex6((t.offset >>> 18) << 18), name: hex6(t.offset), records: t.nodes, bytes: t.nodes * 0x34,
      radius: Math.round(t.radius * 1000) / 1000, textures: [] })
  }
  for (const m of scan.sortedMd3()) {                         // Quake 3 models: grouped by the archive that holds them, by their own folder, named by their own file
    const id = fn + ':' + m.offset.toString(16), parts = m.name.replace(/\.md3$/i, '').split('/'), fromArchive = fn.includes('@')
    md3s.set(id, { file: fn, offset: m.offset })
    list.push({ id, group: fromArchive ? fn.slice(0, fn.indexOf('@')) : fn, sub: parts.length > 1 ? parts.slice(0, -1).join('/') : 'Quake 3 Models', name: parts[parts.length - 1] || hex6(m.offset),
      records: m.surfaces, bytes: m.size, radius: Math.round(m.radius * 1000) / 1000, textures: [] })
  }
  const tags = new Map<string, number>()
  for (const m of scan.sortedTagged()) {                      // a model block: grouped by its kind (Pod, Track, Part...), numbered within it
    const id = fn + ':' + m.offset.toString(16), n = (tags.get(m.tag) || 0) + 1
    tags.set(m.tag, n); taggedModels.set(id, { file: fn, offset: m.offset, size: m.size, tag: m.tag })
    const mesh = m.tag === 'PRM'                              // a mesh file is a model of its own: grouped by its folder, named by its file
    const level = m.tag === 'TR4'                             // a level file holds many meshes: grouped by the file, numbered
    list.push({ id, group: mesh && fn.includes('/') ? fn.slice(0, fn.lastIndexOf('/')) : fn, sub: mesh || level ? 'Meshes' : m.tag, name: mesh ? fn.slice(fn.lastIndexOf('/') + 1).replace(/\.[^.@]*(?=@|$)/, '') : level ? 'Mesh ' + n : m.tag + ' ' + n,
      records: m.groups, bytes: m.size, radius: Math.round(m.radius * 1000) / 1000, textures: [] })
  }
  const nj = scan.sortedNinja()
  for (const m of nj) found_ninja.push({ id: fn + ':' + m.offset.toString(16), file: fn, objects: m.objects })
  for (const x of scan.sortedMotions()) found_motions.push({ file: fn, nodes: x.nodes })
  nj.forEach((m, i) => {
    const id = fn + ':' + m.offset.toString(16), stem = fn.slice(fn.lastIndexOf('/') + 1).replace(/\.[^.@]*(?=@|$)/, '')
    ninja.set(id, { file: fn, m })
    list.push({ id, group: fn.includes('/') ? fn.slice(0, fn.lastIndexOf('/')) : 'Root', sub: 'Ninja Models', name: nj.length > 1 ? stem + ' #' + (i + 1) : stem,
      records: m.objects, bytes: m.size, radius: Math.round(m.radius * 1000) / 1000, textures: [] })
  })
  for (const m of scan.sortedFlat()) {
    const id = fn + ':' + m.offset.toString(16)
    found.set(id, { file: fn, m: { offset: m.offset, records: m.records } })
    list.push({ id, group: fn, sub: hex6((m.offset >>> 18) << 18), name: hex6(m.offset), records: m.records.length, bytes: m.bytes,
      radius: Math.round(m.radius * 1000) / 1000, textures: m.textures })
  }
}

async function open(picked: File[]) {
  disc = await Disc.open(picked)
  files = new Map(); words.clear(); found.clear(); ninja.clear(); trees.clear(); decomp.clear(); motionLists.clear()
  for (const f of await disc.files()) files.set(f.path.replace(/^\//, '').toUpperCase(), f)
  const boot = files.get('1ST_READ.BIN')
  const sha1 = boot ? [...new Uint8Array(await crypto.subtle.digest('SHA-1', await disc.read(boot.lba, boot.size)))].map((b) => b.toString(16).padStart(2, '0')).join('') : ''
  let product = '', version = ''                         // the game's product number and version, from its IP.BIN (the first sector of the high-density area)
  try {
    const ip = await disc.read(HD_START, 2048), txt = (a: number, b: number) => String.fromCharCode(...ip.subarray(a, b)).trim()
    if (txt(0, 15) === 'SEGA SEGAKATANA') { product = txt(0x40, 0x4A); version = txt(0x4A, 0x50) }
  } catch { /* a disc this reader cannot place: no product number */ }
  nodeTransform = taggedTransform(product, version)
  return { game: disc.name, sha1, product, version }
}

// The disc's models, and its pictures and sounds unless the caller already has them (a decomp's map lists them): scanned after open, so the page
// can read the decomp's map in between.
// The skeletons: a model with motions of its own object count. A Ninja model takes the motions of its set; an object tree only those of
// its own file (sets would join every stage module), and both those a decomp's `motions <model file> <motion file>` rule names.
// Cheap: run again whenever the rules may have changed.
function rigsFor(pairs: [string, string][]): { id: string; motions: number }[] {
  setMotions.clear()
  const own = (file: string) => 'file:' + file
  const keysOf = (file: string) => [setOf(file), own(file), ...pairs.filter(([, mo]) => mo.toUpperCase() === file.toUpperCase())
    .flatMap(([md]) => [setOf(md.toUpperCase()), own(md.toUpperCase())])]
  const perKey = new Map<string, Map<number, number>>()         // set or file -> node count -> how many motions
  for (const m of found_motions) {
    for (const k of new Set(keysOf(m.file))) {
      if (!setMotions.has(k)) setMotions.set(k, new Set())
      setMotions.get(k)!.add(m.file)
      const c = perKey.get(k) || new Map<number, number>(); c.set(m.nodes, (c.get(m.nodes) || 0) + 1); perKey.set(k, c)
    }
  }
  const rigs: { id: string; motions: number }[] = []
  const add = (list: { id: string; file: string; objects: number }[], key: (f: string) => string) => {
    for (const m of list) { const n = (perKey.get(key(m.file)) || new Map<number, number>()).get(m.objects) || 0; if (n) rigs.push({ id: m.id, motions: n }) }
  }
  add(found_ninja, setOf)
  add(found_trees.filter((t) => t.objects > 1), own)            // one node has no joints: a tree of one object is a model, not a skeleton
  return rigs
}

async function scanDisc(skipPictures: boolean, skipSounds: boolean) {
  if (!disc) throw new Error('No disc is open.')
  words.clear(); found.clear(); ninja.clear(); trees.clear(); md3s.clear(); taggedModels.clear(); decomp.clear(); motionLists.clear()
  const list: object[] = []
  const pictures: object[] = []
  const rigs: object[] = []
  found_ninja.length = 0; found_motions.length = 0; found_trees.length = 0; setMotions.clear()
  const names = [...files.keys()].filter((n) => !SKIP.some((x) => n.endsWith(x))).sort()
  const total = names.reduce((t, n) => t + files.get(n)!.size, 0) || 1
  let done = 0
  for (const fn of names) {
    const f = files.get(fn)!
    postMessage({ progress: done / total })
    done += f.size
    try {                                                      // a file the disc cannot give (its position is in an audio track) is passed over
      const whole = f.size <= STRETCH || fn.endsWith('.PRS') ? plain(fn, await disc.read(f.lba, f.size)) : null    // else read stretch by stretch
      const scan = new ModelScan(), pics = new Map<number, Pic>()
      let single: Words | null = null
      const cuts = stretchStarts(whole ? whole.length : f.size)
      for (const start of cuts) {
        const raw = whole ? whole.subarray(start, start + STRETCH) : await disc.part(f, start, STRETCH)
        const W = scan.add(start, raw)
        if (whole && whole.length <= STRETCH) single = W
        if (!skipPictures) for (const x of findPictures(raw, start, cuts.length === 1)) if (!pics.has(x.offset)) pics.set(x.offset, x)
        for (const [at, blk] of scan.blocks) {
          const vn = fn + '@' + at.toString(16)
          take(vn, scanBuffer(blk.data), list)                       // each block is scanned as a file of its own
          if (!skipPictures) for (const x of findPictures(blk.data, 0, true)) pictures.push(picRow(vn, x))
        }
        scan.blocks.clear()
      }
      for (const x of [...pics.values()].sort((a, b) => a.offset - b.offset)) pictures.push(picRow(fn, x))
      if (single && scan.flat.size) words.set(fn, single)
      if (whole) for (const x of findMotionImages(whole)) found_motions.push({ file: fn, nodes: x.nodes })     // a motion bank
      take(fn, scan, list)
    } catch { continue }
  }
  rigs.push(...rigsFor([]))                                    // by file sets; the decomp's rules are added by rigsFor later
  const sounds: object[] = []
  if (!skipSounds) {
    for (const [fn, f] of [...files].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      let rows: Awaited<ReturnType<typeof findSounds>> = []
      try { rows = await findSounds(f.size, async (off, n) => disc!.part(f, off, Math.max(0, Math.min(n, f.size - off)))) } catch { continue }
      for (const r of rows) {
        if (r.format === 'unknown') continue
        sounds.push({ file: fn, index: String(r.index), offset: r.offset.toString(16), bytes: String(r.bytes), format: r.format, channels: r.channels === null ? '' : String(r.channels),
          rate: r.rate === null ? '' : String(r.rate), samples: r.samples === null ? '' : String(r.samples),
          seconds: r.rate && r.samples ? (r.samples / r.rate).toFixed(1) : '', name: '' })
      }
    }
  }
  return { models: list, pictures, sounds, rigs }
}

// A palette for a palette texture: the PVP named after its file (beside it, else anywhere on the disc), else the first
// PVP beside it (a guess, said so).
async function paletteFor(file: string): Promise<{ colours: Uint32Array; name: string; guessed: boolean } | null> {
  const stem = file.replace(/\.[^./]*$/, ''), dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : ''
  const base = stem.slice(dir.length) + '.PVP'
  const pvps = [...files.keys()].filter((n) => n.endsWith('.PVP')).sort()
  const named = files.has(stem + '.PVP') ? stem + '.PVP' : pvps.find((n) => n.endsWith('/' + base) || n === base)
  const pick = named || pvps.find((n) => n.startsWith(dir) && !n.slice(dir.length).includes('/'))
  if (!pick) return null
  const f = files.get(pick)!, colours = palette(await disc!.read(f.lba, f.size))
  return colours ? { colours, name: pick, guessed: !named } : null
}

const MIME: Record<string, string> = { gif: 'image/gif', jpg: 'image/jpeg', png: 'image/png' }
// A picture of the disc as PNG (or its own GIF, JPEG or PNG bytes), and the palette it was shown with.
async function image(file: string, offset: number, kind: string, w: number, h: number, dt: number, pf: number, bytes: number) {
  const blk = blockOf(file), f = files.get(blk ? blk.parent : file)
  if (!f) throw new Error('No file ' + file + ' on this disc.')
  if (kind === 'tr4') {                                      // a texture page of a level file, inside a zlib block
    const rgba = tr4Page(await fileBytes(file), dt, pf)
    if (!rgba) return null
    const cv = new OffscreenCanvas(w, h)
    cv.getContext('2d')!.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0)
    return { blob: await cv.convertToBlob({ type: 'image/png' }), palette: '' }
  }
  if (blk) {                                                 // a picture inside a pressed block
    const data = await fileBytes(file)
    if (kind !== 'pvr') return { blob: new Blob([data.slice(offset, offset + bytes)], { type: MIME[kind] || 'application/octet-stream' }), palette: '' }
    const rgba = decode(data.slice(offset, offset + bytes), 16, w, h, dt, pf, { end: bytes })
    if (!rgba) return null
    const cv = new OffscreenCanvas(w, h)
    cv.getContext('2d')!.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0)
    return { blob: await cv.convertToBlob({ type: 'image/png' }), palette: '' }
  }
  if (kind !== 'pvr') return { blob: new Blob([await disc!.read(f.lba, f.size)], { type: MIME[kind] || 'application/octet-stream' }), palette: '' }
  const data = file.endsWith('.PRS') ? (await fileBytes(file)).slice(offset, offset + bytes) : await disc!.part(f, offset, bytes)   // the PVRT chunk: a 16-byte header, then the pixels
  const pal = dt >= 5 && dt <= 8 ? await paletteFor(file) : null
  let rgba = decode(data, 16, w, h, dt, pf, { end: data.length, palette: pal ? pal.colours : undefined })
  if (!rgba) {                                                // some files state a chunk length short of its own pixels: read a little on and try again
    const more = file.endsWith('.PRS') ? (await fileBytes(file)).slice(offset, offset + bytes + 64) : await disc!.part(f, offset, Math.min(bytes + 64, f.size - offset))
    rgba = decode(more, 16, w, h, dt, pf, { end: bytes, palette: pal ? pal.colours : undefined })
  }
  if (!rgba) return null
  const cv = new OffscreenCanvas(w, h)
  cv.getContext('2d')!.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0)
  return { blob: await cv.convertToBlob({ type: 'image/png' }), palette: pal ? pal.name + (pal.guessed ? ' (guessed)' : '') : dt >= 5 && dt <= 8 ? 'none' : '' }
}

async function texture(file: string, offset: number, w: number, h: number, type: number, format: number) {
  const W = await wordsOf(file), data = new Uint8Array(W.w.buffer)
  // data right after a PVRT header (a PVR or PVM file): the header gives where it ends, which places a mipmapped
  // texture's full-size level exactly (files pad the mipmap chain differently from texture memory)
  const chunk = offset >= 16 && String.fromCharCode(...data.subarray(offset - 16, offset - 12)) === 'PVRT'
  const end = chunk ? offset - 8 + (data[offset - 12] | data[offset - 11] << 8 | data[offset - 10] << 16 | data[offset - 9] << 24) : undefined
  const rgba = decode(data, offset, w, h, type, format, { end })
  if (!rgba) return null
  const cv = new OffscreenCanvas(w, h)
  cv.getContext('2d')!.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0)
  return cv.convertToBlob({ type: 'image/png' })
}

async function audio(file: string, offset: number, bytes: number, format = '') {
  const f = files.get(file)
  if (!f) return null
  const raw = await disc!.part(f, offset, bytes)
  if (format.startsWith('DTPK ')) {                           // a sample of a DTPK sound pack: raw data, played at the nominal rate sounds.ts gives
    const rate = 22050
    if (format === 'DTPK ADPCM') return new Blob([pcmWav(adpcm(raw), rate)], { type: 'audio/wav' })
    if (format === 'DTPK PCM16') return new Blob([pcmWav(new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.length & ~1))), rate)], { type: 'audio/wav' })
    if (format === 'DTPK PCM8') return new Blob([pcmWav(Int16Array.from(raw, (x) => (x << 24 >> 24) * 256), rate)], { type: 'audio/wav' })
    return null
  }
  if (raw.length > 22 && raw[0] === 0x52 && raw[1] === 0x49 && raw[2] === 0x46 && raw[3] === 0x46) {     // a WAVE file: plain PCM (format tag 1) plays as it is
    const tag = raw[20] | raw[21] << 8, ch = raw[22] | raw[23] << 8, bits = raw[34] | raw[35] << 8
    if (tag === 1) return new Blob([raw], { type: 'audio/wav' })
    if (tag === 0 && bits === 4 && ch === 1) {                // 4-bit, tag 0: the sound chip's ADPCM, mono
      let at = -1
      for (let p = 36; p < 64 && at < 0; p++) if (raw[p] === 0x64 && raw[p + 1] === 0x61 && raw[p + 2] === 0x74 && raw[p + 3] === 0x61) at = p
      if (at < 0) return null
      const len = raw[at + 4] | raw[at + 5] << 8 | raw[at + 6] << 16 | raw[at + 7] << 24
      const rate = (raw[24] | raw[25] << 8 | raw[26] << 16 | raw[27] << 24) >>> 0
      return new Blob([pcmWav(adpcm(raw.subarray(at + 8, at + 8 + len)), rate)], { type: 'audio/wav' })
    }
    return null
  }
  const wav = toWav(raw)
  return wav ? new Blob([wav], { type: 'audio/wav' }) : null
}

// A file's motions in a format: `v` (V format) or `e16` (16-bit Euler keys). `count` = the frames it plays.
async function motions(file: string, format = 'v') {
  const key = file + '|' + format
  if (!motionLists.has(key)) {
    const W = await wordsOf(file)
    motionLists.set(key, format === 'e16'
      ? findE16(W, W.n * 4).map((m) => ({ offset: m.offset, frames: m.keys, bones: m.bones, addr: m.offset, count: Math.round(m.keys / m.kpf) }))
      : findMotions(W).map((m) => ({ ...m, count: m.frames - 1 })))
  }
  return motionLists.get(key)!.map((m) => ({ offset: m.offset.toString(16), addr: m.addr.toString(16).toUpperCase().padStart(format === 'e16' ? 6 : 8, '0'), frames: m.frames, bones: m.bones, count: m.count }))
}

async function motion(file: string, offset: number, format = 'v') {
  await motions(file, format)
  if (!motionLists.get(file + '|' + format)!.some((m) => m.offset === offset)) throw new Error('No such motion.')
  const W = await wordsOf(file)
  return format === 'e16' ? { format, ...e16Keys(W, new Uint8Array(W.w.buffer), offset) } : { format, ...frames(W, offset) }
}

const OPS: Record<string, (...a: never[]) => Promise<unknown>> = {
  async bytes(file: string) {
    if (blockOf(file)) return fileBytes(file)
    const f = files.get(file)
    if (!f) throw new Error('No file ' + file + ' on this disc.')
    return disc!.read(f.lba, f.size)
  },
  open, scanDisc, texture, image, audio, motions, motion,
  rigsFor: async (pairs: [string, string][]) => rigsFor(pairs),
  // A Ninja model's motions: those of the files of its set with as many nodes as the model has objects; each has a key, its file and offset.
  async ninjaMotions(id: string) {
    const n = ninja.get(id), t = trees.get(id)
    if (!n && !t) throw new Error('No such model.')
    const file = n ? n.file : t!.file, objects = n ? n.m.objects : t!.nodes
    const out: { key: string; frames: number; kinds: string; moving: number }[] = []
    for (const mf of [...(setMotions.get(n ? setOf(file) : 'file:' + file) || [])].sort()) {
      const d = await fileBytes(mf)
      for (const m of [...findNinjaMotions(d), ...findMotionImages(d)]) {
        if (m.nodes === objects) out.push({ key: mf + ':' + m.offset, frames: m.frames, kinds: m.kinds.join('+'), moving: m.moving })
      }
    }
    return out
  },
  // The model posed at a frame of one of its motions: the vertices, normals and where each object sits.
  async ninjaFrame(id: string, motion: string, frame: number) {
    const n = ninja.get(id), t = trees.get(id)
    if (!n && !t) throw new Error('No such model.')
    const cut = motion.lastIndexOf(':'), mfile = motion.slice(0, cut), offset = Number(motion.slice(cut + 1))
    if (!poses.has(motion)) {
      if (poses.size > 64) poses.clear()
      const d = await fileBytes(mfile), k = motionKeys(d.subarray(offset)) || imageKeys(d, offset)
      if (!k) throw new Error('No such motion.')
      poses.set(motion, k.nodes)
    }
    const pose = poseAt(poses.get(motion)!, frame)
    const m = n ? ninjaMesh((await fileBytes(n.file)).subarray(n.m.offset, n.m.offset + n.m.size), 0, pose) : meshRaw(await fileBytes(t!.file), t!.offset, t!.base, pose)
    return { position: m.position, normal: m.normal, joints: m.joints }
  },
  async mesh(id: string) {
    const tg = taggedModels.get(id)
    if (tg) return tg.tag === 'PRM' ? prmMesh(await fileBytes(tg.file)) : tg.tag === 'TR4' ? tr4Mesh(await fileBytes(tg.file), tg.offset) : taggedMesh(await fileBytes(tg.file), tg.offset, tg.size, nodeTransform)
    const q = md3s.get(id)
    if (q) return md3Mesh(await fileBytes(q.file), q.offset)
    const t = trees.get(id)
    if (t) return meshRaw(await fileBytes(t.file), t.offset, t.base)
    const n = ninja.get(id)
    if (n) {
      return ninjaMesh((await fileBytes(n.file)).subarray(n.m.offset, n.m.offset + n.m.size), 0)                                        // textures: the map's [textures] rows, as for any model
    }
    const x = found.get(id)
    if (!x) throw new Error('No such model.')
    return mesh(await wordsOf(x.file), x.m)
  },
}
onmessage = async (e: MessageEvent<{ id: number; op: string; args: never[] }>) => {
  const { id, op, args } = e.data
  try { postMessage({ id, value: await OPS[op](...args) }) } catch (err) { postMessage({ id, error: (err as Error).message }) }
}
