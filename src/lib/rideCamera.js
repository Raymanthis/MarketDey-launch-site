/* eslint-disable */
// Camera and road geometry of the Landmarks Journey ride, moved verbatim out of
// LandmarksJourneySection.jsx so the section and scripts/ride-stub.mjs (and the Blender frame
// pipeline's camera export) share one source. Pure math: no DOM, no React. Anything that needs
// three.js takes the module as an argument, because the section imports three lazily.
// scripts/ride-camera-check.mjs proves the numbers are identical to the original section code.

export const KP = [0, 0.12, 0.3, 0.48, 0.66, 0.84, 0.95, 1];
export const MAP_END = 0.47, RIDE_START = 0.56, RIDE_END = 1, REVEAL = 1 / 17;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const interp = (p, xs, ys) => { for (let i = 1; i < xs.length; i++) if (p <= xs[i]) { const t = (p - xs[i - 1]) / (xs[i] - xs[i - 1]); const e = t * t * (3 - 2 * t); return ys[i - 1] + (ys[i] - ys[i - 1]) * e; } return ys[ys.length - 1]; };

// road centreline: straight, LEFT, straight, RIGHT, straight, LEFT, straight
export const DS = 0.5, S0 = -420, PX = [0], PZ = [0], PT = [0];
{ let x = 0, z = 0, th = 0; for (const [len, deg] of [[100, 0], [22, 90], [110, 0], [22, -90], [126, 0], [95, 0], [30, -55], [30, 0], [34, 70], [25, 0], [26, -50], [210, 0]]) { const n = Math.round(len / DS), k = deg * Math.PI / 180 / n; for (let i = 0; i < n; i++) { th += k / 2; x += Math.sin(th) * DS; z -= Math.cos(th) * DS; th += k / 2; PX.push(x); PZ.push(z); PT.push(th); } } }
export const SMAX = S0 + (PX.length - 1) * DS;
export const fr = s => { const f = Math.min(Math.max((s - S0) / DS, 0), PX.length - 1.001), i = Math.floor(f), u = f - i; return [PX[i] + (PX[i + 1] - PX[i]) * u, PZ[i] + (PZ[i + 1] - PZ[i]) * u, PT[i] + (PT[i + 1] - PT[i]) * u]; };
export const W = (s, lat) => { const [x, z, t] = fr(s); return [x + Math.cos(t) * lat, z + Math.sin(t) * lat]; };

// landmarks (road station, side), signboard stations, pin positions [lat, y, s]
export const LS = [40, 100, 160, 215, 245], LSD = [1, -1, 1, -1, -1], SB = [28, 88, 144, 203, 228];
export const MK = [[11, 8, 40], [-12, 15.5, 100], [8, 5.4, 160], [-10.4, 14.5, 209.8], [-6.4, 10.4, 245]];
// green trail on the flat map
export const TS0 = S0 + 4, TS1 = -14;
export const KS = [-14, 10, 70, 130, 185, 216, 235, 235];
export const Q_GATE = 0.84;

// Section phase from scroll progress p (as computed in the section's frame()).
export const phase = p => {
  const k = clamp(p / MAP_END, 0, 1), e = clamp((p - MAP_END) / (RIDE_START - MAP_END), 0, 1), q = clamp((p - RIDE_START) / (RIDE_END - RIDE_START), 0, 1);
  const f = 0.12 + 0.3 * sstep(0, REVEAL * 1.1, p);
  return { k, e, q, f };
};
// Road station the flat-map heading follows. The section smooths fr(headS)[2] into hdS.
export const headS = (k, e) => k < 1 ? TS0 + k * (TS1 - 30 - TS0) : TS1 - 30 + 30 * clamp(e / 0.45, 0, 1);

// The camera rig. pose() sets camera.position / up / orientation for one render exactly as the
// section did, and returns the values the section needs for overlays.
export function makeRideCamera(THREE) {
  const camP = new THREE.Vector3(), look0 = new THREE.Vector3();
  const gateCurve = new THREE.CatmullRomCurve3([[216, 1.3], [228, 1.1], [237, -0.6], [242.5, -4.2], [245, -9], [245, -20], [245, -36]].map(([s, l]) => { const [x, z] = W(s, l); return new THREE.Vector3(x, 1.75, z); }), false, 'centripetal');
  const [gX, gZ] = W(245, -6.4);
  const gateFar = (() => { const [x, z] = W(245, -60); return new THREE.Vector3(x, 1.9, z); })();
  const look = new THREE.Vector3(), tgt = new THREE.Vector3();
  const pose = (camera, st, sHead, hdS) => {
    const { e, q } = st, e1 = sstep(0, 1, e);
    const roll = sstep(-338, -302, sHead), ra = Math.PI * (1 - roll), fx = Math.sin(hdS + ra), fz = -Math.cos(hdS + ra), [hx, hz] = W(sHead, 0), Hm = 95, ffin = st.f + (0.58 - st.f) * roll, off = (ffin - 0.5) * 105.3;
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
    return { sc, hx, hz, roll };
  };
  return { gateCurve, gateFar, gX, gZ, pose };
}

// Camera of a pre-rendered frame at progress p: heading smoothing converged (hdS === th), so the
// result is deterministic. Returns { pos: [x,y,z], quat: [x,y,z,w] } in scene coordinates.
export function frameCamera(THREE, rig, p, camera) {
  const st = phase(p), sHead = headS(st.k, st.e), th = fr(sHead)[2];
  rig.pose(camera, st, sHead, th);
  return { pos: camera.position.toArray(), quat: camera.quaternion.toArray() };
}
