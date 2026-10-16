// Addresses are unsigned 32-bit numbers: JavaScript's bitwise operators return signed ones, so every result that is an
// address goes through `>>> 0`.
// SH-4 disassembly of a range of the executable, FPU included, with names: the decomp's tools/shdis.py, line for line.
// pc-relative loads show the pool value (as a name when it is one, else a number and, for a 32-bit value, a float),
// branches and calls their target. Pool words a range loads are shown as data.

const OP0: Record<number, string> = { 0x0009: 'nop', 0x000b: 'rts', 0x002b: 'rte', 0x0008: 'clrt', 0x0018: 'sett', 0x0028: 'clrmac',
  0x0048: 'clrs', 0x0058: 'sets', 0x0019: 'div0u', 0x001b: 'sleep', 0x0038: 'ldtlb', 0xf3fd: 'fschg', 0xfbfd: 'frchg' }
const N_ONLY_0: Record<number, string> = { 0x02: 'stc sr,%', 0x12: 'stc gbr,%', 0x22: 'stc vbr,%', 0x32: 'stc ssr,%', 0x42: 'stc spc,%',
  0xfa: 'stc dbr,%', 0x3a: 'stc sgr,%', 0x0a: 'sts mach,%', 0x1a: 'sts macl,%', 0x2a: 'sts pr,%', 0x5a: 'sts fpul,%',
  0x6a: 'sts fpscr,%', 0x03: 'bsrf %', 0x23: 'braf %', 0x83: 'pref @%', 0x93: 'ocbi @%', 0xa3: 'ocbp @%', 0xb3: 'ocbwb @%',
  0xc3: 'movca.l r0,@%', 0x29: 'movt %' }
const N_ONLY_4: Record<number, string> = { 0x00: 'shll %', 0x01: 'shlr %', 0x02: 'sts.l mach,@-%', 0x03: 'stc.l sr,@-%', 0x04: 'rotl %',
  0x05: 'rotr %', 0x06: 'lds.l @%+,mach', 0x07: 'ldc.l @%+,sr', 0x08: 'shll2 %', 0x09: 'shlr2 %', 0x0a: 'lds %,mach',
  0x0b: 'jsr @%', 0x0e: 'ldc %,sr', 0x10: 'dt %', 0x11: 'cmp/pz %', 0x12: 'sts.l macl,@-%', 0x13: 'stc.l gbr,@-%',
  0x15: 'cmp/pl %', 0x16: 'lds.l @%+,macl', 0x17: 'ldc.l @%+,gbr', 0x18: 'shll8 %', 0x19: 'shlr8 %', 0x1a: 'lds %,macl',
  0x1b: 'tas.b @%', 0x1e: 'ldc %,gbr', 0x20: 'shal %', 0x21: 'shar %', 0x22: 'sts.l pr,@-%', 0x23: 'stc.l vbr,@-%',
  0x24: 'rotcl %', 0x25: 'rotcr %', 0x26: 'lds.l @%+,pr', 0x27: 'ldc.l @%+,vbr', 0x28: 'shll16 %', 0x29: 'shlr16 %',
  0x2a: 'lds %,pr', 0x2b: 'jmp @%', 0x2e: 'ldc %,vbr', 0x32: 'stc.l sgr,@-%', 0x33: 'stc.l ssr,@-%', 0x37: 'ldc.l @%+,ssr',
  0x3e: 'ldc %,ssr', 0x43: 'stc.l spc,@-%', 0x47: 'ldc.l @%+,spc', 0x4e: 'ldc %,spc', 0x52: 'sts.l fpul,@-%',
  0x56: 'lds.l @%+,fpul', 0x5a: 'lds %,fpul', 0x62: 'sts.l fpscr,@-%', 0x66: 'lds.l @%+,fpscr', 0x6a: 'lds %,fpscr',
  0xf2: 'stc.l dbr,@-%', 0xf6: 'ldc.l @%+,dbr', 0xfa: 'ldc %,dbr' }
const NM_2 = ['mov.b %m,@%n', 'mov.w %m,@%n', 'mov.l %m,@%n', '', 'mov.b %m,@-%n', 'mov.w %m,@-%n', 'mov.l %m,@-%n',
  'div0s %m,%n', 'tst %m,%n', 'and %m,%n', 'xor %m,%n', 'or %m,%n', 'cmp/str %m,%n', 'xtrct %m,%n', 'mulu.w %m,%n', 'muls.w %m,%n']
const NM_3 = ['cmp/eq %m,%n', '', 'cmp/hs %m,%n', 'cmp/ge %m,%n', 'div1 %m,%n', 'dmulu.l %m,%n', 'cmp/hi %m,%n', 'cmp/gt %m,%n',
  'sub %m,%n', '', 'subc %m,%n', 'subv %m,%n', 'add %m,%n', 'dmuls.l %m,%n', 'addc %m,%n', 'addv %m,%n']
const NM_6 = ['mov.b @%m,%n', 'mov.w @%m,%n', 'mov.l @%m,%n', 'mov %m,%n', 'mov.b @%m+,%n', 'mov.w @%m+,%n', 'mov.l @%m+,%n',
  'not %m,%n', 'swap.b %m,%n', 'swap.w %m,%n', 'negc %m,%n', 'neg %m,%n', 'extu.b %m,%n', 'extu.w %m,%n', 'exts.b %m,%n', 'exts.w %m,%n']
const FPU: Record<number, string> = { 0: 'fadd frM,frN', 1: 'fsub frM,frN', 2: 'fmul frM,frN', 3: 'fdiv frM,frN', 4: 'fcmp/eq frM,frN',
  5: 'fcmp/gt frM,frN', 6: 'fmov.s @(r0,rM),frN', 7: 'fmov.s frM,@(r0,rN)', 8: 'fmov.s @rM,frN', 9: 'fmov.s @rM+,frN',
  0xa: 'fmov.s frM,@rN', 0xb: 'fmov.s frM,@-rN', 0xc: 'fmov frM,frN', 0xe: 'fmac fr0,frM,frN' }
const FPU_D: Record<number, string> = { 0: 'fsts fpul,frN', 1: 'flds frN,fpul', 2: 'float fpul,frN', 3: 'ftrc frN,fpul', 4: 'fneg frN',
  5: 'fabs frN', 6: 'fsqrt frN', 8: 'fldi0 frN', 9: 'fldi1 frN', 0xa: 'fcnvsd fpul,drN', 0xb: 'fcnvds drN,fpul' }

const s8 = (x: number) => (x & 0x80 ? x - 256 : x)
const s12 = (x: number) => (x & 0x800 ? x - 4096 : x)
const hex = (v: number, n = 8) => (v >>> 0).toString(16).padStart(n, '0')

/** [text, pool address or null, pool size, branch target or null] */
export function decode(w: number, pc: number): [string, number | null, number, number | null] {
  const t = w >> 12, n = (w >> 8) & 15, m = (w >> 4) & 15, lo = w & 15
  const nm = (s: string) => s.replace('%m', 'r' + m).replace('%n', 'r' + n)
  if (w in OP0) return [OP0[w], null, 0, null]
  if (t === 0) {
    if ((w & 0xff) in N_ONLY_0) return [N_ONLY_0[w & 0xff].replace('%', 'r' + n), null, 0, null]
    if (lo === 2 && m & 8) return [`stc r${m & 7}_bank,r${n}`, null, 0, null]
    if (lo >= 4 && lo <= 6) return [`mov.${'bwl'[lo - 4]} r${m},@(r0,r${n})`, null, 0, null]
    if (lo === 7) return [`mul.l r${m},r${n}`, null, 0, null]
    if (lo >= 0xc && lo <= 0xe) return [`mov.${'bwl'[lo - 0xc]} @(r0,r${m}),r${n}`, null, 0, null]
    if (lo === 0xf) return [`mac.l @r${m}+,@r${n}+`, null, 0, null]
  } else if (t === 1) return [`mov.l r${m},@(${lo * 4},r${n})`, null, 0, null]
  else if (t === 2 && NM_2[lo]) return [nm(NM_2[lo]), null, 0, null]
  else if (t === 3 && NM_3[lo]) return [nm(NM_3[lo]), null, 0, null]
  else if (t === 4) {
    if ((w & 0xff) in N_ONLY_4) return [N_ONLY_4[w & 0xff].replace('%', 'r' + n), null, 0, null]
    if (m & 8 && (lo === 3 || lo === 7 || lo === 0xe)) {
      return [lo === 3 ? `stc.l r${m & 7}_bank,@-r${n}` : lo === 7 ? `ldc.l @r${n}+,r${m & 7}_bank` : `ldc r${n},r${m & 7}_bank`, null, 0, null]
    }
    if (lo === 0xc) return [`shad r${m},r${n}`, null, 0, null]
    if (lo === 0xd) return [`shld r${m},r${n}`, null, 0, null]
    if (lo === 0xf) return [`mac.w @r${m}+,@r${n}+`, null, 0, null]
  } else if (t === 5) return [`mov.l @(${lo * 4},r${m}),r${n}`, null, 0, null]
  else if (t === 6) return [nm(NM_6[lo]), null, 0, null]
  else if (t === 7) return [`add #${s8(w & 0xff)},r${n}`, null, 0, null]
  else if (t === 8) {
    const d = w & 0xff
    if (n === 0) return [`mov.b r0,@(${lo},r${m})`, null, 0, null]
    if (n === 1) return [`mov.w r0,@(${lo * 2},r${m})`, null, 0, null]
    if (n === 4) return [`mov.b @(${lo},r${m}),r0`, null, 0, null]
    if (n === 5) return [`mov.w @(${lo * 2},r${m}),r0`, null, 0, null]
    if (n === 8) return [`cmp/eq #${s8(d)},r0`, null, 0, null]
    if (n === 9 || n === 0xb || n === 0xd || n === 0xf) return [({ 9: 'bt', 0xb: 'bf', 0xd: 'bt/s', 0xf: 'bf/s' } as Record<number, string>)[n], null, 0, pc + 4 + s8(d) * 2]
  } else if (t === 9) { const a = pc + 4 + (w & 0xff) * 2; return [`mov.w @(0x${a.toString(16)},pc),r${n}`, a, 2, null] }
  else if (t === 0xa || t === 0xb) return [t === 0xa ? 'bra' : 'bsr', null, 0, pc + 4 + s12(w & 0xfff) * 2]
  else if (t === 0xc) {
    const d = w & 0xff, k = n
    if (k <= 2) return [`mov.${'bwl'[k]} r0,@(${d << k},gbr)`, null, 0, null]
    if (k === 3) return [`trapa #${d}`, null, 0, null]
    if (k >= 4 && k <= 6) return [`mov.${'bwl'[k - 4]} @(${d << (k - 4)},gbr),r0`, null, 0, null]
    if (k === 7) { const a = ((pc & ~3) >>> 0) + 4 + d * 4; return [`mova @(0x${(a >>> 0).toString(16)},pc),r0`, null, 0, a] }
    return [['tst #%,r0', 'and #%,r0', 'xor #%,r0', 'or #%,r0', 'tst.b #%,@(r0,gbr)', 'and.b #%,@(r0,gbr)', 'xor.b #%,@(r0,gbr)', 'or.b #%,@(r0,gbr)'][k - 8].replace('%', String(d)), null, 0, null]
  } else if (t === 0xd) { const a = ((pc & ~3) >>> 0) + 4 + (w & 0xff) * 4; return [`mov.l @(0x${(a >>> 0).toString(16)},pc),r${n}`, a, 4, null] }
  else if (t === 0xe) return [`mov #${s8(w & 0xff)},r${n}`, null, 0, null]
  else if (t === 0xf) {
    if (lo in FPU) return [FPU[lo].replace('M', String(m)).replace('N', String(n)), null, 0, null]
    if (lo === 0xd) {
      if (m in FPU_D) return [FPU_D[m].replace('N', String(n)), null, 0, null]
      if (m === 0xe) return [`fipr fv${(n & 3) * 4},fv${(n >> 2) * 4}`, null, 0, null]
      if (m === 0xf && (n & 3) === 1) return [`ftrv xmtrx,fv${(n >> 2) * 4}`, null, 0, null]
    }
  }
  return [`.word 0x${hex(w, 4)}`, null, 0, null]
}

export interface Line { pc: number; word: string; text: string; note: string; label?: string; data?: boolean }

/** The lines of [start, end): instructions, the pool words the range loads as data, names as labels and notes. */
export function disassemble(exe: Uint8Array, base0: number, start: number, end: number, names: Map<number, string>): Line[] {
  const base = ((base0 & 0x1fffffff) | (start & 0xe0000000)) >>> 0   // the executable's base in the mirror the addresses use
  const dv = new DataView(exe.buffer, exe.byteOffset, exe.byteLength)
  const inExe = (a: number, n: number) => a >= base && a - base + n <= exe.length
  const u16 = (a: number) => dv.getUint16(a - base, true), i16 = (a: number) => dv.getInt16(a - base, true)
  const u32 = (a: number) => dv.getUint32(a - base, true), f32 = (a: number) => dv.getFloat32(a - base, true)
  const name = (v: number) => names.get(v >>> 0) || names.get(((v & 0x1fffffff) | (base & 0xe0000000)) >>> 0)
  const loads = new Map<number, [number, number]>()
  const first = (start & ~1) >>> 0                         // unsigned: addresses at 0x8C... have the top bit set
  for (let pc = first; pc < end; pc += 2) {
    if (!inExe(pc, 2)) continue
    const [, pool, size] = decode(u16(pc), pc)
    if (pool !== null) loads.set(pc, [pool, size])
  }
  // Data decoded as instructions can look like loads too: a load inside a pool word does not count; repeat until stable.
  let pools = new Map<number, number>()
  for (;;) {
    const covered = new Set<number>()
    for (const [p, z] of pools) for (let k = 0; k < z; k += 2) covered.add(p + k)
    const next = new Map<number, number>()
    for (const [pc, [pool, size]] of loads) if (!covered.has(pc)) next.set(pool, Math.max(size, next.get(pool) || 0))
    const same = next.size === pools.size && [...next].every(([k, v]) => pools.get(k) === v)
    pools = next
    if (same) break
  }
  const out: Line[] = []
  for (let pc = first; pc < end; pc += 2) {
    if (!inExe(pc, 2)) break
    const pz = pools.get(pc)
    if (pz && inExe(pc, pz)) {
      if (pz === 4) {
        const v = u32(pc), nm = name(v)
        out.push({ pc, word: hex(v), text: '.long 0x' + hex(v), note: nm || '', data: true })
        pc += 2
      } else out.push({ pc, word: hex(u16(pc), 4), text: '.word ' + i16(pc), note: '', data: true })
      continue
    }
    const w = u16(pc)
    let [text] = decode(w, pc)
    const [, pool, size, target] = decode(w, pc)
    let note = ''
    if (pool !== null && inExe(pool, size)) {
      if (size === 2) { const v = i16(pool); note = `=${v} (0x${(v & 0xffff).toString(16)})` }
      else { const v = u32(pool), f = f32(pool); note = '=' + hex(v) + ' ' + (name(v) || (Math.abs(f) > 1e-6 && Math.abs(f) < 1e7 ? `(${+f.toPrecision(6)})` : '')) }
    } else if (target !== null) {
      if (!text.startsWith('mova')) text += ' 0x' + hex(target)
      note = name(target) || ''
    }
    out.push({ pc, word: hex(w, 4), text, note: note.trim(), label: names.get(pc) })
  }
  return out
}
