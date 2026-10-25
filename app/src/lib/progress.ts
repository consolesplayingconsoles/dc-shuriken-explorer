// The decomp's progress, as its README publishes it: the block between <!-- progress --> and <!-- /progress -->, which
// tools/progress.py writes and the decomp's pre-commit hook refreshes on every commit. Read as rows; nothing recomputed.
//
// The v2 report opens with three headline lines, then sections of indented rows:
//   TOTAL TEST COVERAGE           82.8%  the instructions the cases ran, of all instructions, ...
//   FUNCTIONS LEFT  (91.0% complete) 299  of the 3251 functions that can be C (42 with no C form are counted apart)
//   BYTES LEFT      (60.0% complete) 310622  of 776878 bytes of code that can be C
//   FUNCTIONS                         <- a section heading, its rows indented below it
//     unnamed                      16  functions still called FUN_... (16 of 3293)
//     documented                85.2%  2807 named functions in docs/*.md
// The main figure is the share of functions complete.

export interface ProgressRow { depth: number; label: string; pct: number | null; detail: string; heading: boolean; key?: 'coverage' | 'functions' | 'bytes' }

const COVERAGE = /^TOTAL TEST COVERAGE\s+(\d+(?:\.\d+)?)%\s*(.*)$/
const LEFT = /^(FUNCTIONS|BYTES) LEFT\s+\((\d+(?:\.\d+)?)% complete\)\s+(\d+)\s*(.*)$/

export function progressRows(readme: string): ProgressRow[] {
  const m = readme.match(/<!--\s*progress\s*-->([\s\S]*?)<!--\s*\/progress\s*-->/)
  if (!m) return []
  const out: ProgressRow[] = []
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('```')) continue
    const text = line.trim()
    const depth = Math.floor((line.length - line.trimStart().length) / 2)
    if (depth === 0) {
      const c = text.match(COVERAGE)
      if (c) { out.push({ depth: 1, label: 'Test coverage', pct: Number(c[1]), detail: c[2], heading: false, key: 'coverage' }); continue }
      const l = text.match(LEFT)
      if (l) {
        const fn = l[1] === 'FUNCTIONS'
        out.push({ depth: 1, label: fn ? 'Functions' : 'Bytes', pct: Number(l[2]), detail: `${l[3]} left  ${l[4]}`.trim(), heading: false, key: fn ? 'functions' : 'bytes' })
        continue
      }
      out.push({ depth: 0, label: text.split(/\s{2,}/)[0], pct: null, detail: '', heading: true })
      continue
    }
    const r = text.match(/^(.+?)\s{2,}(?:(\d+(?:\.\d+)?)%\s+)?(.*)$/)
    if (!r) { out.push({ depth, label: text, pct: null, detail: '', heading: false }); continue }
    out.push({ depth, label: r[1], pct: r[2] !== undefined ? Number(r[2]) : null, detail: r[3], heading: false })
  }
  return out
}

/** The figure the page leads with: the share of functions complete (null when the report has none). */
export const mainRow = (rows: ProgressRow[]) => rows.find((r) => r.key === 'functions') || null

// UI labels are Capitalised: each word, except short joining words unless they open the label ("Test Coverage").
const SMALL = new Set(['of', 'a', 'an', 'the', 'and', 'or', 'in', 'on', 'by', 'for', 'to', 'with'])
export const capitalise = (t: string) => t.toLowerCase().split(/(\s+)/).map((w, i) => (/^\s+$/.test(w) || (i > 0 && SMALL.has(w)) ? w
  : w.replace(/^([("']?)([a-z])/, (_, p, c) => p + c.toUpperCase()))).join('').replace(/\bc\b/gi, 'C').replace(/\bsdk\b/gi, 'SDK')

/** A row's detail as the page shows it: the counts only (before any explanation, file or rule name), numbers grouped. */
export const facts = (detail: string) => detail.split(/[:;]/)[0].replace(/\s*\([^)]*\)/g, '').replace(/\s+in\s+\S*[/*]\S*/g, '').trim()
  .replace(/\b\d{4,}\b/g, (n) => Number(n).toLocaleString('en-US'))
