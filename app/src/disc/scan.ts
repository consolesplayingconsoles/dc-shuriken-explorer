// The models found in the stretches of one file, by offset in the file: a thing in the overlap of two stretches is found twice
// and kept once. A tree's address is that of the file's first byte (its stretch's address minus where the stretch starts), so
// one address serves the whole file. The twin of the skill's ModelScan / scan_buffer.
import { Words, findModels, header } from './nlmodel'
import { find as findTrees } from './objtree'
import { find as findNinja, type Found as Ninja } from './ninja'
import { STRETCH, starts as stretchStarts } from './stretch'
import { pressedBlocks } from './pressed'
import { find as findMotions, type FoundMotion } from './njmotion'
import { find as findMd3, type Found as Md3 } from './md3'
import { members as zipMembers } from './zip'
import { find as findTagged, type Found as Tagged } from './tagged'
import { find as findPrm } from './prm'
import { find as findTr4 } from './tr4'

export interface FlatModel { offset: number; records: number[]; bytes: number; radius: number; maxTexture: number; textures: number[] }
export interface Tree { offset: number; nodes: number; radius: number; base: number }

export class ModelScan {
  flat = new Map<number, FlatModel>()
  trees = new Map<number, Tree>()
  ninja = new Map<number, Ninja>()
  motions = new Map<number, FoundMotion>()
  md3 = new Map<number, Md3>()
  tagged = new Map<number, Tagged>()
  blocks = new Map<number, { name: string; data: Uint8Array }>()    // pressed blocks by offset in the file: the caller drains them (they can be many and large)
  blockSeen = new Set<number>()

  /** Adds the stretch of the file that starts at byte `start`; returns its words (kept by the caller when the file is one stretch). */
  add(start: number, raw: Uint8Array): Words {
    for (const b of pressedBlocks(raw)) {
      const at = start + b.at
      if (!this.blockSeen.has(at)) { this.blockSeen.add(at); this.blocks.set(at, { name: b.name, data: b.data }) }
    }
    if (start === 0) for (const m of zipMembers(raw)) if (!this.blockSeen.has(m.offset)) { this.blockSeen.add(m.offset); this.blocks.set(m.offset, { name: m.name, data: m.data }) }   // a ZIP's members are streams of their own
    if (start === 0) for (const m of [...findTagged(raw), ...findPrm(raw), ...findTr4(raw)]) this.tagged.set(m.offset, m)       // a model block, or a mesh file, starts a file
    for (const m of findMd3(raw)) { const at = start + m.offset; if (!this.md3.has(at)) this.md3.set(at, { ...m, offset: at }) }
    const W = new Words(raw)
    for (const m of findModels(W)) {
      const at = start + m.offset, h = header(W, m.offset)
      if (this.flat.has(at) || ![...h.centre, h.radius].every(Number.isFinite)) continue
      const tex = new Set<number>()
      let maxTexture = -Infinity
      for (const r of m.records) { if (W.i[r + 8] >= 0) tex.add(W.i[r + 8]); maxTexture = Math.max(maxTexture, W.i[r + 8]) }
      this.flat.set(at, { offset: at, records: m.records.map((r) => r + start / 4), bytes: m.records.reduce((n, r) => n + W.w[r + 19], 0),
        radius: h.radius, maxTexture, textures: [...tex].sort((a, b) => a - b) })
    }
    const tr = findTrees(raw)
    for (const t of tr.trees) {
      const at = start + t.offset
      if (!this.trees.has(at)) this.trees.set(at, { offset: at, nodes: t.nodes, radius: t.radius, base: tr.base - start })
    }
    for (const m of findNinja(raw)) {
      const at = start + m.offset
      if (!this.ninja.has(at)) this.ninja.set(at, { ...m, offset: at })
    }
    for (const m of findMotions(raw)) {
      const at = start + m.offset
      if (!this.motions.has(at)) this.motions.set(at, { ...m, offset: at })
    }
    return W
  }

  sortedFlat() { return [...this.flat.values()].sort((a, b) => a.offset - b.offset) }
  sortedTrees() { return [...this.trees.values()].sort((a, b) => a.offset - b.offset) }
  sortedNinja() { return [...this.ninja.values()].sort((a, b) => a.offset - b.offset) }
  sortedTagged() { return [...this.tagged.values()].sort((a, b) => a.offset - b.offset) }
  sortedMd3() { return [...this.md3.values()].sort((a, b) => a.offset - b.offset) }
  sortedMotions() { return [...this.motions.values()].sort((a, b) => a.offset - b.offset) }
}

/** The scan of a whole file held in memory, in stretches as a disc file is. */
export function scanBuffer(data: Uint8Array): ModelScan {
  const scan = new ModelScan()
  for (const start of stretchStarts(data.length)) scan.add(start, data.subarray(start, start + STRETCH))
  return scan
}
