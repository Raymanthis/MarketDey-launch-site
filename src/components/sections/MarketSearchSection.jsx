'use client';
/* eslint-disable */
import React from 'react';
import content from '@/content/market-search.json';
import './MarketSearchSection.global.css';

const GOODS = [[content.goods[0], 'ri-shopping-basket-2-line', 0.6], [content.goods[1], 'ri-seedling-line', 0.45], [content.goods[2], 'ri-paw-line', 0.25], [content.goods[3], 'ri-anchor-line', 0.3], [content.goods[4], 'ri-t-shirt-2-line', 0.28], [content.goods[5], 'ri-smartphone-line', 0.16], [content.goods[6], 'ri-hammer-line', 0.2], [content.goods[7], 'ri-leaf-line', 0.45], [content.goods[8], 'ri-drop-line', 0.3], [content.goods[9], 'ri-fire-line', 0.3]];
const SEQ = content.sequence;
const STEPS = [2, 5, 10, 20, 50];
const TOWNS = content.towns;
const SUF = content.marketSuffixes;
const DOWU = content.weekdays;
const TODAY = Date.UTC(2026, 9, 11);
const KR = [[0, 2], [0.1, 2], [0.16, 5], [0.22, 5], [0.28, 10], [0.34, 10], [0.4, 20], [0.46, 20], [0.52, 50], [0.58, 50], [0.64, 20], [1, 20]];
const G0 = 0.66, GS = 0.064;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function radiusAt(p) { for (let i = 1; i < KR.length; i++) if (p <= KR[i][0]) { const [a, ra] = KR[i - 1], [b, rb] = KR[i]; const t = sstep(a, b, p); return Math.exp(Math.log(ra) + (Math.log(rb) - Math.log(ra)) * t); } return 20; }
function goodAt(p) { return p < G0 ? null : SEQ[clamp(Math.floor((p - G0) / GS), 0, SEQ.length - 1)]; }
function buildData() {
  const r = rng(23), towns = TOWNS.map((n, i) => { const d = i === 0 ? 0.9 : i < 3 ? 1.6 + i * 1.1 : i < 6 ? 4 + (i - 3) * 2 : 8 + Math.pow(r(), 1.15) * 52, a = r() * Math.PI * 2; return { n, x: Math.cos(a) * d, z: Math.sin(a) * d, big: r() }; });
  const mk = [];
  towns.forEach((t, ti) => { const n = ti < 3 ? 2 : 1 + Math.floor(r() * 2.4); const used = new Set();
    for (let k = 0; k < n; k++) { let s; do { s = SUF[Math.floor(r() * SUF.length)]; } while (used.has(s)); used.add(s);
      const off = 0.2 + r() * (ti < 3 ? 0.6 : 1.6), a = r() * Math.PI * 2, x = t.x + Math.cos(a) * off, z = t.z + Math.sin(a) * off;
      let g = GOODS.filter(q => r() < q[2]).map(q => q[0]); while (g.length < 2) { const q = GOODS[Math.floor(r() * GOODS.length)][0]; if (!g.includes(q)) g.push(q); }
      const off2 = Math.floor(r() * 8), dt = new Date(TODAY + off2 * 864e5);
      mk.push({ name: t.n + ' ' + s, town: t.n, x, z, d: Math.hypot(x, z), goods: g, off: off2, dow: DOWU[dt.getUTCDay()], dnum: String(dt.getUTCDate()), hv: 0.6 + r() * 0.4 }); } });
  mk.sort((a, b) => a.d - b.d); return { towns, mk };
}
const DATA = buildData();
class MarketSearchSection extends React.Component {
  state = { rd: 2, good: null, ph: 0, sp: [0, 0], narrow: false };
  rootRef = React.createRef(); chipRef = React.createRef(); glRef = React.createRef(); ringLabRef = React.createRef(); uiRef = React.createRef(); dayRef = React.createRef(); dotRef = React.createRef(); labRefs = [0, 1, 2, 3].map(() => React.createRef());
  p = 0; cur = 0; vis = false; top = [];
  componentDidMount() {
    this.onScroll = () => this.measure(); this.onResize = () => { this.measure(); if (this.three) this.three.resize(); };
    window.addEventListener('scroll', this.onScroll, { passive: true }); window.addEventListener('resize', this.onResize);
    this.measure(); this.init3D(); const loop = t => { if (this.dead) return; this.raf = requestAnimationFrame(loop); this.tick(t); }; this.raf = requestAnimationFrame(loop);
  }
  componentWillUnmount() { this.dead = true; cancelAnimationFrame(this.raf); window.removeEventListener('scroll', this.onScroll); window.removeEventListener('resize', this.onResize); if (this.three) this.three.dispose(); }
  measure() {
    const el = this.rootRef.current; if (!el) return; const vh = window.innerHeight, r = el.getBoundingClientRect();
    this.p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1); this.vis = r.top < vh && r.bottom > 0;
    const p = clamp(this.p / 0.8, 0, 1), rad = radiusAt(p), good = goodAt(p), rd = rad < 3 ? Math.round(rad * 2) / 2 : Math.round(rad), narrow = window.innerWidth < 900;
    const sp = [clamp(p / 0.58, 0, 1), clamp((p - 0.6) / (G0 + GS * SEQ.length - 0.6), 0, 1)].map(v => Math.round(v * 40) / 40), ph = p < 0.6 ? 0 : 1;
    this.rad = rad; this.good = good;
    const short = vh < 760, s = this.state; if (s.rd !== rd || s.good !== good || s.ph !== ph || s.sp[0] !== sp[0] || s.sp[1] !== sp[1] || s.narrow !== narrow || s.short !== short) this.setState({ rd, good, ph, sp, narrow, short });
  }
  componentDidUpdate() { const el = this.chipRef.current; if (!el) return; const i = GOODS.findIndex(g => g[0] === this.state.good), c = el.children[i]; el.scrollLeft = c ? Math.max(0, c.offsetLeft - el.offsetLeft - 16) : 0; }
  matches(rd, good) { return DATA.mk.filter(m => m.d <= rd && (!good || m.goods.includes(good))); }
  tick(t) { if (!this.vis || !this.three) return; this.cur += (this.p - this.cur) * 0.14; this.three.render(t / 1000, this.rad || 2, this.good, Math.min(1, this.cur / 0.8), sstep(0.8, 0.9, this.cur), sstep(0.906, 1, this.cur)); }
  async init3D() {
    const host = this.glRef.current; if (!host) return; let THREE;
    try { THREE = await import('three'); } catch (e) { return; }
    if (this.dead || !this.glRef.current) return;
    const small = window.innerWidth < 760; let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: !small }); } catch (e) { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.75)); renderer.setSize(host.clientWidth, host.clientHeight); renderer.domElement.style.cssText = 'display:block;width:100%;height:100%'; host.appendChild(renderer.domElement);
    const BG = new THREE.Color('#161513'), scene = new THREE.Scene(); scene.background = BG; scene.fog = new THREE.Fog(BG, 20, 80);
    const camera = new THREE.PerspectiveCamera(40, host.clientWidth / host.clientHeight, 0.05, 2000);
    const WHITE = new THREE.Color('#ffffff'), CREAM = new THREE.Color('#ebe8e1'), r = rng(7), LIME = new THREE.Color('#a7c957'), DIM = new THREE.Color('#4a5340'), WARM = new THREE.Color('#e9dcb8');
    const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshBasicMaterial({ color: '#1b1a18' })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; scene.add(ground);
    const flat = (geo, color, y) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = y; scene.add(m); return m; };
    for (let i = 0; i < 14; i++) { const cx = (r() - 0.5) * 140, cz = (r() - 0.5) * 140, rr = 6 + r() * 16, n = 9, sh = new THREE.Shape(); for (let j = 0; j < n; j++) { const a = j / n * 6.283, d = rr * (0.6 + r() * 0.5), x = cx + Math.cos(a) * d, y = -(cz + Math.sin(a) * d); j ? sh.lineTo(x, y) : sh.moveTo(x, y); } flat(new THREE.ShapeGeometry(sh), i % 3 ? '#1c201a' : '#201f1c', 0.001 + i * 0.0001); }
    const ribbon = (pts2, hw, color, y) => { const pos = []; for (let i = 0; i < pts2.length - 1; i++) { const a = pts2[i], b = pts2[i + 1], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * hw, nz = dx / l * hw; pos.push(a.x + nx, y, a.z + nz, a.x - nx, y, a.z - nz, b.x + nx, y, b.z + nz, a.x - nx, y, a.z - nz, b.x - nx, y, b.z - nz, b.x + nx, y, b.z + nz); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, depthWrite: false, side: THREE.DoubleSide })); scene.add(m); return m; };
    const grid = []; DATA.towns.forEach(t => { const s = 0.5 + t.big * 1.4, rot = r() * 1.5, step = 0.22, c = Math.cos(rot), sn = Math.sin(rot); for (let u = -s; u <= s; u += step) { const half = Math.sqrt(Math.max(0, s * s - u * u)); [[u, -half, u, half], [-half, u, half, u]].forEach(([a1, b1, a2, b2]) => grid.push(t.x + a1 * c - b1 * sn, 0.006, t.z + a1 * sn + b1 * c, t.x + a2 * c - b2 * sn, 0.006, t.z + a2 * sn + b2 * c)); } });
    { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3)); scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#34312c', transparent: true, opacity: 0.9 }))); }
    const labTex = s => { const c = document.createElement('canvas'), x = c.getContext('2d'); x.font = '700 80px Lato, sans-serif'; const w = Math.ceil(x.measureText(s).width) + 32; c.width = w; c.height = 108; x.font = '700 80px Lato, sans-serif'; x.fillStyle = '#9a958b'; x.textBaseline = 'middle'; x.fillText(s, 16, 56); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return [t, w / 108]; };
    const tLabs = DATA.towns.map(t => { const [tex, ar] = labTex(t.n), sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 })); sp.center.set(0.5, -0.4); sp.position.set(t.x, 0.02, t.z); scene.add(sp); return { t, sp, ar, d: Math.hypot(t.x, t.z) }; });
    const pts = [], nP = small ? 0.5 : 1; DATA.towns.forEach(t => { const n = Math.round((40 + t.big * 160) * nP), s = 0.4 + t.big * 1.2; for (let i = 0; i < n; i++) { const a = r() * 6.283, d = Math.pow(r(), 1.8) * s * 2.2; pts.push(t.x + Math.cos(a) * d, 0.01, t.z + Math.sin(a) * d); } });
    for (let i = 0; i < 2600 * nP; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * 90; pts.push(Math.cos(a) * d, 0.01, Math.sin(a) * d); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const pMat = new THREE.PointsMaterial({ color: WARM, size: 1.6 * renderer.getPixelRatio(), sizeAttenuation: false, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }); scene.add(new THREE.Points(pg, pMat));
    const roadMat = new THREE.LineBasicMaterial({ color: '#4a463e', transparent: true, opacity: 0.85 }), riverMat = new THREE.LineBasicMaterial({ color: '#2f4a46', transparent: true, opacity: 0.9 });
    const byAng = DATA.towns.slice(1).sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
    for (let k = 0; k < 7; k++) { const a0 = k / 7 * 6.283 + r() * 0.5, ctl = [new THREE.Vector3(0, 0.02, 0)]; let px = 0, pz = 0;
      for (let s = 1; s <= 6; s++) { const d = s * 14, a = a0 + Math.sin(s * 1.3 + k) * 0.25; let x = Math.cos(a) * d, z = Math.sin(a) * d; const near = byAng.find(t => Math.hypot(t.x - x, t.z - z) < 7); if (near) { x = near.x; z = near.z; } ctl.push(new THREE.Vector3(x, 0.02, z)); px = x; pz = z; }
      const c = new THREE.CatmullRomCurve3(ctl), cp = c.getPoints(220); ribbon(cp, k < 3 ? 0.16 : 0.09, k < 3 ? '#3d3933' : '#302d29', 0.008); if (k < 3) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cp.map(v => new THREE.Vector3(v.x, 0.01, v.z))), new THREE.LineBasicMaterial({ color: '#5a5448', transparent: true, opacity: 0.6 }))); }
    { const ctl = []; for (let i = -6; i <= 6; i++) ctl.push(new THREE.Vector3(22 + Math.sin(i * 0.7) * 6, 0.015, i * 15)); const rp = new THREE.CatmullRomCurve3(ctl).getPoints(260); ribbon(rp, 0.7, '#1a2a2b', 0.004); scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rp.map(v => new THREE.Vector3(v.x, 0.005, v.z))), riverMat));
      const tc = []; for (let i = 0; i <= 6; i++) tc.push(new THREE.Vector3(22 + Math.sin(i * 0.7) * 6 - i * 6, 0.004, -8 - i * 7 + Math.sin(i) * 3)); ribbon(new THREE.CatmullRomCurve3(tc).getPoints(120), 0.28, '#1a2a2b', 0.0042); }
    const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    const colG = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true); colG.translate(0, 0.5, 0);
    const cols = DATA.mk.map(m => { const mat = new THREE.MeshBasicMaterial({ color: DIM.clone(), transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const col = new THREE.Mesh(colG, mat); col.position.set(m.x, 0, m.z); scene.add(col);
      const base = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: LIME.clone(), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending })); base.position.set(m.x, 0.02, m.z); scene.add(base);
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color('#f4ffd8'), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(head);
      return { m, col, mat, base, head, v: 0 }; });
    const circ = []; for (let i = 0; i <= 160; i++) { const a = i / 160 * 6.283; circ.push(new THREE.Vector3(Math.cos(a), 0.03, Math.sin(a))); }
    const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circ), new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.95 })); scene.add(ring);
    const pulse = new THREE.Line(ring.geometry, new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.5 })); scene.add(pulse);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0.06, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.012; scene.add(disc);
    const me = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); me.renderOrder = 998; scene.add(me);
    const meCore = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, fog: false })); meCore.renderOrder = 999; scene.add(meCore);
    let viewR = 2.6; const v3 = new THREE.Vector3(), drag = { on: false, az: 0, el: 0, v: 0, x: 0, y: 0 };
    const pd = e => { drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.v = 0; host.style.cursor = 'grabbing'; try { host.setPointerCapture(e.pointerId); } catch (_) {} };
    const pm = e => { if (!drag.on) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.v = -dx * 0.006; drag.az += drag.v; if (e.pointerType === 'mouse') drag.el += dy * 0.004; };
    const pu = () => { drag.on = false; host.style.cursor = 'grab'; };
    host.addEventListener('pointerdown', pd); host.addEventListener('pointermove', pm); host.addEventListener('pointerup', pu); host.addEventListener('pointercancel', pu);
    const proj = (x, y, z) => { v3.set(x, y, z).project(camera); return [(v3.x * 0.5 + 0.5) * host.clientWidth, (-v3.y * 0.5 + 0.5) * host.clientHeight, v3.z]; };
    const resize = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; if (w >= 900) camera.setViewOffset(w, h, -w * 0.17, h * 0.02, w, h); else camera.setViewOffset(w, h, 0, -h * 0.04, w, h); camera.updateProjectionMatrix(); };
    resize();
    const render = (t, rad, good, p, dive, grow) => {
      viewR += (Math.max(rad, 1.8) * 1.3 - viewR) * 0.08;
      if (!drag.on) { drag.az += drag.v; drag.v *= 0.94; } drag.el *= drag.on ? 1 : 0.97; const az = 0.5 + p * 1.4 + t * 0.03 + drag.az, el = clamp(0.9 - p * 0.15 + drag.el, 0.25, 1.35) * (1 - dive * 0.5) + 1.3 * dive * 0.5, dist = viewR * (host.clientWidth < 900 ? 3.1 : 2.4);
      renderer.domElement.style.opacity = (1 - sstep(0.35, 0.95, dive)).toFixed(3); const kR = viewR / 30 * 0.35, de = dive * dive * (3 - 2 * dive), dd = dist + (kR * 5 - dist) * (1 - Math.pow(1 - de, 3)), cy = kR * de;
      camera.position.set(Math.sin(az) * Math.cos(el) * dd, cy + Math.sin(el) * dd, Math.cos(az) * Math.cos(el) * dd); camera.lookAt(0, cy, 0); const nr = Math.min(0.05, dd * 0.02); if (Math.abs(camera.near - nr) > 1e-5) { camera.near = nr; camera.updateProjectionMatrix(); }
      meCore.visible = me.visible = dive < 0.05; [ring, pulse].forEach(o => { o.visible = dive < 0.6; }); disc.visible = dive < 0.6;
      scene.fog.near = dist * 0.8; scene.fog.far = dist * 2.6;
      ring.scale.set(rad, 1, rad); disc.scale.set(rad, rad, 1); const f = (t * 0.45) % 1; pulse.scale.set(rad * f, 1, rad * f); pulse.material.opacity = 0.55 * (1 - f);
      const k = viewR / 30; meCore.scale.setScalar(k * 0.35 * (1 + Math.pow(grow, 2.2) * 60)); meCore.position.y = k * 0.35; me.scale.setScalar(k * (3 + Math.sin(t * 3) * 0.6)); me.position.y = k * 0.3;
      const w = k * 0.04;
      cols.forEach(c => { const inR = c.m.d <= rad, ok = !good || c.m.goods.includes(good), tg = inR && ok ? 1 : inR ? 0.14 : 0.04; c.v += (tg - c.v) * 0.09;
        const h = k * 9 * c.m.hv * (0.08 + 0.92 * c.v); c.col.scale.set(w, h, w); c.mat.opacity = 0.12 + 0.6 * c.v; c.mat.color.copy(DIM).lerp(LIME, c.v);
        c.base.scale.setScalar(k * (0.35 + 1.3 * c.v)); c.base.material.opacity = 0.15 + 0.7 * c.v; c.head.position.set(c.m.x, h, c.m.z); c.head.scale.setScalar(k * (0.22 + 0.6 * c.v)); c.head.material.opacity = 0.1 + 0.9 * c.v; });
      tLabs.forEach(L => { const s = k * 0.9; L.sp.scale.set(s * L.ar, s, 1); const tgt = L.d < viewR * 1.5 ? 0.85 : 0; L.sp.material.opacity += (tgt - L.sp.material.opacity) * 0.08; });
      renderer.render(scene, camera);
      const out = { labs: this.top.slice(0, 4).map(m => { const c = cols.find(q => q.m === m); return proj(m.x, k * 9 * m.hv * (0.08 + 0.92 * (c ? c.v : 1)), m.z); }) };
      out.ring = proj(Math.sin(az) * rad, 0.03, Math.cos(az) * rad); out.me = proj(0, 0, 0); out.dive = dive; out.grow = grow; return out; };
    this.three = { resize, render: (t, rad, good, p, dive, grow) => { const o = render(t, rad, good, p, dive, grow); this.place(o); }, dispose: () => { renderer.dispose(); renderer.domElement.remove(); } };
  }
  place(o) {
    const dv = o.dive || 0, ui = this.uiRef.current, day = this.dayRef.current, hide = sstep(0, 0.35, dv);
    if (ui) ui.style.opacity = (1 - hide).toFixed(3);
    const dot = this.dotRef.current, gw = o.grow || 0;
    if (dot && o.me) { const vis = dv > 0.04; dot.style.visibility = vis ? 'visible' : 'hidden';
      let tx = o.me[0], ty = o.me[1], ts = 1;
      if (!this.tpin || !this.tpin.isConnected) { const ic = document.querySelector('[data-screen-label="06 Find a market"] .ri-map-pin-2-fill'); this.tpin = ic ? ic.parentElement : null; }
      const sec = this.tpin && this.tpin.closest('section'), stg = sec && sec.firstElementChild, host = this.glRef.current;
      if (this.tpin && stg && host) { const pr = this.tpin.getBoundingClientRect(), sr = stg.getBoundingClientRect(), hr = host.getBoundingClientRect(); const cx = pr.left + pr.width / 2 - sr.left, cy = pr.top + pr.height / 2 - sr.top; if (cx > 0 && cy > 0) { tx = cx - hr.left; ty = cy; ts = Math.max(0.6, (pr.width > 4 ? pr.width : (this.tpin.offsetWidth || 48)) / 48); } }
      const mv = sstep(0.45, 0.95, dv), px = o.me[0] + (tx - o.me[0]) * mv, py = o.me[1] + (ty - o.me[1]) * mv;
      dot.style.transform = 'translate(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px)';
      const full = Math.hypot(window.innerWidth, window.innerHeight) * 1.6, e = gw * gw * (3 - 2 * gw), rr = 24 + (full - 24) * Math.pow(e, 1.4), c = dot.querySelector('[data-c]');
      if (c) { const sc = (1 + 0.5 * sstep(0, 0.45, dv)) * (1 - mv) + ts * mv; c.style.transform = 'scale(' + sc.toFixed(3) + ')'; c.style.opacity = (sstep(0.04, 0.3, dv) * (1 - sstep(0.75, 1, gw))).toFixed(3); }
      window.__mdReveal = gw > 0.001 ? { x: px, y: py, r: rr, d: dv } : (dv > 0.04 ? { x: px, y: py, r: 0, d: dv } : null); }
    if (day) { const a = 0; day.style.clipPath = 'none'; day.style.opacity = a.toFixed(3); day.style.visibility = a > 0.002 ? 'visible' : 'hidden'; }
    if (hide > 0.5) { this.labRefs.forEach(rf => { if (rf.current) rf.current.style.opacity = '0'; }); if (this.ringLabRef.current) this.ringLabRef.current.style.opacity = '0'; return; }
    this.labRefs.forEach((rf, i) => { const el = rf.current; if (!el) return; const q = o.labs[i]; if (!q || q[2] > 1) { el.style.opacity = '0'; return; } el.style.opacity = '1'; el.style.transform = 'translate(' + q[0].toFixed(1) + 'px,' + q[1].toFixed(1) + 'px) translate(-50%,-140%)'; });
    const rl = this.ringLabRef.current; if (rl && o.ring) { rl.style.opacity = '1'; rl.style.transform = 'translate(' + o.ring[0].toFixed(1) + 'px,' + o.ring[1].toFixed(1) + 'px) translate(-50%,-50%)'; }
  }
  renderVals() {
    const s = this.state, rd = s.rd, good = s.good, list = this.matches(rd, good), nR = s.narrow || s.short ? 2 : 4;
    this.top = list.slice(0, 4);
    const lp = v => Math.log(v / 2) / Math.log(25);
    const rk = STEPS.find(k => Math.abs(k - rd) < 0.01);
    const when = o => o === 0 ? content.results.today : o === 1 ? content.results.tomorrow : content.results.inDaysPrefix + o + content.results.inDaysSuffix;
    return {
      rootRef: this.rootRef, uiRef: this.uiRef, dayRef: this.dayRef, dotRef: this.dotRef, chipRef: this.chipRef, glRef: this.glRef, ringLabRef: this.ringLabRef,
      rdLabel: rd + ' ' + content.unit, slPct: (clamp(lp(rd), 0, 1) * 100).toFixed(1) + '%',
      steps: [{ label: content.steps.distance, pct: (s.sp[0] * 100) + '%', fg: s.ph === 0 ? '#fff' : '#ccc5b9' }, { label: content.steps.goods, pct: (s.sp[1] * 100) + '%', fg: s.ph === 1 ? '#fff' : '#8a857b' }],
      pills: STEPS.map(k => ({ label: k + ' ' + content.unit, bg: k === rk ? '#a7c957' : 'rgba(255,255,255,.07)', fg: k === rk ? '#252422' : '#fff' })),
      chips: GOODS.map(([g, icon]) => { const on = g === good; return { label: g, icon, bg: on ? '#a7c957' : 'transparent', fg: on ? '#252422' : '#ccc5b9', bd: on ? '#a7c957' : 'rgba(255,255,255,.14)' }; }),
      count: String(list.length), countLabel: (list.length === 1 ? content.results.market : content.results.markets) + (good ? content.results.selling + good.toLowerCase() : '') + content.results.within + rd + ' ' + content.unit,
      rows: list.slice(0, nR).map((m, i) => ({ n: String(i + 1), name: m.name, sub: m.town + ' · ' + m.d.toFixed(1) + ' km', dow: m.dow, dnum: m.dnum, when: when(m.off) })),
      labs: this.labRefs.map((ref, i) => ({ ref, n: String(i + 1), name: list[i] ? list[i].name : '' })),
      empty: list.length === 0, showP: !s.short && !s.narrow, chipWrap: s.narrow || s.short ? 'nowrap' : 'wrap'
    };
  }
  render() {
    const v = { ...this.props, ...this.renderVals() };
    return (
      <div className="sc-host" data-sc-name="Market Search Section">
        <div ref={v.rootRef} data-screen-label="05 Explore" style={{ position: 'relative', height: '720vh', background: '#161513', fontFamily: "'Lato',ui-sans-serif,system-ui,sans-serif", color: '#fff' }}>
          <div style={{ position: 'sticky', top: '0', height: '100vh', overflow: 'hidden' }}>
            <div ref={v.glRef} style={{ position: 'absolute', inset: '0', cursor: 'grab', touchAction: 'pan-y' }}></div>
            <div style={{ position: 'absolute', inset: '0', pointerEvents: 'none', background: 'radial-gradient(120% 90% at 65% 55%,rgba(22,21,19,0) 40%,rgba(22,21,19,.85) 100%)' }}></div>
            {v.labs.map((l, i) => <React.Fragment key={i}>
              <div ref={l.ref} style={{ position: 'absolute', left: '0', top: '0', opacity: '0', pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', willChange: 'transform' }}>
                <span style={{ height: '24px', padding: '0 9px', borderRadius: '12px', background: 'rgba(37,36,34,.92)', border: '1px solid rgba(167,201,87,.45)', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '900', whiteSpace: 'nowrap' }}><span style={{ color: '#a7c957' }}><span className="sc-interp">{l.n}</span></span><span className="sc-interp">{l.name}</span></span>
              </div>
            </React.Fragment>)}
            <div ref={v.ringLabRef} style={{ position: 'absolute', left: '0', top: '0', opacity: '0', pointerEvents: 'none', height: '26px', padding: '0 10px', borderRadius: '13px', background: '#a7c957', color: '#252422', display: 'inline-flex', alignItems: 'center', fontSize: '13px', fontWeight: '900', whiteSpace: 'nowrap', willChange: 'transform' }}><span className="sc-interp">{v.rdLabel}</span></div>
            <div ref={v.uiRef} style={{ position: 'relative', zIndex: '2', height: '100%', boxSizing: 'border-box', maxWidth: '1264px', margin: '0 auto', padding: 'clamp(48px,11vh,120px) 32px 32px', pointerEvents: 'none' }}>
              <div style={{ width: 'min(100%,440px)', display: 'flex', flexDirection: 'column', gap: 'clamp(14px,2.4vh,22px)' }}>
                <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: '8px', height: '32px', padding: '0 14px 0 10px', borderRadius: '16px', background: 'rgba(167,201,87,.14)', color: '#a7c957', fontSize: '14px', fontWeight: '900' }}><i className="ri-search-line" style={{ fontSize: '16px' }}></i>{content.badge}</div>
                <h2 style={{ margin: '0', fontSize: 'clamp(34px,4.4vw,56px)', fontWeight: '900', letterSpacing: '-.04em', lineHeight: '1', textWrap: 'balance' }}>{content.headline}</h2>
                {v.showP ? <><p style={{ margin: '0', fontSize: 'clamp(15px,1.3vw,18px)', lineHeight: '1.5', color: '#ccc5b9', textWrap: 'pretty' }}>{content.intro}</p></> : null}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {v.steps.map((s, i) => <React.Fragment key={i}>
                    <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${s.pct}`, background: '#a7c957' }}></div></div>
                      <div style={{ fontSize: '13px', fontWeight: '900', color: `${s.fg}`, transition: 'color .3s' }}><span className="sc-interp">{s.label}</span></div>
                    </div>
                  </React.Fragment>)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', borderRadius: '20px', background: 'rgba(37,36,34,.78)', border: '1px solid rgba(255,255,255,.08)', backdropFilter: 'blur(10px)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}><div style={{ fontSize: '13px', fontWeight: '900', color: '#ccc5b9', letterSpacing: '.04em' }}>{content.panel.distanceHeading}</div><div style={{ fontSize: '15px', fontWeight: '900', color: '#a7c957' }}>{`${content.panel.within} `}<span className="sc-interp">{v.rdLabel}</span></div></div>
                  <div style={{ position: 'relative', height: '20px' }}>
                    <div style={{ position: 'absolute', left: '0', right: '0', top: '8px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,.12)' }}></div>
                    <div style={{ position: 'absolute', left: '0', top: '8px', height: '4px', borderRadius: '2px', background: '#a7c957', width: `${v.slPct}` }}></div>
                    <div style={{ position: 'absolute', top: '1px', left: `${v.slPct}`, width: '18px', height: '18px', marginLeft: '-9px', borderRadius: '9px', background: '#fff', boxShadow: '0 0 0 4px rgba(167,201,87,.35)' }}></div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {v.pills.map((p, i) => <React.Fragment key={i}>
                      <span style={{ height: '30px', padding: '0 12px', borderRadius: '15px', background: `${p.bg}`, color: `${p.fg}`, display: 'inline-flex', alignItems: 'center', fontSize: '13px', fontWeight: '900', transition: 'background .3s,color .3s' }}><span className="sc-interp">{p.label}</span></span>
                    </React.Fragment>)}
                  </div>
                  <div style={{ height: '1px', background: 'rgba(255,255,255,.08)' }}></div>
                  <div style={{ fontSize: '13px', fontWeight: '900', color: '#ccc5b9', letterSpacing: '.04em' }}>{content.panel.goodsHeading}</div>
                  <div ref={v.chipRef} style={{ display: 'flex', gap: '6px', flexWrap: `${v.chipWrap}`, scrollBehavior: 'smooth', overflowX: 'auto', scrollbarWidth: 'none' }}>
                    {v.chips.map((c, i) => <React.Fragment key={i}>
                      <span style={{ flex: 'none', height: '30px', padding: '0 12px 0 10px', borderRadius: '15px', background: `${c.bg}`, color: `${c.fg}`, border: `1px solid ${c.bd}`, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700', transition: 'background .3s,color .3s,border-color .3s' }}><i className={c.icon} style={{ fontSize: '14px' }}></i><span className="sc-interp">{c.label}</span></span>
                    </React.Fragment>)}
                  </div>
                </div>
              </div>
              <div style={{ position: 'absolute', right: '32px', bottom: '32px', flex: 'none', width: 'min(calc(100% - 64px),380px)', borderRadius: '22px', background: 'rgba(37,36,34,.92)', border: '1px solid rgba(255,255,255,.08)', backdropFilter: 'blur(10px)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', padding: '16px 18px 12px' }}>
                  <div style={{ fontSize: '40px', fontWeight: '900', letterSpacing: '-.04em', lineHeight: '1', color: '#a7c957' }}><span className="sc-interp">{v.count}</span></div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: '#ccc5b9', lineHeight: '1.3' }}><span className="sc-interp">{v.countLabel}</span></div>
                </div>
                {v.rows.map((r, i) => <React.Fragment key={i}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '64px', padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,.07)' }}>
                    <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '46px', height: '50px', borderRadius: '12px', background: 'rgba(167,201,87,.14)' }}><div style={{ fontSize: '10px', fontWeight: '900', letterSpacing: '.06em', color: '#a7c957' }}><span className="sc-interp">{r.dow}</span></div><div style={{ fontSize: '20px', fontWeight: '900', lineHeight: '1.1' }}><span className="sc-interp">{r.dnum}</span></div></div>
                    <div style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}><div style={{ fontSize: '16px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{ color: '#a7c957', marginRight: '6px' }}><span className="sc-interp">{r.n}</span></span><span className="sc-interp">{r.name}</span></div><div style={{ fontSize: '13px', color: '#ccc5b9' }}><span className="sc-interp">{r.sub}</span></div></div>
                    <span style={{ flex: 'none', height: '26px', padding: '0 10px', borderRadius: '13px', background: 'rgba(255,255,255,.08)', color: '#fff', display: 'inline-flex', alignItems: 'center', fontSize: '12px', fontWeight: '900' }}><span className="sc-interp">{r.when}</span></span>
                  </div>
                </React.Fragment>)}
                {v.empty ? <><div style={{ padding: '14px 18px 18px', fontSize: '14px', color: '#ccc5b9', borderTop: '1px solid rgba(255,255,255,.07)' }}>{content.results.empty}</div></> : null}
              </div>
            </div>
            <div ref={v.dotRef} style={{ position: 'absolute', left: '0', top: '0', width: '0', height: '0', zIndex: '6', pointerEvents: 'none', visibility: 'hidden' }}><span data-c="1" style={{ position: 'absolute', left: '0', top: '0', display: 'flex', width: '48px', height: '48px', margin: '-24px 0 0 -24px', borderRadius: '24px', background: '#4f772d', border: '3px solid #fff', boxSizing: 'border-box', boxShadow: '0 8px 18px rgba(0,0,0,.45)', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: '22px', willChange: 'transform,opacity' }}><i className="ri-map-pin-2-fill"></i></span></div>
            <div ref={v.dayRef} style={{ position: 'absolute', inset: '0', zIndex: '5', pointerEvents: 'none', background: '#ebe8e1', clipPath: 'circle(0px at 50% 50%)', visibility: 'hidden' }}></div>
          </div>
        </div>
      </div>
    );
  }
}

export default MarketSearchSection;
