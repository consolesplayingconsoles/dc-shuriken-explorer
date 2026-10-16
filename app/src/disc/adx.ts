// Decodes CRI ADX audio (the standard 4-bit ADPCM most Dreamcast games use) to a 16-bit PCM WAV.
// An ADX stream starts with 0x80 0x00 and the offset of its "(c)CRI" mark; the header gives the encoding, the block
// size (18 bytes), the bits (4), the channels, the sample rate, the number of samples per channel and a cut-off
// frequency that sets the predictor. Each block is a 16-bit scale and 16 bytes of 4-bit codes (32 samples); the
// blocks of the channels alternate. AHX (MPEG audio inside an ADX header) is not decoded.
export function toWav(b: Uint8Array): ArrayBuffer | null {
  if (b.length < 20 || b[0] !== 0x80 || b[1] !== 0x00) return null
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const start = dv.getUint16(2) + 4, enc = b[4], blk = b[5], bits = b[6], ch = b[7]
  const rate = dv.getUint32(8), samples = dv.getUint32(12), cutoff = dv.getUint16(16)
  if (enc !== 3 || blk !== 18 || bits !== 4 || !(ch >= 1 && ch <= 8) || !(rate >= 4000 && rate <= 192000)) return null
  const a = Math.SQRT2 - Math.cos(2 * Math.PI * cutoff / rate), bb = Math.SQRT2 - 1
  const c = (a - Math.sqrt((a + bb) * (a - bb))) / bb
  const c0 = Math.trunc(c * 8192), c1 = Math.trunc(-(c * c) * 4096)
  const hist = Array.from({ length: ch }, () => [0, 0])
  const out = new Int16Array(samples * ch)
  let pos = start, total = out.length
  const frames = Math.ceil(samples / 32)
  outer: for (let f = 0; f < frames; f++) {
    for (let k = 0; k < ch; k++) {
      if (pos + blk > b.length) { total = f * 32 * ch; break outer }
      const scale = ((b[pos] << 8 | b[pos + 1]) & 0x1FFF) + 1
      let [h1, h2] = hist[k]
      const base = f * 32 * ch + k
      for (let i = 0; i < 16; i++) {
        const byte = b[pos + 2 + i]
        for (let sh = 0; sh < 2; sh++) {
          let n = sh === 0 ? byte >> 4 : byte & 15
          if (n >= 8) n -= 16
          let s = n * scale + ((c0 * h1 + c1 * h2) >> 12)
          s = s > 32767 ? 32767 : s < -32768 ? -32768 : s
          h2 = h1; h1 = s
          const idx = base + (2 * i + sh) * ch
          if (idx < out.length) out[idx] = s
        }
      }
      hist[k] = [h1, h2]
      pos += blk
    }
  }
  const body = total * 2, wav = new ArrayBuffer(44 + body), w = new DataView(wav)
  const str = (o: number, t: string) => { for (let i = 0; i < 4; i++) w.setUint8(o + i, t.charCodeAt(i)) }
  str(0, 'RIFF'); w.setUint32(4, 36 + body, true); str(8, 'WAVE'); str(12, 'fmt ')
  w.setUint32(16, 16, true); w.setUint16(20, 1, true); w.setUint16(22, ch, true); w.setUint32(24, rate, true)
  w.setUint32(28, rate * ch * 2, true); w.setUint16(32, ch * 2, true); w.setUint16(34, 16, true)
  str(36, 'data'); w.setUint32(40, body, true)
  new Int16Array(wav, 44, total).set(out.subarray(0, total))
  return wav
}
