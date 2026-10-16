import { definePlugin } from '../../lib/plugin-api'
import { nodeTransform } from './models'

export default definePlugin({
  name: 'Star Wars Episode I: Racer (Europe), work in progress',
  models: () => ({ taggedTransform: nodeTransform }),
})
