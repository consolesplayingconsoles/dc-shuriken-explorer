// The members of a ZIP archive held whole in memory (stored or deflated), read through the central directory at its end, with no
// knowledge of any game. The twin of the skill's zip_members. A member is named by where its local header sits.
import { inflate } from './inflate'

export interface Member { offset: number; name: string; data: Uint8Array }
const MAX_MEMBER = 16 << 20

interface Entry { offset: number; name: string; method: number; csize: number; usize: number }
function directory(d: Uint8Array): Entry[] | null {
  if (d.length < 22 || d[0] !== 0x50 || d[1] !== 0x4B || d[2] !== 3 || d[3] !== 4) return null
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  let e = -1
  for (let p = d.length - 22; p >= Math.max(0, d.length - 22 - 65535); p--) if (v.getUint32(p, true) === 0x06054B50) { e = p; break }
  if (e < 0) return null
  const count = v.getUint16(e + 10, true), at = v.getUint32(e + 16, true)
  const out: Entry[] = []
  let p = at
  for (let i = 0; i < count; i++) {
    if (p + 46 > d.length || v.getUint32(p, true) !== 0x02014B50) return null
    const n = v.getUint16(p + 28, true), x = v.getUint16(p + 30, true), c = v.getUint16(p + 32, true)
    out.push({ offset: v.getUint32(p + 42, true), method: v.getUint16(p + 10, true), csize: v.getUint32(p + 20, true), usize: v.getUint32(p + 24, true),
      name: new TextDecoder('latin1').decode(d.subarray(p + 46, p + 46 + n)) })
    p += 46 + n + x + c
  }
  return out
}

function read(d: Uint8Array, e: Entry): Uint8Array | null {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  if (e.offset + 30 > d.length || v.getUint32(e.offset, true) !== 0x04034B50) return null
  const at = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true)
  const raw = d.subarray(at, at + e.csize)
  if (e.method === 0) return raw.length === e.usize ? raw : null
  if (e.method === 8) { const o = inflate(raw, e.usize); return o && o.length === e.usize ? o : null }
  return null
}

/** Every member of the archive, in the order of its directory ([] when d is not one). */
export function members(d: Uint8Array): Member[] {
  const dir = directory(d)
  if (!dir) return []
  const out: Member[] = []
  for (const e of dir) {
    if (e.name.endsWith('/') || e.usize > MAX_MEMBER) continue
    const data = read(d, e)
    if (data) out.push({ offset: e.offset, name: e.name, data })
  }
  return out
}

/** The one member whose local header sits at `offset`, or null. */
export function memberAt(d: Uint8Array, offset: number): Member | null {
  const e = (directory(d) || []).find((x) => x.offset === offset)
  const data = e ? read(d, e) : null
  return e && data ? { offset, name: e.name, data } : null
}
