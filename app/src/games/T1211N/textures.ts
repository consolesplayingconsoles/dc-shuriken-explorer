// The shared texture sets (CMN_MODEL_VQ, ITEM_MODEL_VQ, ...). A model file X.MDL keeps its texture list inside, and its pixels are the file X_BIN.PAC,
// packed with the same halfword run-length code as Power Stone's _MODEL.BIN files (read by ../T1201N/textures.ts). The list is 16-byte entries:
// width, height, a Kamui texture type (low byte the pixel format, next byte the kind), and the place of the pixels in the unpacked file (an offset
// from 0, not an address). Checked on CMN_MODEL_VQ and ITEM_MODEL_VQ: the places step by the size of each picture and the last one ends the unpacked file.
import type { DiscView, TextureRow } from '../../lib/plugin-api'
import { unpack } from '../T1201N/textures'

const MODEL = /^(.+)\.MDL$/i
const pow2 = (n: number) => n >= 8 && n <= 1024 && (n & (n - 1)) === 0

/** The pixel file of a model file, when the disc has it. */
export const pixelFileOf = (model: string, names: string[]): string | null => {
  const m = MODEL.exec(model)
  const want = m ? m[1].toUpperCase() + '_BIN.PAC' : ''
  return names.find((n) => n.toUpperCase() === want) || null
}

/** The pixel files: the packs named for a model file (CMN_MODEL_VQ_BIN.PAC, PIT_MODEL_BIN.PAC); the other .PAC files (the hit tables) are not pictures. */
const PIXELS = /_MODEL(_VQ)?_BIN\.PAC$/i
const CONNECT = /_CONNECT\.BIN$/i
export const decodeFile = (name: string, raw: Uint8Array): Uint8Array | null =>
  PIXELS.test(name) ? unpack(raw) : CONNECT.test(name) ? connectLayout(raw).decoded : null

// The *_CONNECT.BIN files (fighters, stages, the other scenes) are a container: a table of (offset, size) pairs of 32-bit words at the start, then
// the segments. A model segment starts ffffffff, the number of textures and the offset in the segment of their list (16-byte entries as above, the
// place being an offset in the pixels); the segment after it holds the pixels, packed as the .PAC files are (or, in a few files, as they are).
// The decoded file is the file as it is with the unpacked pixels added after it, so every offset the map holds into the file stays the same.
export interface TextureList { segment: number; count: number; at: number; pixels: number }   // `at`: where the list is in the file; `pixels`: where its pixels are in the decoded file
export function connectLayout(raw: Uint8Array): { decoded: Uint8Array | null; lists: TextureList[] } {
  const none = { decoded: null, lists: [] }
  if (raw.length < 0x80) return none
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), segs: [number, number][] = []
  for (let i = 0; i < 32; i += 2) {
    const o = v.getUint32(4 * i, true), n = v.getUint32(4 * i + 4, true)
    if (n === 0) break
    if (o < 0x80 || o + n > raw.length) break
    segs.push([o, n])
  }
  const lists: TextureList[] = [], extra: Uint8Array[] = []
  let end = raw.length + ((0x20 - (raw.length & 0x1F)) & 0x1F)
  segs.forEach(([o, n], k) => {
    if (n < 12 || v.getUint32(o, true) !== 0xFFFFFFFF || k + 1 >= segs.length) return
    const count = v.getUint32(o + 4, true), at = v.getUint32(o + 8, true)
    if (count < 1 || count > 200 || at + 16 * count > n) return
    let top = 0
    for (let j = 0; j < count; j++) top = Math.max(top, v.getUint32(o + at + 16 * j + 8, true))
    const [po, pn] = segs[k + 1], packed = raw.subarray(po, po + pn), up = unpack(packed)
    if (up && up.length > top) {
      lists.push({ segment: k, count, at: o + at, pixels: end }); extra.push(up); end += up.length + ((0x20 - (up.length & 0x1F)) & 0x1F)
    } else if (pn > top) lists.push({ segment: k, count, at: o + at, pixels: po })      // stored as they are
  })
  if (!lists.length) return none
  const out = new Uint8Array(end)
  out.set(raw)
  lists.filter((l) => l.pixels >= raw.length).forEach((l, i) => out.set(extra[i], l.pixels))
  return { decoded: out, lists }
}

/** The textures of a container file: one row per entry of each model segment's list. The first list's rows are the file's own (set empty), which the
 * models of the first model segment find; the others are tagged with their segment, to be linked to their models by the map. */
function connectRows(file: string, raw: Uint8Array): TextureRow[] {
  const rows: TextureRow[] = [], { lists } = connectLayout(raw), v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  lists.forEach((l, i) => {
    for (let k = 0; k < l.count; k++) {
      const at = l.at + 16 * k, w = v.getUint16(at, true), h = v.getUint16(at + 2, true), type = v.getUint32(at + 4, true), p = v.getUint32(at + 8, true)
      rows.push({ file, number: String(k), texture_file: file, offset: (l.pixels + p).toString(16), size: '0', width: String(w), height: String(h),
        type: (type >> 8).toString(16), format: String(type & 0xFF), set: i === 0 ? '' : 'segment' + l.segment })
    }
  })
  return rows
}

/** [offset, entries] of the longest run of texture entries in a model file whose pixels lie inside `limit` bytes (null: no run of three or more). */
function listIn(m: DataView, size: number, limit: number): [number, number] | null {
  const ok = (a: number) => {
    if (a + 16 > size) return false
    const w = m.getUint16(a, true), h = m.getUint16(a + 2, true), type = m.getUint32(a + 4, true), p = m.getUint32(a + 8, true)
    return pow2(w) && pow2(h) && (type & 0xFF) <= 6 && (type >> 8) >= 1 && (type >> 8) <= 0x20 && !(type >>> 16) && p < limit
  }
  let best: [number, number] | null = null
  for (let a = 0; a + 16 <= size;) {
    if (!ok(a)) { a += 4; continue }
    let b = a
    while (ok(b)) b += 16
    const n = (b - a) / 16
    if (n >= 3 && (!best || n > best[1])) best = [a, n]
    a = b
  }
  return best
}

export async function modelTextureRows(disc: DiscView): Promise<TextureRow[]> {
  const rows: TextureRow[] = [], names = disc.names()
  for (const model of names.filter((n) => MODEL.test(n)).sort()) {
    const pixels = pixelFileOf(model, names)
    if (!pixels) continue
    const unpacked = unpack(await disc.read(pixels))
    if (!unpacked) continue
    const bytes = await disc.read(model), m = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), found = listIn(m, bytes.length, unpacked.length)
    if (!found) continue
    for (let k = 0; k < found[1]; k++) {
      const at = found[0] + 16 * k, w = m.getUint16(at, true), h = m.getUint16(at + 2, true), type = m.getUint32(at + 4, true), p = m.getUint32(at + 8, true)
      rows.push({ file: model, number: String(k), texture_file: pixels, offset: p.toString(16), size: '0', width: String(w), height: String(h),
        type: (type >> 8).toString(16), format: String(type & 0xFF), set: '' })
    }
  }
  for (const f of names.filter((n) => CONNECT.test(n)).sort()) rows.push(...connectRows(f, await disc.read(f)))
  return rows
}
