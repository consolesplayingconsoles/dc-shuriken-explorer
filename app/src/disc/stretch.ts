// Every byte of every file is scanned, whatever its size: a file that does not fit in one STRETCH is read in overlapping
// stretches (each repeats the end of the one before, so a thing that straddles a cut is whole in the next). The twin of the
// skill's stretch_starts.
export const STRETCH = 16 << 20
export const OVERLAP = 4 << 20

/** Byte offsets of the stretches a file of `size` bytes is scanned in. */
export function starts(size: number): number[] {
  const out = [0], step = STRETCH - OVERLAP
  while (out[out.length - 1] + STRETCH < size) out.push(out[out.length - 1] + step)
  return out
}
