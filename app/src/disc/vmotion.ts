// Finds and reads V-format skeletal motions (the NAOMI-era format `VSklPlay` plays).
// A motion is a 12-byte header {int frames; int bones; data address} with its data right before it: `frames` records of
// (bones + 1) * 2 + 1 vectors of 3 floats. Vector 0 is the root position; bone b's rotation is the two unit vectors
// v[1 + 2b] (its +x) and v[2 + 2b] (its +y), the third axis their cross product. Record 0 is never played.
// A file's motions all point into the address the file is loaded at, so a header is found by its data address landing
// exactly at the header's own place for one load address shared by most headers of the file.
import type { Words } from './nlmodel'

const recordFloats = (bones: number) => ((bones + 1) * 2 + 1) * 3

export function find(W: Words): { offset: number; frames: number; bones: number; addr: number }[] {
  const hits: { offset: number; frames: number; bones: number; load: number }[] = []
  for (let i = 0; i + 3 <= W.n; i++) {
    const fr = W.i[i], nb = W.i[i + 1], dp = W.w[i + 2]
    if (!(fr >= 2 && fr <= 20000 && nb >= 1 && nb <= 63)) continue
    const size = fr * recordFloats(nb) * 4, o = i * 4
    if (size > o) continue
    const load = (dp + size - o) >>> 0
    if (load & 0xFFF || !((load & 0x1FFFFFFF) >= 0x0C000000 && (load & 0x1FFFFFFF) < 0x0D000000)) continue
    hits.push({ offset: o, frames: fr, bones: nb, load })
  }
  if (!hits.length) return []
  const votes = new Map<number, number>()
  for (const h of hits) votes.set(h.load, (votes.get(h.load) || 0) + 1)
  const load = [...votes].sort((a, b) => b[1] - a[1])[0][0]
  return hits.filter((h) => h.load === load).map(({ offset, frames, bones }) => ({ offset, frames, bones, addr: (load + offset) >>> 0 }))
}

export function frames(W: Words, offset: number): { frames: number; bones: number; data: number[] } {
  const o = offset / 4, fr = W.i[o], nb = W.i[o + 1], n = fr * recordFloats(nb)
  return { frames: fr, bones: nb, data: Array.from(W.f.subarray(o - n, o), (x) => (Number.isFinite(x) ? x : 0)) }
}
