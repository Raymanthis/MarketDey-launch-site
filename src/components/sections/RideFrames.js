// Pre-rendered ride frames for LandmarksJourneySection (contract: docs/plans/ride-frames-format.md, rev 2:
// per-variant cameras, manifest.camera[variant][i]).
//
// Plain module, no React. Three parts share one cache per manifest URL, so nothing is downloaded
// twice whether the hero preloader or the section asks first:
//   - RideStore: manifest, format choice, compressed frame blobs (deduplicated fetches) and the
//     preload engine used by RidePreloader.
//   - a decoded-bitmap LRU shared by every player, capped at LRU_BYTES; evicted bitmaps are closed.
//   - RideFramesPlayer: the canvas layer the section draws frames into.

export const RIDE_MANIFEST = '/media/ride/manifest.json';
export const RIDE_STUB_MANIFEST = '/media/ride-stub/manifest.json';
// ?ride=live -> null (procedural street), ?ride=stub -> stub frames, otherwise the real frames.
export const rideSource = search => {
  const v = new URLSearchParams(search || '').get('ride');
  return v === 'live' ? null : v === 'stub' ? RIDE_STUB_MANIFEST : RIDE_MANIFEST;
};

const PAPER = '#f7f5ef';
// 120 MiB of decoded RGBA: 19 landscape frames (1600x1000) or 23 portrait frames (780x1688).
export const LRU_BYTES = 120 * 1024 * 1024;
const MAX_DECODES = 2, PRELOAD_FETCHES = 6, VALVE_MS = 20000, VALVE_FRAMES = 64;
const pad4 = i => String(i).padStart(4, '0');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const variantFor = aspect => (aspect >= 1 ? 'l' : 'p');
export const framesFor = (m, v) => Math.floor(LRU_BYTES / (m.variants[v].w * m.variants[v].h * 4));

// ---- format support (detected once) --------------------------------------------------------
const AVIF_1PX = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
let avifP = null;
export function avifSupported() {
  if (!avifP) avifP = new Promise(res => {
    if (typeof Image === 'undefined') { res(false); return; }
    const img = new Image();
    img.onload = () => res(img.width > 0); img.onerror = () => res(false);
    img.src = AVIF_1PX;
  });
  return avifP;
}

// ---- decoded-bitmap LRU (Map order = recency) -----------------------------------------------
const lru = new Map(), pinned = new Set();
let lruBytes = 0;
const lruHas = k => lru.has(k);
function lruGet(k) { const e = lru.get(k); if (!e) return null; lru.delete(k); lru.set(k, e); return e.bm; }
function lruPut(k, bm) {
  const old = lru.get(k); if (old) { lru.delete(k); lruBytes -= old.bytes; if (old.bm !== bm) old.bm.close(); }
  const bytes = bm.width * bm.height * 4; lru.set(k, { bm, bytes }); lruBytes += bytes;
  for (const [key, e] of lru) { if (lruBytes <= LRU_BYTES) break; if (pinned.has(key) || key === k) continue; lru.delete(key); lruBytes -= e.bytes; e.bm.close(); }
}
function lruDrop(pred) { for (const [key, e] of lru) if (pred(key)) { lru.delete(key); lruBytes -= e.bytes; e.bm.close(); } }
export function rideFrameStats() {
  let blobs = 0, blobBytes = 0;
  for (const s of stores.values()) for (const b of s.blobs.values()) { blobs++; blobBytes += b.size; }
  return { bitmaps: lru.size, bitmapBytes: lruBytes, bitmapMB: +(lruBytes / 1048576).toFixed(1), capMB: LRU_BYTES / 1048576, blobs, blobMB: +(blobBytes / 1048576).toFixed(2) };
}

// ---- store ----------------------------------------------------------------------------------
function validate(m) {
  const n = m && m.count;
  const ok = n > 0 && Array.isArray(m.pAt) && m.pAt.length === n && m.camera && Array.isArray(m.camera.l) && m.camera.l.length === n && Array.isArray(m.camera.p) && m.camera.p.length === n &&
    Array.isArray(m.order) && m.order.length === n && m.variants && m.variants.l && m.variants.p && Array.isArray(m.formats) && m.formats.length > 0;
  if (!ok) throw new Error('ride manifest: invalid');
  return m;
}

class RideStore {
  constructor(url) {
    this.url = url; this.base = url.slice(0, url.lastIndexOf('/') + 1);
    this.blobs = new Map(); this.inflight = new Map(); this.mp = null; this.pre = null;
  }
  manifest() {
    if (!this.mp) this.mp = fetch(this.url).then(r => { if (!r.ok) throw new Error('ride manifest: HTTP ' + r.status); return r.json(); }).then(validate);
    return this.mp;
  }
  async format(m) { return m.formats.includes('avif') && (await avifSupported()) ? 'avif' : m.formats.includes('webp') ? 'webp' : m.formats[0]; }
  path(v, i, fmt) { return v + '/' + pad4(i) + '.' + fmt; }
  hasBlob(v, i, fmt) { return this.blobs.has(this.path(v, i, fmt)); }
  // Fetch one compressed frame once; concurrent callers share the request.
  fetchBlob(v, i, fmt) {
    const k = this.path(v, i, fmt), have = this.blobs.get(k);
    if (have) return Promise.resolve(have);
    let f = this.inflight.get(k);
    if (!f) {
      f = fetch(this.base + k).then(r => { if (!r.ok) throw new Error('ride frame: HTTP ' + r.status); return r.blob(); })
        .then(b => { this.blobs.set(k, b); return b; })
        .finally(() => { this.inflight.delete(k); });
      this.inflight.set(k, f);
    }
    return f;
  }

  // Preload engine: fetches every frame of one variant in manifest.order (6 at a time) and keeps
  // going after the component that started it unmounts. Subscribers get { fraction, ready, failed }.
  preload() {
    if (!this.pre) { this.pre = { fraction: 0, ready: false, failed: false, done: 0, count: 0, subs: new Set() }; this.runPreload(this.pre); }
    return this.pre;
  }
  subscribe(fn) { const pre = this.preload(); pre.subs.add(fn); fn(snap(pre)); return () => pre.subs.delete(fn); }
  async runPreload(pre) {
    const emit = () => { const s = snap(pre); pre.subs.forEach(fn => fn(s)); };
    let m;
    try { m = await this.manifest(); } catch { pre.failed = true; pre.ready = true; emit(); return; }
    const v = variantFor(window.innerWidth / Math.max(1, window.innerHeight)), fmt = await this.format(m);
    const n = m.count, started = new Uint8Array(n), done = new Uint8Array(n), first = m.order.slice(0, Math.min(VALVE_FRAMES, n));
    let valve = false, oi = 0;
    pre.count = n;
    const check = () => {
      if (!pre.ready && (pre.done === n || (valve && first.every(i => done[i])))) pre.ready = true;
      emit();
    };
    setTimeout(() => { valve = true; check(); }, VALVE_MS);
    const next = () => {
      // Visitor already past the hero: fetch what the section is about to show first.
      const sec = window.scrollY > window.innerHeight ? document.querySelector('[data-screen-label="04 Landmarks"]') : null;
      if (sec) {
        const r = sec.getBoundingClientRect(), vh = window.innerHeight, p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
        if (r.top < vh * 3 && r.bottom > 0) {
          const ti = nearestIndex(m.pAt, p);
          for (let d = 0; d < n; d++) { if (ti + d < n && !started[ti + d]) return ti + d; if (d > 0 && ti - d >= 0 && !started[ti - d]) return ti - d; }
        }
      }
      while (oi < n && started[m.order[oi]]) oi++;
      return oi < n ? m.order[oi] : -1;
    };
    const worker = async () => {
      for (let i = next(); i >= 0; i = next()) {
        started[i] = 1;
        try { await this.fetchBlob(v, i, fmt); } catch { try { await this.fetchBlob(v, i, fmt); } catch { /* counted as done; the player falls back to the nearest frame */ } }
        done[i] = 1; pre.done++; pre.fraction = pre.done / n; check();
      }
    };
    await Promise.all(Array.from({ length: PRELOAD_FETCHES }, worker));
  }
}
const snap = pre => ({ fraction: pre.fraction, ready: pre.ready, failed: pre.failed, done: pre.done, count: pre.count });

const stores = new Map();
export function rideStore(url) { let s = stores.get(url); if (!s) { s = new RideStore(url); stores.set(url, s); } return s; }

// Manifest + format for the section, or null (-> live street) if it fails or takes too long.
export async function openRide(url, timeoutMs = 6000) {
  if (!url) return null;
  const store = rideStore(url);
  try {
    const m = await Promise.race([store.manifest(), new Promise((_, rej) => setTimeout(() => rej(new Error('ride manifest: timeout')), timeoutMs))]);
    return { store, manifest: m, format: await store.format(m) };
  } catch { return null; }
}

export function nearestIndex(pAt, p) {
  let lo = 0, hi = pAt.length - 1;
  if (p <= pAt[0]) return 0; if (p >= pAt[hi]) return hi;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pAt[mid] <= p) lo = mid; else hi = mid; }
  return p - pAt[lo] <= pAt[hi] - p ? lo : hi;
}

// ---- player ---------------------------------------------------------------------------------
// One canvas under the section's overlays. update() picks the frame nearest p (a cut, never a
// crossfade), falls back to the nearest decoded frame, keeps up to MAX_DECODES fetch+decodes in
// flight ahead in the scroll direction, and returns what the overlay camera needs.
export class RideFramesPlayer {
  constructor(host, ride) {
    this.store = ride.store; this.m = ride.manifest; this.fmt = ride.format;
    const c = this.canvas = document.createElement('canvas');
    c.setAttribute('data-ride-frames', '');
    c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;background:' + PAPER + ';visibility:hidden';
    host.insertBefore(c, host.firstChild);
    this.ctx = c.getContext('2d');
    this.v = null; this.dir = 1; this.lastP = null; this.planKey = ''; this.want = [];
    this.busy = 0; this.decoding = new Set(); this.failed = new Set(); this.drawn = ''; this.shown = null; this.visible = false;
  }
  key(v, i) { return this.store.url + '|' + v + '|' + i; }
  // Decode ahead of p without showing anything (used just before the map hands over).
  warm(p, W, H) { const v = this.v || variantFor(W / Math.max(1, H)); this.plan(v, nearestIndex(this.m.pAt, p)); this.setVisible(false); }
  update(p, W, H) {
    const m = this.m, n = m.count, want = variantFor(W / Math.max(1, H));
    if (!this.v) this.v = want;
    if (this.lastP !== null && p !== this.lastP) this.dir = p > this.lastP ? 1 : -1;
    this.lastP = p;
    const ti = nearestIndex(m.pAt, p);
    this.plan(want, ti);
    // Orientation change: keep drawing the old variant until the new one has the current frame.
    if (want !== this.v && lruHas(this.key(want, ti))) {
      const old = this.store.url + '|' + this.v + '|'; this.v = want;
      if (this.shown) pinned.delete(this.shown);
      this.shown = null; lruDrop(k => k.startsWith(old));
    }
    const v = this.v;
    let si = lruHas(this.key(v, ti)) ? ti : -1;
    for (let d = 1; si < 0 && d < n; d++) {
      const a = ti - d >= 0 && lruHas(this.key(v, ti - d)) ? ti - d : -1, b = ti + d < n && lruHas(this.key(v, ti + d)) ? ti + d : -1;
      if (a >= 0 && b >= 0) si = Math.abs(m.pAt[a] - p) <= Math.abs(m.pAt[b] - p) ? a : b; else if (a >= 0) si = a; else if (b >= 0) si = b;
    }
    if (si < 0) { this.setVisible(false); return null; }
    const k = this.key(v, si), bm = lruGet(k);
    if (this.shown !== k) { if (this.shown) pinned.delete(this.shown); pinned.add(k); this.shown = k; }
    const V = m.variants[v], s = Math.max(W / V.w, H / V.h), drawW = V.w * s, drawH = V.h * s, offX = (drawW - W) / 2, offY = (drawH - H) / 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), cw = Math.round(W * dpr), ch = Math.round(H * dpr), dk = k + '|' + cw + 'x' + ch;
    if (this.drawn !== dk) {
      const c = this.canvas, x = this.ctx;
      if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
      x.setTransform(cw / W, 0, 0, ch / H, 0, 0);
      x.globalCompositeOperation = 'source-over'; x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'multiply'; x.drawImage(bm, -offX, -offY, drawW, drawH);
      x.globalCompositeOperation = 'source-over';
      this.drawn = dk;
    }
    this.setVisible(true);
    return { i: si, v, key: v + si, cam: m.camera[v][si], fov: V.fov, w: V.w, h: V.h, drawW, drawH, offX, offY };
  }
  setVisible(on) { if (on !== this.visible) { this.visible = on; this.canvas.style.visibility = on ? 'visible' : 'hidden'; } }
  plan(v, ti) {
    const pk = v + ti + this.dir;
    if (pk !== this.planKey) {
      this.planKey = pk;
      const n = this.m.count, ahead = Math.max(2, framesFor(this.m, v) - 6), list = [ti];
      for (let d = 1; d <= ahead; d++) list.push(ti + this.dir * d);
      list.push(ti - this.dir, ti - 2 * this.dir);
      this.want = list.filter(i => i >= 0 && i < n).map(i => [v, i]);
    }
    this.pump();
  }
  pump() {
    while (this.busy < MAX_DECODES && this.want.length) {
      const [v, i] = this.want.shift(), k = this.key(v, i);
      if (lruHas(k) || this.decoding.has(k) || this.failed.has(k)) continue;
      this.decoding.add(k); this.busy++;
      this.store.fetchBlob(v, i, this.fmt).then(b => createImageBitmap(b)).then(bm => { if (this.dead) bm.close(); else lruPut(k, bm); })
        .catch(() => { this.failed.add(k); })
        .finally(() => { this.busy--; this.decoding.delete(k); if (!this.dead) this.pump(); });
    }
  }
  destroy() {
    this.dead = true; this.want = [];
    if (this.shown) pinned.delete(this.shown);
    const pre = this.store.url + '|'; lruDrop(k => k.startsWith(pre));
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }
}
