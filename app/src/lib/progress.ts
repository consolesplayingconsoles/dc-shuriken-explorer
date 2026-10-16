// The decomp's progress, as its README publishes it: the block between <!-- progress --> and <!-- /progress -->, which
// tools/progress.py writes and the decomp's pre-commit hook refreshes on every commit. Read as rows; nothing recomputed.

export interface ProgressRow { depth: number; label: string; pct: number | null; detail: string; heading: boolean }

export function progressRows(readme: string): ProgressRow[] {
  const m = readme.match(/<!--\s*progress\s*-->([\s\S]*?)<!--\s*\/progress\s*-->/)
  if (!m) return []
  const out: ProgressRow[] = []
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('```')) continue
    const depth = Math.floor((line.length - line.trimStart().length) / 2)
    const r = line.trim().match(/^(.+?)\s{2,}(?:(\d+(?:\.\d+)?)%\s+)?(.*)$/)
    if (!r) { out.push({ depth, label: line.trim(), pct: null, detail: '', heading: depth === 0 }); continue }
    out.push({ depth, label: r[1], pct: r[2] !== undefined ? Number(r[2]) : null, detail: r[3], heading: depth === 0 })
  }
  return out
}

// UI labels are Capitalised: each word, except short joining words unless they open the label ("Done: Equivalent C").
const SMALL = new Set(['of', 'a', 'an', 'the', 'and', 'or', 'in', 'on', 'by', 'for', 'to', 'with'])
export const capitalise = (t: string) => t.toLowerCase().split(/(\s+)/).map((w, i) => (/^\s+$/.test(w) || (i > 0 && SMALL.has(w)) ? w
  : w.replace(/^([("']?)([a-z])/, (_, p, c) => p + c.toUpperCase()))).join('').replace(/\bc\b/gi, 'C').replace(/\bsdk\b/gi, 'SDK')

/** A row's detail as the page shows it: the counts only (before any explanation, file or rule name), numbers grouped. */
export const facts = (detail: string) => detail.split(/[:;]/)[0].replace(/\s*\([^)]*\)/g, '').replace(/\s+in\s+\S*[/*]\S*/g, '').trim()
  .replace(/\b\d{4,}\b/g, (n) => Number(n).toLocaleString('en-US'))
