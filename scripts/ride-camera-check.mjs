// Guards the extraction of the Landmarks Journey camera math into src/lib/rideCamera.js.
//
//   node scripts/ride-camera-check.mjs             compare src/lib/rideCamera.js + lmMapBuild() with the baseline
//   node scripts/ride-camera-check.mjs --baseline  recompute the baseline from the pre-refactor section source
//
// The baseline is computed by evaluating the camera code exactly as it stood inside
// LandmarksJourneySection.jsx at commit ORIG (read with `git show`), so the hashes below are not
// a copy of the new module checking itself. Numbers are hashed at full precision.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as THREE from 'three';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIG = '76e9a31';
const SECTION = 'src/components/sections/LandmarksJourneySection.jsx';
const BASELINE = {
  lmMapBuild: '145f6b69226f2c4975d4e6050d141a5c2c7460871e73e9812b821793217514b8',
  camera: '62dbcc4177861b30712ea08ffeb4b87c429ce1edc9ff209f9a7f6fae08c4a152',
};
const N = 50;

const sha = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');

// --- camera samples -------------------------------------------------------------------------
// `sample(st, hdS)` poses `camera` for one render; hdS undefined = converged (hdS === th).
function collect(phase, sample, camera, gX, gZ) {
  const out = [], v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const p = i / (N - 1), st = phase(p);
    for (const lag of [undefined, 0.07]) {
      const r = sample(st, lag === undefined ? undefined : lag);
      camera.updateMatrixWorld(); camera.updateProjectionMatrix();
      const a = v.set(r.hx, 0.3, r.hz).project(camera).toArray(), b = v.set(gX, 3.0, gZ).project(camera).toArray();
      out.push({ p, st, lag: lag ?? null, pos: camera.position.toArray(), quat: camera.quaternion.toArray(), up: camera.up.toArray(), sc: r.sc, hx: r.hx, hz: r.hz, roll: r.roll, sHead: r.sHead, a, b });
    }
  }
  return out;
}
const newCam = () => new THREE.PerspectiveCamera(58, 1.6, 0.1, 700);

// Baseline: slice the original statements out of the section source and evaluate them verbatim.
function originalSampler() {
  const src = execFileSync('git', ['show', `${ORIG}:${SECTION}`], { cwd: ROOT, encoding: 'utf8' });
  const lines = src.split('\n');
  const line = re => { const l = lines.find(x => re.test(x)); if (!l) throw new Error('not found: ' + re); return l.trim(); };
  const span = (a, b) => { const i = lines.findIndex(x => a.test(x)), j = lines.findIndex((x, k) => k >= i && b.test(x)); if (i < 0 || j < 0) throw new Error('span: ' + a); return lines.slice(i, j + 1).map(x => x.trim()).join('\n'); };
  const ts = src.match(/const TS0 = [^,]+, TS1 = [^,]+/)[0];
  const body = [
    line(/^const MAP_END =/), line(/^const KP =/), line(/^const clamp =/), line(/^const sstep =/), line(/^const interp =/),
    span(/const DS = 0\.5, S0 = /, /const W = \(s, lat\) =>/),
    line(/const LS = \[/), line(/const MK = \[/), ts + ';',
    line(/const Q_GATE = /), line(/const gateCurve = /), line(/const \[gX, gZ\] = /), line(/const gateFar = /),
    line(/const KS = \[/), line(/const look = new THREE\.Vector3\(\), ahead/),
    'let hdS;',
    'const phase = p => { ' + line(/const k = clamp\(p \/ MAP_END/).replace(/^const p = this\.cur, can = !!this\.three, VW = window\.innerWidth, VH = window\.innerHeight;\s*/, '') + ' ' + line(/const f = 0\.12 \+ 0\.3 \* sstep/) + ' return { k, e, q, f }; };',
    'const sample = (st, hdIn) => {',
    line(/const \{ k, e, q \} = st, e1 = /),
    line(/const sHead = k < 1 \?/),
    'hdS = hdIn === undefined ? th : th + hdIn;',
    span(/const roll = sstep\(-338, -302, sHead\)/, /else \{ camera\.position\.set\(cx, cy, cz\); camera\.up\.set\(0, 1, 0\); camera\.lookAt\(look\); \}/),
    'return { sc, hx, hz, roll, sHead }; };',
    'return { phase, sample, gX, gZ };',
  ].join('\n');
  const camera = newCam();
  const m = new Function('THREE', 'camera', body)(THREE, camera);
  return { ...m, camera };
}

async function newSampler() {
  const R = await import('../src/lib/rideCamera.js');
  const camera = newCam(), cam = R.makeRideCamera(THREE);
  const sample = (st, hdIn) => {
    const sHead = R.headS(st.k, st.e), th = R.fr(sHead)[2];
    const r = cam.pose(camera, st, sHead, hdIn === undefined ? th : th + hdIn);
    return { ...r, sHead };
  };
  return { phase: R.phase, sample, gX: cam.gX, gZ: cam.gZ, camera, R };
}

async function mapHash() {
  const { lmMapBuild } = await import('../src/lib/lmMapBuild.js');
  const G = lmMapBuild(), plain = {};
  for (const k of Object.keys(G)) if (typeof G[k] !== 'function') plain[k] = G[k];
  const probe = [];
  for (let s = -430; s <= 330; s += 3.7) probe.push(G.fr(s), G.W(s, 4.2), G.W(s, -6.9));
  return { hash: sha({ plain, probe }), G };
}

const baselineMode = process.argv.includes('--baseline');
const map = await mapHash();
if (baselineMode) {
  const o = originalSampler();
  console.log(JSON.stringify({ lmMapBuild: map.hash, camera: sha(collect(o.phase, o.sample, o.camera, o.gX, o.gZ)) }, null, 2));
  process.exit(0);
}

const n = await newSampler();
const camHash = sha(collect(n.phase, n.sample, n.camera, n.gX, n.gZ));
let ok = true;
const report = (name, got, want) => { const same = got === want; ok = ok && same; console.log(`${same ? 'IDENTICAL' : 'DIFFERENT'}  ${name}\n  baseline ${want}\n  now      ${got}`); };
report('lmMapBuild() output', map.hash, BASELINE.lmMapBuild);
report(`camera samples (${N} p values x 2 heading states)`, camHash, BASELINE.camera);

// Live cross-check against the original source, when git history is available.
try {
  const o = originalSampler();
  report('camera samples vs original source @' + ORIG, camHash, sha(collect(o.phase, o.sample, o.camera, o.gX, o.gZ)));
} catch (e) { console.log('(skipped live source cross-check: ' + e.message.split('\n')[0] + ')'); }

// The section's road and landmarks must be the same as the Try-it map's.
const { G } = map, R = n.R;
const roadSame = sha([G.PX, G.PZ, G.PT, G.S0, G.SMAX, G.DS, G.MK, G.LS]) === sha([R.PX, R.PZ, R.PT, R.S0, R.SMAX, R.DS, R.MK, R.LS]);
ok = ok && roadSame;
console.log(`${roadSame ? 'IDENTICAL' : 'DIFFERENT'}  road centreline + MK/LS: rideCamera.js vs lmMapBuild()`);
process.exit(ok ? 0 : 1);
