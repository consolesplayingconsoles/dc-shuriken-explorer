// Reads Ninja chunk models (the Ninja library's NJCM chunk: Sega's first-party Dreamcast format) from raw bytes, with no
// knowledge of any game. An NJCM chunk holds a tree of objects; its pointers count from the start of the chunk's data,
// where the root object sits. An NJTL chunk before it names the model's textures.
// Object (0x34 bytes): eval flags, model, position (3 floats), angles (3 x 32-bit, 0x10000 = a turn), scale (3 floats),
// child, sibling. Model (0x18): vertex list, polygon list, centre, radius.
// The vertex list is chunks of [type, flags, size in words, index offset, count, vertices]: the vertices go into one
// buffer shared by the whole tree, placed by their object's matrix (a later object's strips may use them). The polygon
// list is chunks of bits, texture (TID), material and strip chunks; a strip entry is a vertex index, then its uv and
// normal or colour, as the strip type says.
import type { Mesh } from '../lib/api'
import { chunkModelOk } from './objtree'

const u16 = (d: DataView, p: number) => d.getUint16(p, true)
const u32 = (d: DataView, p: number) => d.getUint32(p, true)
const f32 = (d: DataView, p: number) => d.getFloat32(p, true)

export interface Found { offset: number; size: number; names: string[]; objects: number; radius: number }

// The texture names of an NJTL chunk's data.
function texNames(d: DataView, base: number, size: number): string[] {
  const out: string[] = []
  if (size < 8) return out
  const list = u32(d, base), n = u32(d, base + 4)
  if (n > 1024 || list + n * 12 > size) return out
  for (let i = 0; i < n; i++) {
    const at = u32(d, base + list + i * 12)
    let s = ''
    for (let k = at; k < size && k < at + 64; k++) { const c = d.getUint8(base + k); if (!c) break; s += String.fromCharCode(c) }
    out.push(s)
  }
  return out
}

/** The objects of the tree at `at` (chunk data at base, size bytes), or null when it is not a plausible tree. */
function objects(d: DataView, base: number, size: number, at: number): number[] | null {
  const out: number[] = [], seen = new Set<number>(), todo = [at]
  while (todo.length) {
    const o = todo.pop()!
    if (o & 3 || o + 0x34 > size || seen.has(o) || out.length > 2048) return null
    seen.add(o); out.push(o)
    const p = base + o, flags = u32(d, p), model = u32(d, p + 4), child = u32(d, p + 44), sib = u32(d, p + 48)
    if (flags > 0x3FF || (model && (model & 3 || model + 0x18 > size))) return null
    for (let k = 8; k < 20; k += 4) if (!Number.isFinite(f32(d, p + k)) || Math.abs(f32(d, p + k)) > 1e6) return null
    for (let k = 32; k < 44; k += 4) if (!Number.isFinite(f32(d, p + k)) || Math.abs(f32(d, p + k)) > 1e4) return null
    if (sib) todo.push(sib)
    if (child) todo.push(child)
  }
  return out
}

/** Every Ninja chunk model in d: NJCM chunks whose root object tree reads. */
export function find(d: Uint8Array): Found[] {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), out: Found[] = []
  let names: string[] = []
  for (let p = 0; p + 8 + 0x34 <= d.length; p += 4) {
    if (d[p] !== 0x4E || d[p + 1] !== 0x4A) continue                        // 'NJ'
    const tag = String.fromCharCode(d[p + 2], d[p + 3]), size = u32(v, p + 4)
    if (tag === 'TL' && p + 8 + size <= d.length) { names = texNames(v, p + 8, size); continue }
    if (tag !== 'CM' || p + 8 + size > d.length) continue
    const objs = objects(v, p + 8, size, 0)
    if (!objs) continue
    let radius = 0
    for (const o of objs) { const m = u32(v, p + 8 + o + 4); if (m) radius = Math.max(radius, f32(v, p + 8 + m + 20)) }
    if (!Number.isFinite(radius) || Math.abs(radius) >= 1e9) continue
    out.push({ offset: p, size: size + 8, names, objects: objs.length, radius })
    names = []
    p += size + 4
  }
  return out
}

/* ── Matrices (3x4, row by row) ── */
export type M = number[]
const mul = (a: M, b: M): M => {
  const r: M = new Array(12)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++)
    r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + (j === 3 ? a[i * 4 + 3] : 0)
  return r
}
const ID: M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]
const rx = (a: number): M => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0] }
const ry = (a: number): M => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0] }
const rz = (a: number): M => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0] }
const BAMS = (Math.PI * 2) / 65536

// An object's own matrix: scale, then rotation (X, Y, Z; or Z, X, Y with that eval flag), then translation.
function local(d: DataView, p: number): M {
  const flags = u32(d, p), a = [0, 1, 2].map((k) => d.getInt32(p + 20 + 4 * k, true) * BAMS)
  const t = [f32(d, p + 8), f32(d, p + 12), f32(d, p + 16)], s = [f32(d, p + 32), f32(d, p + 36), f32(d, p + 40)]
  let m: M = [s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0]
  m = flags & 0x20 ? mul(ry(a[1]), mul(rx(a[0]), mul(rz(a[2]), m))) : mul(rz(a[2]), mul(ry(a[1]), mul(rx(a[0]), m)))
  m[3] = t[0]; m[7] = t[1]; m[11] = t[2]
  return m
}
const own = (d: DataView, p: number): Own => ({ flags: u32(d, p), a: [0, 1, 2].map((k) => d.getInt32(p + 20 + 4 * k, true)),
  t: [f32(d, p + 8), f32(d, p + 12), f32(d, p + 16)], s: [f32(d, p + 32), f32(d, p + 36), f32(d, p + 40)] })
/** The matrix of an object placed by position, rotation (angles in BAMS, or a quaternion w x y z) and scale. */
export function placement(flags: number, t: number[], rot: { a: number[] } | { q: number[] }, s: number[]): M {
  let m: M = [s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0]
  if ('q' in rot) {
    const l = Math.hypot(...rot.q) || 1, [w, x, y, z] = rot.q.map((c) => c / l)
    m = mul([1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 0, 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x), 0,
      2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y), 0], m)
  } else {
    const a = rot.a.map((q) => q * BAMS)
    m = flags & 0x20 ? mul(ry(a[1]), mul(rx(a[0]), mul(rz(a[2]), m))) : mul(rz(a[2]), mul(ry(a[1]), mul(rx(a[0]), m)))
  }
  m[3] = t[0]; m[7] = t[1]; m[11] = t[2]
  return m
}
const xf = (m: M, x: number, y: number, z: number, w: number) => [m[0] * x + m[1] * y + m[2] * z + m[3] * w, m[4] * x + m[5] * y + m[6] * z + m[7] * w, m[8] * x + m[9] * y + m[10] * z + m[11] * w]

// Shorts per strip entry after the index, by strip type (64 + n): uv, then normal or colour.
const UVS = [0, 2, 2, 0, 2, 2, 0, 2, 2, 0, 4, 4], EXTRA = [0, 0, 0, 3, 3, 3, 2, 2, 2, 0, 0, 0]

export interface Piece { texture: number; tsp: number; colour?: number; index: number[] }
/** An object's own placement as stored: position, angles in BAMS, scale, and the eval flags. */
export interface Own { t: number[]; a: number[]; s: number[]; flags: number }
/** A pose: the matrix of the object at this place in the tree walk (parents first, children before siblings), or null for its own. */
export type Pose = (index: number, own: Own) => M | null
export interface Joint { parent: number; p: number[] }
export type Built = Mesh & { pieces: Piece[]; joints: Joint[] }
/** Triangles of the model at d[offset] (its NJCM chunk), each piece with its texture number (-1: none). */
export function mesh(d: Uint8Array, at: number, pose?: Pose): Built {
  return build(d, at + 8, u32(new DataView(d.buffer, d.byteOffset, d.byteLength), at + 4), 0, false, pose)
}
/** The mesh of the object tree whose root is at file offset `root`, in a file the game loads at address `mem` (its
 * pointers are memory addresses). A model is a chunk model or a basic model. */
export function meshRaw(d: Uint8Array, root: number, mem: number, pose?: Pose): Built {
  return build(d, -mem, mem + d.length, mem + root, true, pose)
}

// Pointers are `base` plus the pointer value (a chunk's data start, or minus the load address); `root` is the first object's pointer.
function build(d: Uint8Array, base: number, size: number, root: number, raw: boolean, pose?: Pose): Built {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], pieces: Piece[] = []
  const buf = new Map<number, { p: number[]; n: number[] }>()      // the shared vertex buffer
  const cache = new Map<number, number>()                          // polygon lists cached for a later draw
  let tex = -1, tsp = 0, colour: number | undefined

  function vertices(p: number, m: M) {
    for (let guard = 0; p + 4 <= base + size && guard < 4096; guard++) {
      const type = v.getUint8(p), flags = v.getUint8(p + 1)
      if (type === 0xFF) return
      const words = u16(v, p + 2), next = p + 4 + words * 4
      if (type < 32 || type > 50) return
      const off = u16(v, p + 4), n = u16(v, p + 6)
      const sz = [16, 32, 12, 16, 16, 16, 16, 16, 16, 24, 28, 28, 28, 28, 28, 28, 16, 20, 20][type - 32]
      const hasN = type === 33 || (type >= 41 && type <= 47), packed = type >= 48, nf = type === 37 || type === 44
      for (let i = 0; i < n; i++) {
        const q = p + 8 + i * sz
        if (q + sz > next) break
        const P = xf(m, f32(v, q), f32(v, q + 4), f32(v, q + 8), 1)
        let N = [0, 1, 0]
        if (hasN) { const o = type === 33 ? 16 : 12; N = xf(m, f32(v, q + o), f32(v, q + o + 4), f32(v, q + o + 8), 0) }
        else if (packed) { const w = u32(v, q + 12), c = (x: number) => (x & 0x200 ? x - 0x400 : x) / 511; N = xf(m, c(w >> 20 & 0x3FF), c(w >> 10 & 0x3FF), c(w & 0x3FF), 0) }
        if (nf) {                                                   // weighted: into the vertex the flags name, by its weight
          const f = u32(v, q + (type === 37 ? 12 : 24)), k = off + (f & 0xFFFF), wt = (f >>> 16 & 0xFF) / 255
          const old = buf.get(k)
          if ((flags & 3) === 0 || !old) buf.set(k, { p: P.map((x) => x * wt), n: N.map((x) => x * wt) })
          else { old.p = old.p.map((x, j) => x + P[j] * wt); old.n = old.n.map((x, j) => x + N[j] * wt) }
        } else buf.set(off + i, { p: P, n: N })
      }
      p = next
    }
  }

  function polygons(p: number, depth = 0) {
    for (let guard = 0; p + 2 <= base + size && guard < 65536; guard++) {
      const type = v.getUint8(p), flags = v.getUint8(p + 1)
      if (type === 0xFF) return
      if (type === 0) { p += 2; continue }
      if (type <= 5) {                                              // bits
        if (type === 4) { cache.set(flags, p + 2); return }         // cache the rest of this list for a later draw
        if (type === 5 && cache.has(flags) && depth < 4) polygons(cache.get(flags)!, depth + 1)
        p += 2; continue
      }
      if (type === 8 || type === 9) {                               // texture: number, clamp and flip
        tex = u16(v, p + 2) & 0x1FFF
        tsp = (flags & 0x80 ? 1 << 18 : 0) | (flags & 0x40 ? 1 << 17 : 0) | (flags & 0x20 ? 1 << 16 : 0) | (flags & 0x10 ? 1 << 15 : 0)
        p += 4; continue
      }
      const shorts = u16(v, p + 2), next = p + 4 + shorts * 2
      if (type >= 16 && type <= 31 && type & 1 && shorts >= 2) colour = u32(v, p + 4) & 0xFFFFFF   // material: diffuse first (ARGB)
      if (type >= 64 && type <= 75) {
        const k = type - 64, uvs = UVS[k], extra = EXTRA[k], scale = k === 2 || k === 5 || k === 8 || k === 11 ? 1024 : 256
        const head = u16(v, p + 4), nStrips = head & 0x3FFF, user = head >> 14
        let q = p + 6
        const index: number[] = []
        for (let s = 0; s < nStrips && q + 2 <= next; s++) {
          const len = v.getInt16(q, true), n = Math.abs(len)
          q += 2
          const ids: number[] = []
          for (let i = 0; i < n && q + 2 <= next; i++) {
            const vi = u16(v, q), x = buf.get(vi) || { p: [0, 0, 0], n: [0, 1, 0] }
            const id = pos.length / 3
            pos.push(...x.p); nor.push(...x.n)
            if (uvs) uv.push(v.getInt16(q + 2, true) / scale, v.getInt16(q + 4, true) / scale); else uv.push(0, 0)
            ids.push(id)
            q += 2 + (uvs + extra) * 2 + (i >= 2 ? user * 2 : 0)
          }
          const flip = len < 0
          for (let i = 0; i + 2 < ids.length; i++) {
            const a = ids[i], b = ids[i + 1], c = ids[i + 2]
            if ((i % 2 === 0) !== flip) index.push(a, b, c); else index.push(b, a, c)
          }
        }
        pieces.push({ texture: uvs ? tex : -1, tsp: tsp | (flags & 0x08 ? 1 << 20 : 0), colour, index })
      }
      if (next <= p) return
      p = next
    }
  }

  // A basic model: points, normals, then meshsets of triangles, quads or strips (a type in the top 2 bits, a material below),
  // each corner an index with its own texture coordinate; the material gives the colour and the texture number.
  function basic(mo: number, m: M) {
    const pts = u32(v, mo), norPtr = u32(v, mo + 4), nb = v.getInt32(mo + 8, true), ms = u32(v, mo + 12), mat = u32(v, mo + 16)
    const nms = u16(v, mo + 20), nmat = u16(v, mo + 22)
    for (let k = 0; k < nms; k++) {
      const q = base + ms + 0x18 * k, typeMat = u16(v, q), nbMesh = u16(v, q + 2), meshes = u32(v, q + 4), uvp = u32(v, q + 20)
      const type = typeMat & 0xC000, matId = typeMat & 0x3FFF
      let colour: number | undefined, texId = -1
      if (mat && matId < nmat) { const mp = base + mat + 20 * matId; colour = u32(v, mp) & 0xFFFFFF; texId = u32(v, mp + 12) & 0xFFFF }
      let p = base + meshes, corner = 0
      const index: number[] = []
      const vertex = (i: number): number => {
        const id = pos.length / 3
        if (i < 0 || i >= nb) { pos.push(0, 0, 0); nor.push(0, 1, 0); uv.push(0, 0); corner++; return id }
        const q3 = base + pts + 12 * i
        pos.push(...xf(m, f32(v, q3), f32(v, q3 + 4), f32(v, q3 + 8), 1))
        if (norPtr) { const n3 = base + norPtr + 12 * i; nor.push(...xf(m, f32(v, n3), f32(v, n3 + 4), f32(v, n3 + 8), 0)) } else nor.push(0, 1, 0)
        if (uvp) { const t = base + uvp + 4 * corner; uv.push(v.getInt16(t, true) / 255, v.getInt16(t + 2, true) / 255) } else uv.push(0, 0)
        corner++
        return id
      }
      for (let t = 0; t < nbMesh && p + 2 <= base + size; t++) {
        const head = type >= 0x8000 ? u16(v, p) : 0            // a strip's length, its top bit set when the winding is reversed
        const len = type === 0 ? 3 : type === 0x4000 ? 4 : head & 0x7FFF
        if (type >= 0x8000) p += 2
        const n = len, ids: number[] = []
        for (let i = 0; i < n && p + 2 <= base + size; i++, p += 2) ids.push(vertex(v.getInt16(p, true)))
        if (type === 0) { if (ids.length === 3) index.push(ids[0], ids[1], ids[2]); continue }
        const flip = (head & 0x8000) !== 0
        for (let i = 0; i + 2 < ids.length; i++) {
          const a = ids[i], b = ids[i + 1], c = ids[i + 2]
          if ((i % 2 === 0) !== flip) index.push(a, b, c); else index.push(b, a, c)
        }
      }
      pieces.push({ texture: uvp ? texId : -1, tsp: 0, colour, index })
    }
  }

  const joints: Joint[] = []
  function walk(start: number, parent: M, parentIndex: number) {   // an object and its siblings, children first
    let o: number | null = start
    for (let guard = 0; o !== null && guard < 2048; guard++) {
      const p = base + o, flags = u32(v, p), index = joints.length
      const posed = pose ? pose(index, own(v, p)) : null
      const m = mul(parent, posed || local(v, p)), model = u32(v, p + 4)
      joints.push({ parent: parentIndex, p: [m[3], m[7], m[11]] })
      if (model && raw && !chunkModelOk(d, base + model, -base)) basic(base + model, m)
      else if (model) {
        const vl = u32(v, base + model), pl = u32(v, base + model + 4)
        if (vl && vl < size) vertices(base + vl, m)
        if (pl && pl < size && !(flags & 8)) polygons(base + pl)
      }
      const child = u32(v, p + 44), sib = u32(v, p + 48)
      if (child && !(flags & 0x10)) walk(child, m, index)
      o = sib || null
    }
  }
  walk(root, ID, -1)
  return { position: pos, normal: nor, uv, pieces, joints }
}
