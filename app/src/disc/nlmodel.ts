// Reads the NAOMI library's flat model format (the one Crazy Taxi, Virtua Tennis and other NAOMI-library games use)
// from raw bytes, with no knowledge of any game.
// A model is a 24-byte part header (two counts, a bounding sphere: centre x, y, z and radius) followed by a chain of
// records. A record is a 0x50-byte header (PowerVR control word, ISP, TSP, texture control word, a sphere, the texture
// number at +0x20 and the length of the strip data at +0x4C) and the strip data: strips of [flags, count] followed by
// that many entries. An entry is a full vertex (8 floats: position, normal, u, v) or a 2-word reference to a vertex
// seen earlier in the record (a tag word, then a byte offset counted from the end of the tag word).
import type { Mesh } from '../lib/api'

export class Words {
  w: Uint32Array; f: Float32Array; i: Int32Array; n: number
  constructor(data: Uint8Array) {
    const n = data.length >> 2, buf = new ArrayBuffer(n * 4)
    new Uint8Array(buf).set(data.subarray(0, n * 4))
    this.n = n; this.w = new Uint32Array(buf); this.f = new Float32Array(buf); this.i = new Int32Array(buf)
  }
}

/** Length in words of the record at word i, or 0 when there is no plausible record header there. */
function recordAt(W: Words, i: number): number {
  if (i < 6 || i + 20 > W.n) return 0
  const w = W.w
  if (((w[i] & 0xFCFFFF00) >>> 0) !== 0x80000000 || w[i + 1] >>> 28 < 8) return 0
  const ln = w[i + 19]
  if (ln === 0 || ln & 3 || ln > 0x400000 || i + 20 + ln / 4 > W.n) return 0
  return 20 + ln / 4
}

type Entry = { v: true; word: number } | { v: false; word: number; target: number }
/** The strips of the record at word i, or null when the strip data does not add up exactly to the record's length. */
function parseRecord(W: Words, i: number): { flags: number; ents: Entry[] }[] | null {
  const w = W.w, e = i + 20 + w[i + 19] / 4
  let p = i + 20
  const strips: { flags: number; ents: Entry[] }[] = [], verts = new Set<number>()
  while (p < e) {
    if (p + 2 > e) return null
    const flags = w[p], count = w[p + 1]
    if (flags >= 0x1000 || !(count > 0 && count <= 200)) return null
    p += 2
    const ents: Entry[] = []
    let k = 0
    while (k < count || (p < e && !(w[p] < 0x1000 && w[p + 1] > 0 && w[p + 1] <= 200))) {
      k++
      if (p + 2 > e) return null
      const f = W.f[p]
      if (f !== f || Math.abs(f) > 1e9) {
        const target = Math.floor((p * 4 + W.i[p + 1] + 8) / 4)
        if (!verts.has(target)) return null
        ents.push({ v: false, word: p, target }); p += 2
      } else {
        if (p + 8 > e) return null
        verts.add(p); ents.push({ v: true, word: p }); p += 8
      }
    }
    strips.push({ flags, ents })
  }
  return p === e ? strips : null
}

export interface Found { offset: number; records: number[] }
/** Every model in the data: chains of records that parse exactly. */
export function findModels(W: Words): Found[] {
  const w = W.w, next = new Map<number, number>()
  for (let i = 0; i < W.n; i++) {
    if (((w[i] & 0xFCFFFF00) >>> 0) !== 0x80000000) continue
    const ln = recordAt(W, i)
    if (ln) next.set(i, i + ln)
  }
  const follows = new Set<number>()
  for (const j of next.values()) if (next.has(j)) follows.add(j)
  const out: Found[] = []
  for (const i of [...next.keys()].sort((a, b) => a - b)) {
    if (follows.has(i)) continue
    const chain: number[] = []
    let j: number | undefined = i
    while (j !== undefined && next.has(j)) { chain.push(j); j = next.get(j) }
    const radius = W.f[i - 1]
    if (!(radius === radius && Math.abs(radius) >= 1e-4 && Math.abs(radius) < 1e9)) continue         // a model of no size (a radius of 0 or 1e-30) is stray data, found inside audio files
    if (chain.every((r) => parseRecord(W, r) !== null)) out.push({ offset: (i - 6) * 4, records: chain })
  }
  return out
}

export function header(W: Words, offset: number) {
  const o = offset / 4
  return { counts: [W.w[o], W.w[o + 1]], centre: [W.f[o + 2], W.f[o + 3], W.f[o + 4]], radius: W.f[o + 5] }
}

/** Triangles of a model: flat position / normal / uv arrays and, per record, its texture number and indices. */
export function mesh(W: Words, m: Found): Mesh {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], words: number[] = [], pieces: Mesh['pieces'] = []
  const fin = (x: number) => (Number.isFinite(x) ? x : 0)            // a vertex the data gives none for is 0
  for (const r of m.records) {
    const strips = parseRecord(W, r)!, index: number[] = []
    for (const { ents } of strips) {
      const base = new Map<number, number>(), ids: number[] = []
      for (const en of ents) {
        const key = en.v ? en.word : en.target
        if (!base.has(key)) {
          base.set(key, pos.length / 3)
          words.push(key * 4)
          for (let k = 0; k < 3; k++) pos.push(fin(W.f[key + k]))
          for (let k = 3; k < 6; k++) nor.push(fin(W.f[key + k]))
          uv.push(fin(W.f[key + 6]), fin(W.f[key + 7]))
        }
        ids.push(base.get(key)!)
      }
      for (let k = 0; k + 2 < ids.length; k++) {
        const a = ids[k], b = ids[k + 1], c = ids[k + 2]
        if (a === b || b === c || a === c) continue
        if (k % 2 === 0) index.push(a, b, c); else index.push(b, a, c)
      }
    }
    pieces.push({ texture: W.i[r + 8], tsp: W.w[r + 2], list: W.w[r] >> 24 & 7, index })
  }
  return { position: pos, normal: nor, uv, pieces, words }
}
