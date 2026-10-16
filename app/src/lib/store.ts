// Everything this page keeps in the browser lives under cpc.studio.v<N>.: bump STORE_V when a stored shape changes.
// Keys of any other version are deleted on load, not migrated (the map is opened again). cpc.ui.theme is shared
// with the other tools and is left alone.
const STORE_V = 1
export const NS = 'cpc.studio.v' + STORE_V + '.'
export const store = {
  get<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(NS + k) || 'null') as T } catch { return null } },
  set(k: string, v: unknown) { try { localStorage.setItem(NS + k, JSON.stringify(v)) } catch { /* private mode */ } },
}
try {
  for (const k of Object.keys(localStorage)) if ((k.startsWith('cpc.studio.') && !k.startsWith(NS)) || k.startsWith(NS + 'game.')) localStorage.removeItem(k)
} catch { /* storage unavailable */ }

/* The decomp folder is remembered, not a copy of anything in it: a handle to the folder (File System Access API),
   kept in IndexedDB per game. model-map/game.dcgs and models.txt are read from it on every load, so what the decomp
   regenerates or a person edits is what shows, and a rename is written into models.txt, a tracked file whose diff
   can be reviewed. Without the API a picked game.dcgs works for the session only, and there is no path, so no rename. */
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(NS + 'handles', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('h')
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
}
export const idb = {
  async get<T>(k: string): Promise<T | null> {
    try {
      const d = await db()
      return await new Promise((res) => { const q = d.transaction('h').objectStore('h').get(k); q.onsuccess = () => res((q.result as T) || null); q.onerror = () => res(null) })
    } catch { return null }
  },
  async set(k: string, v: unknown) {
    try { const d = await db(); await new Promise((res, rej) => { const t = d.transaction('h', 'readwrite'); t.objectStore('h').put(v, k); t.oncomplete = res; t.onerror = rej }) } catch { /* private mode */ }
  },
  async del(k: string) {
    try { const d = await db(); await new Promise((res) => { const t = d.transaction('h', 'readwrite'); t.objectStore('h').delete(k); t.oncomplete = res; t.onerror = res }) } catch { /* ignore */ }
  },
}
