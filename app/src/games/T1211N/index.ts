// Power Stone 2 (USA, T-1211N V1.000). The shared texture sets (CMN_MODEL_VQ, ITEM_MODEL_VQ, ...) are packed and listed as Power Stone's are
// (textures.ts). The fighters (PLx0_CONNECT.BIN), the stages (STGx0_CONNECT.BIN) and the motions are not read yet.
import { definePlugin } from '../../lib/plugin-api'
import { decodeFile, modelTextureRows } from './textures'

export default definePlugin({
  name: 'Power Stone 2 (USA)',
  versions: ['V1.000'],
  files: () => ({ decode: decodeFile }),
  textures: () => ({ rows: modelTextureRows }),
})
