// Poses a Ninja model from a motion: for a frame, each object takes the position, rotation and scale the motion keys give
// (linear between keys, held before the first and after the last), and its own value for a kind the motion has no keys for.
// Angles are BAMS (0x10000 = a turn) and take the shorter way round; quaternions are blended and normalised.
import type { Keys } from './njmotion'
import { placement, type Own, type Pose } from './ninja'

type Key = number[]
// The two keys around a frame and how far between them (0 to 1); a single key or a frame outside the keys holds one.
function around(keys: Key[], frame: number): [Key, Key, number] {
  if (frame <= keys[0][0]) return [keys[0], keys[0], 0]
  const last = keys[keys.length - 1]
  if (frame >= last[0]) return [last, last, 0]
  let j = 0
  while (keys[j + 1][0] <= frame) j++
  return [keys[j], keys[j + 1], (frame - keys[j][0]) / (keys[j + 1][0] - keys[j][0])]
}

/** The pose of a motion's nodes at `frame` (fractions blend between keys). */
export function poseAt(nodes: Keys[], frame: number): Pose {
  return (index: number, own: Own) => {
    const node = nodes[index]
    if (!node) return null
    let t = own.t, s = own.s, rot: { a: number[] } | { q: number[] } = { a: own.a }
    for (const { kind, keys } of node) {
      if (!keys.length) continue
      const [a, b, f] = around(keys, frame)
      if (kind === 'position' || kind === 'scale') {
        const v = [1, 2, 3].map((i) => a[i] + (b[i] - a[i]) * f)
        if (kind === 'position') t = v; else s = v
      } else if (kind === 'angle') {
        rot = { a: [1, 2, 3].map((i) => a[i] + ((((b[i] - a[i]) + 0x8000) & 0xFFFF) - 0x8000) * f) }
      } else {
        const sign = a[1] * b[1] + a[2] * b[2] + a[3] * b[3] + a[4] * b[4] < 0 ? -1 : 1
        rot = { q: [1, 2, 3, 4].map((i) => a[i] + (sign * b[i] - a[i]) * f) }
      }
    }
    return placement(own.flags, t, rot, s)
  }
}
