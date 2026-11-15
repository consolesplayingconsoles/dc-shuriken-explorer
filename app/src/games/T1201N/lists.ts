// The characters' and effects' textures. Their model files (Pxn.MDL for a character's two forms, EFn0.MDL for a set of effects) keep the texture
// list inside, like a stage's: 16-byte entries (width, height, a Kamui texture type, the address of the pixels in the buffer the pixel file is
// unpacked into). The list is the one run of such entries in the file, and its length is one more than the highest texture number the file's
// models use (checked on all 32 of these files). The pixels are the file of the same name with _MODEL.BIN.
import type { DiscView, TextureRow } from '../../lib/plugin-api'

const FILE_BASE = 0x0CC00000
const FILE_END = 0x0CE00000
const MODEL = /^(P[0-9A-F][01]|EF[0-9A-F]0)\.MDL$/

const pow2 = (n: number) => n >= 8 && n <= 1024 && (n & (n - 1)) === 0

/** [offset, entries] of the longest run of texture entries in a model file (null when there is none of three or more). */
function listIn(m: DataView, size: number): [number, number] | null {
  const ok = (a: number) => {
    if (a + 16 > size) return false
    const w = m.getUint16(a, true), h = m.getUint16(a + 2, true), type = m.getUint32(a + 4, true), p = m.getUint32(a + 8, true)
    return pow2(w) && pow2(h) && (type & 0xFF) <= 6 && (type >> 8) >= 1 && (type >> 8) <= 0x20 && !(type >>> 16) && p >= FILE_BASE && p < FILE_END
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
    const pixels = model.replace(/\.MDL$/, '_MODEL.BIN')
    if (!names.includes(pixels)) continue
    const bytes = await disc.read(model), m = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), found = listIn(m, bytes.length)
    if (!found) continue
    for (let k = 0; k < found[1]; k++) {
      const at = found[0] + 16 * k, w = m.getUint16(at, true), h = m.getUint16(at + 2, true), type = m.getUint32(at + 4, true), p = m.getUint32(at + 8, true)
      rows.push({ file: model, number: String(k), texture_file: pixels, offset: (p - FILE_BASE).toString(16), size: '0', width: String(w), height: String(h),
        type: (type >> 8).toString(16), format: String(type & 0xFF), set: '' })
    }
  }
  return rows
}
