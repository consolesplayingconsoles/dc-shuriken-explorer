// Star Wars Episode I: Racer's model nodes (work in progress). From the game's reverse-engineered source (tim-tim707/SW_RACER_RE,
// swrModel_ComputeNodeWorldMatrix): nodes 0xD064 and 0xD065 carry a transform at +28, three axis vectors then a position (12 big-endian
// floats); a 0xD065 whose 16-bit flags at +12 have 0x10 rotates about its pivot at +76 instead of the origin (t += pivot - R pivot).
// Work in progress: pilots 26 and 28 assemble; 22 shows a gap at its joints. Bone-animated mesh groups (a node at +40 in the mesh header) draw
// their joint triangles from vertex slots another part left behind; filling those slots from that node's last mesh closed the gap but added
// stray triangles, so it is not used yet.
import type { TaggedNode } from '../../lib/plugin-api'

export function nodeTransform(n: TaggedNode): number[] | null {
  if (n.type !== 0xD064 && n.type !== 0xD065) return null
  const v = n.data, f = (k: number) => v.getFloat32(n.at + 28 + 4 * k)
  const m = [f(0), f(3), f(6), f(9), f(1), f(4), f(7), f(10), f(2), f(5), f(8), f(11)]
  if (n.type === 0xD065 && (v.getUint16(n.at + 12) & 0x10)) {
    const p = [v.getFloat32(n.at + 76), v.getFloat32(n.at + 80), v.getFloat32(n.at + 84)]
    for (let r = 0; r < 3; r++) m[r * 4 + 3] += p[r] - (m[r * 4] * p[0] + m[r * 4 + 1] * p[1] + m[r * 4 + 2] * p[2])
  }
  return m
}

