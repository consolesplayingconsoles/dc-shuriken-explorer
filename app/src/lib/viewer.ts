// A WebGL view of one mesh: lit from the camera, orbit with drag, zoom with the wheel.
import type { Mesh } from './api'

const VS = `attribute vec3 p; attribute vec3 n; attribute vec2 t; uniform mat4 m; varying vec3 vn; varying vec2 vt;
void main(){ vn = n; vt = t; gl_Position = m * vec4(p, 1.0); }`
const FS = `precision mediump float; varying vec3 vn; varying vec2 vt; uniform vec3 base; uniform mat3 rot;
uniform sampler2D tex; uniform float useTex; uniform float cut;
void main(){
  vec3 v = normalize(rot * vn); float l = 0.35 + 0.65 * abs(v.z);
  vec4 c = useTex > 0.5 ? texture2D(tex, vt) : vec4(base, 1.0);
  if (cut > 0.5 && c.a < 0.5) discard;   // only where the polygon says its texture's alpha counts
  gl_FragColor = vec4(c.rgb * l, 1.0);
}`

export const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
function rgb(color: string): number[] {
  const c = document.createElement('canvas').getContext('2d')!
  c.fillStyle = color; const v = String(c.fillStyle)
  if (v[0] === '#') { const n = parseInt(v.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] }
  const p = (v.match(/[\d.]+/g) || ['0', '0', '0']).map(Number); return [p[0] / 255, p[1] / 255, p[2] / 255]
}

interface Draw { start: number; count: number; url: string | null; tsp: number; list: number; colour?: number }

export class Viewer {
  yaw = 0.6; pitch = 0.25; dist = 3; pan = [0, 0]; centre = [0, 0, 0]; size = 1
  M: Float32Array | null = null           // projection * view of the last frame (for overlays)
  n = 0
  private cv: HTMLCanvasElement | null = null
  private gl: WebGLRenderingContext | null = null
  private prog: WebGLProgram | null = null
  private bufs: { pos: WebGLBuffer; nor: WebGLBuffer; uv: WebGLBuffer; idx: WebGLBuffer } | null = null
  private tex = new Map<string, { ready: boolean; tex: WebGLTexture | null }>()
  private draws: Draw[] = []
  private type = 0
  private mesh: Mesh | null = null
  private texUrl: (pc: Mesh['pieces'][number]) => string | null = () => null
  onTexture: () => void = () => {}
  resolve: (key: string) => Promise<string | null> = async (k) => k     // a texture key -> an image URL

  attach(cv: HTMLCanvasElement): boolean {
    if (this.cv === cv && this.gl) return true
    const gl = cv.getContext('webgl', { antialias: true })
    if (!gl) return false
    const sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
    const pr = gl.createProgram()!
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(pr); gl.useProgram(pr)
    this.cv = cv; this.gl = gl; this.prog = pr; this.tex = new Map()
    this.bufs = { pos: gl.createBuffer()!, nor: gl.createBuffer()!, uv: gl.createBuffer()!, idx: gl.createBuffer()! }
    if (this.mesh) this.upload(this.mesh, false)
    return true
  }

  clear() { this.mesh = null; this.draws = []; this.n = 0 }

  /** Replaces the mesh's vertices without moving the view (an animation frame). */
  update(mesh: Mesh) {
    this.mesh = mesh
    if (this.gl) this.upload(mesh, false)
  }

  /** Loads a mesh and frames it. texUrl gives each piece's texture (null: drawn flat). */
  setMesh(mesh: Mesh, texUrl: (pc: Mesh['pieces'][number]) => string | null) {
    this.texUrl = texUrl
    this.mesh = mesh
    if (this.gl) this.upload(mesh, true)
    else this.frame(mesh)
  }

  private frame(mesh: Mesh) {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]
    for (let i = 0; i < mesh.position.length; i += 3) for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], mesh.position[i + k]); hi[k] = Math.max(hi[k], mesh.position[i + k])
    }
    this.centre = lo.map((v, k) => (v + hi[k]) / 2)
    this.size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 0.001)
    this.dist = this.size * 1.6
    this.pan = [0, 0]
  }

  private upload(mesh: Mesh, reframe: boolean) {
    const texUrl = this.texUrl
    const gl = this.gl!, b = this.bufs!
    const idx: number[] = []
    this.draws = mesh.pieces.map((pc) => {
      const d = { start: idx.length, count: pc.index.length, url: texUrl(pc), tsp: pc.tsp || 0, list: pc.list || 0, colour: pc.colour }
      pc.index.forEach((i) => idx.push(i))
      return d
    })
    gl.bindBuffer(gl.ARRAY_BUFFER, b.uv); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.uv), gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, b.pos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.position), gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, b.nor); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.normal), gl.STATIC_DRAW)
    const big = mesh.position.length / 3 > 65535 && gl.getExtension('OES_element_index_uint')
    this.type = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(idx) : new Uint16Array(idx), gl.STATIC_DRAW)
    this.n = idx.length
    if (reframe) this.frame(mesh)
  }

  // A texture of the open game, fetched once per context; the model is drawn flat until it arrives.
  private texture(url: string): WebGLTexture | null {
    const gl = this.gl!
    let t = this.tex.get(url)
    if (t) return t.ready ? t.tex : null
    const entry = { ready: false, tex: null as WebGLTexture | null }
    this.tex.set(url, entry)
    const img = new Image()
    this.resolve(url).then((src) => { if (src) img.src = src })
    img.onload = () => {
      if (this.gl !== gl) return
      entry.tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, entry.tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      gl.generateMipmap(gl.TEXTURE_2D)
      entry.ready = true; this.onTexture()
    }
    return null
  }

  zoom(f: number) { this.dist = Math.max(this.size * 0.3, Math.min(this.size * 8, this.dist * f)) }
  fit() { this.dist = this.size * 1.6; this.pan = [0, 0]; this.yaw = 0.6; this.pitch = 0.25 }

  /** Draws a frame; hide leaves the mesh out (its framing stays). */
  draw(hide = false) {
    const cv = this.cv, gl = this.gl
    if (!cv || !gl) return
    const W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1
    if (!W || !H) return
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
    gl.viewport(0, 0, cv.width, cv.height)
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    if (!this.mesh) { this.M = null; return }
    gl.enable(gl.DEPTH_TEST)
    // model space: x right, y up, z towards the viewer at yaw 0; orbit about the centre
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch)
    const R = [cy, 0, -sy, sy * sp, cp, cy * sp, sy * cp, -sp, cy * cp]   // rows: view x, y, z
    const f = 1 / Math.tan(0.4), near = this.size * 0.01, far = this.size * 40, a = W / H, dist = this.dist
    const c = this.centre
    const tr = [0, 1, 2].map((r) => -(R[r * 3] * c[0] + R[r * 3 + 1] * c[1] + R[r * 3 + 2] * c[2]))
    const M = new Float32Array(16)                                       // column-major projection * view
    const V = (r: number, k: number) => R[r * 3 + k]
    for (let k = 0; k < 3; k++) {
      M[k * 4 + 0] = (f / a) * V(0, k)
      M[k * 4 + 1] = f * V(1, k)
      M[k * 4 + 2] = -((far + near) / (far - near)) * V(2, k)
      M[k * 4 + 3] = -V(2, k)
    }
    M[12] = (f / a) * (tr[0] + this.pan[0]); M[13] = f * (tr[1] + this.pan[1])
    M[14] = -((far + near) / (far - near)) * (tr[2] - dist) - (2 * far * near) / (far - near)
    M[15] = -(tr[2] - dist)
    this.M = M
    if (hide) return
    const pr = this.prog!, b = this.bufs!
    gl.uniformMatrix4fv(gl.getUniformLocation(pr, 'm'), false, M)
    gl.uniformMatrix3fv(gl.getUniformLocation(pr, 'rot'), false, new Float32Array([V(0, 0), V(1, 0), V(2, 0), V(0, 1), V(1, 1), V(2, 1), V(0, 2), V(1, 2), V(2, 2)]))
    const baseAt = gl.getUniformLocation(pr, 'base'), accent = rgb(css('--accent'))
    const bind = (buf: WebGLBuffer, name: string, n: number) => {
      const l = gl.getAttribLocation(pr, name)
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 0, 0)
    }
    bind(b.pos, 'p', 3); bind(b.nor, 'n', 3); bind(b.uv, 't', 2)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx)
    const useTex = gl.getUniformLocation(pr, 'useTex'), size = this.type === gl.UNSIGNED_INT ? 4 : 2
    for (const d of this.draws) {
      const tex = d.url ? this.texture(d.url) : null
      gl.uniform1f(useTex, tex ? 1 : 0)
      const c = d.colour                                        // the piece's own colour (a material's), else the accent
      gl.uniform3fv(baseAt, c === undefined ? accent : [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255])
      // texture alpha counts unless the TSP ignores it: on translucent and punch-through lists (PCW), or with Use Alpha
      gl.uniform1f(gl.getUniformLocation(pr, 'cut'), ((d.list !== 0) || (d.tsp >> 20 & 1)) && !(d.tsp >> 19 & 1) ? 1 : 0)
      if (tex) {
        gl.bindTexture(gl.TEXTURE_2D, tex)
        const wrap = (flip: number, clamp: number) => (clamp ? gl.CLAMP_TO_EDGE : flip ? gl.MIRRORED_REPEAT : gl.REPEAT)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap(d.tsp >> 18 & 1, d.tsp >> 16 & 1))
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap(d.tsp >> 17 & 1, d.tsp >> 15 & 1))
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      }
      gl.drawElements(gl.TRIANGLES, d.count, this.type, d.start * size)
    }
  }

  /** Is the mesh under this client point? Draws once more and reads the pixel's alpha (the canvas is clear where empty). */
  hit(x: number, y: number): boolean {
    const cv = this.cv, gl = this.gl
    if (!cv || !gl || !this.draws.length) return false
    this.draw()
    const r = cv.getBoundingClientRect(), sx = cv.width / r.width, sy = cv.height / r.height
    const px = new Uint8Array(4)
    gl.readPixels(Math.floor((x - r.left) * sx), Math.floor(cv.height - (y - r.top) * sy - 1), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    return px[3] > 0
  }

  /** Model point -> CSS pixels in the canvas, or null behind the camera. */
  project(p: number[], W: number, H: number): number[] | null {
    const M = this.M
    if (!M) return null
    const v = [0, 1, 2, 3].map((i) => M[i] * p[0] + M[4 + i] * p[1] + M[8 + i] * p[2] + M[12 + i])
    return v[3] > 0 ? [(v[0] / v[3] + 1) / 2 * W, (1 - v[1] / v[3]) / 2 * H] : null
  }
}
