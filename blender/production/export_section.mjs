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
// src/lib/rideCamera.js is the section's own camera code (shared with the site); frameCamera()
// poses it at p with the heading smoothing converged.
const RC = await import(url.pathToFileURL(path.join(REPO, 'src/lib/rideCamera.js')).href);
const { MAP_END, RIDE_START, RIDE_END, clamp, sstep } = RC;
const rig = RC.makeRideCamera(THREE);
const camera = new THREE.PerspectiveCamera(58, 1.6, 0.1, 700);
for (const [k, v] of [['S0', G.S0], ['DS', G.DS]]) if (RC[k] !== v) throw new Error('rideCamera.js and lmMapBuild.js disagree on ' + k);

function camAt(p) {
  const st = RC.phase(p);
  const { pos, quat } = RC.frameCamera(THREE, rig, p, camera);
  const sc = rig.pose(camera, st, RC.headS(st.k, st.e), RC.fr(RC.headS(st.k, st.e))[2]).sc;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  return { p, e: st.e, q: st.q, s: sc, grow: 0.02 + 0.98 * sstep(0.25, 0.95, st.e), pos, quat, dir: dir.toArray() };
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

// ---------------------------------------------------------------- portrait camera (contract rev 2)
// Same positions; during the ride the portrait camera yaws (about world up) toward each landmark
// as it is approached and passed, just enough that the landmark's footprint stays inside the
// 780x1688 frame, eased with a Gaussian over frames so it never snaps, back to the road heading
// in between. Landmark footprints (street frame at LS: [lat0, lat1] x [z0, z1], height) from the
// section's own clearance quads.
// key feature of each landmark (street frame at LS: lat0, lat1, z0, z1, y0, y1): the canopy, the
// tank, the umbrella row, nave + tower, the gate
const LM_BOX = [[5.5, 16.5, -3.5, 3.5, 0, 5.6], [-14.6, -9.4, -2.6, 2.6, 6, 13.9], [6.0, 9.8, -9.6, 9.6, 0, 3.2],
  [-18, -10, -6, 6, 0, 13], [-7.2, -5.6, -5.75, 5.75, 0, 9.4]];
const lmPts = LM_BOX.map(([a, b, c, d, y0, y1], i) => { const s0 = LS[i], [x, z, t] = fr(s0), pts = [];
  for (const lat of [a, b]) for (const zz of [c, d]) for (const y of [y0, y1]) { const X = x + lat * Math.cos(t) - zz * Math.sin(t), Z = z + lat * Math.sin(t) + zz * Math.cos(t); pts.push(new THREE.Vector3(X, y, Z)); }
  return pts; });
const tanHp = Math.tan(29 * Math.PI / 180) * 780 / 1688, HPF = Math.atan(tanHp), HP = Math.atan(tanHp * 0.9);
const YAW_MAX = 38 * Math.PI / 180;
const yawOf = v => Math.atan2(-v.x, -v.z);            // + = target is to the left (turn left)
const need = frames.map(f => {
  if (f.e < 1) return 0;
  const P = new THREE.Vector3(...f.pos), qi = new THREE.Quaternion(...f.quat).invert();
  const cand = [];
  lmPts.forEach(pts => {
    const c = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / pts.length), d = c.distanceTo(P);
    if (d > 75) return;
    const ac = yawOf(c.clone().sub(P).applyQuaternion(qi));
    if (Math.abs(ac) > 75 * Math.PI / 180) return;      // being passed: let it go
    const ang = pts.map(pt => yawOf(pt.clone().sub(P).applyQuaternion(qi)));
    cand.push({ d, lo: Math.max(...ang) - HP, hi: Math.min(...ang) + HP });   // yaws keeping every point in
  });
  cand.sort((a, b) => a.d - b.d);
  // keep the nearest landmark in; also keep any farther one in when both fit at once
  let lo = -YAW_MAX, hi = YAW_MAX, first = true;
  for (const c of cand) {
    const nlo = Math.max(lo, c.lo), nhi = Math.min(hi, c.hi);
    if (nlo <= nhi) { lo = nlo; hi = nhi; first = false; }
    else if (first) { const m = Math.max(-YAW_MAX, Math.min(YAW_MAX, (c.lo + c.hi) / 2)); lo = hi = m; first = false; }
  }
  return Math.min(Math.max(0, lo), hi); });
// ease: running max of |need| over a window (so the turn starts early and holds), then two Gaussian passes
const W1 = 3, held = need.map((_, j) => { let m = 0; for (let k = -W1; k <= W1; k++) { const jj = j + k; if (jj >= 0 && jj < need.length && Math.abs(need[jj]) > Math.abs(m)) m = need[jj]; } return frames[j].e < 1 ? 0 : m; });
const gauss = (arr, sg) => arr.map((_, j) => { let a = 0, w = 0; for (let k = -3 * sg; k <= 3 * sg; k++) { const jj = j + k; if (jj < 0 || jj >= arr.length) continue; const g = Math.exp(-0.5 * (k / sg) ** 2); a += arr[jj] * g; w += g; } return frames[j].e < 1 ? 0 : a / w; });
const yawSm = gauss(gauss(held, 10), 10).map((y, j) => y * sstep(TILT - 1, TILT + 10, j));
const UP = new THREE.Vector3(0, 1, 0);
frames.forEach((f, j) => { const q = new THREE.Quaternion().setFromAxisAngle(UP, yawSm[j]).multiply(new THREE.Quaternion(...f.quat)); f.quatP = q.toArray(); f.yawP = yawSm[j]; });
const maxRate = Math.max(...yawSm.slice(1).map((y, j) => Math.abs(y - yawSm[j]))) * 180 / Math.PI;
const jmax = yawSm.slice(1).reduce((m, y, j) => Math.abs(y - yawSm[j]) > Math.abs(yawSm[m + 1] - yawSm[m]) ? j : m, 0);
console.log(`[export] max yaw step at frame ${jmax}`);
console.log(`[export] portrait yaw: max ${(Math.max(...yawSm.map(Math.abs)) * 180 / Math.PI).toFixed(1)} deg, max step ${maxRate.toFixed(2)} deg/frame`);
// visibility report: for each landmark, frames where its key feature is entirely inside the frame,
// and the closest distance at which it still is (landscape vs portrait)
const fullyIn = (f, quat, pts, tanH) => { const P = new THREE.Vector3(...f.pos), qi = new THREE.Quaternion(...quat).invert();
  return pts.every(pt => { const v = pt.clone().sub(P).applyQuaternion(qi); return v.z < -0.5 && Math.abs(v.x / -v.z) <= tanH && Math.abs(v.y / -v.z) <= Math.tan(29 * Math.PI / 180); }); };
const VIS = lmPts.map((pts, i) => { const c = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / pts.length), r = {};
  for (const [v, key, tanH] of [['l', 'quat', Math.tan(29 * Math.PI / 180) * 1.6], ['p', 'quatP', tanHp], ['p0', 'quat', tanHp]]) {
    let n = 0, dmin = 1e9; frames.forEach(f => { if (f.e < 1) return; if (fullyIn(f, f[key], pts, tanH)) { n++; dmin = Math.min(dmin, c.distanceTo(new THREE.Vector3(...f.pos))); } });
    r[v] = { frames: n, closest_m: +dmin.toFixed(1) }; }
  return r; });
if (process.env.DEBUG) for (let j = 300; j < 400; j += 4) console.log(j, (need[j] * 57.3).toFixed(1), (yawSm[j] * 57.3).toFixed(1), fullyIn(frames[j], frames[j].quatP, lmPts[4], tanHp), fullyIn(frames[j], frames[j].quat, lmPts[4], tanHp));
VIS.forEach((r, i) => console.log(`[export] L${i + 1} fully in frame: landscape ${r.l.frames} fr (to ${r.l.closest_m} m), portrait ${r.p.frames} fr (to ${r.p.closest_m} m), portrait without yaw ${r.p0.frames} fr (to ${r.p0.closest_m} m)`));
let travel = 0; for (let i = TILT + 1; i < frames.length; i++) travel += dist(frames[i - 1], frames[i]);
const stops = LS.map((ls, i) => { const [x, z] = W(MK[i][2], MK[i][0]); let best = 0, bd = 1e9; frames.forEach((f, j) => { const d = Math.hypot(f.pos[0] - x, f.pos[2] - z); if (d < bd) { bd = d; best = j; } }); return { landmark: i + 1, frame: best, dist: +bd.toFixed(2), p: +frames[best].p.toFixed(5) }; });
// closest frame from which the landmark is still in view in the narrow portrait variant
// (its centre within 70 % of the half field of view, both axes)
const tanV = Math.tan(29 * Math.PI / 180);
const inViewFor = (aspect, m) => LS.map((ls, i) => { const tanH = tanV * aspect; const [x, z] = W(MK[i][2], MK[i][0]), c = new THREE.Vector3(x, 3.0, z); let best = -1, bd = 1e9;
  frames.forEach((f, j) => { if (f.e < 1) return; const q = new THREE.Quaternion(...f.quat).invert(), v = c.clone().sub(new THREE.Vector3(...f.pos)).applyQuaternion(q);
    if (v.z >= -1) return; const u = v.x / -v.z, w = v.y / -v.z; if (Math.abs(u) > m * tanH || Math.abs(w) > m * tanV) return; const d = v.length(); if (d < bd) { bd = d; best = j; } });
  return { landmark: i + 1, frame: best, dist: +bd.toFixed(1) }; });
const inView = { l: inViewFor(1.6, 0.8), p: inViewFor(780 / 1688, 0.9) };
// the stop frames (camera dwell at each KP knot) for the q70 rule: frame nearest each STOP p
const STOPS_Q = [0.12, 0.3, 0.48, 0.66, 0.84].map(q => RIDE_START + q * (RIDE_END - RIDE_START));
const stopFrames = STOPS_Q.map(ps => frames.reduce((b, f, j) => Math.abs(f.p - ps) < Math.abs(frames[b].p - ps) ? j : b, 0));

fs.mkdirSync(OUT, { recursive: true });
const out = {
  note: 'Three.js scene coordinates (Y up). Generated by blender/production/export_section.mjs',
  road: { S0: G.S0, SMAX: G.SMAX, DS: G.DS, PX: G.PX, PZ: G.PZ, PT: G.PT },
  SIDES: G.SIDES, sideQ: G.sideQ, patches: G.patches, MK: G.MK, LS: G.LS, LSD: G.LSD, SB: G.SB,
  FILL: G.FILL, rec, tilt: TILT, stops, inView, stopFrames, frames,
};
fs.writeFileSync(path.join(OUT, 'section.json'), JSON.stringify(out));
const kinds = {}; rec.forEach(r => kinds[r.kind] = (kinds[r.kind] || 0) + 1);
console.log(`[export] ${frames.length} frames (${TILT} tilt + ${frames.length - TILT} ride), ride travel ${travel.toFixed(1)} m,`
  + ` mean ${(travel / (frames.length - TILT - 1)).toFixed(2)} m/frame`);
console.log('[export] placed', JSON.stringify(kinds));
console.log('[export] closest frames to landmarks', JSON.stringify(stops));
console.log('[export] stop frames', JSON.stringify(stopFrames));
console.log('[export] closest in view l', JSON.stringify(inView.l));
console.log('[export] closest in view p', JSON.stringify(inView.p));
