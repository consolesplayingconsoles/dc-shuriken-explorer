// Raw DEFLATE (RFC 1951) decoding, synchronous and with no dependency: the scan reads the members of ZIP archives as it goes.
// Canonical Huffman codes are decoded by counting (the way zlib's puff does): slow but small and exact. Null on bad data.
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

interface Huff { count: number[]; symbol: number[] }
function huff(lengths: number[], n: number): Huff {
  const count = new Array(16).fill(0), offs = new Array(16).fill(0), symbol = new Array(n).fill(0)
  for (let i = 0; i < n; i++) count[lengths[i]]++
  for (let i = 1; i < 15; i++) offs[i + 1] = offs[i] + count[i]
  for (let i = 0; i < n; i++) if (lengths[i]) symbol[offs[lengths[i]]++] = i
  return { count, symbol }
}

let FIXED: { lit: Huff; dist: Huff } | null = null
function fixed() {
  if (!FIXED) {
    const l: number[] = []
    for (let i = 0; i < 144; i++) l.push(8)
    for (let i = 144; i < 256; i++) l.push(9)
    for (let i = 256; i < 280; i++) l.push(7)
    for (let i = 280; i < 288; i++) l.push(8)
    FIXED = { lit: huff(l, 288), dist: huff(new Array(30).fill(5), 30) }
  }
  return FIXED
}

/** The bytes a raw DEFLATE stream decodes to (`size`: how many are expected, when known), or null when the stream is bad. */
export function inflate(src: Uint8Array, size?: number): Uint8Array | null {
  let pos = 0, bitBuf = 0, bitCnt = 0
  let out = new Uint8Array(size && size > 0 ? size : Math.max(1024, src.length * 4)), len = 0
  const bits = (n: number): number => {
    let v = bitBuf
    while (bitCnt < n) { if (pos >= src.length) throw 0; v |= src[pos++] << bitCnt; bitCnt += 8 }
    bitBuf = v >>> n; bitCnt -= n
    return v & ((1 << n) - 1)
  }
  const decode = (h: Huff): number => {
    let code = 0, first = 0, index = 0
    for (let l = 1; l <= 15; l++) {
      code |= bits(1)
      const c = h.count[l]
      if (code - c < first) return h.symbol[index + (code - first)]
      index += c; first += c; first <<= 1; code <<= 1
    }
    throw 0
  }
  const put = (b: number) => {
    if (len >= out.length) { const g = new Uint8Array(out.length * 2); g.set(out); out = g }
    out[len++] = b
  }
  try {
    for (let last = 0; !last;) {
      last = bits(1)
      const type = bits(2)
      if (type === 0) {
        bitBuf = 0; bitCnt = 0
        if (pos + 4 > src.length) return null
        const n = src[pos] | src[pos + 1] << 8
        pos += 4
        if (pos + n > src.length) return null
        for (let i = 0; i < n; i++) put(src[pos++])
        continue
      }
      let lit: Huff, dist: Huff
      if (type === 1) ({ lit, dist } = fixed())
      else if (type === 2) {
        const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4
        const lens = new Array(320).fill(0)
        for (let i = 0; i < ncode; i++) lens[ORDER[i]] = bits(3)
        const code = huff(lens, 19)
        const all: number[] = []
        while (all.length < nlen + ndist) {
          const sym = decode(code)
          if (sym < 16) all.push(sym)
          else {
            let prev = 0, rep: number
            if (sym === 16) { if (!all.length) return null; prev = all[all.length - 1]; rep = 3 + bits(2) } else if (sym === 17) rep = 3 + bits(3)
            else rep = 11 + bits(7)
            if (all.length + rep > nlen + ndist) return null
            for (let i = 0; i < rep; i++) all.push(prev)
          }
        }
        lit = huff(all.slice(0, nlen), nlen); dist = huff(all.slice(nlen), ndist)
      } else return null
      for (;;) {
        const sym = decode(lit)
        if (sym < 256) put(sym)
        else if (sym === 256) break
        else {
          const s = sym - 257
          if (s >= 29) return null
          const n = LBASE[s] + bits(LEXT[s]), d = decode(dist)
          if (d >= 30) return null
          const back = DBASE[d] + bits(DEXT[d])
          if (back > len) return null
          for (let i = 0; i < n; i++) put(out[len - back])
        }
      }
    }
  } catch {
    return null
  }
  return out.slice(0, len)
}
