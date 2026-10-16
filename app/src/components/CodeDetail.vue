<script setup lang="ts">
// A function: its C (when the decomp has it) beside the original code, disassembled from the disc with the decomp's
// names; its status and test cases on the side.
import { computed, ref, watch } from 'vue'
import DetailHead from './DetailHead.vue'
import UiSpinner from './ui/UiSpinner.vue'
import UiPill from './ui/UiPill.vue'
import UiInfoTip from './ui/UiInfoTip.vue'
import { S, codeNames, decompFile, executable, exeBase } from '../state'
import { disassemble, type Line } from '../lib/shdis'
import { cTypes, highlightAsm, highlightC } from '../lib/highlight'
import type { Item } from '../lib/dcgs'

const props = defineProps<{ m: Item }>()
const fn = computed(() => props.m.fn!)
const lines = ref<Line[] | null>(null)
watch(() => props.m.id, async (id) => {
  lines.value = null
  const exe = await executable()
  if (props.m.id !== id) return
  await new Promise((r) => setTimeout(r, 0))                 // let the spinner show before a long listing
  const f = fn.value
  lines.value = disassemble(exe, exeBase.value, f.addr, f.addr + f.size, codeNames.value)
}, { immediate: true })
// One highlighted block each (a big function is thousands of lines).
const listing = computed(() => highlightAsm(lines.value || []))
const cHtml = computed(() => {
  const file = S.map && S.map.code ? S.map.code.sources.get(fn.value.file) || '' : ''
  return highlightC(fn.value.c, { types: cTypes(file), globals: new Set(codeNames.value.values()) })
})
/* ── Test cases: the inputs each case gives the function (registers, memory, a RAM dump, what its calls return) ── */
interface Case { set: string; about: string; regs: [string, string][]; poke: [string, string][]; dump: string; sr: string; calls: string[] }
const cases = ref<{ file: string; list: Case[] }[] | null>(null)
const shortHex = (v: string) => v.replace(/^0+(?=.)/, '')
function readCase(c: Record<string, unknown>, set: string): Case {
  const regs = Object.entries((c.regs as Record<string, string | number>) || {}).map(([k, v]) => [k, typeof v === 'number' ? String(v) : shortHex(String(v))] as [string, string])
  const poke = Object.entries((c.poke as Record<string, string>) || {}).map(([a, b]) => [a.toUpperCase(), b] as [string, string])
  const calls = ((c.calls as Record<string, unknown>[]) || []).map((k) => Object.entries(k).map(([r, v]) => (r === 'poke_arg' ? 'Fills ' + Object.keys(v as object).join(', ') : r + ' = ' + (typeof v === 'number' ? v : shortHex(String(v))))).join(', ') || 'Returns Nothing')
  return { set, about: String(c.about || ''), regs, poke, dump: String(c.dump || ''), sr: c.sr ? String(c.sr) : '', calls }
}
watch(() => props.m.id, async (id) => {
  cases.value = null
  const out = []
  for (const path of fn.value.cases) {
    const text = await decompFile(path)
    if (props.m.id !== id) return
    let data: unknown = null
    try { data = text ? JSON.parse(text) : null } catch { data = null }
    const list: Case[] = Array.isArray(data) ? data.map((c) => readCase(c, ''))
      : data && typeof data === 'object' ? [...(((data as Record<string, unknown[]>).dev) || []).map((c) => readCase(c as Record<string, unknown>, 'Dev')),
        ...(((data as Record<string, unknown[]>).holdout) || []).map((c) => readCase(c as Record<string, unknown>, 'Holdout'))] : []
    out.push({ file: path, list })
  }
  cases.value = out
}, { immediate: true })
// Dev and Holdout side by side; a plain list (no split) shares the two columns.
const columns = computed(() => {
  const all = (cases.value || []).flatMap((f) => f.list)
  if (all.some((c) => c.set)) return ['Dev', 'Holdout'].map((set) => ({ set, list: all.filter((c) => c.set === set) })).filter((c) => c.list.length)
  const half = Math.ceil(all.length / 2)
  return [{ set: '', list: all.slice(0, half) }, { set: '', list: all.slice(half) }].filter((c) => c.list.length)
})
// The decomp's name of a memory address (any mirror), for the cases' pokes.
const addrName = (a: string) => { const v = parseInt(a, 16); return codeNames.value.get(v >>> 0) || codeNames.value.get(((v & 0x1fffffff) | 0x80000000) >>> 0) || codeNames.value.get((v & 0x1fffffff) >>> 0) || '' }
const escH = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
// "r0 = 1, fills r7" -> coloured registers and values
const callHtml = (k: string) => escH(k).replace(/\b(f?r\d+)\b/g, '<span class="hl-register">$1</span>').replace(/= (-?[0-9A-Fa-f.]+)/g, '= <span class="hl-number">$1</span>')
const jump = (to: string) => document.getElementById('code-' + to)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
const hex = (n: number) => '0x' + n.toString(16).toUpperCase().padStart(8, '0')
const caseName = (p: string) => p.split('/').slice(-2).join('/')
</script>

<template>
  <div class="detail detail-wide">
    <DetailHead :m="m" :ref-text="hex(fn.addr)" />
    <div class="code-facts card"><div class="card-b"><dl class="facts facts-row">
      <div><dt>Status</dt><dd>{{ fn.status }}</dd></div>
      <div><dt>Address</dt><dd class="mono"><a class="jump" href="#" @click.prevent="jump('original')">{{ hex(fn.addr) }}</a></dd></div>
      <div><dt>Size</dt><dd class="mono">{{ fn.size.toLocaleString('en-US') }} B</dd></div>
      <div><dt>Source</dt><dd class="mono"><a v-if="fn.file" class="jump" href="#" @click.prevent="jump('c')">src/{{ fn.file }}</a><template v-else>None yet</template></dd></div>
      <div><dt>Test Cases</dt><dd class="mono"><a v-if="fn.cases.length" class="jump" href="#" @click.prevent="jump('cases')">{{ fn.cases.map(caseName).join(', ') }}</a><template v-else>None</template></dd></div>
    </dl></div></div>
    <div class="code-panes">
      <section id="code-c" class="card code-pane" aria-label="C">
        <div class="card-h"><span class="card-t">C</span></div>
        <pre v-if="fn.c" class="code" v-html="cHtml"></pre>
        <div v-else class="notex code-empty">This function has no C yet.</div>
      </section>
      <section id="code-original" class="card code-pane" aria-label="Original code">
        <div class="card-h"><span class="card-t">Original</span><span class="card-meta">SH-4, from the disc</span></div>
        <div v-if="!lines" class="code-empty loading" role="status"><UiSpinner :size="16" /><span>Disassembling</span></div>
        <pre v-else class="code asm" v-html="listing"></pre>
      </section>
    </div>
    <section v-if="fn.cases.length" id="code-cases" class="card cases" aria-label="Test cases">
      <div class="card-h"><span class="card-t">Test Cases</span><span class="card-meta">{{ fn.cases.join(', ') }}</span></div>
      <div v-if="!cases" class="code-empty loading" role="status"><UiSpinner :size="16" /><span>Reading the Cases</span></div>
      <div v-else class="case-cols">
        <div v-for="col in columns" :key="col.set" class="case-col">
          <div v-if="col.set" class="case-col-h">
            <UiPill :tone="col.set === 'Holdout' ? 'ok' : 'warn'">{{ col.set }}</UiPill>
            <UiInfoTip>{{ col.set === 'Holdout'
              ? 'Written after the C already passed the dev cases, so the C was never adjusted to fit them. Passing these is the stronger evidence that it behaves like the original.'
              : 'Written while the C was being made to behave like the original: the C was adjusted until these pass.' }}</UiInfoTip>
            <span class="case-col-n">{{ col.list.length }} {{ col.list.length === 1 ? 'Case' : 'Cases' }}</span>
          </div>
          <ol class="case-list">
            <li v-for="(c, i) in col.list" :key="i" class="case">
              <div class="case-h"><span class="case-n">#{{ i + 1 }}</span><span class="case-about">{{ c.about || 'Case ' + (i + 1) }}</span></div>
              <dl class="case-in">
                <div v-if="c.dump"><dt>Starts From</dt><dd class="mono"><span class="hl-string">{{ c.dump }}</span></dd></div>
                <div v-if="c.regs.length"><dt>Registers</dt><dd class="mono"><span v-for="[k, v] in c.regs" :key="k" class="poke"><span class="hl-register">{{ k }}</span> = <span class="hl-number">{{ v }}</span></span></dd></div>
                <div v-if="c.sr"><dt>SR</dt><dd class="mono"><span class="hl-number">{{ c.sr }}</span></dd></div>
                <div v-if="c.poke.length"><dt>Memory</dt><dd class="mono"><span v-for="[a, b] in c.poke" :key="a" class="poke"><span v-if="addrName(a)" class="hl-global">{{ addrName(a) }} </span><span class="hl-number">{{ a }}</span> ← <span class="hl-string">{{ b }}</span></span></dd></div>
                <div v-if="c.calls.length"><dt>Calls Return</dt><dd class="mono"><span v-for="(k, j) in c.calls" :key="j" class="poke"><span class="case-call">{{ j + 1 }}</span> <span v-html="callHtml(k)"></span></span></dd></div>
                <div v-if="!c.dump && !c.regs.length && !c.poke.length && !c.calls.length"><dt>Inputs</dt><dd>None (the function starts from the executable as loaded)</dd></div>
              </dl>
            </li>
          </ol>
        </div>
      </div>
    </section>
  </div>
</template>
