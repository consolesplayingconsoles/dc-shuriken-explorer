// Runs Shuriken's readers on the skill's synthetic test inputs and prints what they find as JSON, in the shape of the skill's
// tests/compat/emit.py, and checks that the skill's version and its compatibility list are ones Shuriken reads.
// Run by run.sh: node --import ./test/register.mjs test/parity.ts <inputs dir> <skill VERSION file> <skill golden.json>
import { readFileSync } from 'node:fs'
import { decompress } from '../src/disc/prs'
import { find as findTrees } from '../src/disc/objtree'
import { find as findNinja } from '../src/disc/ninja'
import { Words, findModels, header } from '../src/disc/nlmodel'
import { scanBuffer } from '../src/disc/scan'
import { pressedBlocks } from '../src/disc/pressed'
import { find as findPictures } from '../src/disc/pictures'
import { find as findSounds } from '../src/disc/sounds'
import { read as readMotion, find as findMotions, findImages as findMotionImages } from '../src/disc/njmotion'
import { find as findMd3 } from '../src/disc/md3'
import { members as zipMembers } from '../src/disc/zip'
import { find as findTagged } from '../src/disc/tagged'
import { find as findPrm } from '../src/disc/prm'
import { find as findTr4 } from '../src/disc/tr4'
import { starts as stretchStarts } from '../src/disc/stretch'
import { readerStarts, readsMap } from '../src/lib/dcgs'

const [dir, versionFile, goldenFile] = process.argv.slice(2)
const read = (n: string) => new Uint8Array(readFileSync(dir + '/' + n))
const hex = (a: Uint8Array) => Array.from(a.slice(0, 48), (b) => b.toString(16).padStart(2, '0')).join('')
const hex16 = (a: Uint8Array) => Array.from(a.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
const r3 = (x: number) => Math.round(x * 1000) / 1000

const cases: Record<string, unknown> = {}
for (const n of ['prs_literals.bin', 'prs_copies.bin']) {
  const d = decompress(read(n))
  cases['prs:' + n] = d ? { bytes: d.length, hex: hex(d) } : null
}
const t = findTrees(read('tree.bin'))
cases['trees:tree.bin'] = { base: t.base, trees: t.trees.map((x) => [x.offset, x.nodes, r3(x.radius)]) }
const tl = findTrees(read('tree_leaf.bin'))
cases['trees:tree_leaf.bin'] = { base: tl.base, trees: tl.trees.map((x) => [x.offset, x.nodes, r3(x.radius)]) }
cases['ninja:ninja.bin'] = findNinja(read('ninja.bin')).map((m) => [m.offset, m.size, m.objects, r3(m.radius), m.names])

const mb = 1 << 20
cases.stretches = Object.fromEntries([0, mb, 16 * mb, 16 * mb + 1, 28 * mb, 28 * mb + 1, 100 * mb].map((n) => [String(n), stretchStarts(n)]))

const fw = new Words(read('flat.bin'))
cases['flat:flat.bin'] = findModels(fw).map((m) => [m.offset, m.records.length, m.records.reduce((n, r) => n + fw.w[r + 19], 0), r3(header(fw, m.offset).radius), Math.max(...m.records.map((r) => fw.i[r + 8]))])
cases['pressed:pressed.bin'] = pressedBlocks(read('pressed.bin')).map((b) => [b.at, b.name, b.data.length, hex(b.data), b.end])
for (const n of ['pic_pvm.bin', 'pic_gif.bin', 'pic_png.bin', 'pic_jpg.bin', 'tr4.bin']) cases['pictures:' + n] = findPictures(read(n)).map((m) => [m.offset, m.kind, m.w, m.h, m.dt, m.pf, m.bytes, m.name])
for (const n of ['snd_afs.bin', 'snd_afs_dtpk.bin', 'snd_adx.bin', 'snd_other.bin', 'snd_dtpk.bin', 'snd_wav.bin', 'snd_wav4.bin', 'snd_smlt.bin', 'snd_smpb.bin', 'snd_str.bin', 'snd_rat.bin']) {
  const d = read(n)
  cases['sounds:' + n] = (await findSounds(d.length, async (o, k) => d.slice(o, o + k))).map((r) => [r.index, r.offset, r.bytes, r.format, r.channels, r.rate, r.samples])
}
for (const [n, nodes] of [['motion.njm', 2], ['motion_q.njm', 1]] as const) {
  const r = readMotion(read(n), nodes)
  cases['motion:' + n] = r ? [r.frames, r.kinds, r.nodes, r.moving] : null
}
cases['motions:embedded.bin'] = findMotions(read('embedded.bin')).map((m) => [m.offset, m.bytes, m.frames, m.kinds.join('+'), m.nodes, m.moving])
cases['motionimages:motion_bank.bin'] = findMotionImages(read('motion_bank.bin')).map((m) => [m.offset, m.frames, m.kinds.join('+'), m.nodes, m.moving, m.base])
cases['md3:md3.bin'] = findMd3(read('md3.bin')).map((m) => [m.offset, m.size, m.surfaces, m.triangles, m.vertices, r3(m.radius)])
cases['tr4:tr4.bin'] = findTr4(read('tr4.bin')).map((m) => [m.offset, m.size, m.tag, m.groups, m.vertices, m.triangles, r3(m.radius)])
cases['prm:prm.bin'] = findPrm(read('prm.bin')).map((m) => [m.offset, m.size, m.tag, m.groups, m.vertices, m.triangles, r3(m.radius)])
cases['tagged:tagged.bin'] = findTagged(read('tagged.bin')).map((m) => [m.offset, m.size, m.tag, m.groups, m.vertices, m.triangles, r3(m.radius)])
cases['zip:archive.zip'] = zipMembers(read('archive.zip')).map((m) => [m.offset, m.name, m.data.length, hex16(m.data)])
const sc = scanBuffer(read('big.bin'))
cases['scan:big.bin'] = {
  flat: sc.sortedFlat().map((m) => [m.offset, m.records.length, m.bytes, r3(m.radius), m.maxTexture]),
  trees: sc.sortedTrees().map((t) => [t.offset, t.nodes, r3(t.radius), t.base]),
  ninja: sc.sortedNinja().map((m) => [m.offset, m.size, m.objects, r3(m.radius), m.names]),
}

const skill = readFileSync(versionFile, 'utf8').trim()
const golden = JSON.parse(readFileSync(goldenFile, 'utf8')) as { breaking: string[] }
const versionProblems: string[] = []
if (!readsMap(skill)) versionProblems.push('the skill is at ' + skill + ', a version no Shuriken reader reads')
for (const b of golden.breaking) {
  const m = b.match(/^v(\d+)\.(\d+)$/)
  if (!m || !readerStarts.some((s) => s[0] === Number(m[1]) && s[1] === Number(m[2]))) versionProblems.push("the skill's compatibility list breaks at " + b + ' and Shuriken has no reader from ' + b)
}
console.log(JSON.stringify({ cases, versionProblems }))
