// Finds trees of Ninja objects stored as the game's memory image, with no knowledge of any game: objects (eval flags,
// model, position, angles, scale, child, sibling: 0x34 bytes) linked by memory addresses, each model a chunk model whose
// lists walk to their end or a basic model whose arrays lie inside the file. An empty object (no model, child or sibling: a
// bone end) is kept only as another object's child or sibling. The twin of the skill's find_object_trees.
// The load address is found by voting: the child and sibling addresses of the plausible objects must land on other
// plausible objects; of the five best-voted addresses the one under which most models are valid wins (a chain of same-sized
// objects votes equally for an address shifted by one object).
export interface Tree { offset: number; nodes: number; radius: number }

const POLY = new Set<number>([0, 1, 2, 3, 4, 5, 8, 9, ...Array.from({ length: 16 }, (_, i) => 16 + i), 56, 57, 58, ...Array.from({ length: 12 }, (_, i) => 64 + i)])
const HIGH = new Set<number>([0x8C, 0x8D, 0x0C, 0x0D])

/** Is the 0x18-byte chunk model at file offset m (vertex list, polygon list, centre, radius; pointers are memory
 * addresses, `mem` the address of the file's first byte) one whose two chunk lists walk to their end marker? */
export function chunkModelOk(d: Uint8Array, m: number, mem: number): boolean {
  if (m < 0 || m + 0x18 > d.length) return false
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const vl = v.getUint32(m, true), pl = v.getUint32(m + 4, true), r = v.getFloat32(m + 20, true)
  if ((!vl && !pl) || r !== r || !(r >= 0 && r < 1e6)) return false
  for (const [ptr, kind] of [[vl, 'v'], [pl, 'p']] as const) {
    if (!ptr) continue
    let p = ptr - mem
    if (p < 0 || (p & 1) || p >= d.length) return false
    let ended = false
    for (let i = 0; i < 65536; i++) {
      if (p + 2 > d.length) return false
      const t = d[p]
      if (t === 0xFF) { ended = true; break }
      if (kind === 'v') {
        if (!(t >= 32 && t <= 50) || p + 4 > d.length) return false
        p += 4 + v.getUint16(p + 2, true) * 4
      } else if (!POLY.has(t)) return false
      else if (t <= 5) p += 2
      else if (t === 8 || t === 9) p += 4
      else {
        if (p + 4 > d.length) return false
        p += 4 + v.getUint16(p + 2, true) * 2
      }
    }
    if (!ended) return false
  }
  return true
}

/** The radius of the 0x28-byte basic model at file offset m (points, normals, point count, meshsets, materials, meshset
 * and material counts, centre, radius) when its arrays lie inside the file, else null. */
export function basicModelOk(d: Uint8Array, m: number, mem: number): number | null {
  if (m < 0 || m + 0x28 > d.length) return null
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const pts = v.getUint32(m, true), nor = v.getUint32(m + 4, true), nb = v.getInt32(m + 8, true), ms = v.getUint32(m + 12, true), mat = v.getUint32(m + 16, true)
  const nms = v.getUint16(m + 20, true), nmat = v.getUint16(m + 22, true), r = v.getFloat32(m + 36, true)
  if (!(nb > 0 && nb < 65536 && nms > 0 && nms < 512 && r === r && r >= 0 && r < 1e6) || !pts || !ms) return null
  const inside = (ptr: number, size: number) => { const o = ptr - mem; return o >= 0 && (o & 3) === 0 && o + size <= d.length }
  if (!(inside(pts, 12 * nb) && inside(ms, 0x18 * nms) && (nor === 0 || inside(nor, 12 * nb)) && (mat === 0 || inside(mat, 20 * nmat)))) return null
  return r
}

/** The radius of the model at file offset m when it is a chunk model or a basic model, else null. */
export function modelRadius(d: Uint8Array, m: number, mem: number): number | null {
  if (chunkModelOk(d, m, mem)) return new DataView(d.buffer, d.byteOffset, d.byteLength).getFloat32(m + 20, true)
  return basicModelOk(d, m, mem)
}

/** Every tree in d and the address the file loads at (0 when none). */
export function find(d: Uint8Array): { base: number; trees: Tree[] } {
  const none = { base: 0, trees: [] as Tree[] }
  const n = d.length >> 2
  if (n < 16) return none
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const w = (i: number) => v.getUint32(i * 4, true)
  const addr = (x: number) => x === 0 || HIGH.has(x >>> 24)
  const scale = (x: number) => x >= 0x3A800000 && x <= 0x447A0000
  const cand: number[] = [], empty: number[] = []
  for (let i = 0; i < n - 12; i++) {
    if (w(i) > 0x3FF || !(addr(w(i + 1)) && addr(w(i + 11)) && addr(w(i + 12)))) continue
    if (!(scale(w(i + 8)) && scale(w(i + 9)) && scale(w(i + 10)))) continue
    if ([2, 3, 4].some((k) => (w(i + k) & 0x7F800000) === 0x7F800000)) continue
    if (w(i + 1) || w(i + 11) || w(i + 12)) cand.push(i * 4)
    else empty.push(i * 4)
  }
  if (cand.length < 2) return none
  const votes = new Map<number, number>()
  const step = Math.max(1, Math.floor(cand.length / 200)), inner = Math.max(1, Math.floor(cand.length / 2000))
  for (let a = 0; a < cand.length; a += step) {
    const o = cand[a]
    for (const ptr of [w(o / 4 + 11), w(o / 4 + 12)]) {
      if (!ptr) continue
      for (let b = 0; b < cand.length; b += inner) {
        const base = ptr - cand[b]
        if ((base & 3) === 0) votes.set(base, (votes.get(base) || 0) + 1)
      }
    }
  }
  if (!votes.size) return none
  const ranked = [...votes].sort((x, y) => y[1] - x[1]).filter(([b, c]) => c >= 3 && b >= 0 && HIGH.has(Math.floor(b / 0x1000000))).slice(0, 5)
  if (!ranked.length) return none
  const modelsUnder = (b: number) => cand.reduce((n, o) => (w(o / 4 + 1) && modelRadius(d, w(o / 4 + 1) - b, b) !== null ? n + 1 : n), 0)
  let base = ranked[0][0], best = -1                      // equal counts: the one with the most votes
  for (const [b] of ranked) { const sc = modelsUnder(b); if (sc > best) { best = sc; base = b } }
  const good = new Map<number, [number, number, number]>()
  for (const o of cand) {
    const m = w(o / 4 + 1)
    if (m === 0 || modelRadius(d, m - base, base) !== null) good.set(o, [m, w(o / 4 + 11), w(o / 4 + 12)])
  }
  for (const o of empty) good.set(o, [0, 0, 0])             // a tree of its own only with a model, so an unreferenced one is dropped
  for (let changed = true; changed;) {                      // a child or sibling must be an object that is good itself
    changed = false
    for (const [o, [, ch, sb]] of [...good]) {
      if ((ch && !good.has(ch - base)) || (sb && !good.has(sb - base))) { good.delete(o); changed = true }
    }
  }
  const referenced = new Set<number>()
  for (const [, ch, sb] of good.values()) { if (ch) referenced.add(ch - base); if (sb) referenced.add(sb - base) }
  const trees: Tree[] = []
  for (const o of [...good.keys()].sort((x, y) => x - y)) {
    if (referenced.has(o)) continue
    let nodes = 0, models = 0, radius = 0
    const todo = [o], seen = new Set<number>()
    while (todo.length) {
      const x = todo.pop()!
      if (seen.has(x)) continue
      seen.add(x)
      const [m, ch, sb] = good.get(x)!
      nodes++
      if (m) { models++; radius = Math.max(radius, modelRadius(d, m - base, base)!) }
      if (ch) todo.push(ch - base)
      if (sb) todo.push(sb - base)
    }
    if (models) trees.push({ offset: o, nodes, radius })
  }
  return { base, trees }
}
