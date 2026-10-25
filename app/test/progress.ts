// The v2 progress report as the page reads it: three headline lines, then sections. Run by run.sh; exits 1 on a wrong reading.
// No game data: the block below is a synthetic report in the v2 layout.
import { progressRows, mainRow, facts } from '../src/lib/progress'

const readme = `# Some Game

<!-- progress -->
\`\`\`
TOTAL TEST COVERAGE           41.5%  the instructions the cases ran, of all instructions, over the 3251 functions that can be C
FUNCTIONS LEFT  (90.8% complete) 299  of the 3251 functions that can be C (42 with no C form are counted apart)
BYTES LEFT   (60.0% complete) 310622  of 776878 bytes of code that can be C
FUNCTIONS
  unnamed                         16  functions still called FUN_... (16 of 3293)
  No C form                     1.3%  an instruction or a register convention with no C form
  documented                   85.2%  2807 named functions in docs/*.md
GAME ASSETS (EXTRA)
  models named                37.1%  1010 of 2723 models
\`\`\`
<!-- /progress -->
`

const bad: string[] = []
const rows = progressRows(readme)
const main = mainRow(rows)
if (!main || main.pct !== 90.8 || main.label !== 'Functions') bad.push('the main figure is not the functions share: ' + JSON.stringify(main))
const by = Object.fromEntries(rows.filter((r) => r.key).map((r) => [r.key, r]))
if (by.coverage?.pct !== 41.5) bad.push('test coverage not read: ' + JSON.stringify(by.coverage))
if (by.bytes?.pct !== 60.0 || !by.bytes.detail.startsWith('310622 left')) bad.push('bytes not read: ' + JSON.stringify(by.bytes))
if (!by.functions?.detail.startsWith('299 left')) bad.push('functions left not read: ' + JSON.stringify(by.functions))
const heads = rows.filter((r) => r.heading).map((r) => r.label)
if (heads.join('|') !== 'FUNCTIONS|GAME ASSETS (EXTRA)') bad.push('section headings: ' + heads.join('|'))
const noC = rows.find((r) => r.label === 'No C form')
if (!noC || noC.pct !== 1.3 || noC.depth !== 1) bad.push('an indented row: ' + JSON.stringify(noC))
const unnamed = rows.find((r) => r.label === 'unnamed')
if (!unnamed || unnamed.pct !== null) bad.push('a count row must have no percentage: ' + JSON.stringify(unnamed))
if (facts('299 left  of the 3251 functions that can be C (42 with no C form are counted apart)') !== '299 left  of the 3,251 functions that can be C') bad.push('facts(): numbers are grouped and the parenthesis dropped')
if (mainRow(progressRows('no block here')) !== null) bad.push('a README without a report has a main figure')
if (bad.length) { console.error('[progress] ' + bad.join('\n[progress] ')); process.exit(1) }
console.log('[progress] ok: the v2 report is read (headline lines, sections, counts); the functions share leads')
