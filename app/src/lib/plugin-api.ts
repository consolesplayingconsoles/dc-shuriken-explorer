// The one seam between Shuriken and a game's plugin. A plugin lives in app/src/games/<product number>/, the product number written in the
// game's IP.BIN (it differs per region). A plugin imports from here and from nowhere else in the core, so a change to
// these types stops `vue-tsc -b` inside the plugins it breaks. A plugin only ADDS: decoders, and a test that hides items behind
// the list's "hidden" toggle. It cannot remove or change what the core found.
import type { Item } from './dcgs'
import type { Encoding, Split } from './text'

export type { Item, Encoding, Split }

/** A way of reading a text file that only this game has: its bytes in, its lines out. Shown in the Text tab's Encoding list. */
export interface TextStrategy {
  key: string
  label: string
  decode(data: Uint8Array): string[]
  preferred?: (file: string) => boolean           // true for the files this reader is the default for (a path in the decomp's text-dump folder); the user can still pick any other
}

/** A node of a tagged model block, as the core walks it: its type (the low 16 bits of its first word) and the block's bytes, `at` being
 * the node's offset in `data` (big-endian). */
export interface TaggedNode { type: number; at: number; data: DataView }

export interface GamePlugin {
  name: string                                    // the game and region, for people (the folder is named after the game's product number, so each region has its own plugin)
  versions?: readonly string[]                    // the versions of that product it serves (V1.003, ...); none listed means every version
  hidden?: (item: Readonly<Item>) => boolean      // items to hide by default (the user can show them again)
  text?: () => {                                  // the Text tab
    strategies?: TextStrategy[]
    defaults?: (file: string) => { encoding?: Encoding; split?: Split } | undefined   // how a file of the core's readers opens (a path in the text-dump folder); the user can still change both
  }
  models?: () => {                                // the Models tab
    taggedTransform?: (node: TaggedNode) => number[] | null   // a tagged model node's own transform, 3 x 4 row by row (a point p goes to M p); the core chains them parent to child. null: none
  }
}

export const definePlugin = (p: GamePlugin): GamePlugin => p
