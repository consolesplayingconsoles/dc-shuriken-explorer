// The one seam between Shuriken and a game's plugin. A plugin lives in app/src/games/<product number>/, the product number written in the
// game's IP.BIN (it differs per region). A plugin imports from here and from nowhere else in the core, so a change to
// these types stops `vue-tsc -b` inside the plugins it breaks. A plugin only ADDS: decoders, and a test that hides items behind
// the list's "hidden" toggle. It cannot remove or change what the core found.
import type { Item } from './dcgs'
import type { Encoding, Split } from './text'
import type { E16Motion } from './pose'

export type { Item, Encoding, Split, E16Motion }

/** One motion of a skeleton, as the Skeletons tab lists it: `offset` the hex key it is asked for by, `addr` what the list shows, `count` the frames it plays. */
export interface MotionRef { offset: string; addr: string; frames: number; bones: number; count: number }

/** A row of the decomp map's [images] section: file, offset (hex), kind, width, height, format (0 ARGB1555, 1 RGB565, 2 ARGB4444), type (hex, the PVRT data type: 1 twiddled, ...), bytes, name.
 * kind `raw` is a bare PowerVR texture (no PVRT header) at that offset of the file's bytes as the game sees them. */
export type ImageRow = Record<string, string>

/** A row of the decomp map's [textures] section: file (the model file the textures belong to), number (what the model's meshes call it), texture_file (the file holding the pixels),
 * offset (hex), size, width, height, type (hex, the PVRT data type: 1 twiddled, 3 VQ, ...), format (0 ARGB1555, 1 RGB565, 2 ARGB4444), set. */
export type TextureRow = Record<string, string>

/** The open disc as a plugin sees it. `read` gives a file's bytes as they are stored: the plugin's own file decoder is not applied to them. */
export interface DiscView { names(): string[]; read(name: string): Promise<Uint8Array> }

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
  files?: () => {                                 // the files of the disc
    decode?: (name: string, raw: Uint8Array) => Uint8Array | null   // a file this game compresses in a way of its own: its bytes as the game sees them (offsets into it are offsets into the decoded data); null: the file is not one, take it as it is
  }
  motions?: () => {                               // the Skeletons tab, for a rig whose motion file the plugin reads (the rig says format e16)
    list?: (disc: DiscView, file: string) => Promise<MotionRef[] | null>             // the motions of a file this game stores in a way of its own; null: not one of its files, the core reads it
    at?: (disc: DiscView, file: string, offset: number) => Promise<E16Motion | null> // one of them as 16-bit Euler keys, which the core poses with the rig's pose program
  }
  textures?: () => {                              // the textures of the Models and Textures tabs
    rows?: (disc: DiscView) => Promise<TextureRow[]>   // the textures of the models the core finds, where the map does not give them: which file, which number, where the pixels are and how they are stored
  }
  images?: () => {                                // the Images tab
    rows?: (disc: DiscView) => Promise<ImageRow[]>     // pictures the core does not find (a bare bitmap, no header): where they are and how they are stored, added to what it lists
  }
  models?: () => {                                // the Models tab
    taggedTransform?: (node: TaggedNode) => number[] | null   // a tagged model node's own transform, 3 x 4 row by row (a point p goes to M p); the core chains them parent to child. null: none
  }
}

export const definePlugin = (p: GamePlugin): GamePlugin => p
