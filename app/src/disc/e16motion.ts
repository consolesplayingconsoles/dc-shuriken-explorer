// Finds and reads `e16` skeletal motions: 16-bit Euler keys (the format Virtua Tennis's motion player reads).
// A motion is a 32-byte header with its data before it: +0 key count, +4 root keys and +8 rotation keys (file offsets),
// +0xC keys per frame (float), +0x10 root tracks a key, +0x14 / +0x18 / +0x1C root divisors x, y, z (floats).
// Root keys: 3 s16 per track; rotation keys: 3 s16 (x, y, z) per bone. Each block is padded to 4 bytes, so a header is
// found by its two offsets landing exactly before it: root keys, then rotation keys, then the header.
import type { Words } from './nlmodel'

const pad4 = (n: number) => (n + 3) & ~3

export function find(W: Words, size: number): { offset: number; keys: number; bones: number; tracks: number; kpf: number }[] {
  const out = []
  for (let i = 0; i + 8 <= W.n; i++) {
    const keys = W.i[i], root = W.w[i + 1], rot = W.w[i + 2], kpf = W.f[i + 3], tracks = W.i[i + 4], o = i * 4
    if (!(keys > 0 && keys < 100000 && tracks > 0 && tracks < 8 && kpf > 0 && kpf <= 4)) continue
    if (!(root < rot && rot < o && o + 32 <= size)) continue
    if (pad4(keys * tracks * 6) !== rot - root) continue
    const bones = Math.round((o - rot) / (keys * 6))
    if (bones < 1 || bones > 64 || pad4(keys * bones * 6) !== o - rot) continue
    if (![W.f[i + 5], W.f[i + 6], W.f[i + 7]].every((d) => Number.isFinite(d) && d !== 0)) continue
    out.push({ offset: o, keys, bones, tracks, kpf })
  }
  return out
}

export function keys(W: Words, data: Uint8Array, offset: number) {
  const i = offset / 4, keys = W.i[i], root = W.w[i + 1], rot = W.w[i + 2], tracks = W.i[i + 4]
  const bones = Math.round((offset - rot) / (keys * 6))
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const s16 = (at: number, n: number) => Array.from({ length: n }, (_, k) => dv.getInt16(at + 2 * k, true))
  return { keys, bones, tracks, kpf: W.f[i + 3], div: [W.f[i + 5], W.f[i + 6], W.f[i + 7]],
    root: s16(root, keys * tracks * 3), rot: s16(rot, keys * bones * 3) }
}
