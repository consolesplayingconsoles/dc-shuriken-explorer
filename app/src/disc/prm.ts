// Mesh files of one model each, with no knowledge of any game: two little-endian 16-bit counts (polygons, vertices), then 60-byte polygons
// (a type, a texture, four 16-bit vertex numbers, four colours, four texture coordinate pairs) and 24-byte vertices (a position and a
// normal, as floats), the file being exactly that long. Type bit 0 makes a polygon a quad. The twin of the skill's find_prm.
import type { Mesh } from '../lib/api'
import type { Found } from './tagged'

/** The model of a file that is one mesh file; [] when it is not. */
export function find(d: Uint8Array): Found[] {
  const n = d.length
  if (n < 4 + 60 + 24) return []
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), npoly = v.getUint16(0, true), nvert = v.getUint16(2, true)
  if (!(npoly && nvert && 4 + 60 * npoly + 24 * nvert === n)) return []
  let tris = 0
  for (let i = 0; i < npoly; i++) {
    const o = 4 + 60 * i, typ = v.getUint16(o, true), quad = typ & 1
    if (typ > 0x3FFF) return []
    const m = Math.max(v.getUint16(o + 4, true), v.getUint16(o + 6, true), v.getUint16(o + 8, true), quad ? v.getUint16(o + 10, true) : 0)
    if (m >= nvert) return []
    tris += quad ? 2 : 1
  }
  let radius = 0
  for (let i = 0; i < nvert; i++) {
    const o = 4 + 60 * npoly + 24 * i, x = v.getFloat32(o, true), y = v.getFloat32(o + 4, true), z = v.getFloat32(o + 8, true)
    if (!(Math.abs(x) < 1e7 && Math.abs(y) < 1e7 && Math.abs(z) < 1e7)) return []
    radius = Math.max(radius, Math.sqrt(x * x + y * y + z * z))
  }
  return [{ offset: 0, size: n, tag: 'PRM', groups: 1, vertices: nvert, triangles: tris, radius }]
}

/** The mesh of a mesh file, untextured; y is flipped (the file's y points down), so the winding is reversed to keep the faces. */
export function mesh(d: Uint8Array): Mesh {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), npoly = v.getUint16(0, true), nvert = v.getUint16(2, true)
  const position: number[] = [], normal: number[] = [], uv: number[] = [], index: number[] = []
  for (let i = 0; i < nvert; i++) {
    const o = 4 + 60 * npoly + 24 * i
    position.push(v.getFloat32(o, true), -v.getFloat32(o + 4, true), v.getFloat32(o + 8, true))
    normal.push(v.getFloat32(o + 12, true), -v.getFloat32(o + 16, true), v.getFloat32(o + 20, true))
    uv.push(0, 0)
  }
  for (let i = 0; i < npoly; i++) {
    const o = 4 + 60 * i, a = v.getUint16(o + 4, true), b = v.getUint16(o + 6, true), c = v.getUint16(o + 8, true), q = v.getUint16(o + 10, true)
    index.push(a, c, b)
    if (v.getUint16(o, true) & 1) index.push(a, q, c)
  }
  return { position, normal, uv, pieces: [{ texture: -1, tsp: 0, index }] }
}
