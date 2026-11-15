// The game's texture files. res_load_file_unpack runs a file through a halfword run-length expander (FUN_0c0612f4) into 0x0CC00000; the texture
// lists of that file are 16-byte entries in the executable (width, height, a Kamui texture type, and the address of the pixels, in that buffer).
import type { DiscView, ImageRow } from '../../lib/plugin-api'

const EXE = '1ST_READ.BIN'
const EXE_BASE = 0x0C010000                 // where the executable is linked
const FILE_BASE = 0x0CC00000                // where res_load_file_unpack leaves a file
const FILE_END = 0x0CE00000

/** Each file of pictures with the address of its list in the executable, from the game's own loader for it (res_<name>_load: the file it
 * unpacks, then the record it registers, whose list is this). Only pairs checked against the decoded pixels are listed. */
const LISTS: { file: string; list: number }[] = [
  { file: 'CKPT.BIN', list: 0x0C17FCC8 },   // res_cockpit_load: the HUD sheets (digits, "CONTINUE", "PAUSE", ...)
  { file: 'OPT.BIN', list: 0x0C11A778 },    // res_option_load
]
const FILES = new Set(LISTS.map((l) => l.file))

/** The file as the game's expander leaves it: the first halfword is 0 for a file stored as it is, else tokens follow, each a halfword whose top
 * nibble is its type and whose low 12 bits are a count n: type 0 copies the n halfwords after it, type 1 repeats the one after it n times.
 * null for a file that is not one of these (an unknown token, or a run past the end). */
export function unpack(raw: Uint8Array): Uint8Array | null {
  const n = raw.length >> 1
  if (n < 1) return null
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  if (v.getUint16(0, true) === 0) return raw.subarray(2, n * 2)
  const out: number[] = []
  let i = 1
  while (i < n) {
    const t = v.getUint16(i * 2, true), type = t & 0xF000, c = t & 0xFFF
    if (type === 0) {
      if (i + 1 + c > n) return null
      for (let k = 0; k < c; k++) out.push(v.getUint16((i + 1 + k) * 2, true))
      i += 1 + c
    } else if (type === 0x1000) {
      if (i + 2 > n) return null
      const x = v.getUint16((i + 1) * 2, true)
      for (let k = 0; k < c; k++) out.push(x)
      i += 2
    } else return null
  }
  const res = new Uint8Array(out.length * 2), dv = new DataView(res.buffer)
  out.forEach((x, k) => dv.setUint16(k * 2, x, true))
  return res
}

const PIXELS = /^(STG[0-9A-F]0|P[0-9A-F][0-9A-F]|EF[0-9A-F]0)_MODEL\.BIN$/       // the pixels of a stage, a character (its forms and colours) or a set of effects (stages.ts, lists.ts)

export const decodeFile = (name: string, raw: Uint8Array): Uint8Array | null => (FILES.has(name.toUpperCase()) || PIXELS.test(name.toUpperCase()) ? unpack(raw) : null)

const pow2 = (n: number) => n >= 8 && n <= 1024 && (n & (n - 1)) === 0

/** The pictures of the listed files, one row of the map's [images] for each entry of their lists (up to the first that is not one). They are sprite
 * sheets of the interface: the loader registers them with res_model_register, which hands them to the sprite code, not to a 3D model. */
export async function imageRows(disc: DiscView): Promise<ImageRow[]> {
  if (!disc.names().includes(EXE)) return []
  const exe = await disc.read(EXE), v = new DataView(exe.buffer, exe.byteOffset, exe.byteLength), rows: ImageRow[] = []
  for (const { file, list } of LISTS) {
    if (!disc.names().includes(file)) continue
    for (let at = list - EXE_BASE; at + 16 <= exe.length; at += 16) {
      const w = v.getUint16(at, true), h = v.getUint16(at + 2, true), type = v.getUint32(at + 4, true), p = v.getUint32(at + 8, true)
      if (!pow2(w) || !pow2(h) || (type & 0xFF) > 6 || (type >> 8) < 1 || (type >> 8) > 0x20 || type >>> 16 || p < FILE_BASE || p >= FILE_END) break
      rows.push({ file, offset: (p - FILE_BASE).toString(16), kind: 'raw', width: String(w), height: String(h), format: String(type & 0xFF),
        type: (type >> 8).toString(16), bytes: String(w * h * 2), name: '' })
    }
  }
  return rows
}
