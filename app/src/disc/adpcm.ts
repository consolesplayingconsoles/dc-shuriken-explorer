// Decodes the Dreamcast sound chip's 4-bit ADPCM (Yamaha's) to a 16-bit PCM WAV: two samples a byte, the low nibble first. Each
// nibble is a sign bit and three magnitude bits: the sample moves by (2 * magnitude + 1) steps of 1/8, and the step grows or
// shrinks by a factor from a small table (230 to 614 over 256), kept between 127 and 24576. Mono only.
const SCALE = [230, 230, 230, 230, 307, 409, 512, 614]

/** Mono 16-bit PCM samples of 4-bit ADPCM data. */
export function decode(data: Uint8Array): Int16Array {
  const out = new Int16Array(data.length * 2)
  let pred = 0, step = 127, k = 0
  const one = (n: number) => {
    let d = ((2 * (n & 7) + 1) * step) >> 3
    if (n & 8) d = -d
    pred = Math.max(-32768, Math.min(32767, pred + d))
    step = Math.max(127, Math.min(24576, (step * SCALE[n & 7]) >> 8))
    out[k++] = pred
  }
  for (const b of data) { one(b & 15); one(b >> 4) }
  return out
}

/** A 16-bit PCM WAV file of mono samples. */
export function wav(samples: Int16Array, rate: number): ArrayBuffer {
  const body = samples.length * 2, w = new ArrayBuffer(44 + body), v = new DataView(w)
  const str = (o: number, t: string) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, t.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + body, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, body, true)
  new Int16Array(w, 44, samples.length).set(samples)
  return w
}
