// The decomp's code, from its own files: the function list (functions.txt), names (symbols.txt, globals.txt), the C
// (src/*.c; a file whose first line is `/* @unit <start>-<end> ... */` is matching code for that range), which
// functions behave like the original (tests/equivalent.txt) and their test cases (tests/<file>/<function>.json).
import type { Item } from './dcgs'

export interface CodeFiles {
  functions: string
  symbols: string
  globals: string
  equivalent: string
  sources: Map<string, string>          // src file name -> text
  cases: Map<string, string[]>          // function name -> its case files (tests/<file>/<function>.json)
}

export type Status = 'Equivalent' | 'Matching' | 'C Written' | 'Named' | 'Unnamed'
export interface Fn {
  addr: number; size: number; name: string; status: Status
  file: string; c: string                // the C file defining it and its definition ('' when none)
  cases: string[]
}

const unnamed = (n: string) => /^(FUN|blob)_[0-9a-f]+$/i.test(n)

// Top-level function definitions of a C file: name -> the definition's text (from its first line to its closing brace).
function definitions(text: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /^([A-Za-z_][^;{}()#]*?)\b([A-Za-z_]\w*)\s*\(([^;{}]*)\)\s*\{/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (/^\s*(if|for|while|switch|return|else|do)\b/.test(m[1])) continue
    let depth = 0, i = text.indexOf('{', m.index + m[0].length - 1)
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}' && --depth === 0) break
    }
    out.set(m[2], text.slice(m.index, i + 1))
    re.lastIndex = i + 1
  }
  return out
}

export function names(f: CodeFiles): Map<number, string> {
  const out = new Map<number, string>()
  const add = (text: string, isFn: boolean) => {
    for (const line of text.split(/\r?\n/)) {
      const p = line.trim().split(/\s+/)
      if (line.startsWith('#') || p.length < (isFn ? 4 : 2)) continue
      const a = parseInt(isFn ? p[1] : p[0], 16)
      if (Number.isFinite(a) && !out.has(a >>> 0)) out.set(a >>> 0, isFn ? p[3] : p[1])
    }
  }
  add(f.functions, true); add(f.symbols, false); add(f.globals, false)
  return out
}

export function functionsOf(f: CodeFiles): Fn[] {
  const equivalent = new Set(f.equivalent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
  const units: { file: string; lo: number; hi: number }[] = []
  const defs = new Map<string, { file: string; c: string }>()
  for (const [file, text] of f.sources) {
    const u = text.match(/^\/\*\s*@unit\s+([0-9A-Fa-f]+)-([0-9A-Fa-f]+)/)
    if (u) units.push({ file, lo: parseInt(u[1], 16), hi: parseInt(u[2], 16) })
    for (const [n, c] of definitions(text)) if (!defs.has(n)) defs.set(n, { file, c })
  }
  const out: Fn[] = []
  for (const line of f.functions.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/)
    if (p[0] !== 'F' || p.length < 4) continue
    const addr = parseInt(p[1], 16), size = Number(p[2]), name = p[3], d = defs.get(name)
    const unit = units.find((u) => (addr & 0x1fffffff) >= (u.lo & 0x1fffffff) && (addr & 0x1fffffff) < (u.hi & 0x1fffffff))
    const status: Status = unit ? 'Matching' : equivalent.has(name) ? 'Equivalent' : d ? 'C Written' : unnamed(name) ? 'Unnamed' : 'Named'
    out.push({ addr, size, name, status, file: d ? d.file : unit ? unit.file : '', c: d ? d.c : '', cases: f.cases.get(name) || [] })
  }
  return out
}

/** The Code kind's items: grouped by C file (functions with no C yet by their 64 KB of address), named or by address. */
export function codeItems(fns: Fn[]): Item[] {
  return fns.map((fn) => {
    const hex = fn.addr.toString(16).toUpperCase().padStart(8, '0')
    return { id: 'fn:' + hex, kind: 'code', group: fn.file || 'No C Yet', sub: fn.file ? fn.status : hex.slice(0, 4) + 'xxxx',
      subLabel: '', subKey: fn.file ? ['Matching', 'Equivalent', 'C Written', 'Named', 'Unnamed'].indexOf(fn.status) + fn.status : hex,
      name: unnamed(fn.name) ? '' : fn.name, hex, named: !!fn.file, num: fn.addr, fn } as Item
  })
}
