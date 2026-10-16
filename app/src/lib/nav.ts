import type { Kind } from './dcgs'

// Graphics first: it is what the studio is for. Kinds keep this order everywhere (sidebar, keys 1 to 7).
export interface KindDef { key: Kind; label: string; one: string }
export interface Cat { key: 'graphics' | 'audio' | 'text' | 'code'; label: string; kinds: KindDef[] }
export const NAV: Cat[] = [
  { key: 'graphics', label: 'Graphics', kinds: [
    { key: 'models', label: 'Models', one: 'Model' },
    { key: 'skeletons', label: 'Skeletons', one: 'Skeleton' },
    { key: 'textures', label: 'Model Textures', one: 'Model Texture' },
    { key: 'images', label: 'Images', one: 'Image' },
  ] },
  { key: 'audio', label: 'Audio', kinds: [{ key: 'audio', label: 'Sounds', one: 'Sound' }] },
  { key: 'text', label: 'Text', kinds: [{ key: 'text', label: 'Strings', one: 'String' }] },
  { key: 'code', label: 'Code', kinds: [{ key: 'code', label: 'Functions', one: 'Function' }] },
]
export const KINDS: KindDef[] = NAV.flatMap((c) => c.kinds)
export const catOf = (k: Kind): Cat => NAV.find((c) => c.kinds.some((x) => x.key === k))!
export const kindDef = (k: Kind): KindDef => KINDS.find((x) => x.key === k)!

// Kinds whose items come from the game's decomp (the rest come from the disc itself).
export const FROM_DECOMP: Record<Kind, boolean> = { models: false, skeletons: true, textures: true, images: false, audio: false, text: true, code: true }
