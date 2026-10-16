// Blocks tagged `PRESSED` plus a kind (16 bytes), each holding a PRS stream, with no knowledge of any game. Two layouts: the
// tag, a 4-byte big-endian size, a 12-byte name, the stream (the size must equal what the stream decompresses to); or the tag
// and the stream. The twin of the skill's pressed_blocks. A candidate that does not decompress, or whose size does not match,
// is passed over.
import { stream } from './prs'

export interface Block { at: number; name: string; data: Uint8Array; end: number }
const TAG = [0x50, 0x52, 0x45, 0x53, 0x53, 0x45, 0x44]          // PRESSED

const tagAt = (d: Uint8Array, p: number) => TAG.every((b, i) => d[p + i] === b)

/** The block whose tag is at offset p of d, or null when what follows is not one. */
export function blockAt(d: Uint8Array, p: number): Block | null {
  if (p + 32 <= d.length) {
    const size = new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(p + 16, false)
    const r = stream(d.subarray(p + 32))
    if (r && r.data.length && r.data.length === size) {
      const raw = d.subarray(p + 20, p + 32), z = raw.indexOf(0)
      return { at: p, name: new TextDecoder('ascii').decode(z < 0 ? raw : raw.subarray(0, z)), data: r.data, end: p + 32 + r.used }
    }
  }
  if (p + 16 < d.length) {
    const r = stream(d.subarray(p + 16))
    if (r && r.data.length) return { at: p, name: '', data: r.data, end: p + 16 + r.used }
  }
  return null
}

/** Every block in d, in order. */
export function pressedBlocks(d: Uint8Array): Block[] {
  const out: Block[] = []
  let p = d.indexOf(TAG[0])
  while (p >= 0 && p + TAG.length <= d.length) {
    const b = tagAt(d, p) ? blockAt(d, p) : null
    if (b) { out.push(b); p = b.end } else p += TAG.length
    p = d.indexOf(TAG[0], p)
  }
  return out
}
