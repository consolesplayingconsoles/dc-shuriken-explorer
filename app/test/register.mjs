// Lets Node run the app's TypeScript sources as they are: relative imports without an extension get `.ts`.
import { registerHooks } from 'node:module'
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context) } catch (e) {
      if (specifier.startsWith('.') && !/\.\w+$/.test(specifier)) return next(specifier + '.ts', context)
      throw e
    }
  },
})
