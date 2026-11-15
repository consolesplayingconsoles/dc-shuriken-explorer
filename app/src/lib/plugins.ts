// The game plugins found in app/src/games/<product number>/index.ts, picked by the product number (and version) the disc's IP.BIN states. A plugin
// that throws is skipped, so the tab shows what the core found.
import type { Item } from './dcgs'
import type { DiscView, E16Motion, Encoding, GamePlugin, ImageRow, MotionRef, Split, TaggedNode, TextStrategy, TextureRow } from './plugin-api'

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


/** The game plugin's decoder for files compressed in a way of its own, when it has one (a file it fails on is taken as it is). */
export function fileDecoder(product: string | undefined, version?: string): ((name: string, raw: Uint8Array) => Uint8Array | null) | undefined {
  const p = pluginFor(product, version)
  let f: ((name: string, raw: Uint8Array) => Uint8Array | null) | undefined
  try { f = p && p.files ? p.files().decode : undefined } catch (e) { console.warn('plugin', p && p.name, 'files', e); return undefined }
  return f && ((name, raw) => { try { return f!(name, raw) } catch { return null } })
}

/** The pictures the game's plugin adds to the core's. */
export async function imageRows(product: string | undefined, version: string | undefined, disc: DiscView): Promise<ImageRow[]> {
  const p = pluginFor(product, version)
  try { const f = p && p.images ? p.images().rows : undefined; return f ? await f(disc) : [] } catch (e) { console.warn('plugin', p && p.name, 'images', e); return [] }
}

/** The textures the game's plugin gives to the models the core finds. */
export async function textureRows(product: string | undefined, version: string | undefined, disc: DiscView): Promise<TextureRow[]> {
  const p = pluginFor(product, version)
  try { const f = p && p.textures ? p.textures().rows : undefined; return f ? await f(disc) : [] } catch (e) { console.warn('plugin', p && p.name, 'textures', e); return [] }
}

/** The motions of a file, read by the game's plugin (null when it has no reader or the file is not one of its own). */
export async function motionList(product: string | undefined, version: string | undefined, disc: DiscView, file: string): Promise<MotionRef[] | null> {
  const p = pluginFor(product, version)
  try { const f = p && p.motions ? p.motions().list : undefined; return f ? await f(disc, file) : null } catch (e) { console.warn('plugin', p && p.name, 'motions', e); return null }
}

/** One motion of a file, read by the game's plugin. */
export async function motionAt(product: string | undefined, version: string | undefined, disc: DiscView, file: string, offset: number): Promise<E16Motion | null> {
  const p = pluginFor(product, version)
  try { const f = p && p.motions ? p.motions().at : undefined; return f ? await f(disc, file, offset) : null } catch (e) { console.warn('plugin', p && p.name, 'motion', e); return null }
}
