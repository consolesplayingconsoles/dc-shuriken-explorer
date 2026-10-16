// TR4 level files, with no knowledge of any game's data: `TR4\0`, three 16-bit texture page counts, then four zlib blocks each led by an
// unpacked and a packed size (textures of 32 and of 16 bits, miscellaneous textures, the level). The level holds the rooms, the floor data,
// then the mesh words and their pointer table; a mesh is a centre, a radius, its vertices (three 16-bit coordinates), its normals or lights,
// its textured rectangles (four vertex numbers, a texture, effects) and its textured triangles (three, a texture, effects). The twin of the
// skill's find_tr4: one model per distinct mesh.
import type { Mesh } from '../lib/api'
import type { Found } from './tagged'
import { inflate } from './inflate'

interface Parsed { vertices: number[][]; tris: number[]; radius: number }

let cache: { d: Uint8Array; level: Uint8Array | null; meshes: Parsed[] } | null = null

function level(d: Uint8Array): Uint8Array | null {
  if (d.length < 40 || d[0] !== 0x54 || d[1] !== 0x52 || d[2] !== 0x34 || d[3] !== 0) return null
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  let p = 10
  for (let i = 0; i < 4; i++) {
    if (p + 8 > d.length) return null
    const usz = v.getUint32(p, true), csz = v.getUint32(p + 4, true)
    if (csz > d.length - p - 8 || usz > 0x10000000) return null
    if (i === 3) {
      const out = csz > 2 ? inflate(d.subarray(p + 10, p + 8 + csz), usz) : null      // past the two byte zlib header
      return out && out.length === usz ? out : null
    }
    p += 8 + csz
  }
  return null
}

function parse(lv: Uint8Array): Parsed[] {
  const n = lv.length, v = new DataView(lv.buffer, lv.byteOffset, lv.byteLength)
  const u16 = (o: number) => { if (o + 2 > n) throw 0; return v.getUint16(o, true) }
  const i16 = (o: number) => { if (o + 2 > n) throw 0; return v.getInt16(o, true) }
  const u32 = (o: number) => { if (o + 4 > n) throw 0; return v.getUint32(o, true) }
  try {
    if (u32(0) !== 0) return []
    let q = 6
    const nrooms = u16(4)
    for (let r = 0; r < nrooms; r++) {
      q += 16 + 4 + 2 * u32(q + 16)
      q += 2 + 32 * u16(q)
      q += 4 + 8 * u16(q) * u16(q + 2)
      q += 4
      q += 2 + 46 * u16(q)
      q += 2 + 20 * u16(q)
      q += 7
    }
    q += 4 + 2 * u32(q)
    const nwords = u32(q), base = q + 4
    q = base + 2 * nwords
    const nptr = u32(q)
    q += 4
    if (!(nptr > 0 && nptr < 100000) || q + 4 * nptr > n) return []
    const ptrs = [...new Set(Array.from({ length: nptr }, (_, i) => u32(q + 4 * i)))].sort((a, b) => a - b)
    const out: Parsed[] = []
    for (const ptr of ptrs) {
      const o = base + ptr, nv = i16(o + 10)
      if (ptr >= 2 * nwords || !(nv > 0 && nv < 4096)) continue
      const vertices: number[][] = []
      for (let i = 0; i < nv; i++) vertices.push([i16(o + 12 + 6 * i), i16(o + 14 + 6 * i), i16(o + 16 + 6 * i)])
      let r = o + 12 + 6 * nv
      const nn = i16(r)
      r += 2 + (nn > 0 ? 6 * nn : -2 * nn)
      const tris: number[] = []
      let ok = true
      const nrect = i16(r)
      r += 2
      for (let i = 0; i < Math.max(nrect, 0); i++) {
        const a = u16(r + 12 * i), b = u16(r + 12 * i + 2), c = u16(r + 12 * i + 4), e = u16(r + 12 * i + 6)
        ok = ok && Math.max(a, b, c, e) < nv
        tris.push(a, b, c, a, c, e)
      }
      r += 12 * Math.max(nrect, 0)
      const ntri = i16(r)
      r += 2
      for (let i = 0; i < Math.max(ntri, 0); i++) {
        const a = u16(r + 10 * i), b = u16(r + 10 * i + 2), c = u16(r + 10 * i + 4)
        ok = ok && Math.max(a, b, c) < nv
        tris.push(a, b, c)
      }
      if (ok && tris.length) out.push({ vertices, tris, radius: Math.max(...vertices.map(([x, y, z]) => Math.sqrt(x * x + y * y + z * z))) })
    }
    return out
  } catch { return [] }
}

function meshes(d: Uint8Array): Parsed[] {
  if (cache && cache.d === d) return cache.meshes
  const lv = level(d), m = lv ? parse(lv) : []
  cache = { d, level: lv, meshes: m }
  return m
}

/** One model per mesh of a level file; the offset counts the meshes. */
export function find(d: Uint8Array): Found[] {
  return meshes(d).map((m, i) => ({ offset: i, size: 6 * m.vertices.length + 10 * (m.tris.length / 3), tag: 'TR4', groups: 1, vertices: m.vertices.length, triangles: m.tris.length / 3, radius: m.radius }))
}

/** Mesh number `index` of a level file, untextured; y is flipped (the file's y points down), so the winding is reversed to keep the faces. */
export function mesh(d: Uint8Array, index: number): Mesh {
  const m = meshes(d)[index], position: number[] = [], normal: number[] = [], uv: number[] = [], idx: number[] = []
  if (!m) return { position, normal, uv, pieces: [] }
  for (const [x, y, z] of m.vertices) { position.push(x, -y, z); normal.push(0, 1, 0); uv.push(0, 0) }
  for (let k = 0; k < m.tris.length; k += 3) idx.push(m.tris[k], m.tris[k + 2], m.tris[k + 1])
  return { position, normal, uv, pieces: [{ texture: -1, tsp: 0, index: idx }] }
}

let pages: { d: Uint8Array; block: number; raw: Uint8Array | null } | null = null

/** Page `index` of texture block `block` of a level file (block 1 holds 16-bit pages, ARGB 1-5-5-5; the others 32-bit, B G R A) as RGBA, or null. */
export function page(d: Uint8Array, index: number, block: number): Uint8ClampedArray | null {
  if (!pages || pages.d !== d || pages.block !== block) {
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
    let p = 10
    for (let b = 0; b < block && p + 8 <= d.length; b++) p += 8 + v.getUint32(p + 4, true)
    const usz = p + 8 <= d.length ? v.getUint32(p, true) : 0, csz = p + 8 <= d.length ? v.getUint32(p + 4, true) : 0
    pages = { d, block, raw: csz > 2 && csz <= d.length - p - 8 ? inflate(d.subarray(p + 10, p + 8 + csz), usz) : null }
  }
  const raw = pages.raw, bpp = block === 1 ? 2 : 4, n = 256 * 256, o = index * n * bpp
  if (!raw || o + n * bpp > raw.length) return null
  const out = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    if (bpp === 4) { out[4 * i] = raw[o + 4 * i + 2]; out[4 * i + 1] = raw[o + 4 * i + 1]; out[4 * i + 2] = raw[o + 4 * i]; out[4 * i + 3] = raw[o + 4 * i + 3] }
    else {
      const x = raw[o + 2 * i] | raw[o + 2 * i + 1] << 8
      out[4 * i] = (x >> 10 & 31) * 255 / 31; out[4 * i + 1] = (x >> 5 & 31) * 255 / 31; out[4 * i + 2] = (x & 31) * 255 / 31; out[4 * i + 3] = x & 0x8000 ? 255 : 0
    }
  }
  return out
}
