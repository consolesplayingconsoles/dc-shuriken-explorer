// Power Stone (USA). The game packs most of its pictures as bare bitmaps in files compressed with a pixel run-length code of its own, and keeps
// each texture's size and place in tables inside the executable; neither is a format the core reads, so this plugin supplies both.
import { definePlugin } from '../../lib/plugin-api'
import { decodeFile, imageRows } from './textures'
import { stageTextureRows } from './stages'
import { modelTextureRows } from './lists'
import { motionAt, motionList } from './motions'

export default definePlugin({
  name: 'Power Stone (USA)',
  versions: ['V1.001'],
  files: () => ({ decode: decodeFile }),
  images: () => ({ rows: imageRows }),
  motions: () => ({ list: motionList, at: motionAt }),
  textures: () => ({ rows: async (disc) => [...(await stageTextureRows(disc)), ...(await modelTextureRows(disc))] }),
})
