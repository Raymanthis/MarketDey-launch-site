// CityLife: living skyline (car-following traffic with jams, storms, rain canvas).
// Constructed only from lifecycle code (never in render). Operates on the SVG made by HomePage.buildCity.

const mulberry32 = a => () => {
  a |= 0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const r1 = n => Math.round(n * 10) / 10;
// linear mix of two #rrggbb colours
const mixHex = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp(pa >> 16 & 255, pb >> 16 & 255, t));
  const g = Math.round(lerp(pa >> 8 & 255, pb >> 8 & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
};

const SVGNS = 'http://www.w3.org/2000/svg';
const CLOUD_D = 'M0 0H120Q132 0 130 -10Q128 -22 112 -20Q108 -40 86 -38Q76 -56 52 -50Q32 -46 30 -28Q12 -32 6 -18Q-4 -16 -2 -6Q-1 0 0 0Z';

// IDM constants (px, seconds)
const S0 = 10, HEADWAY = 0.6, ACC = 60, DECEL = 90, DECEL_MAX = 260;

// roof segments per vehicle shape (vehicle-local coords, x relative to the inner g, y relative to the wrapper)
const ROOFS = [
  [[0, 22, -21], [22, 50, -32], [50, 66, -21]],
  [[0, 64, -38], [64, 72, -28]],
  [[0, 36, -32], [36, 44, -18]],
  [[0, 104, -52], [104, 112, -12], [112, 134, -44], [134, 140, -30]],
  [[0, 12, -24], [12, 58, -36], [58, 66, -22]],
  [[-2, 12, -14], [12, 24, -38], [24, 40, -12]],
  [[0, 74, -38], [74, 78, -12], [78, 94, -36], [94, 104, -26]],
  [[0, 62, -48], [62, 64, -10], [64, 82, -36], [82, 92, -26]],
];

export class CityLife {
  constructor(svgEl, { night = false, W, G = 292, seed = 1, reducedMotion = false } = {}) {
    this.svg = svgEl;
    this.el = svgEl.parentElement;
    this.night = !!night;
    this.W = W;
    this.G = G;
    this.seed = seed;
    this.reducedMotion = !!reducedMotion;
    this.rT = mulberry32(seed * 7 + 1);
    this.rS = mulberry32(seed * 7 + 2);
    this.rV = mulberry32(seed * 7 + 3);
    this.rR = mulberry32(seed * 7 + 4);

    this.viewTime = 0;
    this.simTime = 0;
    this.last = -1;
    this.running = false;
    this.inView = false;
    this.started = false;
    this.destroyed = false;
    this.raf = 0;
    this.io = null;

    // traffic schedule
    this.tSegs = [];
    this.tNextFree = 0;
    this.tIdx = 0;
    this.C = 0;
    this.tPhase = 'free';
    this.target = 0;
    this.lastSpawn = -1e9;
    this.queue = [];

    // weather schedule
    this.storms = [];
    this.stormId = 0;
    this.wx = { phase: 'clear', p: 0, dim: 0, rain: 0, storm: null };
    this.appliedPhase = 'clear';
    this.appliedStorm = 0;
    this.tinted = false;
    this.stormClouds = [];
    this.boltEv = null;
    // illustrated bolt lives in the SVG as its first child, so tiles, buildings and clouds draw over it
    this.boltG = document.createElementNS(SVGNS, 'g');
    this.boltG.setAttribute('data-cl-wx', '1');
    this.boltG.setAttribute('pointer-events', 'none');
    this.boltG.setAttribute('opacity', '0');
    svgEl.insertBefore(this.boltG, svgEl.firstChild);

    // visuals
    this.skyEls = Array.from(svgEl.querySelectorAll('[data-sky]'));
    this.cloudEls = Array.from(svgEl.querySelectorAll('[data-cloud]'));
    this.wxG = svgEl.querySelector('g[data-wx]');
    this.skyEls.forEach(g => { g.style.transition = 'opacity 2s ease'; });
    this.splashes = [];
    this.drops = [];
    this.nAct = 0;
    this.drawn = false;

    this.lanes = W >= 700 ? 3 : 2;
    this.laneDys = this.lanes === 3 ? [19, 23, 27] : [20, 26];
    this.orderDirty = false;
    this.readVehicles();
    this.makeCanvas();
    this.buildRainLayers();
    if (this.night) { this.addLights(); this.lightWindows(); }
  }

  // ---------- setup ----------
  readVehicles() {
    const W = this.W;
    this.vehicles = Array.from(this.svg.querySelectorAll('g[data-veh]')).map(g => {
      let bb;
      try { bb = g.getBBox(); } catch { bb = null; }
      if (!bb || !(bb.width > 0)) bb = { x: 0, y: -40, width: 70, height: 40 };
      return {
        g, wrapper: g.parentNode, i: +g.getAttribute('data-veh'), x: -600, v: 0, v0: +g.getAttribute('data-v') || 40,
        bx0: bb.x, len: bb.width, bbY: bb.y, bbH: bb.height,
        extra: g.hasAttribute('data-extra'), active: false, queued: false,
        lane: 0, dy: 0, drift: null, wdy: null, s0: S0,
      };
    });
    if (this.vehicles.length) {
      const last = this.vehicles[this.vehicles.length - 1];
      this.vehParent = last.wrapper.parentNode;
      this.vehAnchor = last.wrapper.nextSibling;
    }
    this.VN = this.vehicles.filter(v => !v.extra).length;
    this.target = this.VN;
    // seeded-shuffled lane order for the round-robin initial assignment
    const laneOrder = [];
    for (let L = 0; L < this.lanes; L++) laneOrder.push(L);
    for (let n = laneOrder.length - 1; n > 0; n--) {
      const j = Math.floor(this.rT() * (n + 1));
      const tmp = laneOrder[n]; laneOrder[n] = laneOrder[j]; laneOrder[j] = tmp;
    }
    let k = 0;
    const base = [];
    this.vehicles.forEach(v => {
      if (v.extra) { this.setActive(v, false); return; }
      v.fr = ((k * 0.37 + 0.15) % 1) * (W + 220) - 160;
      v.lane = laneOrder[k % this.lanes];
      v.dy = this.laneDys[v.lane];
      k++;
      v.v = v.v0 * 0.9;
      base.push(v);
    });
    const byLane = [];
    for (let L = 0; L < this.lanes; L++) byLane.push(base.filter(v => v.lane === L));
    byLane.forEach(group => {
      group.sort((a, b) => b.fr - a.fr);
      for (let n = 1; n < group.length; n++) {
        const ld = group[n - 1], f = group[n];
        if (ld.fr - ld.len - f.fr < S0) f.fr = ld.fr - ld.len - S0 - 30;
      }
    });
    base.forEach(v => { v.x = v.fr - v.bx0 - v.len; delete v.fr; this.setActive(v, true); });
    this.orderDirty = true;
  }

  // night mode: headlights, tail lights and lit windows
  addLights() {
    const id = 'cl-cone-' + this.seed;
    const defs = document.createElementNS(SVGNS, 'defs');
    defs.setAttribute('data-cl', '1');
    defs.innerHTML = '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd66b" stop-opacity=".35"></stop><stop offset="1" stop-color="#ffd66b" stop-opacity="0"></stop></linearGradient>';
    this.svg.insertBefore(defs, this.svg.firstChild);
    this.vehicles.forEach(v => {
      const y = v.bbY + v.bbH * 0.62, F = v.bx0 + v.len - 0.5;
      const tmp = document.createElementNS(SVGNS, 'g');
      tmp.innerHTML = '<polygon data-cl="1" points="' + F + ',' + (y - 2) + ' ' + F + ',' + (y + 2) + ' ' + (F + 48) + ',' + (y + 10) + ' ' + (F + 48) + ',' + (y - 8) + '" fill="url(#' + id + ')"></polygon>'
        + '<circle data-cl="1" cx="' + F + '" cy="' + y + '" r="2" fill="#ffd66b"></circle>'
        + '<rect data-cl="1" x="' + (v.bx0 - 1) + '" y="' + (y - 1.5) + '" width="2.5" height="3" rx=".6" fill="#e63946"></rect>';
      while (tmp.firstChild) v.g.appendChild(tmp.firstChild);
    });
  }

  lightWindows() {
    this.lit = [];
    this.svg.querySelectorAll('[data-scroll]').forEach((sc, tile) => {
      Array.from(sc.children).filter(c => c.tagName.toLowerCase() === 'g').slice(0, 3).forEach(copy => {
        copy.querySelectorAll('rect[data-w]').forEach((r, k) => {
          if (mulberry32(this.seed * 1000003 ^ tile * 7919 ^ k * 104729)() >= 0.30) return;
          this.lit.push({ r, anim: r.style.animation });
          r.style.animation = 'none'; r.style.fill = '#f6c453'; r.style.fillOpacity = '0.85';
          r.setAttribute('data-lit', '1');
        });
      });
    });
  }

  clearLights() {
    if (this.svg) this.svg.querySelectorAll('[data-cl]').forEach(n => n.remove());
    (this.lit || []).forEach(({ r, anim }) => {
      r.style.animation = anim; r.style.removeProperty('fill'); r.style.removeProperty('fill-opacity');
      r.removeAttribute('data-lit');
    });
    this.lit = [];
  }

  makeCanvas() {
    const elTop = this.el.getBoundingClientRect().top;
    let minTop = 0;
    this.svg.querySelectorAll('[data-sky],[data-cloud]').forEach(n => {
      minTop = Math.min(minTop, n.getBoundingClientRect().top - elTop);
    });
    this.top = Math.min(-380, minTop - 40);
    this.H = 320 - this.top;
    this.gy = this.G - this.top;
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:absolute;left:0;bottom:0;width:100%;height:' + this.H + 'px;pointer-events:none';
    c.width = Math.round(this.W * this.dpr);
    c.height = Math.round(this.H * this.dpr);
    this.el.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');
    const N = Math.max(40, Math.round(220 * this.W / 1440));
    this.N = N;
    const rr = this.rR;
    for (let n = 0; n < N; n++) {
      const len = 10 + rr() * 12;
      this.drops.push({ x: rr() * (this.W + 60) - 60, y: this.top - len - rr() * 60, len, spd: 650 + rr() * 300, ang: (8 + rr() * 4) * Math.PI / 180 });
    }
  }

  // rain/splash SVG layers: rain behind every vehicle, roof splashes above all vehicles
  buildRainLayers() {
    const id = 'cl-rain-' + this.seed;
    const col = this.night ? '#c8d6e5' : '#ffffff';
    const rainA = this.night ? 0.30 : 0.35;
    const splashA = this.night ? 0.60 : 0.65;
    const buckets = [0.9, 0.55, 0.25].map(b => (splashA * b).toFixed(3));

    // gradient fades rain in over the top 140 px so it never shows a hard line
    const defs = document.createElementNS(SVGNS, 'defs');
    defs.setAttribute('data-cl-rain', '1');
    defs.innerHTML = '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + this.top
      + '" x2="0" y2="' + (this.top + 140) + '">'
      + '<stop offset="0" stop-color="' + col + '" stop-opacity="0"></stop>'
      + '<stop offset="1" stop-color="' + col + '" stop-opacity="' + rainA + '"></stop></linearGradient>';
    this.svg.insertBefore(defs, this.svg.firstChild);
    this.rainDefs = defs;

    const mkRipple = () => {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', col);
      p.setAttribute('stroke-width', '1.2');
      p.setAttribute('d', '');
      return p;
    };
    const mkFill = () => {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('fill', col);
      p.setAttribute('stroke', 'none');
      p.setAttribute('d', '');
      return p;
    };

    if (!this.vehParent) { this.vehParent = this.svg; this.vehAnchor = null; }

    // rain layer: above buildings/road, below every vehicle
    this.rainL = document.createElementNS(SVGNS, 'g');
    this.rainL.setAttribute('data-cl-rain', '1');
    this.rainL.setAttribute('pointer-events', 'none');
    this.dropPath = document.createElementNS(SVGNS, 'path');
    this.dropPath.setAttribute('fill', 'none');
    this.dropPath.setAttribute('stroke', 'url(#' + id + ')');
    this.dropPath.setAttribute('stroke-width', '1');
    this.dropPath.setAttribute('stroke-linecap', 'round');
    this.dropPath.setAttribute('d', '');
    this.rainL.appendChild(this.dropPath);
    this.gndR = []; this.gndF = [];
    for (let b = 0; b < 3; b++) {
      const r = mkRipple(), f = mkFill();
      r.setAttribute('opacity', buckets[b]);
      f.setAttribute('opacity', buckets[b]);
      this.rainL.appendChild(r); this.rainL.appendChild(f);
      this.gndR.push(r); this.gndF.push(f);
    }
    if (this.vehicles.length) this.vehParent.insertBefore(this.rainL, this.vehicles[0].wrapper);
    else this.vehParent.appendChild(this.rainL);

    // roof layer: above all vehicles; re-anchor so later draw-order re-sorting keeps it on top
    this.roofL = document.createElementNS(SVGNS, 'g');
    this.roofL.setAttribute('data-cl-roof', '1');
    this.roofL.setAttribute('pointer-events', 'none');
    this.roofR = []; this.roofF = [];
    for (let b = 0; b < 3; b++) {
      const r = mkRipple(), f = mkFill();
      r.setAttribute('opacity', buckets[b]);
      f.setAttribute('opacity', buckets[b]);
      this.roofL.appendChild(r); this.roofL.appendChild(f);
      this.roofR.push(r); this.roofF.push(f);
    }
    this.vehParent.insertBefore(this.roofL, this.vehAnchor);
    this.vehAnchor = this.roofL;

    this.dropD = '';
    this.gndRd = ['', '', '']; this.gndFd = ['', '', ''];
    this.roofRd = ['', '', '']; this.roofFd = ['', '', ''];
    this.roofSplashes = [];
  }

  setActive(v, on) {
    v.active = on;
    v.g.style.visibility = on ? '' : 'hidden';
    if (!on) {
      v.drift = null;
      v.x = -600;
      v.g.style.transform = 'translateX(-600px)';
      this.orderDirty = true;
    }
  }

  // ---------- lifecycle ----------
  start() {
    if (this.started || this.destroyed) return;
    this.started = true;
    this.loop = now => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(this.loop);
      this.tick(now);
    };
    this.onVis = () => this.updateRunning();
    document.addEventListener('visibilitychange', this.onVis);
    if (typeof IntersectionObserver === 'function') {
      this.io = new IntersectionObserver(entries => {
        const e = entries[entries.length - 1];
        this.inView = !!(e && e.isIntersecting);
        this.updateRunning();
      }, { threshold: 0 });
      this.io.observe(this.el);
    } else {
      this.inView = true;
    }
    this.render(0);
    this.updateRunning();
  }

  updateRunning() {
    const want = this.started && !this.destroyed && this.inView && document.visibilityState === 'visible';
    if (want && !this.running) {
      this.running = true;
      this.last = -1;
      this.raf = requestAnimationFrame(this.loop);
    } else if (!want && this.running) {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.last = -1;
    }
  }

  stop() {
    this.started = false;
    if (this.io) { this.io.disconnect(); this.io = null; }
    if (this.onVis) { document.removeEventListener('visibilitychange', this.onVis); this.onVis = null; }
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.running = false;
    this.inView = false;
    this.last = -1;
  }

  destroy() {
    if (this.destroyed) return;
    this.stop();
    this.destroyed = true;
    if (this.canvas) this.canvas.remove();
    this.clearStormClouds();
    this.clearLights();
    this.skyEls.forEach(g => { g.style.removeProperty('transition'); g.style.removeProperty('opacity'); });
    this.cloudEls.forEach(g => {
      const p = g.querySelector('path');
      if (p) ['transition', 'fill', 'stroke', 'stroke-width'].forEach(k => p.style.removeProperty(k));
    });
    if (this.boltG) { this.boltG.remove(); this.boltG = null; }
    if (this.rainL) { this.rainL.remove(); this.rainL = null; }
    if (this.roofL) { this.roofL.remove(); this.roofL = null; }
    if (this.rainDefs) { this.rainDefs.remove(); this.rainDefs = null; }
    if (this.svg) { const d = this.svg.querySelector('defs[data-cl-wx]'); if (d) d.remove(); }
    this.boltEv = null;
    this.canvas = null; this.ctx = null;
    this.vehicles = []; this.queue = []; this.skyEls = []; this.cloudEls = [];
    this.wxG = null; this.svg = null; this.el = null; this.splashes = []; this.roofSplashes = []; this.drops = [];
  }

  tick(now) {
    if (this.last < 0) { this.last = now; return; }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (dt <= 0) return;
    this.viewTime += dt;
    this.simTime += dt;
    this.step(dt);
    this.render(dt);
  }

  // ---------- traffic schedule ----------
  genTraffic() {
    const r = this.rT, fs = this.tNextFree, first = this.tSegs.length === 0, bs = fs + 60;
    const waves = [];
    let ws = fs + 15 + r() * 10;
    for (;;) {
      const d = 6 + r() * 4, cw = 0.2 + r() * 0.3;
      if (ws + d > bs) break;
      waves.push({ s: ws, e: ws + d, cw });
      ws += 15 + r() * 10;
    }
    const bEnd = bs + 15, hEnd = bEnd + 25 + r() * 15, eEnd = hEnd + 20;
    this.tSegs.push(
      { k: 'free', t0: fs, t1: bs, decay: !first, waves },
      { k: 'build', t0: bs, t1: bEnd },
      { k: 'hold', t0: bEnd, t1: hEnd },
      { k: 'ease', t0: hEnd, t1: eEnd },
    );
    this.tNextFree = eEnd;
  }

  trafficAt(t) {
    if (this.reducedMotion) return { C: 0, phase: 'free' };
    if (t < 0) t = 0;
    while (!this.tSegs.length || this.tSegs[this.tSegs.length - 1].t1 <= t) this.genTraffic();
    if (this.tIdx >= this.tSegs.length || t < this.tSegs[this.tIdx].t0) this.tIdx = 0;
    while (this.tSegs[this.tIdx].t1 <= t) this.tIdx++;
    const s = this.tSegs[this.tIdx];
    if (s.k === 'build') return { C: smooth((t - s.t0) / 15), phase: 'build' };
    if (s.k === 'hold') return { C: 1, phase: 'hold' };
    if (s.k === 'ease') return { C: lerp(1, 0.3, smooth((t - s.t0) / 20)), phase: 'ease' };
    let wc = 0, inWave = false;
    for (const w of s.waves) {
      if (t >= w.s && t < w.e) { inWave = true; wc = Math.max(wc, w.cw * smooth((t - w.s) / 1.5) * smooth((w.e - t) / 1.5)); }
    }
    let dc = 0;
    if (s.decay) { const x = (t - s.t0) / 8; if (x < 1) dc = 0.3 * (1 - smooth(x)); }
    return { C: Math.max(wc, dc), phase: inWave ? 'wave' : 'free' };
  }

  deriveTraffic() {
    const tr = this.trafficAt(this.viewTime);
    this.C = tr.C;
    this.tPhase = tr.phase;
    const jamK = tr.phase === 'build' || tr.phase === 'hold' ? tr.C : tr.phase === 'ease' ? tr.C * 0.5 : 0;
    this.target = Math.min(this.vehicles.length, this.VN + Math.round(this.VN * jamK));
  }

  // ---------- weather schedule ----------
  makeStorm(start, D) {
    const id = ++this.stormId, gEnd = start + 10, cEnd = gEnd + D, rv = this.rV;
    const n = 3 + Math.floor(rv() * 4), events = [];
    for (let k = 0; k < n; k++) events.push({ t: gEnd + 2 + rv() * (D - 4), double: rv() < 0.35, bolt: rv() < 0.5, fired: false });
    events.sort((a, b) => a.t - b.t);
    return { id, start, D, gEnd, cEnd, end: cEnd + 10, events };
  }

  genStorm() {
    const r = this.rS, last = this.storms[this.storms.length - 1];
    // 60–90 s of clear sky between storms, so the skyline is clear more often than not.
    const start = last ? last.end + 60 + r() * 30 : 30 + r() * 20;
    this.storms.push(this.makeStorm(start, 30 + r() * 10));
  }

  weatherAt(t) {
    if (this.reducedMotion) return { phase: 'clear', p: 0, dim: 0, rain: 0, storm: null };
    while (!this.storms.length || this.storms[this.storms.length - 1].end <= t) this.genStorm();
    let s = null;
    for (let k = this.storms.length - 1; k >= 0; k--) {
      if (this.storms[k].start <= t) { s = this.storms[k]; break; }
    }
    if (!s || t >= s.end) return { phase: 'clear', p: 0, dim: 0, rain: 0, storm: null };
    if (t < s.gEnd) {
      const p = (t - s.start) / 10, x = t - (s.gEnd - 2);
      return { phase: 'gathering', p, dim: smooth(p), rain: x > 0 ? 0.3 * x / 2 : 0, storm: s };
    }
    if (t < s.cEnd) {
      const x = t - s.gEnd;
      return { phase: 'storm', p: x / s.D, dim: 1, rain: x < 3 ? lerp(0.3, 1, x / 3) : 1, storm: s };
    }
    const p = (t - s.cEnd) / 10;
    return { phase: 'clearing', p, dim: 1 - smooth(p), rain: 1 - p, storm: s };
  }

  deriveWeather() { this.wx = this.weatherAt(this.viewTime); }

  forceStorm() {
    if (this.reducedMotion) return this.state();
    this.deriveWeather();
    if (this.wx.phase !== 'clear') return this.state();
    const t = this.viewTime;
    this.storms = this.storms.filter(s => s.start <= t);
    this.storms.push(this.makeStorm(t, 30 + this.rS() * 10));
    this.deriveWeather();
    return this.state();
  }

  setViewTime(sec) {
    this.viewTime = Math.max(0, +sec || 0);
    this.storms.forEach(s => s.events.forEach(e => { e.fired = e.t < this.viewTime; }));
    this.clearBolt();
    this.deriveTraffic();
    this.deriveWeather();
    this.syncWeather();
    this.updateStormClouds();
    this.applyVehicles();
  }

  // ---------- traffic sim ----------
  step(dt) {
    this.deriveTraffic();
    const W = this.W, Z0 = 0.62 * W, Z1 = 0.97 * W;
    const frontOf = v => v.x + v.bx0 + v.len;
    const rearOf = v => v.x + v.bx0;
    const act = this.vehicles.filter(v => v.active);

    // okada/keke start filtering (drifting) in slow traffic
    if ((this.tPhase === 'build' || this.tPhase === 'hold') && this.C > 0.5) {
      act.forEach(v => {
        if (v.drift || (v.i !== 5 && v.i !== 2)) return;
        const front = frontOf(v);
        if (front >= Z0 - 200 && front <= Z1 && v.v < 15) {
          const ns = [];
          if (v.lane > 0) ns.push(v.lane - 1);
          if (v.lane < this.lanes - 1) ns.push(v.lane + 1);
          if (ns.length && this.rT() < dt / 5) {
            v.drift = { to: ns[Math.floor(this.rT() * ns.length)], t: 0 };
            this.orderDirty = true;
          }
        }
      });
    }

    const drifters = act.filter(v => v.drift);
    const groups = [];
    for (let L = 0; L < this.lanes; L++) {
      groups.push(act.filter(v => !v.drift && v.lane === L).sort((a, b) => frontOf(b) - frontOf(a)));
    }

    // car-following within each lane only
    groups.forEach(group => {
      group.forEach((v, n) => {
        const front = frontOf(v), rear = rearOf(v);
        const inZone = front >= Z0 - 30 && rear <= Z1;
        const s0 = inZone ? 6 : 10, T = inZone ? 0.35 : HEADWAY;
        v.s0 = s0;
        let vd = v.v0;
        if (inZone) {
          const jam = 8 * Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * this.simTime / 7 - front / 45), 2);
          vd = Math.min(v.v0, lerp(v.v0, jam, this.C));
        }
        vd = Math.max(0.5, vd);
        const ld = n > 0 ? group[n - 1] : null;
        let term = 0;
        if (ld) {
          const s = ld.x + ld.bx0 - front;
          const sStar = Math.max(s0, s0 + v.v * T + v.v * (v.v - ld.v) / (2 * Math.sqrt(ACC * DECEL)));
          term = Math.pow(sStar / Math.max(s, 0.1), 2);
        }
        v._a = Math.max(-DECEL_MAX, Math.min(ACC, ACC * (1 - Math.pow(v.v / vd, 4) - term)));
      });
    });
    // drifters: walking pace, no leader
    drifters.forEach(v => {
      const vd = Math.max(0.5, Math.min(v.v0, 18));
      v._a = Math.max(-DECEL_MAX, Math.min(ACC, ACC * (1 - Math.pow(v.v / vd, 4))));
    });

    act.forEach(v => {
      v.v = Math.max(0, v.v + (v._a || 0) * dt);
      v.x += v.v * dt;
    });

    // drifters slide sideways at 3 px/s toward the target lane
    drifters.forEach(v => {
      v.drift.t += dt;
      const target = this.laneDys[v.drift.to];
      const stepDy = 3 * dt;
      if (target > v.dy) v.dy = Math.min(target, v.dy + stepDy);
      else if (target < v.dy) v.dy = Math.max(target, v.dy - stepDy);
    });

    // hard no-overlap clamp within each lane (front to back)
    groups.forEach(group => {
      for (let n = 1; n < group.length; n++) {
        const ld = group[n - 1], v = group[n];
        const gap = ld.x + ld.bx0 - (v.x + v.bx0 + v.len);
        if (gap < v.s0) { v.x += gap - v.s0; v.v = Math.min(v.v, ld.v); }
      }
    });

    // drifters keep clear of each other
    drifters.sort((a, b) => frontOf(b) - frontOf(a));
    for (let n = 1; n < drifters.length; n++) {
      const ld = drifters[n - 1], v = drifters[n];
      const gap = ld.x + ld.bx0 - (v.x + v.bx0 + v.len);
      if (gap < 6) { v.x += gap - 6; v.v = Math.min(v.v, ld.v); }
    }

    // merge drifters once the target lane dy is reached and there is room
    drifters.forEach(v => {
      if (!v.drift) return;
      if (Math.abs(v.dy - this.laneDys[v.drift.to]) < 0.01) {
        const front = frontOf(v), rear = rearOf(v), L = v.drift.to;
        let gapAhead = Infinity, gapBehind = Infinity;
        act.forEach(o => {
          if (o === v || o.drift || o.lane !== L) return;
          const of = frontOf(o), or = rearOf(o);
          if (or >= front) gapAhead = Math.min(gapAhead, or - front);
          if (of <= rear) gapBehind = Math.min(gapBehind, rear - of);
        });
        if (gapAhead >= 6 && gapBehind >= 6) {
          v.lane = L;
          v.drift = null;
          this.orderDirty = true;
        }
      }
    });

    // exits
    let count = act.length;
    act.forEach(v => {
      if (v.x + v.bx0 > W + 20) {
        if (count > this.target) { this.setActive(v, false); v.queued = false; } else { this.setActive(v, false); v.queued = true; this.queue.push(v); }
        count--;
      }
    });

    // spawn into the lane with the most entry room
    const minSpawn = this.tPhase === 'build' || this.tPhase === 'hold' ? 0.45 : 0;
    if (this.simTime - this.lastSpawn >= minSpawn) {
      let cand = null;
      if (this.queue.length) cand = this.queue[0];
      else if (count < this.target) cand = this.vehicles.find(v => !v.active && !v.queued);
      if (cand) {
        let bestLane = -1, bestRoom = -Infinity, bestRear = null;
        for (let L = 0; L < this.lanes; L++) {
          let rearMost = null, rearMostRear = Infinity;
          this.vehicles.forEach(v => {
            if (v.active && !v.drift && v.lane === L && v.x + v.bx0 < rearMostRear) { rearMost = v; rearMostRear = v.x + v.bx0; }
          });
          const room = rearMost ? rearMostRear + 20 : Infinity;
          if (room > bestRoom) { bestRoom = room; bestLane = L; bestRear = rearMost; }
        }
        if (bestRoom >= S0 + 30) {
          if (this.queue[0] === cand) this.queue.shift();
          cand.queued = false;
          cand.lane = bestLane;
          cand.dy = this.laneDys[bestLane];
          cand.v = Math.min(cand.v0, bestRear ? bestRear.v + 10 : cand.v0);
          this.setActive(cand, true);
          cand.x = -20 - cand.bx0 - cand.len;
          this.lastSpawn = this.simTime;
          this.orderDirty = true;
        }
      }
    }

    // nearer lanes draw on top
    if (this.orderDirty) {
      this.orderDirty = false;
      const sorted = this.vehicles.slice().sort((a, b) => {
        if (a.active !== b.active) return a.active ? 1 : -1;
        if (a.dy !== b.dy) return a.dy - b.dy;
        return (b.x + b.bx0 + b.len) - (a.x + a.bx0 + a.len);
      });
      sorted.forEach(v => this.vehParent.insertBefore(v.wrapper, this.vehAnchor));
    }
  }

  applyVehicles() {
    this.vehicles.forEach(v => {
      if (v.active) v.g.style.transform = 'translateX(' + v.x.toFixed(1) + 'px)';
      if (v.wdy === null || Math.abs(v.dy - v.wdy) > 0.05) {
        v.wdy = v.dy;
        v.wrapper.setAttribute('transform', 'translate(0 ' + (this.G + v.dy).toFixed(1) + ')');
      }
    });
  }

  // ---------- weather visuals ----------
  syncWeather() {
    const w = this.wx, ph = w.phase, sid = w.storm ? w.storm.id : 0;
    if (ph === this.appliedPhase && sid === this.appliedStorm) return;
    const clear = ph === 'clear', tint = ph === 'gathering' || ph === 'storm';
    this.skyEls.forEach(g => { g.style.opacity = clear ? '1' : '0'; });
    if (tint !== this.tinted) {
      const fill = this.night ? '#343431' : '#3a5642';
      this.cloudEls.forEach(g => {
        const p = g.querySelector('path');
        if (!p) return;
        if (tint) {
          p.style.transition = 'fill 3s ease, stroke 3s ease';
          p.style.fill = fill; p.style.stroke = 'rgba(255,255,255,.5)'; p.style.strokeWidth = '1.6';
        } else {
          p.style.removeProperty('fill'); p.style.removeProperty('stroke'); p.style.removeProperty('stroke-width');
        }
      });
      this.tinted = tint;
    }
    if (clear) this.clearStormClouds();
    else if (sid !== this.appliedStorm || !this.stormClouds.length) this.buildStormClouds();
    this.appliedPhase = ph;
    this.appliedStorm = sid;
  }

  clearStormClouds() {
    this.stormClouds.forEach(c => c.g.remove());
    this.stormClouds = [];
  }

  buildStormClouds() {
    this.clearStormClouds();
    if (!this.wxG) return;
    this.ensureGlowDefs();
    const rv = this.rV, W = this.W, n = 4 + Math.floor(rv() * 3), span = (W - 120) + 60;
    for (let j = 0; j < n; j++) {
      const S = 1.6 + rv() * 0.8, Y = -340 + rv() * 150;
      const Xt = -60 + (j + 0.5) * (span / n) + (rv() - 0.5) * (span / n) * 0.6;
      const from = j % 2 ? W + 60 : -300;
      const g = document.createElementNS(SVGNS, 'g');
      // glow sits behind the body: the cloud lights up from inside during a strike
      const glow = document.createElementNS(SVGNS, 'ellipse');
      glow.setAttribute('cx', '66');
      glow.setAttribute('cy', '-10');
      glow.setAttribute('rx', '95');
      glow.setAttribute('ry', '48');
      glow.setAttribute('fill', 'url(#cl-glow-' + this.seed + ')');
      glow.setAttribute('opacity', '0');
      g.appendChild(glow);
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', CLOUD_D);
      // heavier grey-green (hero) / lighter charcoal (night): darker than normal clouds, never near-black
      p.setAttribute('fill', this.night ? '#3b3b38' : '#36503f');
      p.setAttribute('stroke', 'rgba(255,255,255,.5)');
      p.setAttribute('stroke-width', '1.3');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('vector-effect', 'non-scaling-stroke');
      g.appendChild(p);
      // inner detail strokes, same as buildCity's cloud()
      const dl = document.createElementNS(SVGNS, 'path');
      dl.setAttribute('d', 'M44 -30Q50 -40 62 -38M90 -24Q98 -28 104 -24');
      dl.setAttribute('fill', 'none');
      dl.setAttribute('stroke', 'rgba(255,255,255,.3)');
      dl.setAttribute('stroke-width', '1.1');
      dl.setAttribute('stroke-linecap', 'round');
      dl.setAttribute('vector-effect', 'non-scaling-stroke');
      g.appendChild(dl);
      // lit lower edge, drawn last
      const hl = document.createElementNS(SVGNS, 'path');
      hl.setAttribute('d', 'M8 -3Q40 3 66 0Q96 -3 124 -4');
      hl.setAttribute('fill', 'none');
      hl.setAttribute('stroke', '#f4fbe0');
      hl.setAttribute('stroke-width', '1.6');
      hl.setAttribute('stroke-linecap', 'round');
      hl.setAttribute('vector-effect', 'non-scaling-stroke');
      hl.setAttribute('opacity', '0');
      g.appendChild(hl);
      g.setAttribute('opacity', '0');
      this.wxG.appendChild(g);
      this.stormClouds.push({ g, S, Y, Xt, from, dir: Xt + 60 * S < W / 2 ? -1 : 1, cx: from, glow, body: p, detail: dl, hl, L: -1 });
    }
    this.updateStormClouds();
  }

  ensureGlowDefs() {
    if (this.svg.querySelector('defs[data-cl-wx]')) return;
    const defs = document.createElementNS(SVGNS, 'defs');
    defs.setAttribute('data-cl-wx', '1');
    defs.innerHTML = '<radialGradient id="cl-glow-' + this.seed + '" cx="50%" cy="55%" r="50%">'
      + '<stop offset="0" stop-color="#f1f9d8" stop-opacity=".85"></stop>'
      + '<stop offset=".55" stop-color="#d9ef9a" stop-opacity=".35"></stop>'
      + '<stop offset="1" stop-color="#d9ef9a" stop-opacity="0"></stop></radialGradient>';
    this.svg.insertBefore(defs, this.svg.firstChild);
  }

  updateStormClouds() {
    const w = this.wx, s = w.storm;
    if (!s || !this.stormClouds.length) return;
    const t = this.viewTime, W = this.W;
    const base = this.night ? '#3b3b38' : '#36503f';
    const lit = s.events.filter(e => e.src != null && this.stormClouds[e.src]);
    this.stormClouds.forEach(c => {
      let X, op;
      if (w.phase === 'gathering') { const p = clamp01(w.p); X = c.from + (c.Xt - c.from) * (1 - Math.pow(1 - p, 3)); op = 0.95 * p; }
      else if (w.phase === 'storm') { X = c.Xt + 4 * (t - s.gEnd); op = 0.95; }
      else { X = c.Xt + 4 * s.D + c.dir * 90 * (t - s.cEnd); op = 0.95 * (1 - clamp01(w.p)); }
      c.cx = X;
      c.g.setAttribute('transform', 'translate(' + r1(X) + ' ' + r1(c.Y) + ') scale(' + c.S.toFixed(2) + ')');
      c.g.setAttribute('opacity', op.toFixed(3));
      // lightning light: source cloud brightest, neighbours fade with distance
      const cxc = c.cx + 66 * c.S;
      let L = 0;
      lit.forEach(e => {
        const k = this.flashK(e, t);
        if (k <= 0) return;
        const sc = this.stormClouds[e.src];
        const d = Math.abs(cxc - (sc.cx + 66 * sc.S));
        const fall = d === 0 ? 1 : 0.85 * Math.exp(-d / (0.22 * W));
        L = Math.max(L, k * fall);
      });
      if (Math.abs(L - c.L) > 0.002) {
        c.L = L;
        c.body.setAttribute('fill', mixHex(base, '#eef8cf', 0.85 * L));
        c.body.setAttribute('stroke', 'rgba(255,255,255,' + (0.5 + 0.5 * L).toFixed(3) + ')');
        c.detail.setAttribute('stroke', 'rgba(255,255,255,' + (0.3 + 0.6 * L).toFixed(3) + ')');
        c.glow.setAttribute('opacity', L.toFixed(3));
        c.hl.setAttribute('opacity', L.toFixed(3));
      }
    });
  }

  genBolt(t0, src) {
    const rv = this.rV, W = this.W;
    let sx, sy;
    const c = src != null && this.stormClouds[src] ? this.stormClouds[src] : null;
    if (c) { sx = c.cx + (40 + rv() * 52) * c.S; sy = c.Y - 8 * c.S; }
    else if (this.stormClouds.length) {
      const k = this.stormClouds[Math.floor(rv() * this.stormClouds.length)];
      sx = k.cx + (40 + rv() * 52) * k.S; sy = k.Y - 8 * k.S;
    } else { sx = rv() * W; sy = -260; }
    const ey = this.G - 30 - rv() * 40, ex = sx + (rv() - 0.5) * 120;
    // main channel: steps down with jitter, nudged toward the end x
    const n = 8 + Math.floor(rv() * 4), pts = [[sx, sy]];
    for (let k = 1; k < n; k++) {
      const f = k / (n - 1), px = pts[k - 1][0];
      pts.push([px + (ex - px) / (n - k) + (rv() * 2 - 1) * 16, lerp(sy, ey, f)]);
    }
    pts[n - 1] = [ex, ey];
    // 1-3 branches off the upper 60% of the channel, down and sideways, getting shorter
    const branches = [];
    const nb = 1 + Math.floor(rv() * 3), hi = Math.max(1, Math.floor((n - 1) * 0.6));
    for (let b = 0; b < nb; b++) {
      const s0 = pts[Math.floor(rv() * (hi + 1))], side = rv() < 0.5 ? -1 : 1;
      const segs = 3 + Math.floor(rv() * 3), bp = [[s0[0], s0[1]]];
      let sh = 1;
      for (let k = 1; k <= segs; k++) {
        const px = bp[k - 1][0], py = bp[k - 1][1];
        bp.push([px + side * (10 + rv() * 12) * sh, py + (14 + rv() * 10) * sh]);
        sh *= 0.82;
      }
      branches.push(bp);
    }
    const toD = a => a.map((q, k) => (k ? 'L' : 'M') + r1(q[0]) + ' ' + r1(q[1])).join('');
    return { t0, main: toD(pts), branches: branches.map(toD), sx, sy, ex, ey };
  }

  // build the SVG bolt once per strike: glow strokes first, then cores, then the impact glow
  showBolt(b) {
    const g = this.boltG;
    if (!g) return;
    while (g.firstChild) g.removeChild(g.firstChild);
    const mk = (d, w, col, op) => {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', col);
      p.setAttribute('stroke-width', w);
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      if (op) p.setAttribute('stroke-opacity', op);
      return p;
    };
    const glow = [mk(b.main, 7, '#e6f5b8', '.35')].concat(b.branches.map(d => mk(d, 4, '#e6f5b8', '.35')));
    const core = [mk(b.main, 2, '#ffffff')].concat(b.branches.map(d => mk(d, 1.2, '#ffffff')));
    glow.forEach(n => g.appendChild(n));
    core.forEach(n => g.appendChild(n));
    const c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('cx', r1(b.ex));
    c.setAttribute('cy', r1(b.ey));
    c.setAttribute('r', '10');
    c.setAttribute('fill', '#e6f5b8');
    c.setAttribute('opacity', '.35');
    g.appendChild(c);
  }

  clearBolt() {
    this.boltEv = null;
    if (!this.boltG) return;
    this.boltG.setAttribute('opacity', '0');
    while (this.boltG.firstChild) this.boltG.removeChild(this.boltG.firstChild);
  }

  updateBolt() {
    const e = this.boltEv;
    if (!e) return;
    const k = this.flashK(e, this.viewTime);
    this.boltG.setAttribute('opacity', k.toFixed(3));
    if (k === 0 && this.viewTime - e.t > 0.4) this.clearBolt();
  }

  // ---------- drawing ----------
  // fire due lightning events before clouds update, so the source cloud lights on the strike frame
  fireLightning() {
    const w = this.wx;
    if (w.storm) {
      w.storm.events.forEach(e => {
        if (!e.fired && this.viewTime >= e.t) {
          e.fired = true;
          if (this.stormClouds.length) {
            e.src = Math.floor(this.rV() * this.stormClouds.length);
            const sc = this.stormClouds[e.src];
            e.sx = sc.cx + 66 * sc.S;
          }
          if (e.bolt) { this.boltEv = e; this.showBolt(this.genBolt(e.t, e.src)); }
        }
      });
    }
  }

  render(dt) {
    this.deriveTraffic();
    this.deriveWeather();
    this.syncWeather();
    this.fireLightning();
    this.updateStormClouds();
    this.applyVehicles();
    this.stepRain(dt);
    this.draw(dt);
  }

  // flash envelope of event e at viewTime t: 0..1, with a second pulse for double strikes
  flashK(e, t) {
    const d = t - e.t;
    const pulse = x => (x < 0 ? 0 : x < 0.05 ? x / 0.05 : x < 0.15 ? 1 - (x - 0.05) / 0.10 : 0);
    let k = pulse(d);
    if (e.double) k = Math.max(k, 0.7 * pulse(d - 0.18));
    return k;
  }

  flashAlpha() {
    const s = this.wx.storm;
    if (!s) return 0;
    let a = 0;
    s.events.forEach(e => { a = Math.max(a, 0.2 * this.flashK(e, this.viewTime)); });
    return a;
  }

  draw(dt) {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.wx, W = this.W, H = this.H;
    this.updateBolt();
    const flash = this.flashAlpha();
    // dim eases off while a strike is lit so the clouds and bolt are not buried
    let K = 0;
    if (w.storm) w.storm.events.forEach(e => { K = Math.max(K, this.flashK(e, this.viewTime)); });
    const dimK = 1 - 0.7 * K;
    if (!w.dim && !w.rain && !flash && !this.boltEv) {
      if (this.drawn) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.drawn = false; }
      return;
    }
    this.drawn = true;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // 1 dim
    if (w.dim > 0) {
      ctx.fillStyle = this.night ? 'rgba(0,0,0,' + (0.28 * w.dim * dimK).toFixed(3) + ')' : 'rgba(12,28,18,' + (0.22 * w.dim * dimK).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    // 2 flash
    if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + flash.toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
    // 3 bolt is SVG (this.boltG), drawn under the city by showBolt()/updateBolt()
    // soften the canvas top edge so dim/flash never show a hard line
    if (!this.topFade) {
      this.topFade = ctx.createLinearGradient(0, 0, 0, 140);
      this.topFade.addColorStop(0, 'rgba(0,0,0,1)');
      this.topFade.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = this.topFade;
    ctx.fillRect(0, 0, W, 140);
    ctx.globalCompositeOperation = 'source-over';
  }

  // world roof y at world x wx (svg coords), or null if the shape has no roof there
  roofAt(v, wx) {
    const segs = ROOFS[v.i];
    if (!segs) return null;
    const lx = wx - v.x;
    for (let k = 0; k < segs.length; k++) {
      const s = segs[k];
      if (lx >= s[0] && lx <= s[1]) return this.G + v.dy + s[2];
    }
    return null;
  }

  addGroundSplash(x, y) {
    if (this.splashes.length >= 160) return;
    const rv = this.rV, n = 2 + Math.floor(rv() * 2), dr = [];
    for (let k = 0; k < n; k++) dr.push({ x, y, vx: -45 + rv() * 90, vy: -150 + rv() * 60 });
    this.splashes.push({ x, age: 0, dr });
  }

  addRoofSplash(v, lx, ly) {
    if (this.roofSplashes.length >= 80) return;
    const rv = this.rV, dr = [];
    for (let k = 0; k < 2; k++) dr.push({ x: 0, y: 0, vx: -30 + rv() * 60, vy: -90 + rv() * 40 });
    this.roofSplashes.push({ veh: v, lx, ly, age: 0, dr });
  }

  stepRain(dt) {
    const W = this.W, G = this.G, rr = this.rR;
    const na = Math.round(this.N * this.wx.rain);
    const act = this.vehicles.filter(v => v.active);
    for (let k = this.nAct; k < na; k++) this.drops[k].y = this.top - 40 + rr() * (this.gy + 40);
    this.nAct = na;

    const drops = [];
    for (let k = 0; k < na; k++) {
      const d = this.drops[k], sn = Math.sin(d.ang), cs = Math.cos(d.ang), dist = d.spd * dt;
      const py = d.y;
      d.x += sn * dist;
      d.y += cs * dist;
      const hx = d.x, hy = d.y;
      let hit = null;
      for (const v of act) {
        if (hx < v.x + v.bx0 || hx > v.x + v.bx0 + v.len) continue;
        if (!hit || v.dy > hit.dy) hit = v;
      }
      let ry = null;
      if (hit) ry = this.roofAt(hit, hx);
      if (ry != null && py < ry && hy >= ry) {
        this.addRoofSplash(hit, hx - hit.x, ry - (G + hit.dy));
        d.y = this.top - d.len - rr() * 60;
        d.x = rr() * (W + 60) - 60;
      } else if (hy >= G) {
        this.addGroundSplash(hx, G);
        d.y = this.top - d.len - rr() * 60;
        d.x = rr() * (W + 60) - 60;
      }
      drops.push('M' + r1(d.x - sn * d.len) + ' ' + r1(d.y - cs * d.len) + 'L' + r1(d.x) + ' ' + r1(d.y));
    }
    const dropD = drops.join(' ');

    // advance ground and roof splashes, capping their lives at 0.3 s
    this.splashes = this.splashes.filter(sp => {
      sp.age += dt;
      if (sp.age >= 0.3) return false;
      sp.dr.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 700 * dt; });
      return true;
    });
    this.roofSplashes = this.roofSplashes.filter(sp => {
      sp.age += dt;
      if (sp.age >= 0.3 || !sp.veh.active) return false;
      sp.dr.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 600 * dt; });
      return true;
    });

    // ripple and droplet strings per age bucket
    const ripple = (cx, cy, rx) => {
      const ry = rx * 0.3;
      return 'M' + r1(cx - rx) + ' ' + r1(cy) + ' a' + r1(rx) + ' ' + r1(ry) + ' 0 1 0 ' + r1(rx * 2)
        + ' 0 a' + r1(rx) + ' ' + r1(ry) + ' 0 1 0 ' + r1(-rx * 2) + ' 0';
    };
    const sq = (x, y) => 'M' + r1(x) + ' ' + r1(y) + 'h1.8v1.8h-1.8Z';
    const gndR = ['', '', ''], gndF = ['', '', ''];
    for (const sp of this.splashes) {
      const b = sp.age < 0.1 ? 0 : sp.age < 0.2 ? 1 : 2;
      gndR[b] += ripple(sp.x, G, lerp(2, 9, sp.age / 0.3));
      sp.dr.forEach(q => { gndF[b] += sq(q.x, q.y); });
    }
    const roofR = ['', '', ''], roofF = ['', '', ''];
    for (const sp of this.roofSplashes) {
      const b = sp.age < 0.1 ? 0 : sp.age < 0.2 ? 1 : 2;
      const wx = sp.veh.x + sp.lx, wy = G + sp.veh.dy + sp.ly;
      roofR[b] += ripple(wx, wy, lerp(1.5, 6, sp.age / 0.3));
      sp.dr.forEach(q => { roofF[b] += sq(wx + q.x, wy + q.y); });
    }

    // write a path's d only when its string changed
    if (dropD !== this.dropD) { this.dropPath.setAttribute('d', dropD); this.dropD = dropD; }
    for (let b = 0; b < 3; b++) {
      if (gndR[b] !== this.gndRd[b]) { this.gndR[b].setAttribute('d', gndR[b]); this.gndRd[b] = gndR[b]; }
      if (gndF[b] !== this.gndFd[b]) { this.gndF[b].setAttribute('d', gndF[b]); this.gndFd[b] = gndF[b]; }
      if (roofR[b] !== this.roofRd[b]) { this.roofR[b].setAttribute('d', roofR[b]); this.roofRd[b] = roofR[b]; }
      if (roofF[b] !== this.roofFd[b]) { this.roofF[b].setAttribute('d', roofF[b]); this.roofFd[b] = roofF[b]; }
    }
  }

  // ---------- debug ----------
  state() {
    this.deriveTraffic();
    this.deriveWeather();
    const act = this.vehicles.filter(v => v.active);
    const nonDrift = act.filter(v => !v.drift);
    const drifters = act.filter(v => v.drift);
    let minGap = Infinity;
    for (let L = 0; L < this.lanes; L++) {
      const group = nonDrift.filter(v => v.lane === L)
        .map(v => ({ v, front: v.x + v.bx0 + v.len, rear: v.x + v.bx0 }))
        .sort((a, b) => b.front - a.front);
      for (let n = 1; n < group.length; n++) minGap = Math.min(minGap, group[n - 1].rear - group[n].front);
    }
    let minGapDrift = Infinity;
    const ds = drifters.map(v => ({ v, front: v.x + v.bx0 + v.len, rear: v.x + v.bx0 })).sort((a, b) => b.front - a.front);
    for (let n = 1; n < ds.length; n++) minGapDrift = Math.min(minGapDrift, ds[n - 1].rear - ds[n].front);
    let crossLaneOverlaps = 0;
    for (let i = 0; i < act.length; i++) {
      for (let j = i + 1; j < act.length; j++) {
        const a = act[i], b = act[j];
        if (a.lane === b.lane && !a.drift && !b.drift) continue;
        const ar = a.x + a.bx0, af = a.x + a.bx0 + a.len;
        const br = b.x + b.bx0, bf = b.x + b.bx0 + b.len;
        if (ar <= bf && br <= af) crossLaneOverlaps++;
      }
    }
    const s = this.wx.storm;
    return {
      viewTime: this.viewTime, simTime: this.simTime, running: this.running, C: this.C, trafficPhase: this.tPhase,
      target: this.target, VN: this.VN, active: act.length, total: this.vehicles.length, lanes: this.lanes,
      weather: this.wx.phase, weatherP: this.wx.p, dim: this.wx.dim, rain: this.wx.rain,
      lightningLeft: s && this.wx.phase !== 'clear' ? s.events.filter(e => e.t > this.viewTime).length : 0,
      minGap, minGapDrift, crossLaneOverlaps,
      vehicles: act.map(v => ({ i: v.i, x: v.x, front: v.x + v.bx0 + v.len, rear: v.x + v.bx0, v: v.v, v0: v.v0, len: v.len, lane: v.lane, dy: v.dy, drifting: !!v.drift }))
        .sort((a, b) => b.front - a.front),
    };
  }
}
