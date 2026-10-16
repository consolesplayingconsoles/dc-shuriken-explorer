// Sega's PRS compression (a Lempel-Ziv variant: a control byte of 8 flags, then literals and short or long copies from
// earlier output), with no knowledge of any game. The twin of the skill's prs_stream / prs_decompress: null when the data is not PRS.
export function decompress(src: Uint8Array): Uint8Array | null {
  const r = stream(src)
  return r ? r.data : null
}

/** The original bytes and the number of bytes of src the stream took (end marker included), or null when it is not PRS. */
export function stream(src: Uint8Array): { data: Uint8Array; used: number } | null {
  let out = new Uint8Array(Math.max(1024, Math.min(src.length * 4, 1 << 20))), len = 0, pos = 0, ctrl = 0, bits = 0
  const need = (n: number) => {
    if (len + n <= out.length) return
    const grown = new Uint8Array(Math.max(out.length * 2, len + n))
    grown.set(out.subarray(0, len)); out = grown
  }
  const flag = (): number => {
    if (bits === 0) { if (pos >= src.length) throw 0; ctrl = src[pos++]; bits = 8 }
    const f = ctrl & 1; ctrl >>= 1; bits--
    return f
  }
  try {
    for (;;) {
      if (flag()) {                                         // a literal byte
        if (pos >= src.length) return null
        need(1); out[len++] = src[pos++]
        continue
      }
      let size: number, off: number
      if (flag()) {                                         // a long copy: a 16-bit word gives the offset and the size
        if (pos + 2 > src.length) return null
        const word = src[pos] | src[pos + 1] << 8
        pos += 2
        if (word === 0) return { data: out.slice(0, len), used: pos }   // the end marker
        size = word & 7; off = (word >> 3) - 0x2000
        if (size === 0) { if (pos >= src.length) return null; size = src[pos++] + 1 } else size += 2
      } else {                                              // a short copy: two flags give the size, a byte the offset
        const high = flag()
        size = (high << 1 | flag()) + 2
        if (pos >= src.length) return null
        off = src[pos++] - 0x100
      }
      if (len + off < 0) return null
      need(size)
      for (let i = 0; i < size; i++) { out[len] = out[len + off]; len++ }
    }
  } catch {
    return null
  }
}
