// The decomp's map of the game (model-map/game.dcgs) and its curated rules (models.txt), turned into the page's items.

import type { Fn } from './code'

export type Kind = 'models' | 'skeletons' | 'textures' | 'images' | 'audio' | 'text' | 'code'
export type Row = Record<string, string>
export type Mat = number[]                       // 3x4, row by row

export interface Bone { id: number; parent: number | null; part: string; off: number[] }
// A skeleton from the map's [rigs] and [bones]: a bone rig shares one tree (sub ''), a node tree has one per character.
export interface Rig {
  name: string; kind: string; group: string
  motionFile: string; motionFormat: string; poseOffset: string; poseRecord: number
  trees: Map<string, Bone[]>; chars: string[]
  motionBones: { order: number; off: number[] }[]                 // e16: the motion skeleton
  poses: { node: number; parent: string; steps: string[] }[]     // e16: how each node's matrix is built (parents first)
  scales: Map<string, number>                                     // e16: per character (sub)
  welds: Map<string, Weld[]>                                      // node trees: per character, in drawing order
}
// A node's vertex that takes its source node's vertex position (vertices as byte offsets in the model file).
export interface Weld { node: number; src: number; srcVertex: number; dstVertex: number }
export interface Assembly { group: string; sub: string; parts: { id: string; name: string; m: Mat }[] }

export interface Item {
  id: string
  kind: Kind
  group: string
  sub: string
  subLabel: string
  subKey?: string
  name: string
  hex?: string
  named?: boolean
  table?: string
  texset?: string                 // the texture set the model takes its textures from ('' = its file's own)
  num?: number
  // models
  records?: number
  bytes?: number
  radius?: number
  textures?: number[]
  asm?: boolean
  hidden?: boolean                // a plugin asked to hide it by default (the list's toggle shows it)
  // textures
  row?: Row
  w?: number
  h?: number
  // sounds
  ref?: string
  dur?: string
  bank?: boolean
  file?: string
  // skeletons
  rig?: Rig
  // code
  fn?: Fn
  // images (the map's [images])
  pic?: Picture
  // skeletons of a Ninja model with motions of its own object count: the model's id
  ninja?: string
}
// A picture of the disc: where it is, its kind ('pvr' textures are decoded here; GIF, JPEG and PNG shown as they are).
export interface Picture { file: string; offset: number; kind: 'pvr' | 'gif' | 'jpg' | 'png' | 'tr4'; w: number; h: number; pf: number; dt: number; bytes: number; name: string }

const folderOf = (file: string) => (file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : 'Root')
const stemOf = (file: string) => file.slice(file.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '')
/** The map's pictures ([images]) as items. A file holding several pictures is its own group; single pictures are grouped by
 * folder. Both are sub-grouped by size. */
function addImageItems(out: Built, rows: Row[] | undefined) {
  const many = new Map<string, number>(), nth = new Map<string, number>()
  for (const r of rows || []) many.set(r.file.toUpperCase(), (many.get(r.file.toUpperCase()) || 0) + 1)
  for (const r of rows || []) {
    const file = r.file.toUpperCase(), n = nth.get(file) || 0, multi = many.get(file)! > 1, w = Number(r.width), h = Number(r.height), off = parseInt(r.offset, 16)
    nth.set(file, n + 1)
    const pic: Picture = { file, offset: off, kind: r.kind as Picture['kind'], w, h, pf: Number(r.format), dt: parseInt(r.type, 16), bytes: Number(r.bytes), name: tidy(r.name || '') }
    out.items.push({ id: 'img:' + file + ':' + off.toString(16), kind: 'images', group: multi ? file : folderOf(file), sub: w + ' x ' + h, subLabel: '',
      subKey: String(w).padStart(5, '0') + String(h).padStart(5, '0'), name: pic.name || (multi ? '' : stemOf(file)),
      hex: multi ? '#' + (n + 1) : '', named: true, num: multi ? n : 0, w, h, pic })
  }
}

export interface Dcgs { version: string; sha: string; base: number; sections: Record<string, Row[]> }

// The naming convention (the decomp's tools/model_map.py applies the same): words separated by single spaces (underscores and
// camelCase become spaces), each starting with a capital, no parentheses. Ids (hex offsets, table addresses) are not names.
export const tidy = (t: string) => t.replace(/[()[\]]/g, '').replace(/_/g, ' ').replace(/([a-z0-9])(?=[A-Z])/g, '$1 ')
  .split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
// What a row shows: the name when there is one, else the id; the id beside the name, muted.
export const nameOf = (m: Item) => m.name || m.hex || m.id

// Reader 1: the map as tab-separated sections.
function readV1(text: string): Dcgs {
  const out: Dcgs = { version: '', sha: '', base: 0, sections: {} }
  let rows: Row[] | null = null, head: string[] | null = null
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    if (line[0] === '#') {
      const v = line.match(/^# dcgs (\S+)\s*$/); if (v) out.version = v[1]
      const m = line.match(/^# sha1 (\w+)/); if (m) out.sha = m[1]
      const b = line.match(/^# base ([0-9A-Fa-f]+)/); if (b) out.base = parseInt(b[1], 16)
      continue
    }
    const sec = line.match(/^\[(\w+)\]$/)
    if (sec) { rows = out.sections[sec[1]] = []; head = null; continue }
    if (!rows) continue
    const c = line.split('\t')
    if (!head) { head = c; continue }
    const r: Row = {}; head.forEach((k, i) => (r[k] = c[i] || ''))
    rows.push(r)
  }
  return out
}

/** Everything one load produces: the items of every kind and the lookups the detail panes need. */
export interface Built {
  items: Item[]
  asm: Map<string, Assembly>
  tex: Map<string, Row>
  rigs: Map<string, Rig>
  motionNames: Map<string, string>   // 'FILE:offset hex' -> name, from `motion` rules
}

export const PF = ['ARGB1555', 'RGB565', 'ARGB4444', 'YUV422', 'Bump', '4-bit palette', '8-bit palette']
export const DT: Record<number, string> = { 1: 'Twiddled', 2: 'Twiddled, mipmapped', 3: 'VQ', 4: 'VQ, mipmapped', 5: '4-bit palette', 6: '4-bit palette, mipmapped',
  7: '8-bit palette', 8: '8-bit palette, mipmapped', 9: 'Rectangle', 13: 'Twiddled rectangle', 16: 'Small VQ', 17: 'Small VQ, mipmapped', 18: 'Twiddled, mipmapped' }
const fmtDur = (sec: number) => (sec >= 60 ? Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0') : sec.toFixed(1) + ' s')

// A texture of the map: by model file, texture set ('' for the file's own list) and number.
export const texKey = (file: string, set: string, n: string | number) => file.toUpperCase() + ':' + set + ':' + n

export function build(models: Item[], sec: Record<string, Row[]>, rules: string, extra: Item[] = [], ninjaRigs: { id: string; motions: number }[] = []): Built {
  const items = models
  const out: Built = { items, asm: new Map(), tex: new Map(), rigs: new Map(), motionNames: new Map() }
  for (const m of items) { m.kind = 'models'; m.hex = m.name; m.name = ''; m.subLabel = '' }
  applyNames(items, sec.models)
  applyRules(items, rules)
  addAssemblies(out, sec.assemblies)
  for (const r of sec.textures || []) out.tex.set(texKey(r.file, r.set || '', r.number), r)
  addTextureItems(out)
  addSoundItems(out, sec.audio)
  addImageItems(out, sec.images)
  addSkeletonItems(out, sec.rigs, sec.bones, sec)
  for (const t of (rules || '').split(/\r?\n/).map((l) => l.trim().split(/\s+/))) {
    if (t[0] === 'motion' && t.length >= 4) out.motionNames.set(t[1].toUpperCase() + ':' + parseInt(t[2], 16).toString(16), tidy(t.slice(3).join(' ')))
  }
  applyRules(items, rules)                                    // again: the rules also name sounds and images
  items.push(...extra)
  addNinjaSkeletons(out, ninjaRigs)
  sortItems(items)
  return out
}

// A Ninja model that has motions is a skeleton: its object tree is the bones, the motions its animations. Listed beside the model, named as it is.
function addNinjaSkeletons(out: Built, rigs: { id: string; motions: number }[]) {
  const byId = new Map(out.items.filter((m) => m.kind === 'models').map((m) => [m.id, m]))
  for (const r of rigs) {
    const m = byId.get(r.id)
    if (!m) continue
    out.items.push({ id: 'nsk:' + m.id, kind: 'skeletons', group: m.group, sub: m.sub, subLabel: m.subLabel, subKey: m.subKey, name: m.name, hex: m.hex, named: m.named,
      ninja: m.id, records: m.records, bytes: m.bytes, radius: m.radius, num: r.motions })
  }
}

function applyNames(items: Item[], rows: Row[] | undefined) {
  const byId = new Map((rows || []).map((r) => [r.file.toUpperCase() + ':' + r.offset, r]))
  for (const m of items) {
    const r = byId.get(m.id)
    if (r && r.bytes === String(m.bytes)) m.texset = r.texset || ''
    if (r && r.bytes === String(m.bytes) && (r.group || r.name)) {
      m.group = r.group || m.group; m.sub = r.sub || m.sub; m.subLabel = r.sublabel || ''; m.name = r.name || ''; m.named = true; m.table = r.table
    }
  }
}

// An assembly is a set of model parts, each placed by a 3x4 matrix. One list entry per group and sub-group.
function addAssemblies(out: Built, rows: Row[] | undefined) {
  const byId = new Map(out.items.map((m) => [m.id, m]))
  for (const r of rows || []) {
    const part = byId.get(r.file.toUpperCase() + ':' + r.offset)
    if (!part) continue
    const key = r.group + '|' + r.sub
    if (!out.asm.has(key)) out.asm.set(key, { group: r.group, sub: r.sub, parts: [] })
    out.asm.get(key)!.parts.push({ id: part.id, name: r.part, m: ['m00', 'm01', 'm02', 'm03', 'm10', 'm11', 'm12', 'm13', 'm20', 'm21', 'm22', 'm23'].map((k) => Number(r[k])) })
  }
  for (const [key, a] of out.asm) {
    const ps = a.parts.map((p) => byId.get(p.id)!)
    out.items.push({ id: 'asm:' + key, kind: 'models', group: a.group, sub: a.sub, subLabel: (ps[0] && ps[0].subLabel) || '', name: 'Assembled', named: true, asm: true,
      records: a.parts.length, bytes: ps.reduce((n, m) => n + (m.bytes || 0), 0), radius: Math.max(...ps.map((m) => m.radius || 0)) })
  }
}

// Textures: one item per texture of the map, by texture file and size.
function addTextureItems(out: Built) {
  for (const [key, r] of out.tex) {
    const num = Number(r.number), w = Number(r.width), h = Number(r.height)
    out.items.push({ id: 'tex:' + key, kind: 'textures', group: r.texture_file, sub: w + ' x ' + h, subLabel: '',
      subKey: String(w).padStart(5, '0') + String(h).padStart(5, '0'), name: '#' + num, num, named: true, row: r, w, h })
  }
}

// Sounds: one item per sound of the map, by archive and hundreds of entries (a sound bank is one item).
function addSoundItems(out: Built, rows: Row[] | undefined) {
  for (const r of rows || []) {
    if (r.format === 'unknown') continue                       // an archive entry that is not audio (a motion, a model): not a sound
    const i = Number(r.index), bank = !['ADX', 'WAV', 'STR'].includes(r.format), lo = Math.floor(i / 100) * 100, file = r.file.toUpperCase()
    out.items.push({ id: 'snd:' + file + ':' + r.index, kind: 'audio', ref: file + ':' + r.index, group: file, sub: bank ? 'Sound bank' : '#' + lo + ' to #' + (lo + 99),
      subLabel: '', subKey: bank ? '0' : String(lo + 1).padStart(6, '0'), name: tidy(r.name || ''), hex: bank ? r.format : '#' + i, named: !!r.name || !bank,
      num: i, row: r, dur: !bank && r.seconds ? fmtDur(Number(r.seconds)) : '', bank, file })
  }
}

// Skeletons: one item per rig of the map with assembled characters; its bones from [bones].
const partKey = (t: string) => t.replace(/_/g, ' ').trim().toLowerCase()
function addSkeletonItems(out: Built, rigs: Row[] | undefined, bones: Row[] | undefined, sec: Record<string, Row[]>) {
  for (const r of rigs || []) {
    const rig: Rig = { name: r.rig, kind: r.kind, group: r.group, motionFile: (r.motion_file || '').toUpperCase(), motionFormat: r.motion_format || '',
      poseOffset: (r.pose_offset || '').toLowerCase(), poseRecord: Number(r.pose_record) || 1, trees: new Map(), chars: [],
      motionBones: (sec.motionbones || []).filter((b) => b.rig === r.rig).sort((a, b) => Number(a.bone) - Number(b.bone)).map((b) => ({ order: Number(b.order), off: [Number(b.x), Number(b.y), Number(b.z)] })),
      poses: (sec.poses || []).filter((p) => p.rig === r.rig).map((p) => ({ node: Number(p.node), parent: p.parent, steps: p.steps.split(/\s+/).filter(Boolean) })),
      scales: new Map((sec.scales || []).filter((x) => x.rig === r.rig).map((x) => [x.sub, Number(x.scale)] as [string, number])), welds: new Map() }
    for (const w of sec.welds || []) {
      if (w.rig !== r.rig) continue
      if (!rig.welds.has(w.sub)) rig.welds.set(w.sub, [])
      rig.welds.get(w.sub)!.push({ node: Number(w.node), src: Number(w.src_node), srcVertex: parseInt(w.src_vertex, 16), dstVertex: parseInt(w.dst_vertex, 16) })
    }
    for (const b of bones || []) {
      if (b.rig !== r.rig) continue
      if (!rig.trees.has(b.sub)) rig.trees.set(b.sub, [])
      rig.trees.get(b.sub)!.push({ id: Number(b.bone), parent: b.parent === '' ? null : Number(b.parent), part: b.part, off: [Number(b.x), Number(b.y), Number(b.z)] })
    }
    rig.chars = [...out.asm.keys()].filter((k) => out.asm.get(k)!.group === rig.group)
    if (!rig.trees.size || !rig.chars.length) continue
    out.rigs.set(rig.name, rig)
    out.items.push({ id: 'rig:' + rig.name, kind: 'skeletons', group: 'Rigs', sub: rig.group, subLabel: '', name: tidy(rig.name), named: true, num: 0, rig })
  }
}
/** The bones of one character (a node tree's own tree, or the rig's shared one). */
export const bonesOf = (r: Rig, asmKey: string): Bone[] => r.trees.get(asmKey.slice(asmKey.indexOf('|') + 1)) || r.trees.get('') || []
export const boneName = (b: Bone) => (/^\d+$/.test(b.part) ? 'Node ' + b.part : tidy(b.part)) || (b.parent === null ? 'Root' : 'Bone ' + b.id)
// A bone's joint is where its part is placed (the translation of the part's matrix); a bone without a part sits on its
// first placed child, else on its parent.
export function joints(bones: Bone[], a: Assembly): Map<number, number[]> {
  const pos = new Map<number, number[]>()
  for (const b of bones) {
    const p = b.part ? a.parts.find((x) => partKey(x.name) === partKey(b.part)) : undefined
    if (p) pos.set(b.id, [p.m[3], p.m[7], p.m[11]])
  }
  for (let pass = 0; pass < bones.length; pass++) {
    for (const b of bones) {
      if (pos.has(b.id)) continue
      const c = bones.find((x) => x.parent === b.id && pos.has(x.id))
      const q = c ? pos.get(c.id) : b.parent !== null ? pos.get(b.parent) : undefined
      if (q) pos.set(b.id, q)
    }
  }
  return pos
}
/** The bone a placed part follows. */
export const boneOfPart = (bones: Bone[], part: string) => bones.find((b) => b.part && partKey(b.part) === partKey(part))?.id

// models.txt rules the page understands, applied over game.dcgs so a rename shows without regenerating it.
function applyRules(items: Item[], text: string) {
  if (!text) return
  const byId = new Map(items.map((m) => [m.id, m]))
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim().split(/\s+/)
    if (t[0] === 'name' && t.length >= 4) {
      const m = byId.get(t[1].toUpperCase() + ':' + parseInt(t[2], 16).toString(16))
      if (m) { m.name = tidy(t.slice(3).join(' ')); m.named = true }
    } else if (t[0] === 'sound' && t.length >= 4) {
      const m = byId.get('snd:' + t[1].toUpperCase() + ':' + parseInt(t[2], 10))
      if (m) { m.name = tidy(t.slice(3).join(' ')); m.named = true }
    } else if (t[0] === 'image' && t.length >= 4) {
      const m = byId.get('img:' + t[1].toUpperCase() + ':' + parseInt(t[2], 16).toString(16))
      if (m) { m.name = tidy(t.slice(3).join(' ')); m.named = true }
    } else if (t[0] === 'note' && t.length >= 5) {      // note <group> <first id> <last id> <text>: names sub-groups first..last
      const g = t[1], lo = parseInt(t[2], 16), hi = parseInt(t[3], 16), text = tidy(t.slice(4).join(' '))      // the group as written (spaces as _), not tidied: it is a file name
      for (const m of items) if (m.kind === 'models' && (m.group === g || m.group.replace(/ /g, '_') === g) && /^0x[0-9a-f]+$/i.test(m.sub) && parseInt(m.sub, 16) >= lo && parseInt(m.sub, 16) <= hi) m.subLabel = text
    } else if (t[0] === 'table' && t.length >= 4) {
      const addr = t[1].toUpperCase().padStart(8, '0')
      for (const m of items) if (m.table === addr) { m.group = tidy(t[2]); m.subLabel = tidy(t[3]); m.named = true }
    }
  }
}

// Groups: known tables, raw tables, then plain files. Groups and sub-groups sort as text, items by number or hex offset.
function sortItems(items: Item[]) {
  const rank = (m: Item) => (!m.named ? 2 : m.group === 'Tables' ? 1 : 0)
  const nat = (x: string, y: string) => { x = String(x).toLowerCase(); y = String(y).toLowerCase(); return x < y ? -1 : x > y ? 1 : 0 }
  const off = (m: Item) => (m.num !== undefined ? m.num : parseInt(m.id.slice(m.id.lastIndexOf(':') + 1), 16))
  items.sort((a, b) => rank(a) - rank(b) || nat(a.group, b.group) || nat(a.subKey || a.sub, b.subKey || b.sub)
    || (b.asm ? 1 : 0) - (a.asm ? 1 : 0) || (a.asm ? 0 : off(a) - off(b)))
}

// A sub-group's name (`note <group> <id> <id> <text>`, key = "<group> <id>"): the line naming exactly that sub-group is
// replaced where it stands (curated notes keep their place and comments), or removed given no text; a new one goes in a
// block at the end.
const NOTE_HEAD = '# Sub-groups, named by group and id (added by the viewer).'
async function writeNote(fh: FileSystemFileHandle, lines: string[], key: string, rest: string) {
  const [group, id] = key.split(' '), n = parseInt(id, 16)
  const mine = (l: string) => { const t = l.trim().split(/\s+/); return t[0] === 'note' && t[1] === group && parseInt(t[2], 16) === n && parseInt(t[3], 16) === n }
  const line = 'note ' + group + ' ' + id + ' ' + id + ' ' + rest.replace(/[\r\n]+/g, ' ').trim().replace(/ /g, '_')
  const at = lines.findIndex(mine)
  let out = lines.slice()
  if (at >= 0) { if (rest.trim()) out[at] = line; else out.splice(at, 1) }
  else if (rest.trim()) {
    while (out.length && out[out.length - 1] === '') out.pop()
    if (!out.includes(NOTE_HEAD)) out.push('', NOTE_HEAD)
    out.push(line)
  }
  out = out.join('\n').replace(/\n*$/, '\n').split('\n')
  const w = await fh.createWritable()
  await w.write(out.join('\n'))
  await w.close()
}

// Writes one rule into models.txt (or removes it, given no text) and keeps the page's rules sorted: every name / table / sound line is gathered into
// blocks at the end of the file; the rest of the file is left as it is.
const NAME_HEAD = '# Single models, named by file and offset (kept sorted by the viewer).'
const TABLE_HEAD = '# Tables, put under a group and label (kept sorted by the viewer).'
const SOUND_HEAD = '# Sounds, named by file and entry (kept sorted by the viewer).'
const MOTION_HEAD = '# Motions, named by file and offset (kept sorted by the viewer).'
const IMAGE_HEAD = '# Pictures, named by file and offset (kept sorted by the viewer).'
export async function writeRule(dir: FileSystemDirectoryHandle, kind: 'name' | 'table' | 'sound' | 'motion' | 'image' | 'note', key: string, rest: string) {
  const fh = await dir.getFileHandle('models.txt', { create: true })
  const lines = (await (await fh.getFile()).text()).split('\n')
  if (kind === 'note') return writeNote(fh, lines, key, rest)
  const ruleKey = (l: string) => {
    const t = l.trim().split(/\s+/)
    return t[0] === 'name' || t[0] === 'motion' || t[0] === 'image' ? t[0] + ' ' + t[1].toUpperCase() + ' ' + parseInt(t[2], 16)
      : t[0] === 'sound' ? 'sound ' + t[1].toUpperCase() + ' ' + parseInt(t[2], 10) : 'table ' + t[1].toUpperCase().padStart(8, '0')
  }
  const isRule = (l: string) => /^(name|table|sound|motion|image)\s/.test(l)
  const rules = new Map(lines.filter(isRule).map((l) => [ruleKey(l), l.trim()]))
  const line = kind + ' ' + key + ' ' + rest.replace(/[\r\n]+/g, ' ').trim()
  if (rest.trim()) rules.set(ruleKey(line), line); else rules.delete(ruleKey(line))   // an empty name removes the rule
  const isHead = (l: string) => l.startsWith('# Single models, named by file and offset') || l.startsWith('# Tables, put under a group and label')
    || l.startsWith('# Sounds, named by file and entry') || l.startsWith('# Motions, named by file and offset') || l.startsWith('# Pictures, named by file and offset')
  const body = lines.filter((l) => !isRule(l) && !isHead(l))
  while (body.length && body[body.length - 1] === '') body.pop()
  const order = (k: string, v: string): [string, number] => (k.startsWith('name') || k.startsWith('motion') || k.startsWith('image') ? [v.split(/\s+/)[1].toUpperCase(), parseInt(v.split(/\s+/)[2], 16)]
    : k.startsWith('sound') ? [v.split(/\s+/)[1].toUpperCase(), parseInt(v.split(/\s+/)[2], 10)] : [v.split(/\s+/)[1].toUpperCase(), 0])
  const sorted = (prefix: string) => [...rules].filter(([k]) => k.startsWith(prefix)).sort((x, y) => {
    const a = order(...x), b = order(...y); return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]
  }).map(([, v]) => v)
  const out = body.slice()
  const n = sorted('name '), tb = sorted('table '), sn = sorted('sound '), mo = sorted('motion '), im = sorted('image ')
  if (n.length) out.push('', NAME_HEAD, ...n)
  if (sn.length) out.push('', SOUND_HEAD, ...sn)
  if (mo.length) out.push('', MOTION_HEAD, ...mo)
  if (im.length) out.push('', IMAGE_HEAD, ...im)
  if (tb.length) out.push('', TABLE_HEAD, ...tb)
  const w = await fh.createWritable()
  await w.write(out.join('\n') + '\n')
  await w.close()
}

/* ── Readers by version ─────────────────────────────────────
   A map's first line, `# dcgs <version>`, is the version of the skill that wrote it (vX.Y, vX.Y+<commit>, or
   `unstable` for the skill's main branch). Every version from FLOOR up is read; a change that is not backwards
   compatible adds a reader from the version that brings it. Older projects are upgraded with the skill, not read.
   FLOOR is v0.6 now and becomes v1.0 when Shuriken Explorer goes live.                                           */
const FLOOR = [0, 6]
const READERS: { from: number[]; read: (text: string) => Dcgs }[] = [
  { from: FLOOR, read: readV1 },
]
export const readerStarts = READERS.map((r) => r.from)       // the version each reader starts at (a check compares it with the skill's compatibility list)
const parts = (v: string) => { const m = v.match(/^v(\d+)\.(\d+)(\+[0-9a-f]{7})?$/); return m ? [Number(m[1]), Number(m[2])] : null }
const atLeast = (a: number[], b: number[]) => a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1])
function readerFor(version: string) {
  const v = version === 'unstable' ? [Infinity, 0] : parts(version)
  if (!v) return null
  return [...READERS].reverse().find((r) => atLeast(v, r.from)) || null
}
export const mapVersion = (text: string) => (text.match(/^# dcgs (\S+)/) || ['', ''])[1]
export const readsMap = (version: string) => !!readerFor(version)
/** The map read by the reader its version names (version '' and no sections when no reader knows it). */
export function parseDcgs(text: string): Dcgs {
  const v = mapVersion(text), r = readerFor(v)
  return r ? r.read(text) : { version: v, sha: '', base: 0, sections: {} }
}
