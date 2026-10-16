// Ninja motions (an NMDM chunk), with no knowledge of any game: a frame count and the kinds of keys, then per object one pointer
// and one count for each kind; a key is a frame number and three values (position, angle in BAMS, scale), a quaternion's a frame
// number and four floats (w, x, y, z). The kinds come in this order: position, rotation (angle or quaternion), scale. The twin of
// the skill's njm_read / find_motions; a motion belongs to a model of the same file that has as many objects as it has nodes.
export interface Motion { frames: number; kinds: string[]; nodes: number; moving: number }
export interface FoundMotion extends Motion { offset: number; bytes: number }
/** The keys of one node: one list per kind, each key its frame then its values. */
export type Keys = { kind: string; keys: number[][] }[]

const KINDS: [string, number][] = [['position', 1], ['angle', 2], ['quaternion', 0x2000], ['scale', 4]]

/** The motion at the start of d (an NMDM chunk), or null when it is not one this reader reads. `nodes`: the object count of the model, when known. */
export function read(d: Uint8Array, nodes?: number): Motion | null {
  if (d.length < 24 || d[0] !== 0x4E || d[1] !== 0x4D || d[2] !== 0x44 || d[3] !== 0x4D) return null
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const size = v.getUint32(4, true), mdata = v.getUint32(8, true), frames = v.getUint32(12, true), typ = v.getUint16(16, true)
  if ((typ & ~0x2007) || !typ || ((typ & 2) && (typ & 0x2000)) || size + 8 > d.length || (mdata & 3)) return null
  const slots = KINDS.filter(([, bit]) => typ & bit), kinds = slots.map(([n]) => n), key = kinds.map((n) => (n === 'quaternion' ? 20 : 16)), t = kinds.length
  const entry = (i: number) => {
    const o = 8 + mdata + 8 * t * i
    return { ps: kinds.map((_, k) => v.getUint32(o + 4 * k, true)), ns: kinds.map((_, k) => v.getUint32(o + 4 * t + 4 * k, true)) }
  }
  let count = 0
  while (mdata + 8 * t * (count + 1) <= size && (nodes === undefined || count < nodes)) {
    const { ps, ns } = entry(count)
    if (!ps.every((q, k) => (q === 0 && ns[k] === 0) || (q > 0 && q + key[k] * ns[k] <= size && ns[k] > 0 && ns[k] <= frames + 1))) break
    count++
  }
  if (!count || (nodes !== undefined && count !== nodes)) return null
  let moving = 0
  for (let i = 0; i < count; i++) {
    const { ps, ns } = entry(i)
    for (let k = 0; k < t; k++) {
      let last = -1
      for (let j = 0; j < ns[k]; j++) {
        const f = v.getUint32(8 + ps[k] + key[k] * j, true)
        if (f < last) return null
        last = f
      }
      if (ns[k] && last > frames) return null
    }
    if (ns.some((n) => n > 1)) moving++
  }
  return { frames, kinds, nodes: count, moving }
}

/** Every motion in d (the chunk wherever it sits). */
export function find(d: Uint8Array): FoundMotion[] {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), out: FoundMotion[] = []
  for (let p = d.indexOf(0x4E); p >= 0 && p + 24 <= d.length; p = d.indexOf(0x4E, p + 1)) {
    if (p & 3 || d[p + 1] !== 0x4D || d[p + 2] !== 0x44 || d[p + 3] !== 0x4D) continue
    const size = v.getUint32(p + 4, true)
    if (size + 8 > d.length - p) continue
    const r = read(d.subarray(p, p + 8 + size))
    if (r) out.push({ ...r, offset: p, bytes: 8 + size })
  }
  return out
}

/** The keys of every node of the motion at the start of d. */
export function keys(d: Uint8Array): { motion: Motion; nodes: Keys[] } | null {
  const m = read(d)
  if (!m) return null
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), mdata = v.getUint32(8, true), t = m.kinds.length
  const nodes: Keys[] = []
  for (let i = 0; i < m.nodes; i++) {
    const o = 8 + mdata + 8 * t * i, one: Keys = []
    m.kinds.forEach((kind, k) => {
      const q = v.getUint32(o + 4 * k, true), n = v.getUint32(o + 4 * t + 4 * k, true), size = kind === 'quaternion' ? 20 : 16, list: number[][] = []
      for (let j = 0; j < n; j++) {
        const at = 8 + q + size * j, frame = v.getUint32(at, true)
        list.push([frame, ...(kind === 'angle' ? [0, 1, 2].map((x) => v.getInt32(at + 4 + 4 * x, true)) : Array.from({ length: size / 4 - 1 }, (_, x) => v.getFloat32(at + 4 + 4 * x, true)))])
      }
      one.push({ kind, keys: list })
    })
    nodes.push(one)
  }
  return { motion: m, nodes }
}

/** A motion stored as the game's memory image (a motion bank): its offset in the file, the address the file loads at. */
export interface FoundImage extends Motion { offset: number; base: number }
const HIGH = new Set<number>([0x8C, 0x8D, 0x0C, 0x0D])

/** Every motion of a motion bank: the motion (pointer to its key table, frame count, kinds, a 16-bit word whose low 4 bits
 * count the kinds) and its key table as in an NMDM chunk, every pointer a memory address. The file loads at the address of
 * its lowest pointer (its first bytes are keys). A table has no length of its own: it ends at the next motion or table, the
 * end of the file, or the first entry whose pointers and counts are not plausible. The twin of the skill's find_motion_images. */
export function findImages(d: Uint8Array): FoundImage[] {
  const n = d.length >> 2
  if (n < 8) return []
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), w = (i: number) => v.getUint32(i * 4, true)
  let base = -1
  for (let i = 0; i < n; i++) { const x = w(i); if (HIGH.has(x >>> 24) && (base < 0 || x < base)) base = x }
  if (base < 0) return []
  const size = d.length, heads: { at: number; md: number; frames: number; kinds: string[] }[] = []
  for (let i = 0; i < n - 2; i++) {
    const md = w(i), frames = w(i + 1), typ = w(i + 2), t = typ & 0xFFFF, inp = typ >>> 16
    if (!(md >= base && md < base + size) || (md & 3) || !(frames > 0 && frames < 0x10000)) continue
    if (!t || (t & ~0x2007) || ((t & 2) && (t & 0x2000))) continue
    const kinds = KINDS.filter(([, bit]) => t & bit).map(([k]) => k)
    if ((inp & 0xF) !== kinds.length) continue
    heads.push({ at: i * 4, md: md - base, frames, kinds })
  }
  const starts = [...new Set([...heads.map((h) => h.at), ...heads.map((h) => h.md), size])].sort((a, b) => a - b)
  const out: FoundImage[] = []
  for (const { at, md, frames, kinds } of heads) {
    const t = kinds.length, key = kinds.map((k) => (k === 'quaternion' ? 20 : 16))
    const end = starts.find((s) => s > md)!
    const entries: { ps: number[]; ns: number[] }[] = []
    while (md + 8 * t * (entries.length + 1) <= end) {
      const o = md + 8 * t * entries.length
      const ps = kinds.map((_, k) => v.getUint32(o + 4 * k, true)), ns = kinds.map((_, k) => v.getUint32(o + 4 * t + 4 * k, true))
      if (!ps.every((q, k) => (q === 0 && ns[k] === 0) || (ns[k] > 0 && ns[k] <= frames + 1 && q >= base && q - base + key[k] * ns[k] <= size))) break
      entries.push({ ps, ns })
    }
    if (!entries.length) continue
    let ok = true, moving = 0
    for (const { ps, ns } of entries) {
      ps.forEach((q, k) => {
        let last = -1
        for (let j = 0; j < ns[k]; j++) { const f = v.getUint32(q - base + key[k] * j, true); if (f < last) ok = false; last = f }
        if (ns[k] && last > frames) ok = false
      })
      if (ns.some((c) => c > 1)) moving++
    }
    if (ok && moving) out.push({ offset: at, frames, kinds, nodes: entries.length, moving, base })
  }
  return out
}

/** The keys of every node of the motion at offset `at` of a motion bank (see findImages), or null when it is not one. */
export function imageKeys(d: Uint8Array, at: number): { motion: Motion; nodes: Keys[] } | null {
  const m = findImages(d).find((x) => x.offset === at)
  if (!m) return null
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), md = v.getUint32(at, true) - m.base, t = m.kinds.length
  const nodes: Keys[] = []
  for (let i = 0; i < m.nodes; i++) {
    const o = md + 8 * t * i, one: Keys = []
    m.kinds.forEach((kind, k) => {
      const q = v.getUint32(o + 4 * k, true), n = v.getUint32(o + 4 * t + 4 * k, true), size = kind === 'quaternion' ? 20 : 16, list: number[][] = []
      for (let j = 0; j < n; j++) {
        const p = q - m.base + size * j, frame = v.getUint32(p, true)
        list.push([frame, ...(kind === 'angle' ? [0, 1, 2].map((x) => v.getInt32(p + 4 + 4 * x, true)) : Array.from({ length: size / 4 - 1 }, (_, x) => v.getFloat32(p + 4 + 4 * x, true)))])
      }
      one.push({ kind, keys: list })
    })
    nodes.push(one)
  }
  return { motion: m, nodes }
}
