// The live Blender street model for LandmarksJourneySection's ?ride=model mode, and the Blender
// vehicles + people for ?ride=hybrid (figuresStore).
//
// Plain module, no React. One download per page: the hero preloader (RidePreloader) and the
// section share the same store, so whichever asks first starts the fetch and the other reuses it.
// The glb is fetched with progress (so "Loading N%" reflects the model), then handed to
// GLTFLoader.parse with the meshopt decoder. Built by blender/production/export_glb.py.

export const MODEL_URL = '/media/street/city.glb';
export const MODEL_LITE_URL = '/media/street/city-lite.glb';
export const FIGURES_URL = '/media/street/figures.glb';
export const FIGURES_LITE_URL = '/media/street/figures-lite.glb';
// Fallback sizes for the progress bar when a server sends no Content-Length.
const APPROX_BYTES = { [MODEL_URL]: 3.2e6, [MODEL_LITE_URL]: 1.27e6, [FIGURES_URL]: 1.05e6, [FIGURES_LITE_URL]: 0.5e6 };

// Phones (small screens or a coarse pointer) get the lite model.
export function modelLite() {
  if (typeof window === 'undefined') return false;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  return small || coarse;
}

class ModelStore {
  constructor(url) {
    this.url = url; this.subs = new Set();
    this.st = { fraction: 0, ready: false, failed: false };
    this.bufP = null; this.gltfP = null;
  }
  emit(patch) { this.st = { ...this.st, ...patch }; const s = this.st; this.subs.forEach(fn => fn(s)); }
  // ArrayBuffer of the glb (fetched once, streamed for progress).
  buffer() {
    if (!this.bufP) this.bufP = this.fetchBuffer().then(
      buf => { this.emit({ fraction: 1, ready: true }); return buf; },
      err => { this.emit({ failed: true, ready: true }); throw err; });
    return this.bufP;
  }
  async fetchBuffer() {
    const r = await fetch(this.url);
    if (!r.ok) throw new Error('ride model: HTTP ' + r.status);
    const total = +(r.headers.get('content-length') || 0) || APPROX_BYTES[this.url] || 4e6;
    if (!r.body || !r.body.getReader) { const b = await r.arrayBuffer(); return b; }
    const reader = r.body.getReader(), parts = [];
    let got = 0, lastEmit = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); got += value.length;
      const f = Math.min(0.99, got / total);
      if (f - lastEmit >= 0.01) { lastEmit = f; this.emit({ fraction: f }); }
    }
    const out = new Uint8Array(got);
    let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out.buffer;
  }
  subscribe(fn) { this.subs.add(fn); fn(this.st); this.buffer().catch(() => {}); return () => { this.subs.delete(fn); }; }
  // Parsed glTF ({ scene, ... }); THREE is passed in because the section imports three lazily.
  load() {
    if (!this.gltfP) this.gltfP = this.buffer().then(async buf => {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js')
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      return new Promise((res, rej) => loader.parse(buf, '', res, rej));
    });
    // a parse failure must not stick: the next mount may retry from the cached buffer
    this.gltfP.catch(() => { this.gltfP = null; });
    return this.gltfP;
  }
}

let store = null, figStore = null;
export function modelStore() {
  if (!store) store = new ModelStore(modelLite() ? MODEL_LITE_URL : MODEL_URL);
  return store;
}
// Vehicles + people only (blender/production/export_figures.py), for ?ride=hybrid.
export function figuresStore() {
  if (!figStore) figStore = new ModelStore(modelLite() ? FIGURES_LITE_URL : FIGURES_URL);
  return figStore;
}
