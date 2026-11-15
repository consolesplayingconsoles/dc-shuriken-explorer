// The fighters' motions. A character's motion file (Px0_MOT.MDT) is five banks of frames, written big-endian. The loader (res_load_pl_motion_data)
// takes the file apart by a row of 15 (offset, length) pairs in the executable: per bank an index table (256 halfwords: the first frame of each
// motion), then per bank a block of frames and a block of 8-byte records (a big-endian offset in halfwords into the frames, and two flag bytes),
// one record a frame. A frame is 22 triples of signed 16-bit values: one skipped, the body's turn, its position (the value / 16), and the 19 bone
// angles (twice the value is the angle, 65536 to a turn) in the order of a byte table in the executable (the segment each triple moves).
// A record's second flag byte is how many ticks (60 a second) the game takes to reach that key from the one before, blending the pose as it goes
// (pl_blend_motion_pose); the motion handed to the core is that blend, one frame a tick.
// The game builds a part's matrix as T * Rz * Ry * Rx; the core's e16 pose is Rz(-z) * Ry(y) * Rx(x) with the z of positions negated, so the
// motion hands over z negated and the rig's rows (the map's [motionbones] and [poses]) do the same.
import type { DiscView, E16Motion, MotionRef } from '../../lib/plugin-api'

const EXE = '1ST_READ.BIN'
const EXE_BASE = 0x0C010000
const NAMES = 0x0C180BD0            // the game's file names: a table of pointers, indexed by file number
const MOTION_FILES = 0x0C14E488     // the file number of each character's motion file
const ROWS = 0x0C14E4C0             // per character, 30 words: 15 (offset, length) pairs
const SEG_ORDER = 0x0C150D50        // 19 bytes: the part each of the 19 bone triples moves
const CHARACTERS = 11
const BONES = 19

interface Layout { tables: number[]; frames: number[]; sizes: number[]; records: number[]; counts: number[]; order: number[] }

async function layoutOf(disc: DiscView, file: string): Promise<Layout | null> {
  if (!disc.names().includes(EXE)) return null
  const exe = await disc.read(EXE), v = new DataView(exe.buffer, exe.byteOffset, exe.byteLength)
  const word = (a: number) => v.getUint32(a - EXE_BASE, true)
  const name = (index: number) => { let at = word(NAMES + 4 * index) - EXE_BASE, s = ''; while (exe[at]) s += String.fromCharCode(exe[at++]); return s }
  let c = -1
  for (let k = 0; k < CHARACTERS; k++) if (name(word(MOTION_FILES + 4 * k)).toUpperCase() === file.toUpperCase()) { c = k; break }
  if (c < 0) return null
  const row = ROWS + c * 120, pair = (k: number) => [word(row + 8 * k), word(row + 8 * k + 4)]
  const tables: number[] = [], frames: number[] = [], sizes: number[] = [], records: number[] = [], counts: number[] = []
  for (let g = 0; g < 5; g++) {
    tables.push(pair(g)[0]); frames.push(pair(5 + g)[0]); sizes.push(pair(5 + g)[1])
    records.push(pair(10 + g)[0]); counts.push(pair(10 + g)[1] / 8)
  }
  return { tables, frames, sizes, records, counts, order: Array.from(exe.subarray(SEG_ORDER - EXE_BASE, SEG_ORDER - EXE_BASE + BONES)) }
}

/** The first frames of a bank's motions, sorted: the distinct values of its index table (the first motion starts at frame 0). */
function starts(data: DataView, L: Layout, g: number): number[] {
  const set = new Set<number>([0])
  for (let k = 0; k < 256; k++) { const s = data.getUint16(L.tables[g] + 2 * k, false); if (s < L.counts[g]) set.add(s) }
  return [...set].sort((a, b) => a - b)
}

const KEY_BANK = 0x100000          // a motion is asked for by bank * KEY_BANK + its first frame

/** The ticks each key of a motion takes. */
function ticks(data: DataView, L: Layout, g: number, first: number, n: number): number[] {
  return Array.from({ length: n }, (_, k) => data.getUint8(L.records[g] + 8 * (first + k) + 5) || 1)
}

export async function motionList(disc: DiscView, file: string): Promise<MotionRef[] | null> {
  const L = await layoutOf(disc, file)
  if (!L) return null
  const bytes = await disc.read(file), data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out: MotionRef[] = []
  for (let g = 0; g < 5; g++) {
    const s = starts(data, L, g)
    s.forEach((first, i) => {
      const n = (i + 1 < s.length ? s[i + 1] : L.counts[g]) - first
      if (n > 0) {
        const total = ticks(data, L, g, first, n).reduce((a, b) => a + b, 0)
        out.push({ offset: (g * KEY_BANK + first).toString(16), addr: 'B' + g + ' #' + first, frames: total, bones: BONES, count: total })
      }
    })
  }
  return out
}

const wrap = (x: number) => ((x + 32768) & 0xFFFF) - 32768

export async function motionAt(disc: DiscView, file: string, offset: number): Promise<E16Motion | null> {
  const L = await layoutOf(disc, file)
  if (!L) return null
  const g = Math.floor(offset / KEY_BANK), first = offset % KEY_BANK
  if (g < 0 || g > 4) return null
  const bytes = await disc.read(file), data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), s = starts(data, L, g)
  const i = s.indexOf(first)
  if (i < 0) return null
  const n = (i + 1 < s.length ? s[i + 1] : L.counts[g]) - first
  const keyRot = new Array<number>(n * BONES * 3).fill(0), keyRoot = new Array<number>(n * 3).fill(0)
  for (let k = 0; k < n; k++) {
    const at = L.frames[g] + 2 * data.getUint32(L.records[g] + 8 * (first + k), false)
    const t = (j: number) => [data.getInt16(at + 6 * j, false), data.getInt16(at + 6 * j + 2, false), data.getInt16(at + 6 * j + 4, false)]
    const p = t(2)
    keyRoot[3 * k] = p[0]; keyRoot[3 * k + 1] = p[1]; keyRoot[3 * k + 2] = -p[2]
    for (let b = 0; b < BONES; b++) {
      const a = t(3 + b), part = L.order[b]
      keyRot[(k * BONES + part) * 3] = wrap(a[0] * 2); keyRot[(k * BONES + part) * 3 + 1] = wrap(a[1] * 2); keyRot[(k * BONES + part) * 3 + 2] = wrap(-a[2] * 2)
    }
  }
  const dur = ticks(data, L, g, first, n), total = dur.reduce((a, b) => a + b, 0)
  const rot = new Array<number>(total * BONES * 3), root = new Array<number>(total * 3)
  let tick = 0
  for (let k = 0; k < n; k++) {
    const from = Math.max(k - 1, 0)                           // the first key is reached from itself
    for (let j = 1; j <= dur[k]; j++, tick++) {
      const w = j / dur[k]
      for (let i = 0; i < BONES * 3; i++) {
        const a = keyRot[from * BONES * 3 + i], c = keyRot[k * BONES * 3 + i]
        let d = c - a; if (d > 32767) d -= 65536; if (d < -32768) d += 65536      // the short way round
        rot[tick * BONES * 3 + i] = wrap(Math.round(a + d * w))
      }
      for (let i = 0; i < 3; i++) root[tick * 3 + i] = keyRoot[from * 3 + i] + (keyRoot[k * 3 + i] - keyRoot[from * 3 + i]) * w
    }
  }
  return { format: 'e16', keys: total, bones: BONES, tracks: 1, kpf: 1, div: [16, 16, 16], root, rot }
}
