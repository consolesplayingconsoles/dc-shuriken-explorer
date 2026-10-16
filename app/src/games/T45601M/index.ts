import { definePlugin } from '../../lib/plugin-api'
import { mebLines } from './text'

export default definePlugin({
  name: 'Illbleed (Japan)',
  text: () => ({ strategies: [{ key: 'meb', label: 'Illbleed message codes (partial)', decode: mebLines, preferred: (file) => /\.meb$/i.test(file) }] }),
})
