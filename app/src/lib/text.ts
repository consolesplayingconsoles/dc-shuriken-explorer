// The decomp's text: the files the skill dumped into its text-dump folder, listed as they are. Nothing here knows any game's text:
// a file is split into lines at a line feed or a NUL byte and read a page at a time, so a long file never fills the page.
import type { Item } from './dcgs'

export const TEXT_DIR = 'text-dump'
export const PAGE = 200                                       // lines to a page

/** One item per dumped file, grouped by its folder. */
export function textItems(paths: string[]): Item[] {
  return paths.map((p) => {
    const rel = p.slice(TEXT_DIR.length + 1), at = rel.lastIndexOf('/')
    return { id: 'txt:' + rel, kind: 'text', group: at < 0 ? 'Root' : rel.slice(0, at), sub: 'Files', subLabel: '', name: rel.slice(at + 1), file: p, named: true } as Item
  })
}

export type Encoding = 'shift_jis' | 'windows-1252' | 'utf-8' | 'utf-16le' | 'utf-16be'
export type Split = 'either' | 'lf' | 'nul'
export const ENCODINGS: { key: Encoding; label: string }[] = [
  { key: 'shift_jis', label: 'Shift-JIS' }, { key: 'windows-1252', label: 'Latin-1 (Windows-1252)' }, { key: 'utf-8', label: 'UTF-8' },
  { key: 'utf-16le', label: 'UTF-16 little-endian' }, { key: 'utf-16be', label: 'UTF-16 big-endian' },
]
export const SPLITS: { key: Split; label: string }[] = [
  { key: 'either', label: 'Line feed or null byte (00)' }, { key: 'lf', label: 'Line feed only' }, { key: 'nul', label: 'Null byte only (00)' },
]

/** Where each line of a file starts and ends: [start, end) byte pairs, empty lines left out. A UTF-16 file is cut at its 16-bit units. */
export function lineSpans(data: Uint8Array, split: Split = 'either', enc: Encoding = 'shift_jis'): Uint32Array {
  const out: number[] = []
  const wide = enc === 'utf-16le' || enc === 'utf-16be', step = wide ? 2 : 1
  const unit = (i: number) => (!wide ? data[i] : enc === 'utf-16le' ? data[i] | (data[i + 1] << 8) : (data[i] << 8) | data[i + 1])
  let start = -1
  for (let i = 0; i + step <= data.length; i += step) {
    const u = unit(i)
    const cut = (u === 0x0a && split !== 'nul') || (u === 0x00 && split !== 'lf') || (u === 0x0d && split !== 'nul' && i + 2 * step <= data.length && unit(i + step) === 0x0a)
    if (cut) { if (start >= 0) { out.push(start, i); start = -1 } }
    else if (start < 0) start = i
  }
  if (start >= 0) out.push(start, data.length - (data.length % step))
  return Uint32Array.from(out)
}

/** The text of lines [first, last) of a file, read in the chosen encoding. */
export function pageLines(data: Uint8Array, spans: Uint32Array, first: number, last: number, enc: Encoding = 'shift_jis'): string[] {
  const dec = new TextDecoder(enc)
  const out: string[] = []
  for (let n = first; n < last; n++) out.push(dec.decode(data.subarray(spans[2 * n], spans[2 * n + 1])))
  return out
}
