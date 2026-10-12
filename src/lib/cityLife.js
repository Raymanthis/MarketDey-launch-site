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

const SVGNS = 'http://www.w3.org/2000/svg';
const CLOUD_D = 'M0 0H120Q132 0 130 -10Q128 -22 112 -20Q108 -40 86 -38Q76 -56 52 -50Q32 -46 30 -28Q12 -32 6 -18Q-4 -16 -2 -6Q-1 0 0 0Z';

// IDM constants (px, seconds)
const S0 = 10, HEADWAY = 0.6, ACC = 60, DECEL = 90, DECEL_MAX = 260;

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
    this.bolt = null;

    // visuals
    this.skyEls = Array.from(svgEl.querySelectorAll('[data-sky]'));
    this.cloudEls = Array.from(svgEl.querySelectorAll('[data-cloud]'));
    this.wxG = svgEl.querySelector('g[data-wx]');
    this.skyEls.forEach(g => { g.style.transition = 'opacity 2s ease'; });
    this.splashes = [];
    this.drops = [];
    this.nAct = 0;
    this.drawn = false;

    this.readVehicles();
    this.makeCanvas();
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
        g, i: +g.getAttribute('data-veh'), x: -600, v: 0, v0: +g.getAttribute('data-v') || 40,
        bx0: bb.x, len: bb.width, bbY: bb.y, bbH: bb.height,
        extra: g.hasAttribute('data-extra'), active: false, queued: false,
      };
    });
    this.VN = this.vehicles.filter(v => !v.extra).length;
    this.target = this.VN;
    let k = 0;
    const base = [];
    this.vehicles.forEach(v => {
      if (v.extra) { this.setActive(v, false); return; }
      v.fr = ((k * 0.37 + 0.15) % 1) * (W + 220) - 160; k++;
      v.v = v.v0 * 0.9;
      base.push(v);
    });
    base.sort((a, b) => b.fr - a.fr);
    for (let n = 1; n < base.length; n++) {
      const ld = base[n - 1], f = base[n];
      if (ld.fr - ld.len - f.fr < S0) f.fr = ld.fr - ld.len - S0 - 30;
    }
    base.forEach(v => { v.x = v.fr - v.bx0 - v.len; delete v.fr; this.setActive(v, true); });
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
      this.drops.push({ x: rr() * (this.W + 60) - 60, y: -len - rr() * 60, len, spd: 650 + rr() * 300, ang: (8 + rr() * 4) * Math.PI / 180 });
    }
  }

  setActive(v, on) {
    v.active = on;
    v.g.style.visibility = on ? '' : 'hidden';
    if (!on) { v.x = -600; v.g.style.transform = 'translateX(-600px)'; }
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
    this.canvas = null; this.ctx = null;
    this.vehicles = []; this.queue = []; this.skyEls = []; this.cloudEls = [];
    this.wxG = null; this.svg = null; this.el = null; this.splashes = []; this.drops = [];
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
    const start = last ? last.start + Math.max(60 + r() * 30, last.end - last.start + 5) : 30 + r() * 20;
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
    this.bolt = null;
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
    const act = this.vehicles.filter(v => v.active);
    act.sort((a, b) => (b.x + b.bx0 + b.len) - (a.x + a.bx0 + a.len));
    const accs = act.map((v, n) => {
      const front = v.x + v.bx0 + v.len, rear = v.x + v.bx0;
      let vd = v.v0;
      if (front >= Z0 - 30 && rear <= Z1) {
        const jam = 8 * Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * this.simTime / 7 - front / 45), 2);
        vd = Math.min(v.v0, lerp(v.v0, jam, this.C));
      }
      vd = Math.max(0.5, vd);
      const ld = n > 0 ? act[n - 1] : null;
      let term = 0;
      if (ld) {
        const s = ld.x + ld.bx0 - front;
        const sStar = Math.max(S0, S0 + v.v * HEADWAY + v.v * (v.v - ld.v) / (2 * Math.sqrt(ACC * DECEL)));
        term = Math.pow(sStar / Math.max(s, 0.1), 2);
      }
      const a = ACC * (1 - Math.pow(v.v / vd, 4) - term);
      return Math.max(-DECEL_MAX, Math.min(ACC, a));
    });
    act.forEach((v, n) => { v.v = Math.max(0, v.v + accs[n] * dt); v.x += v.v * dt; });
    for (let n = 1; n < act.length; n++) {
      const ld = act[n - 1], v = act[n], gap = ld.x + ld.bx0 - (v.x + v.bx0 + v.len);
      if (gap < S0) { v.x += gap - S0; v.v = Math.min(v.v, ld.v); }
    }
    // exits
    let count = act.length;
    act.forEach(v => {
      if (v.x + v.bx0 > W + 20) {
        if (count > this.target) { this.setActive(v, false); v.queued = false; } else { this.setActive(v, false); v.queued = true; this.queue.push(v); }
        count--;
      }
    });
    // spawn
    const minSpawn = this.tPhase === 'build' || this.tPhase === 'hold' ? 0.7 : 0;
    if (this.simTime - this.lastSpawn >= minSpawn) {
      let cand = null;
      if (this.queue.length) cand = this.queue[0];
      else if (count < this.target) cand = this.vehicles.find(v => !v.active && !v.queued);
      if (cand) {
        let rm = null, rmRear = Infinity;
        this.vehicles.forEach(v => { if (v.active && v.x + v.bx0 < rmRear) { rm = v; rmRear = v.x + v.bx0; } });
        if (!rm || rmRear >= -20 + S0 + 30) {
          if (this.queue[0] === cand) this.queue.shift();
          cand.queued = false;
          cand.v = Math.min(cand.v0, rm ? rm.v + 10 : cand.v0);
          this.setActive(cand, true);
          cand.x = -20 - cand.bx0 - cand.len;
          this.lastSpawn = this.simTime;
        }
      }
    }
  }

  applyVehicles() {
    this.vehicles.forEach(v => { if (v.active) v.g.style.transform = 'translateX(' + v.x.toFixed(1) + 'px)'; });
  }

  // ---------- weather visuals ----------
  syncWeather() {
    const w = this.wx, ph = w.phase, sid = w.storm ? w.storm.id : 0;
    if (ph === this.appliedPhase && sid === this.appliedStorm) return;
    const clear = ph === 'clear', tint = ph === 'gathering' || ph === 'storm';
    this.skyEls.forEach(g => { g.style.opacity = clear ? '1' : '0'; });
    if (tint !== this.tinted) {
      const fill = this.night ? '#1a1918' : '#2c5134';
      this.cloudEls.forEach(g => {
        const p = g.querySelector('path');
        if (!p) return;
        if (tint) {
          p.style.transition = 'fill 3s ease, stroke 3s ease';
          p.style.fill = fill; p.style.stroke = 'rgba(255,255,255,.45)'; p.style.strokeWidth = '2';
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
    const rv = this.rV, W = this.W, n = 4 + Math.floor(rv() * 3), span = (W - 120) + 60;
    for (let j = 0; j < n; j++) {
      const S = 1.6 + rv() * 0.8, Y = -340 + rv() * 150;
      const Xt = -60 + (j + 0.5) * (span / n) + (rv() - 0.5) * (span / n) * 0.6;
      const from = j % 2 ? W + 60 : -300;
      const g = document.createElementNS(SVGNS, 'g');
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', CLOUD_D);
      p.setAttribute('fill', this.night ? '#161514' : '#2a4a31');
      p.setAttribute('stroke', 'rgba(255,255,255,.4)');
      p.setAttribute('stroke-width', '1.3');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('vector-effect', 'non-scaling-stroke');
      g.appendChild(p);
      g.setAttribute('opacity', '0');
      this.wxG.appendChild(g);
      this.stormClouds.push({ g, S, Y, Xt, from, dir: Xt + 60 * S < W / 2 ? -1 : 1, cx: from });
    }
    this.updateStormClouds();
  }

  updateStormClouds() {
    const w = this.wx, s = w.storm;
    if (!s || !this.stormClouds.length) return;
    const t = this.viewTime;
    this.stormClouds.forEach(c => {
      let X, op;
      if (w.phase === 'gathering') { const p = clamp01(w.p); X = c.from + (c.Xt - c.from) * (1 - Math.pow(1 - p, 3)); op = 0.95 * p; }
      else if (w.phase === 'storm') { X = c.Xt + 4 * (t - s.gEnd); op = 0.95; }
      else { X = c.Xt + 4 * s.D + c.dir * 90 * (t - s.cEnd); op = 0.95 * (1 - clamp01(w.p)); }
      c.cx = X;
      c.g.setAttribute('transform', 'translate(' + r1(X) + ' ' + r1(c.Y) + ') scale(' + c.S.toFixed(2) + ')');
      c.g.setAttribute('opacity', op.toFixed(3));
    });
  }

  genBolt(t0) {
    const rv = this.rV, top = this.top, W = this.W;
    let sx, sy;
    if (this.stormClouds.length) {
      const c = this.stormClouds[Math.floor(rv() * this.stormClouds.length)];
      sx = c.cx + 60 * c.S; sy = c.Y - top;
    } else { sx = rv() * W; sy = -260 - top; }
    const ey = this.gy - (120 + rv() * 60), ex = sx + (rv() < 0.5 ? -60 : 60) * rv();
    const n = 7 + Math.floor(rv() * 4), pts = [[sx, sy]];
    for (let k = 1; k < n; k++) { const f = k / n; pts.push([lerp(sx, ex, f) + (rv() * 2 - 1) * 14, lerp(sy, ey, f)]); }
    pts.push([ex, ey]);
    const m = pts[Math.floor(n / 2)], branch = [m];
    const bd = rv() < 0.5 ? -1 : 1;
    for (let k = 1; k <= 3; k++) branch.push([m[0] + bd * k * 14 + (rv() * 2 - 1) * 8, m[1] + k * 18]);
    return { t0, pts, branch };
  }

  // ---------- drawing ----------
  render(dt) {
    this.deriveTraffic();
    this.deriveWeather();
    this.syncWeather();
    this.updateStormClouds();
    this.applyVehicles();
    this.draw(dt);
  }

  flashAlpha() {
    const s = this.wx.storm;
    if (!s) return 0;
    let a = 0;
    s.events.forEach(e => {
      const d = this.viewTime - e.t;
      if (d >= 0 && d <= 0.15) a = Math.max(a, 0.35 * (1 - d / 0.15));
      if (e.double) { const d2 = d - 0.18; if (d2 >= 0 && d2 <= 0.15) a = Math.max(a, 0.25 * (1 - d2 / 0.15)); }
    });
    return a;
  }

  draw(dt) {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.wx, W = this.W, H = this.H, gy = this.gy;
    // fire lightning events
    if (w.storm) {
      w.storm.events.forEach(e => {
        if (!e.fired && this.viewTime >= e.t) {
          e.fired = true;
          if (e.bolt && this.viewTime - e.t < 0.2) this.bolt = this.genBolt(e.t);
        }
      });
    }
    if (this.bolt && this.viewTime - this.bolt.t0 > 0.2) this.bolt = null;
    const flash = this.flashAlpha();
    if (!w.dim && !w.rain && !flash && !this.bolt && !this.splashes.length) {
      if (this.drawn) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.drawn = false; }
      return;
    }
    this.drawn = true;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // 1 dim
    if (w.dim > 0) {
      ctx.fillStyle = this.night ? 'rgba(0,0,0,' + (0.28 * w.dim).toFixed(3) + ')' : 'rgba(12,28,18,' + (0.22 * w.dim).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    const rainCol = this.night ? 'rgba(200,214,229,.30)' : 'rgba(255,255,255,.35)';
    // 2 rain
    const na = Math.round(this.N * w.rain), rr = this.rR;
    for (let k = this.nAct; k < na; k++) this.drops[k].y = -40 + rr() * (gy + 40);
    this.nAct = na;
    if (na > 0) {
      ctx.strokeStyle = rainCol; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 0; k < na; k++) {
        const d = this.drops[k], sn = Math.sin(d.ang), cs = Math.cos(d.ang), dist = d.spd * dt;
        d.x += sn * dist; d.y += cs * dist;
        if (d.y >= gy) {
          if (this.splashes.length < 160) this.addSplash(d.x);
          d.y = -d.len - rr() * 60; d.x = rr() * (W + 60) - 60;
        }
        ctx.moveTo(d.x - sn * d.len, d.y - cs * d.len); ctx.lineTo(d.x, d.y);
      }
      ctx.stroke();
    }
    // 3 splashes
    if (this.splashes.length) {
      ctx.strokeStyle = rainCol; ctx.fillStyle = rainCol;
      this.splashes = this.splashes.filter(sp => {
        sp.age += dt;
        const t = sp.age / 0.3;
        if (t >= 1) return false;
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        const rx = lerp(1, 6, t);
        ctx.ellipse(sp.x, gy, rx, rx * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
        sp.dr.forEach(q => {
          q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 700 * dt;
          ctx.fillRect(q.x - 0.6, q.y - 0.6, 1.2, 1.2);
        });
        return true;
      });
      ctx.globalAlpha = 1;
    }
    // 4 flash
    if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + flash.toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
    // 5 bolt
    if (this.bolt) {
      const b = this.bolt;
      ctx.globalAlpha = Math.max(0, 1 - (this.viewTime - b.t0) / 0.2);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.shadowBlur = 12; ctx.shadowColor = 'rgba(255,255,255,.8)';
      ctx.beginPath();
      b.pts.forEach((p, k) => { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      b.branch.forEach((p, k) => { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
  }

  addSplash(x) {
    const rv = this.rV, n = 2 + Math.floor(rv() * 2), dr = [];
    for (let k = 0; k < n; k++) dr.push({ x, y: this.gy, vx: -40 + rv() * 80, vy: -110 + rv() * 50 });
    this.splashes.push({ x, age: 0, dr });
  }

  // ---------- debug ----------
  state() {
    this.deriveTraffic();
    this.deriveWeather();
    const act = this.vehicles.filter(v => v.active).map(v => ({ v, front: v.x + v.bx0 + v.len, rear: v.x + v.bx0 }));
    act.sort((a, b) => b.front - a.front);
    let minGap = Infinity;
    for (let n = 1; n < act.length; n++) minGap = Math.min(minGap, act[n - 1].rear - act[n].front);
    const s = this.wx.storm;
    return {
      viewTime: this.viewTime, simTime: this.simTime, running: this.running, C: this.C, trafficPhase: this.tPhase,
      target: this.target, VN: this.VN, active: act.length, total: this.vehicles.length,
      weather: this.wx.phase, weatherP: this.wx.p, dim: this.wx.dim, rain: this.wx.rain,
      lightningLeft: s && this.wx.phase !== 'clear' ? s.events.filter(e => e.t > this.viewTime).length : 0,
      minGap,
      vehicles: act.map(a => ({ i: a.v.i, x: a.v.x, front: a.front, rear: a.rear, v: a.v.v, v0: a.v.v0, len: a.v.len })),
    };
  }
}
