// Decodes PowerVR2 texture data (as the Dreamcast stores it) to RGBA.
// The description of a texture is the game's own: width, height, data type (1 twiddled, 2 twiddled mipmapped, 3 VQ,
// 4 VQ mipmapped, 5/6 4-bit palette, 7/8 8-bit palette, 9 rectangle, 0x0D twiddled rectangle, 0x10/0x11 small VQ,
// 0x12 twiddled mipmapped) and pixel format (0 ARGB1555, 1 RGB565, 2 ARGB4444; 5 and 6 = palette, its colours given
// apart; 3 = YUV422, not with a codebook). Mipmapped data holds the smaller levels first, the full-size level last, so given where
// the data ends (`end`) the full-size level is read from there.
const TW = (() => {
  const t = new Uint32Array(1024)
  for (let i = 0; i < 1024; i++) { let v = 0, b = 0, x = i; while (x) { v |= (x & 1) << (2 * b); x >>= 1; b++ } t[i] = v }
  return t
})()
const LUT: Uint32Array[] = []
function lut(pf: number): Uint32Array {                     // 16-bit pixel -> RGBA as one little-endian word
  if (!LUT[pf]) {
    const t = new Uint32Array(65536)
    for (let v = 0; v < 65536; v++) {
      let r, g, b, a
      if (pf === 0) { r = ((v >> 10) & 31) * 255 / 31 | 0; g = ((v >> 5) & 31) * 255 / 31 | 0; b = (v & 31) * 255 / 31 | 0; a = v >> 15 ? 255 : 0 }
      else if (pf === 1) { r = ((v >> 11) & 31) * 255 / 31 | 0; g = ((v >> 5) & 63) * 255 / 63 | 0; b = (v & 31) * 255 / 31 | 0; a = 255 }
      else { r = ((v >> 8) & 15) * 17; g = ((v >> 4) & 15) * 17; b = (v & 15) * 17; a = ((v >> 12) & 15) * 17 }
      t[v] = (a << 24 | b << 16 | g << 8 | r) >>> 0
    }
    LUT[pf] = t
  }
  return LUT[pf]
}
const u16 = (d: Uint8Array, p: number) => d[p] | d[p + 1] << 8

/** w x h RGBA pixels of the texture at data[at], or null when its format is not decoded or the data runs out. */
export function decode(data: Uint8Array, at: number, w: number, h: number, dt: number, pf: number,
  opt: { end?: number; palette?: Uint32Array } = {}): Uint8ClampedArray | null {
  if (!(w >= 8 && w <= 1024 && h >= 8 && h <= 1024)) return null
  if (dt >= 5 && dt <= 8) return paletted(data, at, w, h, dt, opt.palette, opt.end)
  if (pf > 3 || ![1, 2, 3, 4, 9, 0x0D, 0x10, 0x11, 0x12].includes(dt)) return null
  if (pf === 3 && ![1, 2, 9, 0x0D, 0x12].includes(dt)) return null          // YUV422: not with a codebook
  const L = lut(pf === 3 ? 0 : pf), out = new Uint32Array(w * h)
  let p = at
  if (dt === 0x12) { if (opt.end === undefined) return null; dt = 1; p = opt.end - 2 * w * w }
  if (dt === 3 || dt === 4 || dt === 0x10 || dt === 0x11) {
    const entries = dt === 3 || dt === 4 ? 256 : smallBook(w, dt === 0x11)
    if (p + entries * 8 > data.length) return null
    const at0 = p, book = (i: number) => u16(data, at0 + 2 * i)
    p += entries * 8
    const hw = w / 2, hh = h / 2
    if (dt === 0x11) { if (opt.end === undefined) return null; p = opt.end - hw * hh }
    else if (dt === 4) { let off = 1, s = 2; while (s < w) { off += (s / 2) * (s / 2); s *= 2 } p += off }
    if (p < at0 || p + hw * hh > data.length) return null
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < hw; x++) {
        const c = data[p + (TW[x] << 1 | TW[y])] * 4
        out[(2 * y) * w + 2 * x] = L[book(c)]; out[(2 * y) * w + 2 * x + 1] = L[book(c + 2)]
        out[(2 * y + 1) * w + 2 * x] = L[book(c + 1)]; out[(2 * y + 1) * w + 2 * x + 1] = L[book(c + 3)]
      }
    }
    return new Uint8ClampedArray(out.buffer)
  }
  if (dt === 2) {
    if (opt.end !== undefined) p = opt.end - 2 * w * h
    else { let off = 6, s = 2; while (s < w) { off += s * s * 2; s *= 2 } p += off }
  }
  if (p + 2 * w * h > data.length) return null
  if (pf === 3) return yuv422(data, p, w, h, dt)
  if (dt === 9) { for (let i = 0; i < w * h; i++) out[i] = L[u16(data, p + 2 * i)]; return new Uint8ClampedArray(out.buffer) }
  const m = Math.min(w, h), rect = w !== h
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (rect ? (Math.floor(x / m) + Math.floor(y / m)) * m * m : 0) + (TW[x % m] << 1 | TW[y % m])
      out[y * w + x] = L[u16(data, p + 2 * i)]
    }
  }
  return new Uint8ClampedArray(out.buffer)
}

// YUV422: two pixels share their colour. Of each pair of 16-bit words (after the untwiddling the other formats get) the first holds
// U (low byte) and Y0, the second V and Y1. The conversion is the PowerVR2's own.
function yuv422(data: Uint8Array, p: number, w: number, h: number, dt: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4), m = Math.min(w, h), rect = w !== h && dt !== 9
  const word = (x: number, y: number) => u16(data, p + 2 * (dt === 9 ? y * w + x : (rect ? (Math.floor(x / m) + Math.floor(y / m)) * m * m : 0) + (TW[x % m] << 1 | TW[y % m])))
  const put = (o: number, y: number, u: number, v: number) => {
    out[o] = y + 1.375 * (v - 128); out[o + 1] = y - 0.34375 * (u - 128) - 0.6875 * (v - 128); out[o + 2] = y + 1.71875 * (u - 128); out[o + 3] = 255
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x + 1 < w; x += 2) {
      const a = word(x, y), b = word(x + 1, y), u = a & 255, v = b & 255, o = (y * w + x) * 4
      put(o, a >> 8, u, v); put(o + 4, b >> 8, u, v)
    }
  }
  return out
}

// Small VQ: the codebook has fewer entries for small textures.
const smallBook = (w: number, mip: boolean) => (w <= 16 ? 16 : w === 32 ? (mip ? 64 : 32) : w === 64 ? (mip ? 256 : 128) : 256)

/** A palette file's colours (PVPL: 16-bit or 32-bit ARGB entries) as RGBA words, or null. */
export function palette(data: Uint8Array): Uint32Array | null {
  if (data.length < 16 || String.fromCharCode(...data.subarray(0, 4)) !== 'PVPL') return null
  const fmt = u16(data, 8), n = u16(data, 14), out = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    if (fmt === 6) {                                          // ARGB8888, stored B G R A
      const p = 16 + 4 * i
      if (p + 4 > data.length) return null
      out[i] = (data[p + 3] << 24 | data[p] << 16 | data[p + 1] << 8 | data[p + 2]) >>> 0
    } else {
      const p = 16 + 2 * i
      if (p + 2 > data.length || fmt > 2) return null
      out[i] = lut(fmt)[u16(data, p)]
    }
  }
  return out
}

// 4-bit (types 5, 6) and 8-bit (types 7, 8) palette indices, twiddled; without a palette, grey levels.
function paletted(data: Uint8Array, at: number, w: number, h: number, dt: number, pal?: Uint32Array, end?: number): Uint8ClampedArray | null {
  const bits = dt <= 6 ? 4 : 8, size = (w * h * bits) / 8
  let p = at
  if (dt === 6 || dt === 8) { if (end === undefined) return null; p = end - size }
  if (p < 0 || p + size > data.length || w !== h) return null
  const grey = (i: number) => { const v = bits === 4 ? i * 17 : i; return (0xFF000000 | v << 16 | v << 8 | v) >>> 0 }
  const out = new Uint32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = TW[x] << 1 | TW[y]
      const i = bits === 8 ? data[p + t] : (data[p + (t >> 1)] >> ((t & 1) * 4)) & 15
      out[y * w + x] = pal && i < pal.length ? pal[i] : grey(i)
    }
  }
  return new Uint8ClampedArray(out.buffer)
}
