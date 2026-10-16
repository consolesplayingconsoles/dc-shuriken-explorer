// Boku Doraemon's own text records, ported from Pluto's translation parsers (pluto-translate/parsers: ptrtable, itemtbl, exemsg).
// Text is Shift-JIS; inside a record `01 ff` breaks a line (shown as " / "), `04 ff` a page (" // "), `05 ff <u16>` sets a colour (dropped).
// Bytes that are not text are skipped, never guessed: a line is only what the game's own record framing marks as text.
const sjis = new TextDecoder('shift_jis')
const fwLead = (b: number) => (b >= 0x81 && b <= 0x9F) || (b >= 0xE0 && b <= 0xEF)
const fwTrail = (b: number) => (b >= 0x40 && b <= 0x7E) || (b >= 0x80 && b <= 0xFC)
const fw = (d: Uint8Array, k: number) => k + 1 < d.length && fwLead(d[k]) && fwTrail(d[k + 1])

// The text of a record from `start`: skip to the first full-width character, then take full-width characters and the line (01 ff) and,
// with `pages`, page (04 ff) breaks that more text follows; stop at anything else. Returns the line, or '' when there is none.
function walk(d: Uint8Array, start: number, end: number, pages: boolean): string {
  let p = start
  while (p + 1 < end && !fw(d, p)) p++
  let k = p, out = '', run = p
  const flush = () => { if (k > run) out += sjis.decode(d.subarray(run, k)) }
  while (k < end) {
    if (k + 1 < end && fw(d, k)) { k += 2; continue }
    if ((d[k] === 0x01 || (pages && d[k] === 0x04)) && k + 2 < end && d[k + 1] === 0xFF && fwLead(d[k + 2])) {
      flush(); out += d[k] === 0x01 ? ' / ' : ' // '; k += 2; run = k; continue
    }
    break
  }
  flush()
  return out
}

/** A u32 offset table (its first entry is its own size, so count = first / 4; 0xffffffff ends it), each entry a record
 * `2d f0 <u16 len> <text>`: menus and maps (`.SCP`), the secrets and ranks (`INFO/*.TBL`), the gadget names. One line per record. */
export function pointerTable(d: Uint8Array): string[] {
  if (d.length < 4) return []
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength), first = v.getUint32(0, true)
  if (first === 0 || first % 4 || first > d.length) return []
  const n = first / 4, ptrs: number[] = []
  for (let i = 0; i < n; i++) ptrs.push(v.getUint32(4 * i, true))
  ptrs.push(d.length)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const s = ptrs[i]
    if (s === 0xFFFFFFFF || s >= d.length) continue
    let e = ptrs[i + 1]
    if (e === 0xFFFFFFFF || e > d.length || e <= s) e = d.length
    const line = walk(d, s, e, false)
    if (line) out.push(line)
  }
  return out
}

/** `DOUGU/ITEMTBL.PAC`: the gadget names (a pointer table, records below 0x1800), then one description per 0x800 sector from 0x1800
 * (the game finds a gadget's description by its index times 0x800), each a `2d f0` record with line and page breaks. */
export function gadgetTable(d: Uint8Array): string[] {
  const BASE = 0x1800, SECTOR = 0x800
  const out = pointerTable(d)                                    // the names (the table's records all lie below 0x1800)
  for (let off = BASE; off + 8 <= d.length; off += SECTOR) {
    const end = Math.min(d.length, off + SECTOR)
    let j = -1
    for (let k = off; k + 1 < Math.min(end, off + 0x20); k++) if (d[k] === 0x2D && d[k + 1] === 0xF0) { j = k; break }
    if (j < 0) continue
    const line = walk(d, j + 4, end, true)
    if (line) out.push(line)
  }
  return out
}

/** Messages the engine shows itself, kept in the executable (`1ST_READ.BIN`): records `<20..3f> f0 <u16 len> <text>` whose text holds a
 * colour token (05 ff) and kana, which keeps code that only looks like a record out. One line per record. */
export function exeMessages(d: Uint8Array): string[] {
  const out: string[] = [], n = d.length
  for (let i = 0; i < n - 4; i++) {
    if (!(d[i] >= 0x20 && d[i] <= 0x3F && d[i + 1] === 0xF0)) continue
    const ln = d[i + 2] | (d[i + 3] << 8)
    if (!(ln > 4 && ln < 400 && i + 2 + ln <= n)) continue
    const ts = i + 4, te = i + 2 + ln
    let ctrl = false, kana = false
    for (let j = ts; j + 1 < te; j++) { if (d[j] === 0x05 && d[j + 1] === 0xFF) ctrl = true; if (d[j] >= 0x82 && d[j] <= 0x83) kana = true }
    if (!ctrl || !kana) continue
    let line = ''
    for (let k = ts; k < te;) {
      if (k + 1 < te && (d[k] === 0x01 || d[k] === 0x04 || d[k] === 0x05) && d[k + 1] === 0xFF) {
        if (d[k] === 0x01) line += ' / '; else if (d[k] === 0x04) line += ' // '
        k += d[k] === 0x05 ? 4 : 2; continue
      }
      if (d[k] === 0xFF) { k++; continue }
      let j = k
      while (j < te && !(j + 1 < te && (d[j] === 0x01 || d[j] === 0x04 || d[j] === 0x05) && d[j + 1] === 0xFF) && d[j] !== 0xFF) j++
      line += sjis.decode(d.subarray(k, j)); k = j
    }
    out.push(line.replace(/^( \/\/? )+|( \/\/? )+$/g, ''))   // breaks that end the box carry no text
    i = te - 1
  }
  return out
}
