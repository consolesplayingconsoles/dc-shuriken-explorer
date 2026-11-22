import { definePlugin } from '../../lib/plugin-api'

export default definePlugin({
  name: 'Jet Set Radio (Europe)',
  versions: ['V1.002'],
  executable: 'JET_PAL.BIN',            // 1ST_READ.BIN is only the loader (JetMenu) that starts it
})
