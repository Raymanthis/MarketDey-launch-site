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
// distant-cloud body: same silhouette flattened to half height (low over the far skyline)
const FAR_CLOUD_D = 'M0 0H120Q132 0 130 -5Q128 -11 112 -10Q108 -20 86 -19Q76 -28 52 -25Q32 -23 30 -14Q12 -16 6 -9Q-4 -8 -2 -3Q-1 0 0 0Z';
// storm-cloud fill: one step lighter than before; far clouds are hazier (lighter, semi-transparent)
const STORM_FILL = n => (n ? '#474744' : '#425c4b');
const FAR_FILL = n => (n ? '#545450' : '#53685a');
// splash surface indices for the rolling state() counter
const SP_ROAD = 0, SP_VEH = 1, SP_NEAR = 2, SP_FARB = 3, SP_FARA = 4;

// IDM constants (px, seconds)
const S0 = 10, HEADWAY = 0.6, ACC = 60, DECEL = 90, DECEL_MAX = 260;

// roof segments per vehicle shape (vehicle-local coords, x relative to the inner g, y relative to the wrapper)
// opaque underlay per vehicle shape (vehicle-local): body + wheel band + the gaps between cab and cargo,
// filled with the skyline colour so nothing behind (rain, buildings) shows through the vehicle
const UNDER = [
  'M0 -6V-16Q0 -20 6 -20L16 -21L26 -32H46L56 -21H62Q66 -20 66 -14V-6ZM8 -8H58V1H8Z',
  'M0 -6V-32Q0 -38 6 -38H58Q66 -38 69 -28L72 -6ZM8 -8H62V1H8Z',
  'M0 -6V-24Q0 -32 8 -32H28Q36 -32 39 -24L44 -10V-6ZM5 -8H42V0H5Z',
  'M0 -8V-52H104V-44H112V-44H128Q134 -44 136 -38L140 -22V-8ZM8 -10H134V1H8Z',
  'M0 -6V-20Q0 -24 4 -24L12 -36H54Q60 -36 62 -30L66 -20V-6ZM7 -8H59V2H7Z',
  'M-3 2V-12L10 -15L13 -30L14 -38H22V-30H29L27 -15L41 -12V2Z',
  'M4 -14Q0 -14 0 -26Q0 -38 10 -38H64Q74 -38 74 -26V-36H94L104 -22V-8H0V-14ZM6 -10H98V1H6Z',
  'M0 -8V-48H62V-36H82L92 -22V-8ZM8 -10H86V1H8Z',
  'M-10 -12V-40H0Q0 -50 10 -50H66V-38H84L94 -22V-8H-10ZM8 -10H92V1H8Z',
  'M0 -6V-22H3V-32H33V-30L40 -38H66L74 -26H86Q90 -26 90 -20V-6ZM10 -10H82V1H10Z',
  'M0 -8V-50H150V-44H178Q186 -44 188 -38L196 -22V-8ZM8 -10H190V1H8Z',
];

// exact roof line per vehicle shape (topmost painted y for each local x), computed once per page from the
// underlay + body paths with Path2D hit-testing (no DOM layout), then cached
const ROOF_X0 = -6, ROOF_N = 152;
const ROOF_CACHE = new Map();
const roofLine = (i, bodyD) => {
  if (ROOF_CACHE.has(i)) return ROOF_CACHE.get(i);
  const line = new Float32Array(ROOF_N).fill(NaN);
  const ctx = typeof document !== 'undefined' && document.createElement('canvas').getContext('2d');
  if (ctx && typeof Path2D === 'function') {
    const pu = UNDER[i] ? new Path2D(UNDER[i]) : null, pb = bodyD ? new Path2D(bodyD) : null;
    ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
    for (let k = 0; k < ROOF_N; k++) {
      const x = ROOF_X0 + k;
      for (let y = -64; y <= 3; y += 0.5) {
        if ((pu && (ctx.isPointInPath(pu, x, y) || ctx.isPointInStroke(pu, x, y)))
          || (pb && (ctx.isPointInPath(pb, x, y) || ctx.isPointInStroke(pb, x, y)))) { line[k] = y; break; }
      }
    }
  }
  ROOF_CACHE.set(i, line);
  return line;
};

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
    this.overtakes = 0;
    this.stopLines = null;
    this.jamCount = 0;
    this.jamType = null;
    this.bd = null;
    this.hzG = null;
    this.hzDefs = null;
    this.polDefs = null;

    // weather schedule
    this.storms = [];
    this.stormId = 0;
    this.wx = { phase: 'clear', p: 0, dim: 0, rain: 0, storm: null };
    this.appliedPhase = 'clear';
    this.appliedStorm = 0;
    this.tinted = false;
    this.stormClouds = [];
    this.farClouds = [];
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
    this.drops = [];
    this.nAct = 0;
    this.drawn = false;
    this.rainDrawn = false;
    this.midDrawn = false;
    this.farDrawn = false;
    this.roofDrawn = false;
    this.gSplashes = null;
    this.rSplashes = null;
    this.gSplashCount = 0;
    this.rSplashCount = 0;
    this.bSplashes = null;
    this.bSplashCount = 0;
    this.cMid = null;
    this.cMidCtx = null;
    this.cFar = null;
    this.cFarCtx = null;
    this.splashBuf = null;
    this.splashTot = null;
    this.splashCur = null;
    this.splashIdx = 0;
    this.tiles = null;
    this.tileLayers = null;
    this.roadLayer = null;
    this.firstSkyLayer = null;
    this.wxAnchor = null;
    this.skyGs = null;

    this.lanes = W >= 700 ? 3 : 2;
    this.laneDys = this.lanes === 3 ? [19, 23, 27] : [20, 26];
    this.orderDirty = false;
    this.readVehicles();
    this.layerize();
    this.makeCanvas();
    if (this.night) { this.addLights(); this.lightWindows(); } else this.addLights(true);
    this.buildProfiles();
  }

  // ---------- setup ----------
  readVehicles() {
    const W = this.W;
    this.vehicles = Array.from(this.svg.querySelectorAll('g[data-veh]')).map(g => {
      let bb;
      try { bb = g.getBBox(); } catch { bb = null; }
      if (!bb || !(bb.width > 0)) bb = { x: 0, y: -40, width: 70, height: 40 };
      return {
        g, wrapper: g.parentNode, i: +g.getAttribute('data-veh'), x: -600, v: 0,
        vBase: +g.getAttribute('data-v') || 40, v0: 0,
        bx0: bb.x, len: bb.width, bbY: bb.y, bbH: bb.height,
        extra: g.hasAttribute('data-extra'), active: false, queued: false,
        lane: 0, dy: 0, drift: null, wdy: null, s0: S0, lc: null, lcCool: 0, crawl: null, crawling: false,
      };
    });
    this.vehicles.forEach(v => { this.pickV0(v); v.lcCool = this.rT() * 2; });
    this.vehicles.forEach(v => {
      const d = UNDER[v.i], body = v.g.querySelector('path');
      if (!d || !body) return;
      const u = document.createElementNS(SVGNS, 'path');
      u.setAttribute('d', d);
      const fl = body.getAttribute('fill') || '#000';
      u.setAttribute('fill', fl);
      // stroke too: the body outline is semi-transparent and sits outside the fill
      u.setAttribute('stroke', fl);
      u.setAttribute('stroke-width', '1.6');
      u.setAttribute('stroke-linejoin', 'round');
      u.setAttribute('data-cl-under', '1');
      v.roof = roofLine(v.i, body.getAttribute('d'));
      v.g.insertBefore(u, v.g.firstChild);
    });
    // police light bar: two alternating halves on the cab roof of each Hilux (shape 9)
    this.vehicles.forEach(v => {
      if (v.i !== 9) return;
      if (this.night) this.ensurePolDefs();
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('data-cl-pol', '1');
      const red = [], blue = [];
      const redHalo = document.createElementNS(SVGNS, 'circle');
      redHalo.setAttribute('cx', '50');
      redHalo.setAttribute('cy', '-39.5');
      if (this.night) { redHalo.setAttribute('r', '9'); redHalo.setAttribute('fill', 'url(#cl-pol-r-' + this.seed + ')'); }
      else { redHalo.setAttribute('r', '4'); redHalo.setAttribute('fill', '#e63946'); redHalo.setAttribute('opacity', '.25'); }
      red.push(redHalo);
      const redRect = document.createElementNS(SVGNS, 'rect');
      redRect.setAttribute('x', '46.5');
      redRect.setAttribute('y', '-40.5');
      redRect.setAttribute('width', '7.5');
      redRect.setAttribute('height', '2');
      redRect.setAttribute('fill', '#e63946');
      if (!this.night) redRect.setAttribute('opacity', '.55');
      red.push(redRect);
      const blueHalo = document.createElementNS(SVGNS, 'circle');
      blueHalo.setAttribute('cx', '58');
      blueHalo.setAttribute('cy', '-39.5');
      if (this.night) { blueHalo.setAttribute('r', '9'); blueHalo.setAttribute('fill', 'url(#cl-pol-b-' + this.seed + ')'); }
      else { blueHalo.setAttribute('r', '4'); blueHalo.setAttribute('fill', '#3a86ff'); blueHalo.setAttribute('opacity', '.25'); }
      blue.push(blueHalo);
      const blueRect = document.createElementNS(SVGNS, 'rect');
      blueRect.setAttribute('x', '54');
      blueRect.setAttribute('y', '-40.5');
      blueRect.setAttribute('width', '7.5');
      blueRect.setAttribute('height', '2');
      blueRect.setAttribute('fill', '#3a86ff');
      if (!this.night) blueRect.setAttribute('opacity', '.55');
      blue.push(blueRect);
      g.appendChild(redHalo);
      g.appendChild(redRect);
      g.appendChild(blueHalo);
      g.appendChild(blueRect);
      v.g.appendChild(g);
      v.pol = { red, blue, phase: -1 };
    });
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

  ensurePolDefs() {
    if (this.polDefs || !this.svg) return;
    const defs = document.createElementNS(SVGNS, 'defs');
    defs.setAttribute('data-cl-pol', '1');
    defs.innerHTML = '<radialGradient id="cl-pol-r-' + this.seed + '"><stop offset="0" stop-color="#e63946" stop-opacity=".55"/><stop offset="1" stop-color="#e63946" stop-opacity="0"/></radialGradient>'
      + '<radialGradient id="cl-pol-b-' + this.seed + '"><stop offset="0" stop-color="#3a86ff" stop-opacity=".55"/><stop offset="1" stop-color="#3a86ff" stop-opacity="0"/></radialGradient>';
    this.svg.insertBefore(defs, this.svg.firstChild);
    this.polDefs = defs;
  }

  // ---------- layer stack ----------
  mkLayer() {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('width', '100%');
    s.setAttribute('height', '320');
    s.setAttribute('viewBox', '0 0 ' + this.W + ' 320');
    s.setAttribute('preserveAspectRatio', 'xMinYMax meet');
    s.setAttribute('aria-hidden', 'true');
    s.style.cssText = 'position:absolute;left:0;bottom:0;overflow:visible;pointer-events:none;will-change:transform';
    return s;
  }

  // split the skyline into stacked, separately composited layers so per-frame changes
  // are compositor transforms or canvas redraws, never re-rasters of the static city
  layerize() {
    const el = this.el;

    // tiles: one layer per parallax group; hand its scroll animation to the layer
    const tiles = Array.from(this.svg.querySelectorAll('[data-scroll]'));
    this.tiles = tiles;
    this.tileLayers = [];
    for (let k = 0; k < tiles.length; k++) {
      const g = tiles[k];
      const layer = this.mkLayer();
      el.appendChild(layer);
      layer.appendChild(g);
      g._layer = layer;
      if (g._a) {
        const a = g._a;
        const b = layer.animate(a.effect.getKeyframes(), { duration: a.effect.getTiming().duration, iterations: Infinity });
        b.currentTime = a.currentTime;
        b.playbackRate = a.playbackRate;
        a.cancel();
        g._a = b;
        if (b.playbackRate < 1) {
          const t0 = performance.now();
          const ramp = n => {
            if (this.destroyed) return;
            const k = Math.min(1, (n - t0) / 1600);
            b.playbackRate = k * k * (3 - 2 * k);
            if (k < 1 && el.isConnected) requestAnimationFrame(ramp);
          };
          requestAnimationFrame(ramp);
        }
      }
      this.tileLayers.push(layer);
    }

    // road: ground line + animated dash, its own layer under the vehicles
    const roadLayer = this.mkLayer();
    el.appendChild(roadLayer);
    const roadPaths = Array.from(this.svg.children).filter(n => n.tagName.toLowerCase() === 'path');
    for (let k = 0; k < roadPaths.length; k++) roadLayer.appendChild(roadPaths[k]);
    this.roadLayer = roadLayer;

    // vehicles: one tightly sized svg each, positioned by compositor transform
    const vehicles = this.vehicles;
    for (let k = 0; k < vehicles.length; k++) {
      const v = vehicles[k];
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('width', v.len + 80);
      svg.setAttribute('height', '80');
      svg.setAttribute('viewBox', '-10 -70 ' + (v.len + 80) + ' 80');
      svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;will-change:transform;transform-origin:0 0';
      svg.appendChild(v.g);
      v.g.style.transform = '';
      v.wrapper.remove();
      v.wrapper = svg;
      svg.style.visibility = v.active ? '' : 'hidden';
      el.appendChild(svg);
    }

    // sky + clouds: one layer per group in original document order
    const skyGs = Array.from(this.svg.querySelectorAll('[data-sky]'));
    const combined = Array.from(this.svg.querySelectorAll('[data-sky],[data-cloud]'));
    this.skyGs = skyGs;
    const skyLayers = [];
    let seenCloud = false;
    for (let k = 0; k < combined.length; k++) {
      const g = combined[k];
      const layer = this.mkLayer();
      el.appendChild(layer);
      layer.appendChild(g);
      const live = g.querySelector('[data-live]');
      if (live) {
        layer.style.animation = live.style.animation;
        live.style.animation = 'none';
      }
      if (!this.firstSkyLayer) this.firstSkyLayer = layer;
      if (g.hasAttribute('data-cloud')) {
        seenCloud = true;
      } else {
        layer.style.transition = 'opacity 2s ease';
        skyLayers.push(layer);
        if (seenCloud && !this.wxAnchor) this.wxAnchor = layer;
      }
    }
    this.skyEls = skyLayers;
  }

  // varied desired speed per shape, skewed fast/slow around vBase
  pickV0(v) {
    const r = this.rT();
    let f;
    if (v.i === 5 || v.i === 0 || v.i === 4 || v.i === 9) f = 0.7 + 0.65 * Math.pow(r, 0.55);
    else if (v.i === 3 || v.i === 6 || v.i === 7 || v.i === 8 || v.i === 10) f = 0.7 + 0.65 * Math.pow(r, 1.9);
    else f = 0.7 + 0.65 * r;
    v.v0 = v.vBase * f;
  }

  // night mode: headlights, tail lights and lit windows
  // headlights (lamp + soft cone) and tail lights. Night: always on. Day (hero): a dimmer set, grouped per vehicle,
  // switched on by updateLights() while it rains.
  addLights(day = false) {
    const id = 'cl-cone-' + this.seed;
    const defs = document.createElementNS(SVGNS, 'defs');
    defs.setAttribute('data-cl', '1');
    defs.innerHTML = '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd66b" stop-opacity="' + (day ? '.26' : '.35') + '"></stop><stop offset="1" stop-color="#ffd66b" stop-opacity="0"></stop></linearGradient>';
    this.svg.insertBefore(defs, this.svg.firstChild);
    this.vehicles.forEach(v => {
      const y = v.bbY + v.bbH * 0.62, F = v.bx0 + v.len - 0.5;
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('data-cl', '1');
      g.innerHTML = '<polygon data-cl="1" points="' + F + ',' + (y - 2) + ' ' + F + ',' + (y + 2) + ' ' + (F + 48) + ',' + (y + 10) + ' ' + (F + 48) + ',' + (y - 8) + '" fill="url(#' + id + ')"></polygon>'
        + '<circle data-cl="1" cx="' + F + '" cy="' + y + '" r="' + (day ? '1.6' : '2') + '" fill="#ffd66b"></circle>'
        + '<rect data-cl="1" x="' + (v.bx0 - 1) + '" y="' + (y - 1.5) + '" width="2.5" height="3" rx=".6" fill="#e63946"></rect>';
      if (day) { g.setAttribute('opacity', '0'); v.lightG = g; v.L = 0; v.lightDelay = this.rT() * 1.5; }
      v.g.appendChild(g);
    });
  }

  // day lights: off when clear; in the storm each driver switches on after a 0–1.5 s stagger (0.5 s fade, all on
  // within ~2 s of the rain starting); after the rain has stopped (clearing ends) they switch off the same way
  updateLights() {
    if (this.night) return;
    const w = this.wx, t = this.viewTime;
    if (w.storm) this.lastStorm = w.storm;
    const s = this.lastStorm;
    let tOn = -1, tOff = -1;
    if (w.phase === 'storm' || w.phase === 'clearing') tOn = t - s.gEnd;
    else if (w.phase === 'clear' && s && t >= s.end) tOff = t - s.end;
    const vs = this.vehicles;
    for (let k = 0; k < vs.length; k++) {
      const v = vs[k];
      if (!v.lightG) continue;
      const L = tOn >= 0 ? clamp01((tOn - v.lightDelay) / 0.5) : tOff >= 0 ? 1 - clamp01((tOff - v.lightDelay) / 0.5) : 0;
      const q = Math.round(L * 50) / 50;
      if (q !== v.L) { v.L = q; v.lightG.setAttribute('opacity', q); }
    }
  }

  lightWindows() {
    this.lit = [];
    this.el.querySelectorAll('[data-scroll]').forEach((sc, tile) => {
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
    if (this.el) this.el.querySelectorAll('[data-cl]').forEach(n => n.remove());
    (this.lit || []).forEach(({ r, anim }) => {
      r.style.animation = anim; r.style.removeProperty('fill'); r.style.removeProperty('fill-opacity');
      r.removeAttribute('data-lit');
    });
    this.lit = [];
  }

  makeCanvas() {
    const elTop = this.el.getBoundingClientRect().top;
    let minTop = 0;
    const skyGs = this.skyGs || [];
    const cloudGs = this.cloudEls || [];
    for (let k = 0; k < skyGs.length; k++) minTop = Math.min(minTop, skyGs[k].getBoundingClientRect().top - elTop);
    for (let k = 0; k < cloudGs.length; k++) minTop = Math.min(minTop, cloudGs[k].getBoundingClientRect().top - elTop);
    this.top = Math.min(-380, minTop - 40);
    this.H = 320 - this.top;
    this.gy = this.G - this.top;
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    // near drops at full alpha; mid (farB) ~55% and far (farA) ~35%
    this.rainCol = this.night ? 'rgba(200,214,229,.30)' : 'rgba(255,255,255,.35)';
    this.rainColMid = this.night ? 'rgba(200,214,229,.16)' : 'rgba(255,255,255,.19)';
    this.rainColFar = this.night ? 'rgba(200,214,229,.10)' : 'rgba(255,255,255,.12)';
    this.gCol = this.night ? 'rgba(200,214,229,.6)' : 'rgba(255,255,255,.65)';
    this.bucketA = [0.9, 0.55, 0.25];

    // rain canvas: behind every vehicle
    const rc = document.createElement('canvas');
    rc.setAttribute('aria-hidden', 'true');
    rc.style.cssText = 'position:absolute;left:0;bottom:0;width:100%;height:' + this.H + 'px;pointer-events:none;will-change:transform';
    rc.width = Math.round(this.W * this.dpr);
    rc.height = Math.round(this.H * this.dpr);
    this.el.insertBefore(rc, this.roadLayer.nextSibling);
    this.cRain = rc;
    this.cRainCtx = rc.getContext('2d');

    // mid rain canvas: farB drops + farB-roof splashes, in front of farB but behind the near row
    const mc = document.createElement('canvas');
    mc.setAttribute('aria-hidden', 'true');
    mc.style.cssText = 'position:absolute;left:0;bottom:0;width:100%;height:' + this.H + 'px;pointer-events:none;will-change:transform';
    mc.width = Math.round(this.W * this.dpr);
    mc.height = Math.round(this.H * this.dpr);
    this.el.insertBefore(mc, this.tileLayers[2] || this.roadLayer);
    this.cMid = mc;
    this.cMidCtx = mc.getContext('2d');

    // far rain canvas: farA drops + farA-roof splashes, in front of farA but behind farB
    const fc = document.createElement('canvas');
    fc.setAttribute('aria-hidden', 'true');
    fc.style.cssText = 'position:absolute;left:0;bottom:0;width:100%;height:' + this.H + 'px;pointer-events:none;will-change:transform';
    fc.width = Math.round(this.W * this.dpr);
    fc.height = Math.round(this.H * this.dpr);
    this.el.insertBefore(fc, this.tileLayers[1] || this.roadLayer);
    this.cFar = fc;
    this.cFarCtx = fc.getContext('2d');

    // roof canvas: above every vehicle
    const rf = document.createElement('canvas');
    rf.setAttribute('aria-hidden', 'true');
    rf.style.cssText = 'position:absolute;left:0;bottom:0;width:100%;height:' + this.H + 'px;pointer-events:none;will-change:transform';
    rf.width = Math.round(this.W * this.dpr);
    rf.height = Math.round(this.H * this.dpr);
    this.el.insertBefore(rf, this.firstSkyLayer);
    this.cRoof = rf;
    this.cRoofCtx = rf.getContext('2d');

    // overlay canvas (dim + flash), always last
    const c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:absolute;left:0;bottom:0;width:100%;height:' + this.H + 'px;pointer-events:none';
    c.width = Math.round(this.W * this.dpr);
    c.height = Math.round(this.H * this.dpr);
    this.el.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');

    // drop pool (fixed); cache trig per drop so the per-frame path allocates nothing.
    // Each drop is pinned to a depth layer at spawn: near drops fall from the near storm
    // clouds, mid/far drops from the distant clouds, and a drop only lands on its own layer.
    const N = Math.max(40, Math.round(220 * this.W / 1440));
    this.N = N;
    this.nNear = Math.ceil(N * 0.55);
    this.nMid = Math.ceil(N * 0.3);
    this.nFar = N - this.nNear - this.nMid;
    const rr = this.rR;
    for (let n = 0; n < N; n++) {
      const layer = n < this.nNear ? 'near' : n < this.nNear + this.nMid ? 'farB' : 'farA';
      const len = layer === 'near' ? 10 + rr() * 12 : layer === 'farB' ? 7 + rr() * 7 : 5 + rr() * 5;
      const ang = (8 + rr() * 4) * Math.PI / 180;
      this.drops.push({ layer, x: rr() * (this.W + 60) - 60, y: this.top - len - rr() * 60, len, spd: 650 + rr() * 300, ang, sn: Math.sin(ang), cs: Math.cos(ang) });
    }
    // 30-frame rolling window of splashes per surface (road/vehicle/near/farB/farA) for state()
    this.splashBuf = new Array(30);
    for (let i = 0; i < 30; i++) this.splashBuf[i] = new Int32Array(5);
    this.splashTot = new Int32Array(5);
    this.splashCur = this.splashBuf[0];

    // splash pools (fixed): 160 ground + 80 roof, 3-slot droplets each, swap-removed
    this.gSplashes = new Array(160);
    for (let k = 0; k < 160; k++) {
      const dr = new Array(3);
      for (let m = 0; m < 3; m++) dr[m] = { x: 0, y: 0, vx: 0, vy: 0 };
      this.gSplashes[k] = { x: 0, y: 0, age: 0, n: 0, b: 0, dr };
    }
    this.rSplashes = new Array(80);
    for (let k = 0; k < 80; k++) {
      const dr = new Array(3);
      for (let m = 0; m < 3; m++) dr[m] = { x: 0, y: 0, vx: 0, vy: 0 };
      this.rSplashes[k] = { veh: null, lx: 0, ly: 0, age: 0, n: 0, b: 0, dr };
    }

    // building-roof splash pool (fixed): 120, 3-slot droplets each, swap-removed
    this.bSplashes = new Array(120);
    for (let k = 0; k < 120; k++) {
      const dr = new Array(3);
      for (let m = 0; m < 3; m++) dr[m] = { x: 0, y: 0, vx: 0, vy: 0, gone: false };
      this.bSplashes[k] = { k: 0, u: 0, y: 0, s: 1, rx: 0, age: 0, n: 0, b: 0, dr };
    }
  }

  // current scroll offset (px) of parallax tile k (0..−T). The layer animation is created
  // after construction and may be missing or paused, so look it up fresh every frame.
  tileOff(k) {
    const g = this.tiles && this.tiles[k], a = g && g._a;
    if (!a || a.currentTime == null) return 0;
    if (g._durA !== a) { g._durA = a; g._dur = a.effect.getTiming().duration; }
    const T = g._T !== undefined ? g._T : (g._T = +g.getAttribute('data-scroll'));
    return -T * (((a.currentTime % g._dur) + g._dur) % g._dur) / g._dur;
  }

  // rasterise one untransformed copy of each building tile into a per-column roof line
  // (x 0..T, y measured from the top), so rain can land on buildings without touching the
  // DOM per frame. farA (k=0), farB (k=1) and near (k=2) all get a profile now that far
  // and mid drops land on their own rows.
  buildProfiles() {
    this.prof = [null, null, null];
    for (let k = 0; k <= 2; k++) {
      const g = this.tiles[k];
      if (!g) continue;
      const T = +g.getAttribute('data-scroll');
      const copy = g.children[1];
      if (!copy) continue;
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(T) + 2;
      cv.height = 320;
      const ctx = cv.getContext('2d');
      for (let m = 0; m < copy.children.length; m++) {
        const el = copy.children[m];
        if (el.tagName.toLowerCase() !== 'path') continue;
        const fill = el.getAttribute('fill');
        if (!fill || fill === 'none') continue;
        const d = el.getAttribute('d');
        if (!d) continue;
        const p = new Path2D(d);
        ctx.fill(p);
        ctx.lineWidth = +el.getAttribute('stroke-width') || 1;
        ctx.stroke(p);
      }
      const img = ctx.getImageData(0, 0, cv.width, cv.height);
      const p = new Float32Array(Math.ceil(T) + 1);
      for (let x = 0; x <= Math.ceil(T); x++) {
        let y = 0;
        for (; y <= this.G; y++) {
          if (img.data[(y * cv.width + x) * 4 + 3] > 100) break;
        }
        p[x] = y <= this.G ? y : NaN;
      }
      this.prof[k] = { T, p };
      cv.width = cv.height = 0; // release the offscreen bitmap
    }
  }

  // building roof y at world x (svg coords), or NaN where the skyline has a gap there
  profY(k, x, off) {
    const pr = this.prof[k], T = pr.T, p = pr.p;
    let u = (x - off) % T;
    if (u < 0) u += T;
    return p[u | 0];
  }

  setActive(v, on) {
    v.active = on;
    v.wrapper.style.visibility = on ? '' : 'hidden';
    if (!on) {
      v.drift = null;
      v.lc = null;
      v.lcCool = 0;
      v.x = -600;
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
    if (this.el && this.el.isConnected && this.tiles) {
      for (let k = 0; k < this.tiles.length; k++) {
        if (this.tiles[k]._a) { this.tiles[k]._a.cancel(); this.tiles[k]._a = null; }
      }
    }
    if (this.canvas) this.canvas.remove();
    if (this.cRain) this.cRain.remove();
    if (this.cMid) this.cMid.remove();
    if (this.cFar) this.cFar.remove();
    if (this.cRoof) this.cRoof.remove();
    this.clearStormClouds();
    this.clearLights();
    this.hazardsOff();
    if (this.hzDefs) { this.hzDefs.remove(); this.hzDefs = null; }
    if (this.polDefs) { this.polDefs.remove(); this.polDefs = null; }
    this.bd = null;
    this.skyEls.forEach(g => { g.style.removeProperty('transition'); g.style.removeProperty('opacity'); });
    this.cloudEls.forEach(g => {
      const p = g.querySelector('path');
      if (p) ['transition', 'fill', 'stroke', 'stroke-width'].forEach(k => p.style.removeProperty(k));
    });
    if (this.boltG) { this.boltG.remove(); this.boltG = null; }
    if (this.svg) { const d = this.svg.querySelector('defs[data-cl-wx]'); if (d) d.remove(); }
    this.boltEv = null;
    this.canvas = null; this.ctx = null;
    this.cRain = null; this.cRainCtx = null;
    this.cMid = null; this.cMidCtx = null;
    this.cFar = null; this.cFarCtx = null;
    this.cRoof = null; this.cRoofCtx = null;
    this.vehicles = []; this.queue = []; this.skyEls = []; this.cloudEls = [];
    this.tileLayers = []; this.tiles = [];
    this.gSplashes = []; this.rSplashes = [];
    this.splashBuf = null; this.splashTot = null; this.splashCur = null;
    this.wxG = null; this.svg = null; this.el = null; this.drops = [];
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
    const r = this.rT, fs = this.tNextFree, bs = fs + 60;
    const type = (this.jamCount % 2 === 0) ? 'bottleneck' : 'breakdown';
    this.jamCount++;
    const waves = [];
    let ws = fs + 15 + r() * 10;
    for (;;) {
      const d = 6 + r() * 4, cw = 0.2 + r() * 0.3;
      if (ws + d > bs) break;
      waves.push({ s: ws, e: ws + d, cw });
      ws += 15 + r() * 10;
    }
    if (type === 'breakdown') {
      const stopDur = 25 + r() * 15;
      this.tSegs.push(
        { k: 'free', t0: fs, t1: bs, decay: true, waves, type },
        { k: 'breakdown', t0: bs, t1: bs + 20 + stopDur, stopDur, type },
      );
      this.tNextFree = bs + 20 + stopDur;
      return;
    }
    const bEnd = bs + 15, hEnd = bEnd + 25 + r() * 15, eEnd = hEnd + 20;
    // one stop line per lane, 8-16 px inside the right edge: where the queue head parks
    const stops = [];
    for (let L = 0; L < this.lanes; L++) stops.push(this.W - (8 + r() * 8));
    this.tSegs.push(
      { k: 'free', t0: fs, t1: bs, decay: false, waves, type },
      { k: 'build', t0: bs, t1: bEnd, stops, type },
      { k: 'hold', t0: bEnd, t1: hEnd, stops, type },
      { k: 'ease', t0: hEnd, t1: eEnd, type },
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
    if (s.k === 'build') return { C: smooth((t - s.t0) / 15), phase: 'build', stops: s.stops };
    if (s.k === 'hold') return { C: 1, phase: 'hold', stops: s.stops };
    if (s.k === 'ease') return { C: lerp(1, 0.3, smooth((t - s.t0) / 20)), phase: 'ease' };
    if (s.k === 'breakdown') return { C: 0, phase: 'breakdown', seg: s };
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
    // stop lines exist only while the queue builds up and holds; ease lets the heads pull away
    this.stopLines = (tr.phase === 'build' || tr.phase === 'hold') && !this.reducedMotion ? tr.stops || null : null;
    // a new breakdown segment arms its state machine the first time we reach it
    if (tr.phase === 'breakdown' && !tr.seg.started) {
      tr.seg.started = true;
      if (this.bd) this.hazardsOff();
      this.bd = { seg: tr.seg, veh: null, phase: 'seek', stopFront: 0, tStop: 0, vTrig: 0, hazardsOn: false, hazardVisible: false };
      this.vehicles.forEach(v => { v.crawl = null; v.crawling = false; });
    }
    if (this.bd) this.tPhase = 'breakdown';
    let jamType = null;
    for (const s of this.tSegs) { if (s.t1 > this.viewTime) { jamType = s.type; break; } }
    this.jamType = jamType;
    const jamK = this.bd ? 0.5 : tr.phase === 'build' || tr.phase === 'hold' ? tr.C : tr.phase === 'ease' ? tr.C * 0.5 : 0;
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

  forceJam(type) {
    if (this.reducedMotion) return this.state();
    const now = this.viewTime;
    this.tSegs = this.tSegs.filter(s => s.t0 < now);
    if (this.tSegs.length) this.tSegs[this.tSegs.length - 1].t1 = Math.min(this.tSegs[this.tSegs.length - 1].t1, now);
    const kind = type === 'bottleneck' ? 'bottleneck' : 'breakdown';
    const r = this.rT;
    if (kind === 'bottleneck') {
      const bEnd = now + 15, hEnd = bEnd + 25 + r() * 15, eEnd = hEnd + 20;
      const stops = [];
      for (let L = 0; L < this.lanes; L++) stops.push(this.W - (8 + r() * 8));
      this.tSegs.push(
        { k: 'build', t0: now, t1: bEnd, stops, type: 'bottleneck' },
        { k: 'hold', t0: bEnd, t1: hEnd, stops, type: 'bottleneck' },
        { k: 'ease', t0: hEnd, t1: eEnd, type: 'bottleneck' },
      );
      this.tNextFree = eEnd;
    } else {
      const stopDur = 25 + r() * 15;
      this.tSegs.push({ k: 'breakdown', t0: now, t1: now + 20 + stopDur, stopDur, type: 'breakdown' });
      this.tNextFree = now + 20 + stopDur;
    }
    this.jamCount = kind === 'bottleneck' ? 1 : 0;
    this.tIdx = 0;
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
    const stops = this.stopLines;
    const frontOf = v => v.x + v.bx0 + v.len;
    const rearOf = v => v.x + v.bx0;
    const act = this.vehicles.filter(v => v.active);

    // breakdown: pick the broken vehicle once (seek)
    if (this.bd && this.bd.phase === 'seek') {
      const bd = this.bd;
      let cand = null;
      act.forEach(v => {
        if (v.drift || v.lc || (v.i !== 3 && v.i !== 6 && v.i !== 10)) return;
        if (frontOf(v) < W / 2 + v.len / 2 - 60 && (!cand || frontOf(v) > frontOf(cand))) cand = v;
      });
      if (!cand) {
        const parked = this.vehicles.find(v => !v.active && (v.i === 3 || v.i === 6 || v.i === 10));
        if (parked) {
          const qi = this.queue.indexOf(parked);
          if (qi >= 0) this.queue.splice(qi, 1);
          this.queue.unshift(parked);
          parked.queued = true;
          cand = parked;
        }
      }
      // nothing eligible yet (e.g. every trailer/tanker is past the middle): keep seeking until the segment ends
      if (!cand) { if (this.viewTime >= bd.seg.t1) { this.hazardsOff(); this.bd = null; } }
      else { bd.veh = cand; bd.stopFront = W / 2 + cand.len / 2; bd.phase = 'approach'; }
    }

    // okada/keke start filtering (drifting) in slow traffic
    if ((this.tPhase === 'build' || this.tPhase === 'hold') && this.C > 0.5) {
      act.forEach(v => {
        if (v === (this.bd && this.bd.veh)) return;
        if (v.drift || v.lc || (v.i !== 5 && v.i !== 2)) return;
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
    const buildGroups = () => {
      const g = [];
      for (let L = 0; L < this.lanes; L++) {
        g.push(act.filter(v => !v.drift && (v.lane === L || (v.lc && v.lc.from === L)))
          .sort((a, b) => frontOf(b) - frontOf(a)));
      }
      return g;
    };

    // obstruction box while the broken vehicle is stopping/stopped
    const bdBlock = this.bd && this.bd.veh && (this.bd.phase === 'stopping' || this.bd.phase === 'stopped')
      ? { bR: rearOf(this.bd.veh), bF: frontOf(this.bd.veh), bL: this.bd.veh.lane } : null;

    // overtaking: decide lane changes (gap acceptance) before car-following
    let groups = buildGroups();
    act.forEach(v => {
      if (v === (this.bd && this.bd.veh)) return;
      if (v.drift || v.lc || v.lcCool > 0) return;
      const front = frontOf(v), rear = rearOf(v);
      const L = v.lane;
      const g = groups[L];
      let ld = null;
      for (let n = 0; n < g.length; n++) {
        if (g[n] === v) { ld = n > 0 ? g[n - 1] : null; break; }
      }
      if (!ld) return;
      const gap = rearOf(ld) - front;
      if (gap >= 70 || ld.v >= v.v0 * 0.85 || v.v0 <= ld.v + 6) return;
      if ((this.tPhase === 'build' || this.tPhase === 'hold') && front >= Z0 - 200) return;
      if (front < 0 || rear > W - 40) return;
      const cands = [];
      if (L - 1 >= 0) cands.push(L - 1);
      if (L + 1 < this.lanes) cands.push(L + 1);
      if (cands.length === 2 && this.rT() < 0.5) cands.reverse();
      for (const C of cands) {
        // don't join the blocked lane right behind the breakdown
        if (bdBlock && C === bdBlock.bL && front >= bdBlock.bR - 250 && front <= bdBlock.bF) continue;
        let a = null, b = null, aRear = Infinity, bFront = -Infinity, overlap = false;
        act.forEach(o => {
          if (o === v || o.drift) return;
          if (!(o.lane === C || (o.lc && (o.lc.to === C || o.lc.from === C)))) return;
          const of = frontOf(o), or = rearOf(o);
          if (or >= front && or < aRear) { aRear = or; a = o; }
          if (of <= rear && of > bFront) { bFront = of; b = o; }
          if (or < front && of > rear) overlap = true;
        });
        if (overlap) continue;
        if ((!a || aRear - front >= Math.max(18, v.v * 0.9))
          && (!b || rear - bFront >= Math.max(18, b.v * 0.8))
          && (!a || a.v > ld.v + 4)) {
          v.lc = { from: L, to: C, t: 0, dur: 0.6 };
          v.lane = C;
          v.lcCool = 2.5;
          this.overtakes++;
          return;
        }
      }
    });

    // breakdown: slow zone and merge-around while the obstruction is in place
    act.forEach(v => { v.crawling = false; });
    if (bdBlock) {
      act.forEach(v => {
        if (v === this.bd.veh) return;
        const front = frontOf(v), rear = rearOf(v);
        if (front >= bdBlock.bR - 120 && rear < bdBlock.bF) {
          if (v.crawl == null) v.crawl = 10 + this.rT() * 10;
          v.crawling = true;
        }
      });
      // one vehicle at a time merges out of the blocked lane
      if (!act.some(v => v.lc && v.lc.from === bdBlock.bL && frontOf(v) >= bdBlock.bR - 200 && frontOf(v) <= bdBlock.bF)) {
        let follower = null;
        act.forEach(v => {
          if (v === this.bd.veh || v.drift || v.lane !== bdBlock.bL) return;
          const f = frontOf(v);
          if (f <= bdBlock.bR && (!follower || f > frontOf(follower))) follower = v;
        });
        if (follower && frontOf(follower) >= bdBlock.bR - 40 && follower.v < 12) {
          const v = follower, front = frontOf(v), rear = rearOf(v);
          const cands = [];
          if (bdBlock.bL - 1 >= 0) cands.push(bdBlock.bL - 1);
          if (bdBlock.bL + 1 < this.lanes) cands.push(bdBlock.bL + 1);
          if (cands.length === 2 && this.rT() < 0.5) cands.reverse();
          for (const C of cands) {
            let a = null, b = null, aRear = Infinity, bFront = -Infinity, overlap = false;
            act.forEach(o => {
              if (o === v || o.drift) return;
              if (!(o.lane === C || (o.lc && (o.lc.to === C || o.lc.from === C)))) return;
              const of = frontOf(o), or = rearOf(o);
              if (or >= front && or < aRear) { aRear = or; a = o; }
              if (of <= rear && of > bFront) { bFront = of; b = o; }
              if (or < front && of > rear) overlap = true;
            });
            if (overlap) continue;
            if ((!a || aRear - front >= 8) && (!b || rear - bFront >= 8)) {
              v.lc = { from: bdBlock.bL, to: C, t: 0, dur: 1.2 };
              v.lane = C;
              v.lcCool = 3;
              break;
            }
          }
        }
      }
    }

    // car-following within each lane only (mid-change vehicles are obstacles in their old lane)
    groups = buildGroups();
    const heads = [];
    groups.forEach((group, L) => {
      // lane head: front-most vehicle still short of the stop line (queue members past it keep driving out)
      const stop = stops ? stops[L] : null;
      let head = null;
      if (stop != null) {
        group.forEach(v => {
          if (v.lane !== L) return;
          const f = frontOf(v);
          if (f <= stop + 2 && (!head || f > frontOf(head))) head = v;
        });
      }
      heads[L] = head;
      group.forEach((v, n) => {
        if (v.lane !== L) return; // obstacle-only here: acceleration comes from its target lane
        const front = frontOf(v), rear = rearOf(v);
        const inZone = front >= Z0 - 30 && rear <= Z1;
        const s0 = v.i === 10 ? (inZone ? 10 : 26) : (inZone ? 6 : 10);
        const T = v.i === 10 ? (inZone ? 0.6 : 1.1) : (inZone ? 0.35 : HEADWAY);
        v.s0 = s0;
        let vd = v.v0;
        // the lane head drives up to its stop line; only the queue behind it creeps
        if (inZone && v !== head) {
          const jam = 8 * Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * this.simTime / 7 - front / 45), 2);
          vd = Math.min(v.v0, lerp(v.v0, jam, this.C));
        }
        if (v.crawling) vd = Math.min(vd, v.crawl);
        vd = Math.max(0.5, vd);
        const ld = n > 0 ? group[n - 1] : null;
        let term = 0;
        if (ld) {
          const s = ld.x + ld.bx0 - front;
          const sStar = Math.max(s0, s0 + v.v * T + v.v * (v.v - ld.v) / (2 * Math.sqrt(ACC * DECEL)));
          term = Math.pow(sStar / Math.max(s, 0.1), 2);
        }
        // head: a virtual stationary leader parked on the stop line, unless a real leader is closer
        if (v === head && !(ld && ld.x + ld.bx0 <= stop)) {
          const sStar = Math.max(0.5, 0.5 + v.v * 0.35 + v.v * v.v / (2 * Math.sqrt(ACC * DECEL)));
          term = Math.pow(sStar / Math.max(stop - front, 0.1), 2);
        }
        v._a = Math.max(-DECEL_MAX, Math.min(ACC, ACC * (1 - Math.pow(v.v / vd, 4) - term)));
        if (this.bd && v === this.bd.veh && this.bd.phase === 'restart') v._a = Math.min(v._a, ACC * 0.5);
      });
    });
    // drifters: walking pace, no leader
    drifters.forEach(v => {
      let vd = Math.max(0.5, Math.min(v.v0, 18));
      if (v.crawling) vd = Math.min(vd, v.crawl);
      v._a = Math.max(-DECEL_MAX, Math.min(ACC, ACC * (1 - Math.pow(v.v / vd, 4))));
    });

    act.forEach(v => { if (v.lcCool > 0) v.lcCool -= dt; });
    act.forEach(v => {
      if (this.bd && v === this.bd.veh && (this.bd.phase === 'stopping' || this.bd.phase === 'stopped')) return;
      v.v = Math.max(0, v.v + (v._a || 0) * dt);
      v.x += v.v * dt;
    });

    // breakdown vehicle: approach trigger, brake, hold, restart
    if (this.bd && this.bd.veh) {
      const bd = this.bd, bv = bd.veh;
      if (bd.phase === 'approach') {
        if (bv.active && bd.stopFront - frontOf(bv) <= Math.max(8, 0.75 * bv.v)) { bd.phase = 'stopping'; bd.vTrig = bv.v; }
      } else if (bd.phase === 'stopping') {
        bv.v = Math.max(0, bv.v - (bd.vTrig / 1.5) * dt);
        bv.x += bv.v * dt;
        if (frontOf(bv) > bd.stopFront + 4) { bv.x = bd.stopFront + 4 - bv.bx0 - bv.len; bv.v = 0; }
        if (bv.v === 0) { bd.phase = 'stopped'; bd.tStop = this.simTime; this.hazardsOn(); }
      } else if (bd.phase === 'stopped') {
        bv.v = 0;
        if (this.simTime - bd.tStop >= bd.seg.stopDur) { this.hazardsOff(); bd.phase = 'restart'; }
      } else if (bd.phase === 'restart') {
        if (rearOf(bv) > W / 2 + 140) { this.hazardsOff(); this.bd = null; }
      }
      this.updateHazards();
    }

    // no lane head ever pokes past its stop line; drifters ignore the lines but stay behind the furthest
    if (stops) {
      for (let L = 0; L < heads.length; L++) {
        const h = heads[L];
        if (h && frontOf(h) > stops[L]) { h.x = stops[L] - h.bx0 - h.len; h.v = 0; }
      }
      let far = -Infinity;
      stops.forEach(s => { far = Math.max(far, s); });
      drifters.forEach(v => {
        if (frontOf(v) > far + 4) { v.x = far + 4 - v.bx0 - v.len; v.v = 0; }
      });
    }

    // drifters slide sideways at 3 px/s toward the target lane
    drifters.forEach(v => {
      v.drift.t += dt;
      const target = this.laneDys[v.drift.to];
      const stepDy = 3 * dt;
      if (target > v.dy) v.dy = Math.min(target, v.dy + stepDy);
      else if (target < v.dy) v.dy = Math.max(target, v.dy - stepDy);
    });

    // progress active lane changes: lerp dy, re-sort at the half and the end
    act.forEach(v => {
      if (!v.lc) return;
      v.lc.t += dt;
      const p = v.lc.t / v.lc.dur;
      v.dy = lerp(this.laneDys[v.lc.from], this.laneDys[v.lc.to], smooth(p));
      if (!v.lc.half && p >= 0.5) { v.lc.half = true; this.orderDirty = true; }
      if (v.lc.t >= v.lc.dur) {
        v.dy = this.laneDys[v.lc.to];
        v.lc = null;
        this.orderDirty = true;
      }
    });

    // hard no-overlap clamp within each lane (front to back)
    groups.forEach((group, L) => {
      for (let n = 1; n < group.length; n++) {
        const ld = group[n - 1], v = group[n];
        if (v.lane !== L) continue; // mid-change obstacle: never moved in its old lane
        if (this.bd && v === this.bd.veh && this.bd.phase === 'stopped') continue; // broken vehicle holds still
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
        if (this.bd && v === this.bd.veh) { this.hazardsOff(); this.bd = null; }
        this.setActive(v, false); v.queued = false;
        count--;
      }
    });

    // spawn into the lane with the most entry room
    const minSpawn = this.tPhase === 'build' || this.tPhase === 'hold' ? 0.45 : 0;
    if (this.simTime - this.lastSpawn >= minSpawn) {
      let cand = null;
      if (this.queue.length) cand = this.queue[0];
      else if (count < this.target) {
        // weighted pick among parked vehicles (allocation-light: two passes)
        const rainy = this.wx.rain > 0;
        let tot = 0;
        for (let k = 0; k < this.vehicles.length; k++) {
          const v = this.vehicles[k];
          if (!v.active && !v.queued && !(rainy && v.i === 5)) tot += v.i === 9 ? 0.5 : (v.i === 8 || v.i === 10) ? 0.3 : 1;
        }
        if (tot > 0) {
          let pick = this.rT() * tot, last = null;
          for (let k = 0; k < this.vehicles.length; k++) {
            const v = this.vehicles[k];
            if (v.active || v.queued || (rainy && v.i === 5)) continue;
            last = v;
            pick -= v.i === 9 ? 0.5 : (v.i === 8 || v.i === 10) ? 0.3 : 1;
            if (pick <= 0) { cand = v; break; }
          }
          if (!cand) cand = last;
        }
      }
      if (cand) {
        this.pickV0(cand);
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
      // move only the layers that are out of place (walk back from the roof canvas): re-inserting every
      // composited vehicle layer on each change churns style and layers
      let ref = this.cRoof;
      for (let k = sorted.length - 1; k >= 0; k--) {
        const w = sorted[k].wrapper;
        if (w.nextSibling !== ref) this.el.insertBefore(w, ref);
        ref = w;
      }
    }
  }

  // ---------- breakdown hazards ----------
  ensureHzDefs() {
    if (this.hzDefs || !this.svg) return;
    const defs = document.createElementNS(SVGNS, 'defs');
    defs.setAttribute('data-cl-hz', '1');
    defs.innerHTML = '<radialGradient id="cl-hz-' + this.seed + '"><stop offset="0" stop-color="#ffb703" stop-opacity=".55"/><stop offset="1" stop-color="#ffb703" stop-opacity="0"/></radialGradient>';
    this.svg.insertBefore(defs, this.svg.firstChild);
    this.hzDefs = defs;
  }

  hazardsOn() {
    const bd = this.bd;
    if (!bd || !bd.veh) return;
    if (!this.hzG) {
      this.ensureHzDefs();
      const v = bd.veh, bx0 = v.bx0, len = v.len, bbY = v.bbY, bbH = v.bbH;
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('data-cl-hz', '1');
      const lamps = [
        [bx0 + len - 1, bbY + bbH * 0.30],
        [bx0 + len - 1, bbY + bbH * 0.72],
        [bx0 + 1, bbY + bbH * 0.30],
        [bx0 + 1, bbY + bbH * 0.72],
      ];
      lamps.forEach(([x, y]) => {
        const halo = document.createElementNS(SVGNS, 'circle');
        if (this.night) {
          halo.setAttribute('r', '9');
          halo.setAttribute('fill', 'url(#cl-hz-' + this.seed + ')');
        } else {
          halo.setAttribute('r', '4');
          halo.setAttribute('fill', '#ffb703');
          halo.setAttribute('opacity', '.35');
        }
        halo.setAttribute('cx', x.toFixed(1));
        halo.setAttribute('cy', y.toFixed(1));
        halo.setAttribute('data-cl-hz', '1');
        g.appendChild(halo);
        const lamp = document.createElementNS(SVGNS, 'circle');
        lamp.setAttribute('r', '2.2');
        lamp.setAttribute('fill', '#ffb703');
        lamp.setAttribute('cx', x.toFixed(1));
        lamp.setAttribute('cy', y.toFixed(1));
        lamp.setAttribute('data-cl-hz', '1');
        g.appendChild(lamp);
      });
      v.g.appendChild(g);
      this.hzG = g;
    }
    bd.hazardsOn = true;
  }

  hazardsOff() {
    if (this.hzG) { this.hzG.remove(); this.hzG = null; }
    if (this.bd) { this.bd.hazardsOn = false; this.bd.hazardVisible = false; }
  }

  updateHazards() {
    if (!this.hzG || !this.bd) return;
    const bd = this.bd;
    const visible = bd.hazardsOn && (((this.simTime - bd.tStop) * 1.5) % 1 < 0.5);
    if (visible !== bd.hazardVisible) {
      bd.hazardVisible = visible;
      this.hzG.style.display = visible ? '' : 'none';
    }
  }

  applyVehicles() {
    const G = this.G, vehicles = this.vehicles;
    for (let k = 0; k < vehicles.length; k++) {
      const v = vehicles[k];
      if (!v.active) continue;
      const tx = r1(v.x - 10);
      const ty = r1(G + v.dy - 70);
      if (tx !== v.tx || ty !== v.ty) {
        v.tx = tx; v.ty = ty;
        v.wrapper.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0)';
      }
    }
  }

  // police light bars alternate red/blue at ~2 Hz; nothing is allocated per frame
  updatePolice() {
    const vehicles = this.vehicles;
    const phase = Math.floor(this.simTime * 4) % 2;
    for (let k = 0; k < vehicles.length; k++) {
      const v = vehicles[k];
      if (!v.active || !v.pol || v.pol.phase === phase) continue;
      v.pol.phase = phase;
      const rd = phase === 0 ? 'inline' : 'none';
      const bd = phase === 0 ? 'none' : 'inline';
      for (let m = 0; m < v.pol.red.length; m++) v.pol.red[m].setAttribute('display', rd);
      for (let m = 0; m < v.pol.blue.length; m++) v.pol.blue[m].setAttribute('display', bd);
    }
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
    this.farClouds.forEach(c => c.g.remove());
    this.farClouds = [];
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
      const g = document.createElementNS(SVGNS, 'svg');
      g.setAttribute('width', '140');
      g.setAttribute('height', '70');
      g.setAttribute('viewBox', '-6 -60 140 70');
      g.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;will-change:transform,opacity;transform-origin:0 0';
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
      // one step lighter than the original storm clouds (item 4)
      p.setAttribute('fill', STORM_FILL(this.night));
      p.setAttribute('stroke', 'rgba(255,255,255,.5)');
      // CSS scale also scales strokes now, so bake the inverse into the width
      p.setAttribute('stroke-width', (0.8 / S).toFixed(3));
      p.setAttribute('stroke-linejoin', 'round');
      g.appendChild(p);
      // inner detail strokes, thinner in proportion to the outline
      const dl = document.createElementNS(SVGNS, 'path');
      dl.setAttribute('d', 'M44 -30Q50 -40 62 -38M90 -24Q98 -28 104 -24');
      dl.setAttribute('fill', 'none');
      dl.setAttribute('stroke', 'rgba(255,255,255,.3)');
      dl.setAttribute('stroke-width', (0.7 / S).toFixed(3));
      dl.setAttribute('stroke-linecap', 'round');
      g.appendChild(dl);
      // lit lower edge, drawn last
      const hl = document.createElementNS(SVGNS, 'path');
      hl.setAttribute('d', 'M8 -3Q40 3 66 0Q96 -3 124 -4');
      hl.setAttribute('fill', 'none');
      hl.setAttribute('stroke', '#f4fbe0');
      hl.setAttribute('stroke-width', (1 / S).toFixed(3));
      hl.setAttribute('stroke-linecap', 'round');
      hl.setAttribute('opacity', '0');
      g.appendChild(hl);
      this.el.insertBefore(g, this.wxAnchor);
      this.stormClouds.push({ g, S, Y, Xt, from, dir: Xt + 60 * S < W / 2 ? -1 : 1, cx: from, glow, body: p, detail: dl, hl, L: -1, tf: null, op: null, ox: 6, oy: 60, cxm: 66, sa: 0.5, da: 0.3 });
    }
    this.buildFarClouds();
    this.updateStormClouds();
  }

  // distant storm clouds: fewer, smaller, flatter and hazier, low over the far skyline.
  // They live in front of the far city (farA/farB tiles) and behind the near row + near
  // clouds (inserted before the mid rain canvas, which is itself before the near tile).
  buildFarClouds() {
    if (!this.cMid) return;
    const rv = this.rV, W = this.W, n = 4 + Math.floor(rv() * 4), span = (W - 120) + 60;
    for (let j = 0; j < n; j++) {
      const S = 0.7 + rv() * 0.5, Y = -170 + rv() * 70;
      const Xt = -60 + (j + 0.5) * (span / n) + (rv() - 0.5) * (span / n) * 0.6;
      const from = j % 2 ? W + 60 : -300;
      const g = document.createElementNS(SVGNS, 'svg');
      g.setAttribute('width', '120');
      g.setAttribute('height', '44');
      g.setAttribute('viewBox', '-6 -32 120 44');
      g.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;will-change:transform,opacity;transform-origin:0 0';
      const glow = document.createElementNS(SVGNS, 'ellipse');
      glow.setAttribute('cx', '60');
      glow.setAttribute('cy', '-5');
      glow.setAttribute('rx', '70');
      glow.setAttribute('ry', '26');
      glow.setAttribute('fill', 'url(#cl-glow-' + this.seed + ')');
      glow.setAttribute('opacity', '0');
      g.appendChild(glow);
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', FAR_CLOUD_D);
      p.setAttribute('fill', FAR_FILL(this.night));
      p.setAttribute('fill-opacity', '0.82'); // distance haze
      p.setAttribute('stroke', 'rgba(255,255,255,.30)');
      p.setAttribute('stroke-width', (0.6 / S).toFixed(3));
      p.setAttribute('stroke-linejoin', 'round');
      g.appendChild(p);
      const dl = document.createElementNS(SVGNS, 'path');
      dl.setAttribute('d', 'M44 -15Q50 -20 62 -19M90 -12Q98 -14 104 -12');
      dl.setAttribute('fill', 'none');
      dl.setAttribute('stroke', 'rgba(255,255,255,.18)');
      dl.setAttribute('stroke-width', (0.5 / S).toFixed(3));
      dl.setAttribute('stroke-linecap', 'round');
      g.appendChild(dl);
      const hl = document.createElementNS(SVGNS, 'path');
      hl.setAttribute('d', 'M8 -2Q40 1 66 0Q96 -2 124 -2');
      hl.setAttribute('fill', 'none');
      hl.setAttribute('stroke', '#f4fbe0');
      hl.setAttribute('stroke-width', (0.9 / S).toFixed(3));
      hl.setAttribute('stroke-linecap', 'round');
      hl.setAttribute('opacity', '0');
      g.appendChild(hl);
      this.el.insertBefore(g, this.cMid);
      this.farClouds.push({ g, S, Y, Xt, from, dir: Xt + 60 * S < W / 2 ? -1 : 1, cx: from, glow, body: p, detail: dl, hl, L: -1, tf: null, op: null, ox: 6, oy: 32, cxm: 60, sa: 0.30, da: 0.18 });
    }
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
    if (!s) return;
    const t = this.viewTime, W = this.W;
    const base = STORM_FILL(this.night), farBase = FAR_FILL(this.night);
    const lit = s.events.filter(e => e.src != null && this.stormClouds[e.src]);
    this.updateClouds(this.stormClouds, base, lit, 1, t, W, w, s);
    this.updateClouds(this.farClouds, farBase, lit, 0.55, t, W, w, s);
  }

  updateClouds(cs, base, lit, glowScale, t, W, w, s) {
    if (!cs.length) return;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      let X, op;
      if (w.phase === 'gathering') { const p = clamp01(w.p); X = c.from + (c.Xt - c.from) * (1 - Math.pow(1 - p, 3)); op = 0.95 * p; }
      else if (w.phase === 'storm') { X = c.Xt + 4 * (t - s.gEnd); op = 0.95; }
      else { X = c.Xt + 4 * s.D + c.dir * 90 * (t - s.cEnd); op = 0.95 * (1 - clamp01(w.p)); }
      c.cx = X;
      const tf = 'translate3d(' + r1(X - c.ox * c.S) + 'px,' + r1(c.Y - c.oy * c.S) + 'px,0) scale(' + c.S.toFixed(2) + ')';
      if (tf !== c.tf) { c.tf = tf; c.g.style.transform = tf; }
      const opS = op.toFixed(3);
      if (opS !== c.op) { c.op = opS; c.g.style.opacity = opS; }
      // lightning light: source cloud brightest, neighbours fade with distance (far clouds scaled down)
      const cxc = c.cx + c.cxm * c.S;
      let L = 0;
      lit.forEach(e => {
        const k = this.flashK(e, t);
        if (k <= 0) return;
        const sc = this.stormClouds[e.src];
        const d = Math.abs(cxc - (sc.cx + sc.cxm * sc.S));
        const fall = d === 0 ? 1 : 0.85 * Math.exp(-d / (0.22 * W));
        L = Math.max(L, k * fall);
      });
      L *= glowScale;
      if (Math.abs(L - c.L) > 0.002) {
        c.L = L;
        c.body.setAttribute('fill', mixHex(base, '#eef8cf', 0.85 * L));
        c.body.setAttribute('stroke', 'rgba(255,255,255,' + (c.sa + (1 - c.sa) * L).toFixed(3) + ')');
        c.detail.setAttribute('stroke', 'rgba(255,255,255,' + (c.da + (1 - c.da) * L).toFixed(3) + ')');
        c.glow.setAttribute('opacity', L.toFixed(3));
        c.hl.setAttribute('opacity', L.toFixed(3));
      }
    }
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
    this.updatePolice();
    this.updateLights();
    this.stepRain(dt);
    this.draw();
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

  draw() {
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
    const line = v.roof;
    if (!line) return null;
    const k = Math.round(wx - v.x) - ROOF_X0;
    if (k < 0 || k >= ROOF_N) return null;
    const y = line[k];
    return y === y ? this.G + v.dy + y : null; // NaN: no body at this x
  }

  // record a splash on `surface` in the current frame's rolling-window slot
  countSplash(surface) {
    this.splashCur[surface]++;
    this.splashTot[surface]++;
  }

  addGroundSplash(x, y) {
    if (this.gSplashCount >= 160) return;
    const sp = this.gSplashes[this.gSplashCount++];
    const rv = this.rV;
    sp.x = x; sp.y = y; sp.age = 0;
    this.countSplash(SP_ROAD);
    sp.n = 2 + Math.floor(rv() * 2);
    for (let k = 0; k < sp.n; k++) {
      const q = sp.dr[k];
      q.x = x; q.y = y;
      q.vx = -45 + rv() * 90;
      q.vy = -150 + rv() * 60;
    }
  }

  // a roof splash is hidden once a nearer vehicle (larger dy) covers it with a higher body
  roofHidden(sp) {
    const v = sp.veh, wx = v.x + sp.lx, wy = this.G + v.dy + sp.ly, r = sp.rxMax || 6;
    // test the ripple's centre and both ends: any part under a nearer, higher body hides the splash
    return this.occludedAt(v, wx - r, wy) || this.occludedAt(v, wx, wy) || this.occludedAt(v, wx + r, wy);
  }

  // true when a vehicle nearer than v covers point (px, py) with its body
  occludedAt(v, px, py) {
    const vs = this.vehicles;
    for (let m = 0; m < vs.length; m++) {
      const u = vs[m];
      if (u === v || !u.active || u.dy <= v.dy) continue;
      if (px < u.x + u.bx0 - 1 || px > u.x + u.bx0 + u.len + 1) continue;
      const ry = this.roofAt(u, Math.min(Math.max(px, u.x + u.bx0), u.x + u.bx0 + u.len));
      if (ry != null && ry < py + 2) return true;
    }
    return false;
  }

  addRoofSplash(v, lx, ly) {
    if (this.rSplashCount >= 80) return;
    // on a sloped roof the ripple must stay within the roof band: cap its radius by the local slope;
    // at a step (a wall between roof levels) the drop just ends there, without a splash
    // the ripple may only spread over roof that stays within 1.2 px of the hit point
    const line = v.roof, k0 = Math.round(lx) - ROOF_X0;
    const y0 = line && k0 >= 0 && k0 < ROOF_N ? line[k0] : NaN;
    let r = 0;
    for (let d = 1; d <= 6 && y0 === y0; d++) {
      const a = k0 - d >= 0 ? line[k0 - d] : NaN, b = k0 + d < ROOF_N ? line[k0 + d] : NaN;
      if (!(Math.abs(a - y0) <= 1.2) || !(Math.abs(b - y0) <= 1.2)) break;
      r = d;
    }
    if (r < 1) return;
    const sp = this.rSplashes[this.rSplashCount++];
    const rv = this.rV;
    sp.veh = v; sp.lx = lx; sp.ly = ly; sp.age = 0; sp.n = 2;
    this.countSplash(SP_VEH);
    sp.rxMax = Math.max(0.8, r - 1.2); // keep the stroked ripple inside the flat run
    for (let k = 0; k < 2; k++) {
      const q = sp.dr[k];
      q.x = 0; q.y = 0; q.gone = false;
      q.vx = -30 + rv() * 60;
      q.vy = -90 + rv() * 40;
    }
  }

  // building-roof splash: ripple + droplets that settle on the building's roof line. The
  // ripple radius is capped by the flat run around the hit point (same rule as vehicles);
  // on a step or wall there is no splash. u is tile-space, so world x = u + current offset.
  addBuildingSplash(k, x, y, off) {
    if (this.bSplashCount >= 120) return;
    const s = k === 2 ? 1 : k === 1 ? 0.55 : 0.35;
    const u = x - off;
    const pr = this.prof[k], T = pr.T, p = pr.p;
    const ui = ((u % T) + T) % T | 0;
    let r = 0;
    for (let d = 1; d <= 6; d++) {
      const a = p[((ui - d) % T + T) % T | 0];
      const b = p[((ui + d) % T + T) % T | 0];
      if (!(Math.abs(a - y) <= 1.2) || !(Math.abs(b - y) <= 1.2)) break;
      r = d;
    }
    if (r < 2) return; // building roofs: only splash on a flat run (spires, domes, slopes just end the drop)
    const sp = this.bSplashes[this.bSplashCount++];
    const rv = this.rV;
    sp.k = k; sp.u = u; sp.y = y; sp.s = s; sp.age = 0;
    this.countSplash(k === 2 ? SP_NEAR : k === 1 ? SP_FARB : SP_FARA);
    sp.rx = Math.max(0.8, r - 1.2);
    sp.n = 2 + Math.floor(rv() * 2);
    for (let m = 0; m < sp.n; m++) {
      const q = sp.dr[m];
      q.x = 0; q.y = 0; q.gone = false;
      q.vx = (-30 + rv() * 60) * s;
      q.vy = (-90 + rv() * 40) * s;
    }
  }

  // spawn drop d from a storm cloud that is actually on stage (op >= 0.35), picked with
  // probability proportional to its scale. Two passes over the (tiny) list, so no allocation.
  // fill: also used when a drop first appears, so the column fills in from cloud base to ground.
  emit(d, fill) {
    const cs = d.layer === 'near' ? this.stormClouds : this.farClouds, rr = this.rR;
    let tot = 0;
    for (let k = 0; k < cs.length; k++) { const c = cs[k]; if (c.op >= 0.35) tot += c.S; }
    if (!(tot > 0)) return false;
    let pick = rr() * tot, c = null, ci = -1, last = -1;
    for (let k = 0; k < cs.length; k++) {
      const q = cs[k];
      if (q.op < 0.35) continue;
      last = k;
      pick -= q.S;
      if (pick <= 0) { c = q; ci = k; break; }
    }
    if (!c) { c = cs[last]; ci = last; }
    // x inside the cloud body's lower half, y in the hidden band just above its bottom edge
    d.x = c.cx + (10 + rr() * 112) * c.S;
    d.y = fill ? c.Y + rr() * (this.G - c.Y) : c.Y - rr() * 9 * c.S;
    d.src = ci;
    d.wait = false;
    return true;
  }

  // mid/far drops land only on their own building row; below the roof line they keep falling
  // (hidden behind nearer rows) and reset at the ground without a splash.
  stepFarDrop(d, k, off, py, hy) {
    const y = this.profY(k, d.x, off);
    if (y === y) {
      if (py < y && hy >= y) {
        this.addBuildingSplash(k, d.x, y, off);
        if (!this.emit(d, false)) d.wait = true;
      } else if (hy >= y) {
        if (!this.emit(d, false)) d.wait = true;
      } else {
        const mx = d.x - d.sn * d.len * 0.5, my = hy - d.cs * d.len * 0.5, tx = d.x - d.sn * d.len, ty = hy - d.cs * d.len;
        if (my >= this.profY(k, mx, off) || ty >= this.profY(k, tx, off)) { if (!this.emit(d, false)) d.wait = true; }
      }
    } else if (hy >= this.G) {
      if (!this.emit(d, false)) d.wait = true;
    }
  }

  stepRain(dt) {
    const G = this.G;
    const drops = this.drops, vehicles = this.vehicles;
    const na = Math.round(this.N * this.wx.rain);
    // rotate the 30-frame splash window once per frame (totals track the rolling sum)
    const slot = this.splashBuf[this.splashIdx];
    for (let i = 0; i < 5; i++) { this.splashTot[i] -= slot[i]; slot[i] = 0; }
    this.splashCur = slot;
    this.naNear = Math.min(na, this.nNear);
    this.naMid = Math.max(0, Math.min(na, this.nNear + this.nMid) - this.nNear);
    this.naFar = Math.max(0, na - this.nNear - this.nMid);
    // level up: a newly active drop only appears once a storm cloud can emit it
    for (let k = this.nAct; k < na; k++) { const d = drops[k]; if (!this.emit(d, true)) d.wait = true; }
    this.nAct = na;
    const offA = this.tileOff(0), offB = this.tileOff(1), offN = this.tileOff(2);

    // move drops, spawn roof/ground splashes on impact
    for (let k = 0; k < na; k++) {
      const d = drops[k];
      // no storm cloud on stage: hold the drop (invisible) and retry on later frames
      if (d.wait && !this.emit(d, true)) continue;
      const sn = d.sn, cs = d.cs, dist = d.spd * dt;
      const py = d.y;
      d.x += sn * dist;
      d.y += cs * dist;
      const hx = d.x, hy = d.y;
      if (d.layer === 'near') {
        // a vehicle covering x wins over the building behind it: nearest lane (largest dy) first
        let hit = null, ry = null, hitDy = -Infinity;
        for (let m = 0; m < vehicles.length; m++) {
          const v = vehicles[m];
          if (!v.active) continue;
          if (hx < v.x + v.bx0 || hx > v.x + v.bx0 + v.len) continue;
          const y = this.roofAt(v, hx);
          if (y == null) continue;
          if (v.dy > hitDy || (v.dy === hitDy && y < ry)) { ry = y; hit = v; hitDy = v.dy; }
        }
        if (ry != null) {
          if (py < ry && hy >= ry) {
            this.addRoofSplash(hit, hx - hit.x, ry - (G + hit.dy) - 0.8); // ripple sits just on top of the roof line
            if (!this.emit(d, false)) d.wait = true;
          }
          // above the vehicle roof: keep falling toward it (never caught by the building behind)
        } else if ((k * 7919) % 100 < 55) {
          // street plane: falls in front of the roadside facades and lands on the road at a slight depth spread
          const gy = G + 3 + ((k * 37) % 13);
          if (hy >= gy) {
            this.addGroundSplash(hx, gy);
            if (!this.emit(d, false)) d.wait = true;
          }
        } else {
          const yN = this.profY(2, hx, offN);
          if (yN === yN && hy >= yN) {
            if (py < yN) this.addBuildingSplash(2, hx, yN, offN);
            if (!this.emit(d, false)) d.wait = true;
          } else if (hy >= G) {
            this.addGroundSplash(hx, G);
            if (!this.emit(d, false)) d.wait = true;
          } else {
            // the slanted tail must not cut into a near facade (a roof rising toward the tail)
            const mx = hx - d.sn * d.len * 0.5, my = hy - d.cs * d.len * 0.5, tx = hx - d.sn * d.len, ty = hy - d.cs * d.len;
            if (my >= this.profY(2, mx, offN) || ty >= this.profY(2, tx, offN)) { if (!this.emit(d, false)) d.wait = true; }
          }
        }
      } else if (d.layer === 'farB') {
        this.stepFarDrop(d, 1, offB, py, hy);
      } else {
        this.stepFarDrop(d, 0, offA, py, hy);
      }
    }

    // advance ground splashes, swap-removing expired ones
    for (let k = this.gSplashCount - 1; k >= 0; k--) {
      const sp = this.gSplashes[k];
      sp.age += dt;
      if (sp.age >= 0.3) {
        this.gSplashCount--;
        const last = this.gSplashes[this.gSplashCount];
        this.gSplashes[k] = last;
        this.gSplashes[this.gSplashCount] = sp;
        continue;
      }
      sp.b = sp.age < 0.1 ? 0 : sp.age < 0.2 ? 1 : 2;
      for (let m = 0; m < sp.n; m++) {
        const q = sp.dr[m];
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vy += 700 * dt;
      }
    }

    // advance roof splashes, dropping those on deactivated vehicles
    for (let k = this.rSplashCount - 1; k >= 0; k--) {
      const sp = this.rSplashes[k];
      sp.age += dt;
      if (sp.age >= 0.3 || !sp.veh.active || this.roofHidden(sp)) {
        this.rSplashCount--;
        const last = this.rSplashes[this.rSplashCount];
        this.rSplashes[k] = last;
        this.rSplashes[this.rSplashCount] = sp;
        continue;
      }
      sp.b = sp.age < 0.1 ? 0 : sp.age < 0.2 ? 1 : 2;
      for (let m = 0; m < sp.n; m++) {
        const q = sp.dr[m];
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vy += 600 * dt;
        // land back on the roof line under the droplet (never in front of the body)
        const line = sp.veh.roof, kq = Math.round(sp.lx + q.x) - ROOF_X0, kb = Math.round(sp.lx) - ROOF_X0;
        // highest roof under the droplet's 2 px footprint
        let yq = NaN;
        let off = false;
        for (let f = -1; f <= 2; f++) {
          const kk = kq + f, yy = line && kk >= 0 && kk < ROOF_N ? line[kk] : NaN;
          if (yy !== yy) { off = true; break; }
          if (!(yq <= yy)) yq = yy;
        }
        if (off) yq = NaN; // any part of the droplet past the end of the roof: it is gone (below)
        const yb = line && kb >= 0 && kb < ROOF_N ? line[kb] : NaN;
        // a droplet never slides into a taller part of the body (a wall): bounce back off it
        if (yq === yq && yb === yb && yq < yb - 1 && q.y > (yq - yb) - 2.8) { q.x -= q.vx * dt; q.vx = -q.vx; }
        if (yq !== yq) { q.gone = true; continue; } // off the end of the roof: the droplet is gone
        const floor = (yb === yb) ? (yq - yb) - 2.8 : -2.8; // 1 px clearance above the roof
        if (q.y > floor) { q.y = floor; q.vy = 0; q.vx = 0; }
      }
    }

    // advance building splashes, swap-removing expired ones
    for (let k = this.bSplashCount - 1; k >= 0; k--) {
      const sp = this.bSplashes[k];
      sp.age += dt;
      if (sp.age >= 0.3) {
        this.bSplashCount--;
        const last = this.bSplashes[this.bSplashCount];
        this.bSplashes[k] = last;
        this.bSplashes[this.bSplashCount] = sp;
        continue;
      }
      sp.b = sp.age < 0.1 ? 0 : sp.age < 0.2 ? 1 : 2;
      const pr = this.prof[sp.k], T = pr.T, p = pr.p;
      const u = sp.u, y = sp.y, grav = 600 * sp.s;
      for (let m = 0; m < sp.n; m++) {
        const q = sp.dr[m];
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vy += grav * dt;
        const kq = Math.round(u + q.x);
        let yq = NaN, off = false;
        for (let f = -1; f <= 2; f++) {
          const yy = p[((kq + f) % T + T) % T | 0];
          if (yy !== yy) { off = true; break; }
          if (!(yq <= yy)) yq = yy;
        }
        if (off) { q.gone = true; continue; } // any part of the droplet past the roof: gone (below)
        // a droplet never slides into a taller part of the roof (a wall): bounce back off it
        if (yq < y - 1 && q.y > (yq - y) - 2.8) { q.x -= q.vx * dt; q.vx = -q.vx; }
        const floor = (yq - y) - 2.8; // 1 px clearance above the roof
        if (q.y > floor) { q.y = floor; q.vy = 0; q.vx = 0; }
      }
    }

    this.splashIdx = (this.splashIdx + 1) % 30;
    this.drawRainCanvas();
    this.drawMidCanvas();
    this.drawFarCanvas();
    this.drawRoofCanvas();
  }

  drawDrops(ctx, i0, i1, lineWidth, strokeStyle, top) {
    if (!(i1 > i0)) return;
    const drops = this.drops;
    ctx.beginPath();
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.strokeStyle = strokeStyle;
    for (let k = i0; k < i1; k++) {
      const d = drops[k];
      if (d.wait) continue;
      ctx.moveTo(d.x - d.sn * d.len, d.y - d.cs * d.len - top);
      ctx.lineTo(d.x, d.y - top);
    }
    ctx.stroke();
  }

  // building-roof splashes for one depth layer; each layer is drawn on its own canvas so
  // nearer rows occlude it naturally (no per-splash layout checks needed).
  drawBuildingSplashes(ctx, k, top) {
    const nB = this.bSplashCount, bS = this.bSplashes;
    if (!nB) return;
    const off = this.tileOff(k);
    for (let b = 0; b < 3; b++) {
      ctx.globalAlpha = this.bucketA[b];
      ctx.beginPath();
      for (let i = 0; i < nB; i++) {
        const sp = bS[i];
        if (sp.k !== k || sp.b !== b) continue;
        const cx = sp.u + off;
        const cy = sp.y - 0.8 - top;
        const rr = Math.min(sp.rx, lerp(1.5, 6, sp.age / 0.3) * sp.s);
        ctx.moveTo(cx + rr, cy); // new subpath: no connecting line between ripples
        ctx.ellipse(cx, cy, rr, rr * 0.3, 0, 0, 2 * Math.PI);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < nB; i++) {
        const sp = bS[i];
        if (sp.k !== k || sp.b !== b) continue;
        const cx = sp.u + off;
        const cy = sp.y - 0.8 - top;
        const sz = 1.6 * sp.s;
        for (let m = 0; m < sp.n; m++) {
          const q = sp.dr[m];
          if (q.gone) continue;
          ctx.rect(cx + q.x, cy + q.y, sz, sz);
        }
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawRainCanvas() {
    const ctx = this.cRainCtx, W = this.W, H = this.H, top = this.top;
    const na = this.naNear;
    if (!na && !this.gSplashCount && !this.bSplashCount) {
      if (this.rainDrawn) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.cRain.width, this.cRain.height);
        this.rainDrawn = false;
      }
      return;
    }
    this.rainDrawn = true;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    this.drawDrops(ctx, 0, na, 1, this.rainCol, top);

    const nS = this.gSplashCount, gS = this.gSplashes;
    ctx.strokeStyle = this.gCol;
    ctx.fillStyle = this.gCol;
    ctx.lineWidth = 1.2;
    for (let b = 0; b < 3; b++) {
      ctx.globalAlpha = this.bucketA[b];
      ctx.beginPath();
      for (let k = 0; k < nS; k++) {
        const sp = gS[k];
        if (sp.b !== b) continue;
        const rx = lerp(2, 9, sp.age / 0.3);
        ctx.moveTo(sp.x + rx, sp.y - top); // new subpath: no connecting line between ripples
        ctx.ellipse(sp.x, sp.y - top, rx, rx * 0.3, 0, 0, 2 * Math.PI);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < nS; k++) {
        const sp = gS[k];
        if (sp.b !== b) continue;
        for (let m = 0; m < sp.n; m++) {
          const q = sp.dr[m];
          ctx.rect(q.x, q.y - top, 1.8, 1.8);
        }
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.drawBuildingSplashes(ctx, 2, top);

    // drops now start down at the cloud bases, so the fade only has to soften the canvas edge
    if (!this.rainFade) {
      this.rainFade = ctx.createLinearGradient(0, 0, 0, 40);
      this.rainFade.addColorStop(0, 'rgba(0,0,0,1)');
      this.rainFade.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = this.rainFade;
    ctx.fillRect(0, 0, W, 40);
    ctx.globalCompositeOperation = 'source-over';
  }

  drawMidCanvas() {
    const ctx = this.cMidCtx, W = this.W, H = this.H, top = this.top;
    const na = this.naMid, i0 = this.nNear;
    if (!na && !this.bSplashCount) {
      if (this.midDrawn) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.cMid.width, this.cMid.height);
        this.midDrawn = false;
      }
      return;
    }
    this.midDrawn = true;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    this.drawDrops(ctx, i0, i0 + na, 0.7, this.rainColMid, top);
    this.drawBuildingSplashes(ctx, 1, top);

    if (!this.midFade) {
      this.midFade = ctx.createLinearGradient(0, 0, 0, 40);
      this.midFade.addColorStop(0, 'rgba(0,0,0,1)');
      this.midFade.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = this.midFade;
    ctx.fillRect(0, 0, W, 40);
    ctx.globalCompositeOperation = 'source-over';
  }

  drawFarCanvas() {
    const ctx = this.cFarCtx, W = this.W, H = this.H, top = this.top;
    const na = this.naFar, i0 = this.nNear + this.nMid;
    if (!na && !this.bSplashCount) {
      if (this.farDrawn) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.cFar.width, this.cFar.height);
        this.farDrawn = false;
      }
      return;
    }
    this.farDrawn = true;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    this.drawDrops(ctx, i0, i0 + na, 0.5, this.rainColFar, top);
    this.drawBuildingSplashes(ctx, 0, top);

    if (!this.farFade) {
      this.farFade = ctx.createLinearGradient(0, 0, 0, 40);
      this.farFade.addColorStop(0, 'rgba(0,0,0,1)');
      this.farFade.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = this.farFade;
    ctx.fillRect(0, 0, W, 40);
    ctx.globalCompositeOperation = 'source-over';
  }

  drawRoofCanvas() {
    const ctx = this.cRoofCtx, W = this.W, H = this.H, top = this.top, G = this.G;
    const nS = this.rSplashCount;
    if (!nS) {
      if (this.roofDrawn) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.cRoof.width, this.cRoof.height);
        this.roofDrawn = false;
      }
      return;
    }
    this.roofDrawn = true;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const rS = this.rSplashes;
    ctx.strokeStyle = this.gCol;
    ctx.fillStyle = this.gCol;
    ctx.lineWidth = 1.2;
    for (let b = 0; b < 3; b++) {
      ctx.globalAlpha = this.bucketA[b];
      ctx.beginPath();
      for (let k = 0; k < nS; k++) {
        const sp = rS[k];
        if (sp.b !== b) continue;
        const wx = sp.veh.x + sp.lx;
        const wy = G + sp.veh.dy + sp.ly;
        const rx = Math.min(sp.rxMax, lerp(1.5, 6, sp.age / 0.3));
        ctx.moveTo(wx + rx, wy - top); // new subpath: no connecting line between ripples
        ctx.ellipse(wx, wy - top, rx, rx * 0.3, 0, 0, 2 * Math.PI);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < nS; k++) {
        const sp = rS[k];
        if (sp.b !== b) continue;
        const wx = sp.veh.x + sp.lx;
        const wy = G + sp.veh.dy + sp.ly;
        for (let m = 0; m < sp.n; m++) {
          const q = sp.dr[m];
          if (q.gone || this.occludedAt(sp.veh, wx + q.x, wy + q.y) || this.occludedAt(sp.veh, wx + q.x + 1.8, wy + q.y)) continue;
          ctx.rect(wx + q.x, wy + q.y - top, 1.8, 1.8);
        }
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (!this.roofFade) {
      this.roofFade = ctx.createLinearGradient(0, 0, 0, 140);
      this.roofFade.addColorStop(0, 'rgba(0,0,0,1)');
      this.roofFade.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = this.roofFade;
    ctx.fillRect(0, 0, W, 140);
    ctx.globalCompositeOperation = 'source-over';
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
      for (let n = 1; n < group.length; n++) {
        if (group[n - 1].v.lc || group[n].v.lc) continue;
        minGap = Math.min(minGap, group[n - 1].rear - group[n].front);
      }
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
    const W = this.W;
    // distance from the right edge back to each lane's front-most vehicle still on stage
    const laneHeads = [];
    for (let L = 0; L < this.lanes; L++) {
      let head = null;
      act.forEach(v => {
        if (v.drift || v.lane !== L) return;
        const front = v.x + v.bx0 + v.len;
        if (front <= W && (head === null || front > head)) head = front;
      });
      laneHeads.push(head === null ? null : W - head);
    }
    return {
      viewTime: this.viewTime, simTime: this.simTime, running: this.running, C: this.C, trafficPhase: this.tPhase,
      jamType: this.jamType,
      bd: this.bd ? {
        phase: this.bd.phase,
        i: this.bd.veh ? this.bd.veh.i : null,
        x: this.bd.veh ? this.bd.veh.x : null,
        front: this.bd.veh ? this.bd.veh.x + this.bd.veh.bx0 + this.bd.veh.len : null,
        rear: this.bd.veh ? this.bd.veh.x + this.bd.veh.bx0 : null,
        lane: this.bd.veh ? this.bd.veh.lane : null,
        v: this.bd.veh ? this.bd.veh.v : null,
        hazardsOn: !!this.bd.hazardsOn,
        hazardVisible: !!this.bd.hazardVisible,
        stopFront: this.bd.stopFront,
      } : null,
      target: this.target, VN: this.VN, active: act.length, total: this.vehicles.length, lanes: this.lanes,
      weather: this.wx.phase, weatherP: this.wx.p, dim: this.wx.dim, rain: this.wx.rain,
      bSplashes: this.bSplashCount,
      splashes: this.splashTot ? {
        road: this.splashTot[SP_ROAD], vehicle: this.splashTot[SP_VEH], nearRoof: this.splashTot[SP_NEAR],
        farBRoof: this.splashTot[SP_FARB], farARoof: this.splashTot[SP_FARA],
      } : { road: 0, vehicle: 0, nearRoof: 0, farBRoof: 0, farARoof: 0 },
      lightningLeft: s && this.wx.phase !== 'clear' ? s.events.filter(e => e.t > this.viewTime).length : 0,
      minGap, minGapDrift, crossLaneOverlaps,
      stopLines: this.stopLines ? this.stopLines.slice() : null, laneHeads,
      lightL: this.night ? 1 : (act.length ? act.reduce((m, v) => m + (v.L || 0), 0) / act.length : 0),
      laneChanges: act.filter(v => v.lc).length, overtakes: this.overtakes,
      vehicles: act.map(v => ({ i: v.i, x: v.x, front: v.x + v.bx0 + v.len, rear: v.x + v.bx0, v: v.v, v0: v.v0, len: v.len, lane: v.lane, dy: v.dy, drifting: !!v.drift, lc: !!v.lc, crawl: !!v.crawling }))
        .sort((a, b) => b.front - a.front),
    };
  }
}
