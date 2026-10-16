// Poses a rig from one record of a V-format motion: each bone's rotation is two unit vectors of the record (its +x and
// +y in the parent's axes, the third axis their cross product), placed at its rest offset along the parent. The root
// keeps only its height, so the motion plays in place.
import type { Mesh } from './api'
import type { Assembly, Bone, Rig, Weld } from './dcgs'

export interface VMotion { format: 'v'; frames: number; bones: number; data: number[] }
export interface E16Motion { format: 'e16'; keys: number; bones: number; tracks: number; kpf: number; div: number[]; root: number[]; rot: number[] }
export type Motion = VMotion | E16Motion
/** Frames a motion plays (V: records 1.. ; e16: keys / keys per frame). */
export const frameCount = (m: Motion) => (m.format === 'e16' ? Math.round(m.keys / m.kpf) : m.frames - 1)
export interface Placed { R: number[][]; t: number[] }    // R row by row; a point p goes to R p + t

const cross = (a: number[], c: number[]) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]]
const mul = (A: number[][], B: number[][]) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]))

export function pose(bones: Bone[], m: VMotion, record: number): Map<number, Placed> {
  const per = ((m.bones + 1) * 2 + 1) * 3, at = record * per
  const v = (i: number) => m.data.slice(at + 3 * i, at + 3 * i + 3)
  const depth = (b: number) => { let n = 0, x = bones.find((y) => y.id === b); while (x && x.parent !== null) { n++; const p = x.parent; x = bones.find((y) => y.id === p) } return n }
  const world = new Map<number, Placed>()
  for (const b of [...bones].sort((x, y) => depth(x.id) - depth(y.id))) {
    if (b.id > m.bones) continue
    const a = v(1 + 2 * b.id), c = v(2 + 2 * b.id), d = cross(a, c)
    const Rb = [[a[0], c[0], d[0]], [a[1], c[1], d[1]], [a[2], c[2], d[2]]]
    if (b.parent === null) { world.set(b.id, { R: Rb, t: [0, v(0)[1], 0] }); continue }
    const p = world.get(b.parent)
    if (!p) continue
    const o = b.off
    world.set(b.id, { R: mul(p.R, Rb), t: [0, 1, 2].map((i) => p.R[i][0] * o[0] + p.R[i][1] * o[1] + p.R[i][2] * o[2] + p.t[i]) })
  }
  return world
}

// The character's parts placed on the posed bones (a part follows the bone its slot names); then, for node trees, each
// weld moves a vertex of a node's part onto its source node's vertex, sources first, as the game does when it draws.
export function posedMesh(a: Assembly, parts: Map<string, Mesh>, boneOf: (part: string) => number | undefined, world: Map<number, Placed>, welds: Weld[] = [], hideUnposed = false): Mesh {
  const out: Mesh = { position: [], normal: [], uv: [], pieces: [] }
  const range = new Map<number, { from: number; words: number[] }>()     // bone -> its part's vertices in out
  for (const p of a.parts) {
    const d = parts.get(p.id), b = boneOf(p.name), w = b !== undefined ? world.get(b) : undefined
    if (!d || (hideUnposed && !w)) continue
    const R = w ? w.R : [[p.m[0], p.m[1], p.m[2]], [p.m[4], p.m[5], p.m[6]], [p.m[8], p.m[9], p.m[10]]]
    const t = w ? w.t : [p.m[3], p.m[7], p.m[11]]
    const base = out.position.length / 3
    if (b !== undefined && d.words) range.set(b, { from: base, words: d.words })
    for (let i = 0; i < d.position.length; i += 3) {
      const x = d.position[i], y = d.position[i + 1], z = d.position[i + 2]
      const nx = d.normal[i], ny = d.normal[i + 1], nz = d.normal[i + 2]
      for (let k = 0; k < 3; k++) {
        out.position.push(R[k][0] * x + R[k][1] * y + R[k][2] * z + t[k])
        out.normal.push(R[k][0] * nx + R[k][1] * ny + R[k][2] * nz)
      }
    }
    d.uv.forEach((u) => out.uv.push(u))
    d.pieces.forEach((pc) => out.pieces.push({ texture: pc.texture, tsp: pc.tsp, list: pc.list, colour: pc.colour, file: pc.file, set: pc.set, index: pc.index.map((i) => i + base) }))
  }
  for (const wd of welds) {
    const s = range.get(wd.src), d = range.get(wd.node)
    if (!s || !d) continue
    const si = s.words.indexOf(wd.srcVertex)
    if (si < 0) continue
    const sp = (s.from + si) * 3
    d.words.forEach((wv, k) => {
      if (wv !== wd.dstVertex) return
      const dp = (d.from + k) * 3
      for (let c = 0; c < 3; c++) { out.position[dp + c] = out.position[sp + c]; out.normal[dp + c] = out.normal[sp + c] }
    })
  }
  return out
}

/* ── e16 motions through a pose program ─────────────────────
   Each listed node is built from its parent's matrix by its steps, in order (each multiplies on the right):
   root = T(x/dx, y/dy, -z/dz) from root track 0; rot:b = Rz(-z)·Ry(y) (order 1) or Ry(y)·Rz(-z) (order 0), then Rx(x);
   bone:b = T(ox·s, oy·s, -oz·s) then rot:b; rx/ry/rz:<hex> a fixed turn (0x10000 = a turn); t:x,y,z = T(x·s, y·s, z·s).
   bind = the node's bind pose relative to its parent. `=` copies another node. A node without a line is not drawn: the
   game leaves its matrix zero (e.g. an alternate head). Keys are blended between frames (angles the short way round).                                                                  */
const I3 = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
const mulP = (a: Placed, b: Placed): Placed => ({ R: mul(a.R, b.R), t: [0, 1, 2].map((i) => a.R[i][0] * b.t[0] + a.R[i][1] * b.t[1] + a.R[i][2] * b.t[2] + a.t[i]) })
const T = (v: number[]): Placed => ({ R: I3(), t: v })
const ang = (u: number) => (u / 65536) * 2 * Math.PI
const Rx = (a: number): Placed => { const c = Math.cos(a), s = Math.sin(a); return { R: [[1, 0, 0], [0, c, -s], [0, s, c]], t: [0, 0, 0] } }
const Ry = (a: number): Placed => { const c = Math.cos(a), s = Math.sin(a); return { R: [[c, 0, s], [0, 1, 0], [-s, 0, c]], t: [0, 0, 0] } }
const Rz = (a: number): Placed => { const c = Math.cos(a), s = Math.sin(a); return { R: [[c, -s, 0], [s, c, 0], [0, 0, 1]], t: [0, 0, 0] } }
const inv = (p: Placed): Placed => {           // rigid: transpose, -R't
  const R = [0, 1, 2].map((i) => [0, 1, 2].map((j) => p.R[j][i]))
  return { R, t: [0, 1, 2].map((i) => -(R[i][0] * p.t[0] + R[i][1] * p.t[1] + R[i][2] * p.t[2])) }
}
const fromMat = (m: number[]): Placed => ({ R: [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]], t: [m[3], m[7], m[11]] })

export function poseE16(r: Rig, sub: string, bones: Bone[], bind: Assembly, m: E16Motion, frame: number): Map<number, Placed> {
  const s = r.scales.get(sub) || 1
  const kf = Math.min(frame * m.kpf, m.keys - 1), k0 = Math.floor(kf), k1 = Math.min(k0 + 1, m.keys - 1), w = kf - k0
  const angAt = (b: number, axis: number) => {
    const a = m.rot[(k0 * m.bones + b) * 3 + axis], c = m.rot[(k1 * m.bones + b) * 3 + axis]
    let d = c - a; if (d > 32767) d -= 65536; if (d < -32768) d += 65536
    return ang(a + d * w)
  }
  const rootAt = (axis: number) => m.root[k0 * m.tracks * 3 + axis] * (1 - w) + m.root[k1 * m.tracks * 3 + axis] * w
  const rot = (b: number): Placed => {
    const x = angAt(b, 0), y = angAt(b, 1), z = angAt(b, 2), mb = r.motionBones[b]
    const yz = mb && mb.order ? mulP(Rz(-z), Ry(y)) : mulP(Ry(y), Rz(-z))
    return mulP(yz, Rx(x))
  }
  const step = (st: string): Placed => {
    const [op, arg] = st.split(':')
    if (op === 'root') return T([rootAt(0) / m.div[0], rootAt(1) / m.div[1], -rootAt(2) / m.div[2]])
    if (op === 'rot') return rot(Number(arg))
    if (op === 'bone') { const o = (r.motionBones[Number(arg)] || { off: [0, 0, 0] }).off; return mulP(T([o[0] * s, o[1] * s, -o[2] * s]), rot(Number(arg))) }
    if (op === 'rx' || op === 'ry' || op === 'rz') { const a = ang(parseInt(arg, 16)); return op === 'rx' ? Rx(a) : op === 'ry' ? Ry(a) : Rz(a) }
    if (op === 't') return T(arg.split(',').map((v) => Number(v) * s))
    return T([0, 0, 0])
  }
  const bindOf = new Map(bind.parts.map((x) => [x.name, fromMat(x.m)]))
  const bindRel = (node: number): Placed => {
    const b = bones.find((x) => x.id === node), pb = b && b.parent !== null ? bones.find((x) => x.id === b.parent) : undefined
    const Bn = b && bindOf.get(b.part), Bp = pb && bindOf.get(pb.part)
    return Bn && Bp ? mulP(inv(Bp), Bn) : T([0, 0, 0])
  }
  const world = new Map<number, Placed>()
  for (const p of r.poses) {
    if (p.parent === '=') { const src = world.get(Number(p.steps[0])); if (src) world.set(p.node, src); continue }
    let cur = p.parent === '-' ? T([0, 0, 0]) : world.get(Number(p.parent))
    if (!cur) continue
    for (const st of p.steps) cur = mulP(cur, st === 'bind' ? bindRel(p.node) : step(st))
    world.set(p.node, cur)
  }
  return world
}
