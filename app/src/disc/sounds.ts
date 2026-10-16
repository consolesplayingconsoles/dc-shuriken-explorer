// The sounds of a disc file, with no knowledge of any game: every ADX / AHX stream of an AFS archive (an archive with none holds
// something else and has no rows), a file that is one ADX / AHX stream, or a DTPK sound bank (listed, not opened). The twin of the
// skill's audio_file_rows / adx_info.
export interface Sound { index: number; offset: number; bytes: number; format: string; channels: number | null; rate: number | null; samples: number | null }

/** [format, channels, rate, samples] of a CRI ADX / AHX header at the start of b, or null. */
export function adxInfo(b: Uint8Array): [string, number, number, number] | null {
  if (b.length < 16 || b[0] !== 0x80 || b[1] !== 0x00) return null
  const enc = b[4], ch = b[7], v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const rate = v.getUint32(8, false), samples = v.getUint32(12, false)
  if (![2, 3, 4, 0x10, 0x11].includes(enc) || !(ch >= 1 && ch <= 8) || !(rate >= 4000 && rate <= 192000)) return null
  return [enc >= 0x10 ? 'AHX' : 'ADX', ch, rate, samples]
}

/** ["WAV", channels, rate, samples] of a RIFF WAVE file whose header is at the start of b (any format tag: a viewer decides what it can play), or null. */
export function wavInfo(b: Uint8Array): [string, number, number, number] | null {
  if (b.length < 44 || !tag(b, 'RIFF') || ![0x57, 0x41, 0x56, 0x45].every((c, i) => b[8 + i] === c) || ![0x66, 0x6D, 0x74, 0x20].every((c, i) => b[12 + i] === c)) return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const ch = v.getUint16(22, true), rate = v.getUint32(24, true), bits = v.getUint16(34, true)
  let at = -1                                                       // 'data' is searched for, not taken at the fmt chunk's declared end: some files carry two stray bytes before it
  for (let p = 36; p < 64 && at < 0; p++) if (b[p] === 0x64 && b[p + 1] === 0x61 && b[p + 2] === 0x74 && b[p + 3] === 0x61) at = p
  if (!(ch >= 1 && ch <= 8) || !(rate >= 4000 && rate <= 192000) || at < 0 || at + 8 > b.length) return null
  const data = v.getUint32(at + 4, true)
  return ['WAV', ch, rate, bits ? Math.floor((data * 8) / (bits * ch)) : 0]
}

const tag = (b: Uint8Array, t: string) => b.length >= t.length && [...t].every((c, i) => b[i] === c.charCodeAt(0))

/** The entries of a RAT archive of `size` bytes (`RAT\0`, a version, an entry count, then 32 byte entries from byte 32: an 8 byte name, a 4 byte
 * type, a 4 byte tag, the size, two dates, the offset), up to the first entry that is not one. The twin of the skill's rat_entries. */
async function ratSounds(size: number, head: Uint8Array, read: (offset: number, n: number) => Promise<Uint8Array>): Promise<Sound[]> {
  if (head.length < 12) return []
  const n = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(8, true)
  if (!(n > 0 && n < 100000) || 32 + 32 * n > size) return []
  const table = await read(0, 32 + 32 * n), tv = new DataView(table.buffer, table.byteOffset, table.byteLength), out: Sound[] = []
  const str = (o: number, len: number) => { let r = ''; for (let i = 0; i < len && table[o + i] !== 0; i++) r += String.fromCharCode(table[o + i]); return r }
  for (let i = 0; i < n; i++) {
    const o = 32 + 32 * i, name = str(o, 8), typ = str(o + 8, 4), tg = str(o + 12, 4), sz = tv.getUint32(o + 16, true), off = tv.getUint32(o + 28, true)
    if (!name || !/^[A-Z]{3,4}$/.test(typ) || off + sz > size) break
    if (typ === 'SDFX') out.push({ index: i, offset: off, bytes: sz, format: 'RAT sound (' + tg + ')', channels: null, rate: null, samples: null })
  }
  return out
}

/** The samples of a DTPK sound pack (the AM2 sound driver's) at `base` of a file, `size` bytes long. The pack's sample table is at the offset in
 * its word at +0x3C: a count (the last index), then 16-byte entries {format << 24 | data offset (from the pack's start), loop start, loop end, 0,
 * data size}; format 0 is PCM16, 1 PCM8, 3 the sound chip's 4-bit ADPCM. A row's index is the entry's number * 10000 + the sample's. The pack does not
 * record a rate (a program's pitch sets it): rows carry 22050 as the rate to play at. */
const DTPK_RATE = 22050
async function dtpkSounds(entry: number, base: number, size: number, read: (offset: number, n: number) => Promise<Uint8Array>): Promise<Sound[]> {
  const head = await read(base, 0x40)
  if (head.length < 0x40) return []
  const t = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(0x3C, true)
  if (t + 8 > size) return []
  const cv = await read(base + t, 4), count = new DataView(cv.buffer, cv.byteOffset, cv.byteLength).getUint32(0, true) + 1
  if (!(count > 0 && count < 10000) || t + 4 + 16 * count > size) return []
  const table = await read(base + t + 4, 16 * count), v = new DataView(table.buffer, table.byteOffset, table.byteLength), rows: Sound[] = []
  for (let k = 0; k < count; k++) {
    const w = v.getUint32(16 * k, true), bytes = v.getUint32(16 * k + 12, true), fmt = w >>> 24, at = w & 0xFFFFFF
    if (!bytes || at + bytes > size) continue
    const known = fmt === 3 ? ['DTPK ADPCM', bytes * 2] as const : fmt === 0 ? ['DTPK PCM16', bytes >> 1] as const : fmt === 1 ? ['DTPK PCM8', bytes] as const : null
    rows.push({ index: entry * 10000 + k, offset: base + at, bytes, format: known ? known[0] : 'DTPK format ' + fmt, channels: 1, rate: DTPK_RATE, samples: known ? known[1] : null })
  }
  return rows
}

/** The sounds of a file of `size` bytes; read(offset, n) gives any n bytes of it. */
export async function find(size: number, read: (offset: number, n: number) => Promise<Uint8Array>): Promise<Sound[]> {
  const head = await read(0, Math.min(size, 4096))
  if (head.length >= 8 && head[0] === 0x41 && head[1] === 0x46 && head[2] === 0x53 && head[3] === 0) {      // AFS\0
    const n = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(4, true)
    if (!(n > 0 && n < 100000)) return []
    const table = await read(0, 8 + 8 * n), tv = new DataView(table.buffer, table.byteOffset, table.byteLength)
    const rows: Sound[] = []
    for (let i = 0; i < n; i++) {
      const off = tv.getUint32(8 + 8 * i, true), sz = tv.getUint32(12 + 8 * i, true)
      if (!sz || off + 16 > size) continue
      const first = await read(off, 16)
      if (tag(first, 'DTPK')) { rows.push(...(await dtpkSounds(i, off, sz, read))); continue }     // a sound pack inside the archive: its samples
      const info = adxInfo(first)
      rows.push(info ? { index: i, offset: off, bytes: sz, format: info[0], channels: info[1], rate: info[2], samples: info[3] }
        : { index: i, offset: off, bytes: sz, format: 'unknown', channels: null, rate: null, samples: null })
    }
    return rows.some((r) => r.format === 'ADX' || r.format === 'AHX' || r.format.startsWith('DTPK ')) ? rows : []
  }
  if (tag(head, 'RAT\0')) return ratSounds(size, head, read)
  const info = adxInfo(head)
  if (info) return [{ index: 0, offset: 0, bytes: size, format: info[0], channels: info[1], rate: info[2], samples: info[3] }]
  const wav = wavInfo(head)
  if (wav) return [{ index: 0, offset: 0, bytes: size, format: wav[0], channels: wav[1], rate: wav[2], samples: wav[3] }]
  if (tag(head, 'DTPK')) return [{ index: 0, offset: 0, bytes: size, format: 'DTPK sound bank', channels: null, rate: null, samples: null }]
  if (head.length >= 16) {                                          // a sample stream: version 1, the sample rate, 4 (then the block size); listed, not decoded
    const v = new DataView(head.buffer, head.byteOffset, head.byteLength), rate = v.getUint32(4, true)
    if (v.getUint32(0, true) === 1 && v.getUint32(8, true) === 4 && rate >= 4000 && rate <= 192000) return [{ index: 0, offset: 0, bytes: size, format: 'STR', channels: null, rate, samples: null }]
  }
  for (const t of ['SMLT', 'SMPB']) {                               // Sega's sound driver files: a multi bank or a program bank, listed, not opened
    if (tag(head, t)) return [{ index: 0, offset: 0, bytes: size, format: t + ' sound bank', channels: null, rate: null, samples: null }]
  }
  return []
}
