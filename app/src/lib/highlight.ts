// Syntax colours for the Code panes (an editor's usual reading aid; nothing depends on them): C and SH-4 assembly to
// HTML with `hl-*` spans. Every piece of text is escaped.
import type { Line } from './shdis'

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const span = (cls: string, t: string) => `<span class="hl-${cls}">${esc(t)}</span>`

const C_KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'goto',
  'sizeof', 'typedef', 'struct', 'union', 'enum', 'static', 'extern', 'const', 'volatile', 'register', 'inline'])
const C_TYPES = new Set(['void', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned', 'Bool', 'Sint8', 'Uint8',
  'Sint16', 'Uint16', 'Sint32', 'Uint32', 'Float', 'size_t'])

// What the C around a function says: its file's type names (typedefs, struct tags) and the decomp's global names.
export interface CContext { types?: Set<string>; globals?: Set<string> }
/** Type names a C file declares: `typedef ... Name;`, `typedef struct {...} Name;`, `struct Name`. */
export function cTypes(file: string): Set<string> {
  const out = new Set<string>()
  for (const m of file.matchAll(/\btypedef\b[^;{]*?\b([A-Za-z_]\w*)\s*;/g)) out.add(m[1])
  // `typedef struct {...} Name;`: the name after the brace that closes a typedef's body (a `} v;` elsewhere is a variable)
  for (const m of file.matchAll(/\btypedef\s+(?:struct|union|enum)\b[^{;]*\{/g)) {
    let depth = 0, i = m.index + m[0].length - 1
    for (; i < file.length; i++) { if (file[i] === '{') depth++; else if (file[i] === '}' && --depth === 0) break }
    const after = file.slice(i + 1).match(/^\s*\**\s*([A-Za-z_]\w*)/)
    if (after) out.add(after[1])
  }
  for (const m of file.matchAll(/\b(?:struct|union|enum)\s+([A-Za-z_]\w*)/g)) out.add(m[1])
  return out
}

/** C to highlighted HTML: keywords, types, parameters, fields, globals, constants, calls, numbers, strings, comments. */
export function highlightC(src: string, ctx: CContext = {}): string {
  const types = ctx.types || new Set<string>(), globals = ctx.globals || new Set<string>()
  // the parameters of the function the text starts with: the last name of each comma-separated part
  const sig = src.match(/^[^(]*\(([^)]*)\)/)
  const params = new Set((sig ? sig[1].split(',') : []).map((p) => (p.match(/([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*$/) || ['', ''])[1]).filter((n) => n && n !== 'void'))
  const re = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(^[ \t]*#[^\n]*)|(\b0[xX][0-9a-fA-F]+[uUlL]*\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFuUlL]*\b)|((?:->|\.)\s*)([A-Za-z_]\w*)|([A-Za-z_]\w*)(?=\s*\()|(?<=(?:^|[({;,])[ \t]*(?:(?:const|static|volatile|register|extern|unsigned|signed)\s+)*)([A-Za-z_]\w*)\b(?=(?:\s+\**|\s*\*+)\s*[A-Za-z_]\w*\s*[;,=)\[])|([A-Za-z_]\w*)/gm
  let out = '', last = 0, m: RegExpExecArray | null
  const word = (w: string, call: boolean, declType: boolean) => {
    if (C_KEYWORDS.has(w)) return span('keyword', w)
    if (C_TYPES.has(w) || types.has(w) || /^tag[A-Z]/.test(w)) return span('type', w)
    if (call) return span('call', w)
    if (declType) return span('type', w)
    if (params.has(w)) return span('param', w)
    if (globals.has(w)) return span('global', w)
    if (/^[A-Z][A-Z0-9_]{2,}$/.test(w)) return span('constant', w)
    return esc(w)
  }
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index))
    if (m[1]) out += span('comment', m[1])
    else if (m[2]) out += span('string', m[2])
    else if (m[3]) out += span('pre', m[3])
    else if (m[4]) out += span('number', m[4])
    else if (m[6]) out += esc(m[5]) + span('field', m[6])
    else if (m[7]) out += word(m[7], true, false)
    else if (m[8]) out += word(m[8], false, !C_KEYWORDS.has(m[8]) && m[8] !== 'return')
    else if (m[9]) out += word(m[9], false, false)
    last = m.index + m[0].length
  }
  return out + esc(src.slice(last))
}

// An operand list: registers, immediates (#n), addresses and numbers.
function operands(t: string): string {
  return t.split(/(\b(?:x?f?r\d+(?:_bank)?|dr\d+|fv\d+|xmtrx|fpul|fpscr|pc|pr|gbr|vbr|ssr|spc|sgr|dbr|sr|mach|macl)\b|#-?\d+|0x[0-9a-fA-F]+|-?\b\d+\b)/)
    .map((p, i) => (i % 2 === 0 ? esc(p) : p[0] === '#' || /^-?\d|^0x/.test(p) ? span('number', p) : span('register', p))).join('')
}

/** A disassembly listing to highlighted HTML: address, word, instruction, note; labels on their own line. */
export function highlightAsm(lines: Line[]): string {
  const out: string[] = []
  for (const l of lines) {
    if (l.label) out.push((out.length ? '\n' : '') + span('label', l.label + ':'))
    const head = span('addr', l.pc.toString(16).padStart(8, '0')) + '  ' + span('word', l.word.padEnd(8)) + '  '
    if (l.data) { out.push(head + span('data', l.text) + (l.note ? '  ' + span('comment', '; ' + l.note) : '')); continue }
    const sp = l.text.indexOf(' '), op = sp < 0 ? l.text : l.text.slice(0, sp), args = sp < 0 ? '' : l.text.slice(sp)
    const body = span('mnemonic', op) + operands(args)
    const pad = ' '.repeat(Math.max(1, 30 - l.text.length))
    out.push(head + body + (l.note ? pad + span('comment', '; ' + l.note) : ''))
  }
  return out.join('\n')
}
