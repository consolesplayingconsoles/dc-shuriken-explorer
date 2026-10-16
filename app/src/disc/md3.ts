// Quake 3 models (MD3: `IDP3`, version 15), with no knowledge of any game. A header, frames (a bounding box and a radius each),
// tags, then surfaces: triangles (three vertex numbers), shaders (a name), texture coordinates and, per frame, the vertices
// (three 16-bit coordinates in 1/64 and a packed normal). The twin of the skill's find_md3.
import type { Mesh } from '../lib/api'

export interface Found { offset: number; size: number; surfaces: number; triangles: number; vertices: number; radius: number; name: string }

const tag = (d: Uint8Array, p: number) => d[p] === 0x49 && d[p + 1] === 0x44 && d[p + 2] === 0x50 && d[p + 3] === 0x33    // IDP3
const text = (d: Uint8Array, p: number, n: number) => { const e = d.subarray(p, p + n).indexOf(0); return new TextDecoder('latin1').decode(d.subarray(p, e < 0 ? p + n : p + e)) }

/** Every MD3 model in d: the header and every surface must lie inside it, each surface's tables inside the surface. */
export function find(d: Uint8Array): Found[] {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), out: Found[] = []
  for (let p = d.indexOf(0x49); p >= 0;) {
    let next = p + 1
    if (!(p & 3) && p + 108 <= d.length && tag(d, p) && v.getUint32(p + 4, true) === 15) {
      const nframes = v.getUint32(p + 76, true), ntags = v.getUint32(p + 80, true), nsurf = v.getUint32(p + 84, true)
      const ofsf = v.getUint32(p + 92, true), ofss = v.getUint32(p + 100, true), ofse = v.getUint32(p + 104, true)
      let ok = nframes > 0 && nframes <= 4096 && nsurf > 0 && nsurf <= 64 && ntags <= 64 && ofss >= 108 && ofss < ofse && ofse <= d.length - p && ofsf + 56 * nframes <= ofse
      let tris = 0, verts = 0, s = p + ofss
      for (let i = 0; ok && i < nsurf; i++) {
        if (s + 108 > d.length || !tag(d, s)) { ok = false; break }
        const snf = v.getUint32(s + 72, true), nv = v.getUint32(s + 80, true), nt = v.getUint32(s + 84, true), otri = v.getUint32(s + 88, true)
        const ost = v.getUint32(s + 96, true), oxyz = v.getUint32(s + 100, true), oend = v.getUint32(s + 104, true)
        if (!(nv > 0 && nv <= 65535 && nt > 0 && nt <= 65535 && snf === nframes && otri >= 108 && oend >= 108 && s + oend <= p + ofse &&
          otri + 12 * nt <= oend && ost + 8 * nv <= oend && oxyz + 8 * nv * nframes <= oend)) { ok = false; break }
        tris += nt; verts += nv; s += oend
      }
      if (ok) { out.push({ offset: p, size: ofse, surfaces: nsurf, triangles: tris, vertices: verts, radius: v.getFloat32(p + ofsf + 36, true), name: text(d, p + 8, 64) }); next = p + ofse }
    }
    p = d.indexOf(0x49, next)
  }
  return out
}

/** The first frame of the model at d[offset] as one piece per surface. Quake's z points up: it goes to y (and y to -z). */
export function mesh(d: Uint8Array, offset: number): Mesh {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const nsurf = v.getUint32(offset + 84, true), ofss = v.getUint32(offset + 100, true)
  const position: number[] = [], normal: number[] = [], uv: number[] = [], pieces: Mesh['pieces'] = []
  let s = offset + ofss
  for (let i = 0; i < nsurf; i++) {
    const nv = v.getUint32(s + 80, true), nt = v.getUint32(s + 84, true), otri = v.getUint32(s + 88, true), ost = v.getUint32(s + 96, true), oxyz = v.getUint32(s + 100, true), oend = v.getUint32(s + 104, true)
    const base = position.length / 3
    for (let k = 0; k < nv; k++) {
      const q = s + oxyz + 8 * k, x = v.getInt16(q, true) / 64, y = v.getInt16(q + 2, true) / 64, z = v.getInt16(q + 4, true) / 64
      const n = v.getUint16(q + 6, true), lat = (n & 255) * Math.PI / 128, lng = (n >> 8 & 255) * Math.PI / 128
      const nx = Math.cos(lat) * Math.sin(lng), ny = Math.sin(lat) * Math.sin(lng), nz = Math.cos(lng)
      position.push(x, z, -y); normal.push(nx, nz, -ny)
      uv.push(v.getFloat32(s + ost + 8 * k, true), v.getFloat32(s + ost + 8 * k + 4, true))
    }
    const index: number[] = []
    for (let k = 0; k < nt; k++) { const t = s + otri + 12 * k; index.push(base + v.getUint32(t, true), base + v.getUint32(t + 4, true), base + v.getUint32(t + 8, true)) }
    pieces.push({ texture: -1, tsp: 0, index })
    s += oend
  }
  return { position, normal, uv, pieces }
}
