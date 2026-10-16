// Illbleed's `.MEB` message files: a u32 count, then that many u32 offsets, then the records. A record is control bytes, then 16-bit codes
// (a high byte of 0 and a glyph number); 0x82 ends a line of the box. Glyphs worked out so far: 0 is a space, 1 to 10 the digits, 11 to 36 the
// capitals, 37 to 62 the lowercase letters, 63 an apostrophe, 67 a full stop, 68 a comma, 70 an exclamation mark (read off the sentences). Every other byte or glyph is shown as its hex between angle marks, so nothing is guessed.
const glyph = (c: number): string => {
  if (c === 0) return ' '
  if (c <= 10) return String(c - 1)
  if (c <= 36) return String.fromCharCode(0x41 + c - 11)
  if (c <= 62) return String.fromCharCode(0x61 + c - 37)
  if (c === 63) return "'"
  if (c === 67) return '.'
  if (c === 68) return ','
  if (c === 70) return '!'
  return '‹' + c.toString(16).padStart(2, '0') + '›'
}

export function mebLines(data: Uint8Array): string[] {
  if (data.length < 8) return []
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength), n = v.getUint32(0, true)
  if (n === 0 || 4 + 4 * n > data.length) return []
  const offs: number[] = []
  for (let i = 0; i < n; i++) offs.push(v.getUint32(4 + 4 * i, true))
  offs.push(data.length)
  const out: string[] = []
  for (let r = 0; r < n; r++) {
    const a = offs[r], b = offs[r + 1]
    if (!(a < b && b <= data.length)) continue
    let line = ''
    for (let i = a; i < b;) {
      const x = data[i]
      if (x === 0x82) { line += ' / '; i++ }
      else if (x === 0 && i + 1 < b) { line += glyph(data[i + 1]); i += 2 }
      else { line += '‹' + x.toString(16).padStart(2, '0') + '›'; i++ }
    }
    out.push(line)
  }
  return out
}
