// A Dreamcast GDI read from the user's own files (the .gdi and its track files), a sector run at a time: nothing is
// loaded whole and nothing leaves the browser.
// The ISO9660 volume starts at LBA 45000 (high-density area), but file extents can sit in any later data track
// (Dreamkey 3.1 keeps every file in track 5), so each extent is resolved to its own track.
export const HD_START = 45000

interface Track { lba: number; sector: number; file: File; count: number }
export interface DiscFile { lba: number; size: number; path: string; name: string }

export class Disc {
  private tracks: Track[]
  name: string

  constructor(name: string, tracks: Track[]) { this.name = name; this.tracks = tracks }

  /** The disc of a .gdi among picked files (its tracks found by name, any case); throws a readable message. */
  static async open(files: File[]): Promise<Disc> {
    const gdi = files.find((f) => /\.gdi$/i.test(f.name))
    if (!gdi) throw new Error('No .gdi file found.')
    const byName = new Map(files.map((f) => [f.name.toLowerCase(), f]))
    const tracks: Track[] = []
    for (const line of (await gdi.text()).split(/\r?\n/).slice(1)) {
      const p = line.trim().split(/\s+/)
      if (p.length < 6 || Number(p[2]) !== 4) continue                       // data tracks only
      const name = p.slice(4, -1).join(' ').replace(/^"|"$/g, '')
      const file = byName.get(name.toLowerCase())
      if (!file) throw new Error('The track ' + name + ' is missing.')
      const sector = Number(p[3])
      tracks.push({ lba: Number(p[1]), sector, file, count: Math.floor(file.size / sector) })
    }
    if (!tracks.length) throw new Error('The .gdi lists no data track.')
    tracks.sort((a, b) => a.lba - b.lba)
    return new Disc(gdi.name.replace(/\.gdi$/i, ''), tracks)
  }

  private track(lba: number): Track {
    const t = this.tracks.find((x) => x.lba <= lba && lba < x.lba + x.count)
    if (!t) throw new Error('LBA ' + lba + ' is in no data track')
    return t
  }

  /** size bytes from sector lba on (a run may cross into the next track). */
  async read(lba: number, size: number): Promise<Uint8Array<ArrayBuffer>> {
    const out = new Uint8Array(size)
    let done = 0
    while (done < size) {
      const t = this.track(lba)
      const n = Math.min(Math.ceil((size - done) / 2048), t.lba + t.count - lba)
      const raw = new Uint8Array(await t.file.slice((lba - t.lba) * t.sector, (lba - t.lba + n) * t.sector).arrayBuffer())
      const skip = t.sector === 2352 ? 16 : 0                                // raw mode 1: 12 sync + 4 header
      for (let i = 0; i < n && done < size; i++) {
        const take = Math.min(2048, size - done)
        out.set(raw.subarray(i * t.sector + skip, i * t.sector + skip + take), done)
        done += take
      }
      lba += n
    }
    return out
  }

  /** size bytes of a file from a byte offset, reading only the sectors they span. */
  async part(f: DiscFile, offset: number, size: number): Promise<Uint8Array<ArrayBuffer>> {
    size = Math.max(0, Math.min(size, f.size - offset))
    const first = Math.floor(offset / 2048), skip = offset - first * 2048
    return (await this.read(f.lba + first, skip + size)).subarray(skip, skip + size)
  }

  async files(): Promise<DiscFile[]> {
    const pvd = await this.read(HD_START + 16, 2048)
    if (String.fromCharCode(...pvd.subarray(1, 6)) !== 'CD001') throw new Error('This disc has no readable file system.')
    const dv = new DataView(pvd.buffer, pvd.byteOffset)
    const out: DiscFile[] = []
    await this.walk(dv.getUint32(156 + 2, true), dv.getUint32(156 + 10, true), '', out)
    return out
  }

  private async walk(lba: number, size: number, prefix: string, out: DiscFile[]) {
    const data = await this.read(lba, size), dv = new DataView(data.buffer)
    let i = 0
    while (i < data.length) {
      const n = data[i]
      if (n === 0) { i = (Math.floor(i / 2048) + 1) * 2048; continue }         // padding to the next sector
      const len = data[i + 32], name = data.subarray(i + 33, i + 33 + len)
      if (!(len === 1 && name[0] <= 1)) {
        const elba = dv.getUint32(i + 2, true), esize = dv.getUint32(i + 10, true)
        const nm = String.fromCharCode(...name).split(';')[0], path = prefix + '/' + nm
        if (data[i + 25] & 2) await this.walk(elba, esize, path, out)
        else out.push({ lba: elba, size: esize, path, name: nm.toUpperCase() })
      }
      i += n
    }
  }
}
