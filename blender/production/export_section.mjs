// Export the Landmarks Journey street and its camera path for the Blender production render.
//
//     node blender/production/export_section.mjs [--count 400] [--tilt 56]
//
// Read-only use of src/: it loads src/lib/lmMapBuild.js (the section's geometry, same seed and
// code as LandmarksJourneySection.jsx; they are verified identical, see README) and evaluates an
// *instrumented copy* in memory. Recorder calls are inserted at the entry of each placement
// function (building kinds, poles, trees, lamps, vehicles), so we get every placed object with
// its street frame (TX, TZ, TR), without changing a single random draw. The camera is the
// section's render() camera math (roadCam, the gate curve, the tilt) re-run here with three.js,
// with the heading smoothing hdS converged to its target.
//
// Writes blender/production/out/section.json (gitignored):
//   road {S0, DS, PX, PZ, PT}, SIDES, sideQ, patches, MK, LS, LSD, SB, FILL, rec[...],
//   frames[{i, p, e, q, s, grow, pos, quat, look}] (Three.js scene coordinates).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import * as THREE from 'three';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const OUT = path.join(HERE, 'out');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const COUNT = opt('--count', 400), TILT = opt('--tilt', 56);

// ---------------------------------------------------------------- instrumented geometry
let src = fs.readFileSync(path.join(REPO, 'src/lib/lmMapBuild.js'), 'utf8');
const inject = (re, call) => { const n0 = src.length; src = src.replace(re, m => m + call); if (src.length === n0) throw new Error('instrumentation failed: ' + re); };
const STATE = "TX, TZ, TC, TS, TR, fl: Object.fromEntries(Object.entries(FILL).map(([k, v]) => [k, v.length]))";
inject(/const bungalow = \(sd, xn, w, len, det\) => \{/, ` __REC({ kind: 'bungalow', sd, xn, w, len, det, ${STATE} });`);
inject(/const storey = \(sd, xn, w, len, fl, det\) => \{/, ` __REC({ kind: 'storey', sd, xn, w, len, floors: fl, det, ${STATE} });`);
inject(/const shopRow = \(sd, xn, len, det\) => \{/, ` __REC({ kind: 'shopRow', sd, xn, len, det, ${STATE} });`);
inject(/const container = \(sd, xn, len, det\) => \{/, ` __REC({ kind: 'container', sd, xn, len, det, ${STATE} });`);
inject(/const unfinished = \(sd, xn, w, len, det\) => \{/, ` __REC({ kind: 'unfinished', sd, xn, w, len, det, ${STATE} });`);
inject(/const pole = x => \{/, ` __REC({ kind: 'pole', x, ${STATE} });`);
inject(/const tree = x => \{/, ` __REC({ kind: 'tree', x, ${STATE} });`);
inject(/const lamp = x => \{/, ` __REC({ kind: 'lamp', x, ${STATE} });`);
inject(/if \(flip\) \{ TC = -TC; TS = -TS; TR \+= Math.PI; \}/, ` __REC({ kind: 'veh', s, lat, flip, model: fn === car ? 'car' : fn === danfo ? 'danfo' : 'keke', ${STATE} });`);
src = src.replace('export function lmMapBuild() {', 'export function lmMapBuild(__REC) {');
src = src.replace('return { PX, PZ, PT, S0, SMAX, DS, FILL, sideQ, patches, fr, W, MK, LS, SIDES };',
  'return { PX, PZ, PT, S0, SMAX, DS, FILL, sideQ, patches, fr, W, MK, LS, LSD, SB, SIDES, poles };');
const tmp = path.join(os.tmpdir(), 'lmMapBuild.instrumented.' + process.pid + '.mjs');
fs.writeFileSync(tmp, src);
const { lmMapBuild } = await import(url.pathToFileURL(tmp).href);
fs.unlinkSync(tmp);
const rec = [];
const G = lmMapBuild(r => rec.push(r));
const { fr, W, MK, LS, SB } = G;

// ---------------------------------------------------------------- camera (section render())
const MAP_END = 0.47, RIDE_START = 0.56, RIDE_END = 1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const interp = (p, xs, ys) => { for (let i = 1; i < xs.length; i++) if (p <= xs[i]) { const t = (p - xs[i - 1]) / (xs[i] - xs[i - 1]); const e = t * t * (3 - 2 * t); return ys[i - 1] + (ys[i] - ys[i - 1]) * e; } return ys[ys.length - 1]; };
const REVEAL = 1 / 17, KP = [0, 0.12, 0.3, 0.48, 0.66, 0.84, 0.95, 1], KS = [-14, 10, 70, 130, 185, 216, 235, 235];
const TS0 = G.S0 + 4, TS1 = -14, Q_GATE = 0.84;
const camera = new THREE.PerspectiveCamera(58, 1.6, 0.1, 700);
const camP = new THREE.Vector3(), look0 = new THREE.Vector3(), look = new THREE.Vector3(), tgt = new THREE.Vector3();
const gateCurve = new THREE.CatmullRomCurve3([[216, 1.3], [228, 1.1], [237, -0.6], [242.5, -4.2], [245, -9], [245, -20], [245, -36]].map(([s, l]) => { const [x, z] = W(s, l); return new THREE.Vector3(x, 1.75, z); }), false, 'centripetal');
const gateFar = (() => { const [x, z] = W(245, -60); return new THREE.Vector3(x, 1.9, z); })();

function camAt(p) {
  const k = clamp(p / MAP_END, 0, 1), e = clamp((p - MAP_END) / (RIDE_START - MAP_END), 0, 1), q = clamp((p - RIDE_START) / (RIDE_END - RIDE_START), 0, 1);
  const f = 0.12 + 0.3 * sstep(0, REVEAL * 1.1, p), e1 = sstep(0, 1, e);
  const sHead = k < 1 ? TS0 + k * (TS1 - 30 - TS0) : TS1 - 30 + 30 * clamp(e / 0.45, 0, 1), th = fr(sHead)[2];
  const hdS = th;                                    // smoothing converged
  const up = sstep(0.25, 0.95, e);
  const roll = sstep(-338, -302, sHead), ra = Math.PI * (1 - roll), fx = Math.sin(hdS + ra), fz = -Math.cos(hdS + ra), [hx, hz] = W(sHead, 0), Hm = 95, ffin = f + (0.58 - f) * roll, off = (ffin - 0.5) * 105.3;
  const roadCam = qq => { const s1 = interp(qq, KP, KS), [rx, rz] = W(s1, 1.3), [ax, az] = W(s1 + 26, 0.6); look.set(ax, 1.9, az);
    let wMax = 0, wi = -1; LS.forEach((ls, i) => { const d = ls - s1, w = Math.max(0, 1 - Math.abs(d - 30) / 22) * 0.5; if (w > wMax) { wMax = w; wi = i; } });
    if (wi >= 0) { const [mx, mz] = W(LS[wi], MK[wi][0] * 0.8); tgt.set(mx, 3.4, mz); look.lerp(tgt, wMax); }
    camP.set(rx, 1.75 + Math.sin(s1 * 0.8) * 0.04, rz); return s1; };
  let sc;
  if (q <= Q_GATE) sc = roadCam(q);
  else { roadCam(Q_GATE); look0.copy(look); const u = 0.6 * sstep(0, 1, (q - Q_GATE) / (1 - Q_GATE)); gateCurve.getPointAt(u, camP); camP.y = 1.75;
    if (u + 0.08 <= 1) gateCurve.getPointAt(u + 0.08, tgt); else { gateCurve.getPointAt(1, tgt); tgt.lerp(gateFar, (u + 0.08 - 1) / 0.08); }
    tgt.y = 1.9; look.copy(look0).lerp(tgt, sstep(0, 0.3, u)); sc = 216 + u * 29; }
  const cx = camP.x, cy = camP.y, cz = camP.z;
  if (e < 1) { const mx = hx + fx * off, mz = hz + fz * off;
    camera.position.set(mx + (cx - mx) * e1, Hm + (cy - Hm) * e1, mz + (cz - mz) * e1);
    tgt.set(mx + (look.x - mx) * e1, look.y * e1, mz + (look.z - mz) * e1);
    camera.up.set(fx * (1 - e1), e1, fz * (1 - e1)).normalize(); camera.lookAt(tgt); }
  else { camera.position.set(cx, cy, cz); camera.up.set(0, 1, 0); camera.lookAt(look); }
  camera.updateMatrixWorld();
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  return { p, e, q, s: sc, grow: 0.02 + 0.98 * up, pos: camera.position.toArray(), quat: camera.quaternion.toArray(), dir: dir.toArray() };
}

// ---------------------------------------------------------------- frame spacing
// Tilt (p in [MAP_END, RIDE_START)): even steps of camera rotation angle.
// Ride (p in [RIDE_START, 1]): even steps of cost = travel/STEP_M + rotation/STEP_DEG, so frames
// stay ~0.7 m apart while driving and still advance when the view swings toward a landmark.
const angle = (a, b) => { const qa = new THREE.Quaternion(...a.quat), qb = new THREE.Quaternion(...b.quat); return qa.angleTo(qb) * 180 / Math.PI; };
const dist = (a, b) => Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
function cumulative(p0, p1, n, cost) {
  const ps = [], c = [0]; let prev = null;
  for (let i = 0; i <= n; i++) { const p = p0 + (p1 - p0) * i / n, f = camAt(p); ps.push(p); if (prev) c.push(c[c.length - 1] + cost(prev, f)); prev = f; }
  return { ps, c };
}
function pick({ ps, c }, m, includeEnd) {
  const out = [], tot = c[c.length - 1], n = includeEnd ? m - 1 : m;
  for (let j = 0; j < m; j++) { const target = tot * j / n; let i = 1; while (i < c.length - 1 && c[i] < target) i++; const t = (target - c[i - 1]) / Math.max(1e-12, c[i] - c[i - 1]); out.push(ps[i - 1] + (ps[i] - ps[i - 1]) * clamp(t, 0, 1)); }
  return out;
}
const STEP_M = 0.7, STEP_DEG = 1.6;
const tiltC = cumulative(MAP_END, RIDE_START, 4000, (a, b) => angle(a, b));
const rideC = cumulative(RIDE_START, RIDE_END, 20000, (a, b) => dist(a, b) / STEP_M + angle(a, b) / STEP_DEG);
const pTilt = pick(tiltC, TILT, false), pRide = pick(rideC, COUNT - TILT, true);
const frames = [...pTilt, ...pRide].map((p, i) => ({ i, ...camAt(p) }));
let travel = 0; for (let i = TILT + 1; i < frames.length; i++) travel += dist(frames[i - 1], frames[i]);
const stops = LS.map((ls, i) => { const [x, z] = W(MK[i][2], MK[i][0]); let best = 0, bd = 1e9; frames.forEach((f, j) => { const d = Math.hypot(f.pos[0] - x, f.pos[2] - z); if (d < bd) { bd = d; best = j; } }); return { landmark: i + 1, frame: best, dist: +bd.toFixed(2), p: +frames[best].p.toFixed(5) }; });
// the stop frames (camera dwell at each KP knot) for the q70 rule: frame nearest each STOP p
const STOPS_Q = [0.12, 0.3, 0.48, 0.66, 0.84].map(q => RIDE_START + q * (RIDE_END - RIDE_START));
const stopFrames = STOPS_Q.map(ps => frames.reduce((b, f, j) => Math.abs(f.p - ps) < Math.abs(frames[b].p - ps) ? j : b, 0));

fs.mkdirSync(OUT, { recursive: true });
const out = {
  note: 'Three.js scene coordinates (Y up). Generated by blender/production/export_section.mjs',
  road: { S0: G.S0, SMAX: G.SMAX, DS: G.DS, PX: G.PX, PZ: G.PZ, PT: G.PT },
  SIDES: G.SIDES, sideQ: G.sideQ, patches: G.patches, MK: G.MK, LS: G.LS, LSD: G.LSD, SB: G.SB,
  FILL: G.FILL, rec, tilt: TILT, stops, stopFrames, frames,
};
fs.writeFileSync(path.join(OUT, 'section.json'), JSON.stringify(out));
const kinds = {}; rec.forEach(r => kinds[r.kind] = (kinds[r.kind] || 0) + 1);
console.log(`[export] ${frames.length} frames (${TILT} tilt + ${frames.length - TILT} ride), ride travel ${travel.toFixed(1)} m,`
  + ` mean ${(travel / (frames.length - TILT - 1)).toFixed(2)} m/frame`);
console.log('[export] placed', JSON.stringify(kinds));
console.log('[export] closest frames to landmarks', JSON.stringify(stops));
console.log('[export] stop frames', JSON.stringify(stopFrames));
