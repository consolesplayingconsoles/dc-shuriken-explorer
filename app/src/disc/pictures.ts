// Pictures in a file's bytes, with no knowledge of any game: a whole GIF, JPEG or PNG file, or PowerVR textures (`PVRT` chunks)
// anywhere, named by a PVM archive's header when the file is one. The twin of the skill's find_pictures / pvrt_at / pvm_names.
export interface Found { offset: number; kind: 'pvr' | 'gif' | 'jpg' | 'png' | 'tr4'; w: number; h: number; dt: number; pf: number; bytes: number; name: string }

const PVRT_TYPES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 0x0D, 0x10, 0x11, 0x12])
const ascii = (d: Uint8Array, p: number, n: number) => String.fromCharCode(...d.subarray(p, p + n))

function indexOfTag(d: Uint8Array, tag: string, from: number): number {
  const a = tag.charCodeAt(0)
  for (let p = d.indexOf(a, from); p >= 0; p = d.indexOf(a, p + 1)) {
    if (p + tag.length > d.length) return -1
    let ok = true
    for (let i = 1; i < tag.length; i++) if (d[p + i] !== tag.charCodeAt(i)) { ok = false; break }
    if (ok) return p
  }
  return -1
}

/** The texture names of a PVM archive's header, in archive order ([] when it is not one or names none). */
export function pvmNames(d: Uint8Array): string[] {
  const names: string[] = []
  if (d.length >= 12 && ascii(d, 0, 4) === 'PVMH') {
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
    const flags = v.getUint16(8, true), n = v.getUint16(10, true)
    let q = 12
    for (let i = 0; i < n; i++) {
      if (q + 2 > d.length) break
      q += 2
      let name = ''
      if (flags & 8) {
        const raw = d.subarray(q, q + 28), z = raw.indexOf(0)
        name = new TextDecoder('ascii').decode(z < 0 ? raw : raw.subarray(0, z))
        q += 28
      }
      q += (flags & 4 ? 2 : 0) + (flags & 2 ? 2 : 0) + (flags & 1 ? 4 : 0)
      names.push(name)
    }
  }
  return names
}

/** [width, height, pixel format, data type, bytes] of a plausible PVRT chunk at p (its fields in range), else null. */
export function pvrtAt(d: Uint8Array, p: number): [number, number, number, number, number] | null {
  if (p + 16 > d.length || ascii(d, p, 4) !== 'PVRT') return null
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const ln = v.getUint32(p + 4, true), pf = d[p + 8], dt = d[p + 9], w = v.getUint16(p + 12, true), h = v.getUint16(p + 14, true)
  if (!PVRT_TYPES.has(dt) || pf > 6 || d[p + 10] || d[p + 11] || !(w >= 8 && w <= 1024 && h >= 8 && h <= 1024)) return null
  if (dt !== 9 && ((w & (w - 1)) || (h & (h - 1)))) return null
  if (ln < 8 || ln > 0x1000000) return null
  return [w, h, pf, dt, ln + 8]
}

/** The texture pages of a TR4 level file: its zlib blocks of 32-bit pages (blocks 0 and 2, four bytes a pixel) and of 16-bit pages (block 1, two bytes a
 * pixel), 256 x 256 each; `offset` is where the page's block starts in the file plus the page's number (so each page has an offset of its own), `dt` the page's number in it, `pf` the block (0, 1 or 2). */
function tr4Pages(d: Uint8Array): Found[] {
  if (d.length < 40 || ascii(d, 0, 4) !== 'TR4\0') return []
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), out: Found[] = []
  let p = 10
  for (let blk = 0; blk < 3; blk++) {
    if (p + 10 > d.length) break
    const usz = v.getUint32(p, true), csz = v.getUint32(p + 4, true), bpp = blk === 1 ? 2 : 4
    if (csz > d.length - p - 8 || d[p + 8] !== 0x78 || usz % (256 * 256 * bpp)) break
    for (let k = 0; k < usz / (256 * 256 * bpp); k++) out.push({ offset: p + k, kind: 'tr4', w: 256, h: 256, dt: k, pf: blk, bytes: 256 * 256 * bpp, name: '' })
    p += 8 + csz
  }
  return out
}

/** Every picture in d. With `whole` false d is a stretch of a bigger file starting at byte `base`, and only textures are looked for. */
export function find(d: Uint8Array, base = 0, whole = true): Found[] {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  if (whole && d.length > 10) {
    if (ascii(d, 0, 4) === 'GIF8') return [{ offset: 0, kind: 'gif', w: v.getUint16(6, true), h: v.getUint16(8, true), dt: 0, pf: 0, bytes: d.length, name: '' }]
    if (d[0] === 0x89 && ascii(d, 1, 3) === 'PNG' && d.length > 24) return [{ offset: 0, kind: 'png', w: v.getUint32(16, false), h: v.getUint32(20, false), dt: 0, pf: 0, bytes: d.length, name: '' }]
    if (d[0] === 0xFF && d[1] === 0xD8 && d[2] === 0xFF) {
      let p = 2
      while (p + 9 < d.length && d[p] === 0xFF) {
        const m = d[p + 1], ln = d[p + 2] << 8 | d[p + 3]
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
          return [{ offset: 0, kind: 'jpg', w: d[p + 7] << 8 | d[p + 8], h: d[p + 5] << 8 | d[p + 6], dt: 0, pf: 0, bytes: d.length, name: '' }]
        }
        p += 2 + ln
      }
    }
  }
  if (whole && ascii(d, 0, 4) === 'TR4\0') return tr4Pages(d)
  const names = whole ? pvmNames(d) : []
  const out: Found[] = []
  let p = indexOfTag(d, 'PVRT', 0)
  while (p >= 0) {
    const t = pvrtAt(d, p)
    if (t) {
      out.push({ offset: base + p, kind: 'pvr', w: t[0], h: t[1], dt: t[3], pf: t[2], bytes: t[4], name: out.length < names.length ? names[out.length] : '' })
      p = indexOfTag(d, 'PVRT', p + Math.max(4, Math.min(t[4], d.length - p)))
    } else p = indexOfTag(d, 'PVRT', p + 1)
  }
  return out
}
