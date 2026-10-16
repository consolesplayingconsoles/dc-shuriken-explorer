// Tagged model blocks, with no knowledge of any game: a big-endian count, then count + 1 rising offsets that alternate between a
// pointer-flag section and a body; each body starts with a 4-byte tag of four letters and a list of
// node pointers ended by 0xFFFFFFFF (all pointers count from the body's start). A node is 28 bytes (flags, a child count at +20,
// a child list at +24): with flags 0x4000 it lists nodes (a node's own transform, when a game's plugin gives one, is chained from parent to child),
// of type 0x3064 it lists mesh groups. A group is 0x40 bytes (bounding box at +8, runs and mode at +32, vertices at +52,
// 16 bytes each: three signed 16-bit coordinates, two texture coordinates, a normal and a factor, as bytes). The twin of the skill's
// find_tagged.
import type { Mesh } from '../lib/api'
import type { TaggedNode } from '../lib/plugin-api'

export interface Found { offset: number; size: number; tag: string; groups: number; vertices: number; triangles: number; radius: number }
const tagAt = (d: Uint8Array, p: number) => String.fromCharCode(d[p], d[p + 1], d[p + 2], d[p + 3])
const isTag = (t: string) => /^[A-Za-z]{4}$/.test(t)

type M = number[]                                         // 3 x 4, row by row: a point p goes to M p
const I: M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]
const mul = (a: M, b: M): M => {
  const r: M = new Array(12).fill(0)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
    let x = 0
    for (let k = 0; k < 3; k++) x += a[i * 4 + k] * b[k * 4 + j]
    r[i * 4 + j] = x + (j === 3 ? a[i * 4 + 3] : 0)
  }
  return r
}

interface Group { m: M; at: number; vertices: number; triangles: number; mode: number; runs: number[]; ofs52: number; faces: number[] | null }

/** The triangles of a mesh group from its display list at body offset ofs48 (8-byte commands up to 0xDF), as vertex numbers in the group's
 * vertex array, or null when there is none or it does not read. 0x01 loads vertices into slots; 0x05, 0x06 and 0x07 draw one, two and
 * two triangles from slot numbers (doubled); other commands are skipped. A slot is the vertex of the same number until a load changes it. */
function faces(d: Uint8Array, s2: number, end: number, ofs48: number, o52: number, nv: number): number[] | null {
  if (!ofs48 || ofs48 + 8 > end - s2) return null
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), slots = Array.from({ length: nv }, (_, i) => i), out: number[] = []
  let p = s2 + ofs48
  for (let guard = 0; guard < 4096; guard++, p += 8) {
    if (p + 8 > end) return null
    const w0 = v.getUint32(p), w1 = v.getUint32(p + 4), cmd = w0 >>> 24
    if (cmd === 0xDF) return out
    if (cmd === 0x01) {
      const n = (w0 >>> 12) & 0xFF, vend = (w0 & 0xFFF) >> 1, first = w1 >= o52 && (w1 - o52) % 16 === 0 ? (w1 - o52) / 16 : -1
      if (first >= 0 && vend >= n) for (let k = 0; k < n; k++) if (vend - n + k < slots.length && first + k < nv) slots[vend - n + k] = first + k
    } else if (cmd === 5 || cmd === 6 || cmd === 7) {
      const tris = [[(w0 >>> 16) & 255, (w0 >>> 8) & 255, w0 & 255]]
      if (cmd !== 5) tris.push([(w1 >>> 16) & 255, (w1 >>> 8) & 255, w1 & 255])
      for (const t of tris) {
        const [a, b, c] = t.map((x) => x >> 1)
        if (Math.max(a, b, c) >= slots.length) return null
        out.push(slots[a], slots[b], slots[c])
      }
    }
  }
  return null
}

function groupsOf(d: Uint8Array, s2: number, end: number, transform?: (node: TaggedNode) => number[] | null): Group[] {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), found: { g: number; m: M }[] = [], seen = new Set<number>()
  const node = (ptr: number, m: M) => {
    if (ptr === 0 || seen.has(ptr) || s2 + ptr + 28 > end) return
    seen.add(ptr)
    const o = s2 + ptr, flags = v.getUint32(o), nch = v.getUint32(o + 20), och = v.getUint32(o + 24), t = flags & 0xFFFF
    if (nch > 4096 || s2 + och + 4 * nch > end) return
    if (flags & 0x4000) {
      let w = m
      const own = transform ? transform({ type: t, at: o, data: v }) : null
      if (own && own.length === 12 && own.every((x) => x === x && Math.abs(x) < 1e9)) w = mul(m, own)
      for (let i = 0; i < nch; i++) node(v.getUint32(s2 + och + 4 * i), w)
    }
    else if (t === 0x3064) {
      for (let i = 0; i < nch; i++) { const g = v.getUint32(s2 + och + 4 * i); if (s2 + g + 0x40 <= end) found.push({ g, m }) }
    }
  }
  for (let q = s2 + 4; q + 4 <= end && v.getUint32(q) !== 0xFFFFFFFF && seen.size < 100000; q += 4) node(v.getUint32(q), I)
  const out: Group[] = []
  for (const { g, m } of found) {
    const o = s2 + g, nruns = v.getUint16(o + 32), mode = v.getUint16(o + 34), oruns = v.getUint32(o + 36), o52 = v.getUint32(o + 52), nv = v.getUint16(o + 58)
    if (!nv || o52 + 16 * nv > end - s2) continue
    let runs: number[] = []
    if (oruns) {
      if (s2 + oruns + 4 * nruns > end) continue
      for (let k = 0; k < nruns; k++) { const r = v.getUint32(s2 + oruns + 4 * k); runs.push(mode !== 3 && mode !== 4 && r > 32 ? r + 2 * Math.floor(r / 32) : r) }
      const sum = runs.reduce((a, b) => a + b, 0)
      if (sum < nv) runs[runs.length - 1] += nv - sum
    } else {
      const step = mode === 3 || mode === 4 ? mode : 1
      runs = nruns >= 1 && nv % nruns === 0 && (nv / nruns) % step === 0 ? new Array(nruns).fill(nv / nruns) : [nv]
    }
    if (runs.reduce((a, b) => a + b, 0) !== nv) continue
    const fs = faces(d, s2, end, v.getUint32(o + 48), o52, nv)
    const triangles = fs ? fs.length / 3 : runs.reduce((a, r) => a + (mode === 3 ? Math.floor(r / 3) : mode === 4 ? 2 * Math.floor(r / 4) : Math.max(0, r - 2)), 0)
    out.push({ m, at: g, vertices: nv, triangles, mode, runs, ofs52: o52, faces: fs })
  }
  return out
}

/** Every model of a model block held at the start of d. */
export function find(d: Uint8Array): Found[] {
  if (d.length < 24) return []
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), n = v.getUint32(0)
  if (!(n >= 2 && n <= 4096) || 4 + 4 * (n + 1) > d.length) return []
  const offs: number[] = []
  for (let i = 0; i <= n; i++) offs.push(v.getUint32(4 + 4 * i))
  for (let i = 0; i < n; i++) if (offs[i] > offs[i + 1]) return []
  if (offs[n] > d.length || offs[0] < 4 + 4 * (n + 1)) return []
  const pairs: [number, number][] = []
  for (let i = 0; 2 * i + 2 <= n; i++) pairs.push([offs[2 * i + 1], offs[2 * i + 2]])
  if (pairs.filter(([a]) => isTag(tagAt(d, a))).length * 2 < pairs.length) return []
  const out: Found[] = []
  for (const [a, e] of pairs) {
    if (!isTag(tagAt(d, a)) || e - a < 8) continue
    const gs = groupsOf(d, a, e)
    if (!gs.length) continue
    let radius = 0
    for (const g of gs) for (const k of [8, 12, 16, 20, 24, 28]) { const x = Math.abs(v.getFloat32(a + g.at + k)); if (x === x && x < 1e9) radius = Math.max(radius, x) }
    out.push({ offset: a, size: e - a, tag: tagAt(d, a), groups: gs.length, vertices: gs.reduce((s, g) => s + g.vertices, 0), triangles: gs.reduce((s, g) => s + g.triangles, 0), radius })
  }
  return out
}

/** The model whose body is d[offset .. offset + size) as one piece per mesh group, each placed by its nodes' transforms (none without `transform`). */
export function mesh(d: Uint8Array, offset: number, size: number, transform?: (node: TaggedNode) => number[] | null): Mesh {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const position: number[] = [], normal: number[] = [], uv: number[] = [], pieces: Mesh['pieces'] = []
  for (const g of groupsOf(d, offset, offset + size, transform)) {
    const base = position.length / 3
    for (let k = 0; k < g.vertices; k++) {
      const q = offset + g.ofs52 + 16 * k, x = v.getInt16(q), y = v.getInt16(q + 2), z = v.getInt16(q + 4), m = g.m
      position.push(m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11])
      const nx = v.getInt8(q + 12) / 127, ny = v.getInt8(q + 13) / 127, nz = v.getInt8(q + 14) / 127
      normal.push(m[0] * nx + m[1] * ny + m[2] * nz, m[4] * nx + m[5] * ny + m[6] * nz, m[8] * nx + m[9] * ny + m[10] * nz)
      uv.push(0, 0)
    }
    const index: number[] = g.faces ? g.faces.map((i) => base + i) : []
    let first = 0
    for (const r of g.faces ? [] : g.runs) {
      for (let n = 0; ; n += g.mode === 3 ? 3 : g.mode === 4 ? 4 : 1) {
        if (g.mode === 3) { if (n + 2 >= r) break; index.push(base + first + n, base + first + n + 1, base + first + n + 2) }
        else if (g.mode === 4) { if (n + 3 >= r) break; index.push(base + first + n + 1, base + first + n + 2, base + first + n + 3, base + first + n + 3, base + first + n, base + first + n + 1) }
        else { if (n + 2 >= r) break; index.push(...(n % 2 === 0 ? [n, n + 1, n + 2] : [n, n + 2, n + 1]).map((i) => base + first + i)) }
      }
      first += r
    }
    pieces.push({ texture: -1, tsp: 0, index })
  }
  return { position, normal, uv, pieces }
}
