import { definePlugin } from '../../lib/plugin-api'
import { exeMessages, gadgetTable, pointerTable } from './text'

export default definePlugin({
  name: 'Boku Doraemon (Japan)',
  text: () => ({
    strategies: [
      { key: 'ptrtable', label: 'Boku Doraemon pointer-table records', decode: pointerTable, preferred: (file) => /\.(scp|tbl)$/i.test(file) },
      { key: 'itemtbl', label: 'Boku Doraemon gadget names and descriptions', decode: gadgetTable, preferred: (file) => /itemtbl\.pac$/i.test(file) },
      { key: 'exemsg', label: 'Boku Doraemon messages in the executable', decode: exeMessages, preferred: (file) => /1st_read\.bin$/i.test(file) },
    ],
    defaults: (file) => (/story\.pac$/i.test(file) ? { encoding: 'shift_jis', split: 'nul' }       // dialogue: Shift-JIS lines ended by a null byte
      : /\.ini$/i.test(file) ? { encoding: 'shift_jis', split: 'lf' } : undefined),                  // menus as text lines
  }),
})
