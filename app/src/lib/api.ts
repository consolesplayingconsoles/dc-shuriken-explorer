// What the disc worker returns for a model.
export interface Piece { texture: number; tsp: number; list?: number; colour?: number; file?: string; set?: string; index: number[] }   // set: the model's texture set, '' for its file's own textures
// words: each vertex's entry as a byte offset in its file (welds name vertices that way); a vertex shared by strips repeats.
export interface Mesh { position: number[]; normal: number[]; uv: number[]; pieces: Piece[]; words?: number[]; joints?: { parent: number; p: number[] }[] }   // joints: a Ninja model's objects, each with its parent and where it sits
