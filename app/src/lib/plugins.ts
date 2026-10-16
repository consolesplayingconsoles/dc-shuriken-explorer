// The game plugins found in app/src/games/<product number>/index.ts, picked by the product number (and version) the disc's IP.BIN states. A plugin
// that throws is skipped, so the tab shows what the core found.
import type { Item } from './dcgs'
import type { Encoding, GamePlugin, Split, TaggedNode, TextStrategy } from './plugin-api'

const found = import.meta.glob<{ default: GamePlugin }>('../games/*/index.ts', { eager: true })
const all = new Map<string, GamePlugin>(Object.entries(found).map(([path, m]) => [path.split('/')[2].toUpperCase(), m.default]))

export function pluginFor(product: string | undefined, version?: string) {
  const p = product ? all.get(product.toUpperCase().replace(/\s+/g, '_')) : undefined     // a product number with a space (T23001D 50) is the folder T23001D_50
  return p && (!p.versions || !version || p.versions.includes(version)) ? p : undefined
}

/** Marks the items the game's plugin asks to hide. Nothing is removed: the list can show them again. */
export function applyHidden(product: string | undefined, version: string | undefined, items: Item[]) {
  const p = pluginFor(product, version)
  if (!p || !p.hidden) return
  for (const m of items) {
    try { if (p.hidden(m)) m.hidden = true } catch (e) { console.warn('plugin', p.name, 'hidden', e); return }
  }
}

/** The text readers the game's plugin adds. */
export function textStrategies(product: string | undefined, version?: string): TextStrategy[] {
  const p = pluginFor(product, version)
  try { return (p && p.text && p.text().strategies) || [] } catch (e) { console.warn('plugin', p && p.name, 'text', e); return [] }
}

/** The encoding and split the game's plugin opens a text file with, when it names them. */
export function textDefaults(product: string | undefined, version: string | undefined, file: string): { encoding?: Encoding; split?: Split } {
  const p = pluginFor(product, version)
  try { return (p && p.text && p.text().defaults && p.text().defaults!(file)) || {} } catch (e) { console.warn('plugin', p && p.name, 'text defaults', e); return {} }
}

/** The game plugin's transform for tagged model nodes, when it has one (a node it fails on gets none). */
export function taggedTransform(product: string | undefined, version?: string): ((node: TaggedNode) => number[] | null) | undefined {
  const p = pluginFor(product, version)
  let f: ((node: TaggedNode) => number[] | null) | undefined
  try { f = p && p.models ? p.models().taggedTransform : undefined } catch (e) { console.warn('plugin', p && p.name, 'models', e); return undefined }
  return f && ((node) => { try { return f!(node) } catch { return null } })
}

