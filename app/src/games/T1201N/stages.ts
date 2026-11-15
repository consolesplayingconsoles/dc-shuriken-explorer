// The stages' textures. A stage has a model file (STGn0.MDL) that holds its models and, at an offset the game's stage table gives, the list of
// its textures: 16-byte entries (width, height, a Kamui texture type, the address of the pixels in the buffer the pixel file is unpacked into).
// The pixels are the stage's STGn0_MODEL.BIN. res_stage_load reads three tables of the executable for stage n: the index of the model file
// (0x0C14DDD8), of the pixel file (0x0C14DD9C), and a 52-byte record (0x0C350B60) whose word 10 is the offset of the list in the model file.
import type { DiscView, TextureRow } from '../../lib/plugin-api'

const EXE = '1ST_READ.BIN'
const EXE_BASE = 0x0C010000
const FILE_BASE = 0x0CC00000
const FILE_END = 0x0CE00000
const NAMES = 0x0C180BD0                    // the game's file names: a table of pointers, indexed by file number
const MODEL_FILE = 0x0C14DDD8, PIXEL_FILE = 0x0C14DD9C, RECORD = 0x0C350B60, STAGES = 11

const pow2 = (n: number) => n >= 8 && n <= 1024 && (n & (n - 1)) === 0

export async function stageTextureRows(disc: DiscView): Promise<TextureRow[]> {
  if (!disc.names().includes(EXE)) return []
  const exe = await disc.read(EXE), v = new DataView(exe.buffer, exe.byteOffset, exe.byteLength), rows: TextureRow[] = []
  const word = (a: number) => v.getUint32(a - EXE_BASE, true)
  const name = (index: number) => {
    let at = word(NAMES + 4 * index) - EXE_BASE, s = ''
    while (exe[at]) s += String.fromCharCode(exe[at++])
    return s
  }
  for (let id = 0; id < STAGES; id++) {
    const model = name(word(MODEL_FILE + 4 * id)), pixels = name(word(PIXEL_FILE + 4 * id)), list = word(RECORD + 52 * id + 40)
    const names = disc.names()
    if (!names.includes(model) || !names.includes(pixels)) continue
    const mdl = await disc.read(model), m = new DataView(mdl.buffer, mdl.byteOffset, mdl.byteLength)
    for (let k = 0, at = list; at + 16 <= mdl.length; k++, at += 16) {
      const w = m.getUint16(at, true), h = m.getUint16(at + 2, true), type = m.getUint32(at + 4, true), p = m.getUint32(at + 8, true)
      if (!pow2(w) || !pow2(h) || (type & 0xFF) > 6 || (type >> 8) < 1 || (type >> 8) > 0x20 || type >>> 16 || p < FILE_BASE || p >= FILE_END) break
      rows.push({ file: model, number: String(k), texture_file: pixels, offset: (p - FILE_BASE).toString(16), size: '0', width: String(w), height: String(h),
        type: (type >> 8).toString(16), format: String(type & 0xFF), set: '' })
    }
  }
  return rows
}
