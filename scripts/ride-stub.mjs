// Stub ride frames for developing the frame player before the Blender frames exist.
//
//   node scripts/ride-stub.mjs [count=61]
//
// Writes public/media/ride-stub/ in the format of docs/plans/ride-frames-format.md (WebP only).
// Every frame is drawn through that frame's own camera, sampled from the section's camera code
// (src/lib/rideCamera.js) exactly as the contract specifies: a ground grid, the road centreline
// and kerbs, and a coloured marker at each of the five landmark pin positions (MK) plus the coin
// pin's resting point. In-scene overlays rendered with manifest.camera[i] must land on the markers.
// View with /?ride=stub.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import sharp from 'sharp';
import { MAP_END, S0, SMAX, W, MK, makeRideCamera, frameCamera } from '../src/lib/rideCamera.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/media/ride-stub');
const COUNT = Math.max(2, parseInt(process.argv[2] || '61', 10));
const P0 = MAP_END, P1 = 1;
const VARIANTS = { l: { w: 1600, h: 1000, fov: 58 }, p: { w: 780, h: 1688, fov: 58 } };
// Marker colours per landmark; the coin pin (landmark 5's on-road marker) gets its own.
export const MARKER_COLORS = ['#e01b24', '#1c71d8', '#9141ac', '#ff7800', '#00a3a3'];
export const COIN_COLOR = '#8f5902';

const pad = i => String(i).padStart(4, '0');
const rig = makeRideCamera(THREE), probe = new THREE.PerspectiveCamera(58, 1.6, 0.1, 700);

// Markers: pins 1-4 are sprites at MK; pin 5 is the coin, which bobs around W(245, -5.2) at y 1.25.
const markers = MK.map(([lat, y, s], i) => { const [x, z] = W(s, lat); return { p: [x, y, z], color: MARKER_COLORS[i], label: String(i + 1), shape: 'disc' }; });
{ const [x, z] = W(245, -5.2); markers.push({ p: [x, 1.25, z], color: COIN_COLOR, label: 'coin', shape: 'square' }); }

function drawFrame(i, p, cam, v) {
  const { w, h, fov } = VARIANTS[v], c = new THREE.PerspectiveCamera(fov, w / h, 0.1, 700);
  c.position.fromArray(cam.pos); c.quaternion.fromArray(cam.quat); c.updateMatrixWorld(); c.updateProjectionMatrix();
  const NEAR = 0.3, a = new THREE.Vector3(), b = new THREE.Vector3();
  const toView = (x, y, z, o) => o.set(x, y, z).applyMatrix4(c.matrixWorldInverse);
  const px = o => { o.applyMatrix4(c.projectionMatrix); return [(o.x + 1) / 2 * w, (1 - o.y) / 2 * h]; };
  // segment in world space -> clipped against the near plane -> pixel segment (or null)
  const seg = (P, Q) => {
    toView(P[0], P[1], P[2], a); toView(Q[0], Q[1], Q[2], b);
    if (a.z > -NEAR && b.z > -NEAR) return null;
    if (a.z > -NEAR) a.lerp(b, (a.z + NEAR) / (a.z - b.z)); else if (b.z > -NEAR) b.lerp(a, (b.z + NEAR) / (b.z - a.z));
    const A = px(a), B = px(b); if (![...A, ...B].every(Number.isFinite)) return null;
    return `M${A[0].toFixed(2)} ${A[1].toFixed(2)}L${B[0].toFixed(2)} ${B[1].toFixed(2)}`;
  };
  const u = Math.min(w, h) / 780;
  let grid = '', road = '', kerb = '', mk = '';
  const cx = Math.round(cam.pos[0] / 10) * 10, cz = Math.round(cam.pos[2] / 10) * 10, R = 420;
  for (let g = -R; g <= R; g += 10) {
    grid += (seg([cx + g, 0, cz - R], [cx + g, 0, cz + R]) || '') + (seg([cx - R, 0, cz + g], [cx + R, 0, cz + g]) || '');
  }
  for (let s = S0; s < SMAX - 2; s += 2) {
    const [x1, z1] = W(s, 0), [x2, z2] = W(s + 2, 0); road += seg([x1, 0, z1], [x2, 0, z2]) || '';
    for (const lat of [-4, 4]) { const [x3, z3] = W(s, lat), [x4, z4] = W(s + 2, lat); kerb += seg([x3, 0, z3], [x4, 0, z4]) || ''; }
  }
  for (const m of markers) {
    toView(m.p[0], m.p[1], m.p[2], a); if (a.z > -NEAR) continue;
    const [x, y] = px(a); if (x < -100 || y < -100 || x > w + 100 || y > h + 100) continue;
    const r = 9 * u, R2 = 17 * u, sw = 2.5 * u;
    // stem down to the ground, so the marker reads as a point in space
    const g = new THREE.Vector3(); toView(m.p[0], 0, m.p[2], g); const stem = g.z < -NEAR ? px(g) : null;
    if (stem) mk += `<path d="M${x.toFixed(2)} ${y.toFixed(2)}L${stem[0].toFixed(2)} ${stem[1].toFixed(2)}" stroke="#555" stroke-width="${u}" stroke-dasharray="${3 * u} ${3 * u}"/>`;
    const fillShape = m.shape === 'square' ? `<rect x="${(x - r).toFixed(2)}" y="${(y - r).toFixed(2)}" width="${2 * r}" height="${2 * r}" fill="${m.color}"/>` : `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}" fill="${m.color}"/>`;
    mk += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${R2}" fill="none" stroke="${m.color}" stroke-width="${sw}"/>` + fillShape +
      `<path d="M${(x - R2 * 1.6).toFixed(2)} ${y.toFixed(2)}H${(x + R2 * 1.6).toFixed(2)}M${x.toFixed(2)} ${(y - R2 * 1.6).toFixed(2)}V${(y + R2 * 1.6).toFixed(2)}" stroke="${m.color}" stroke-width="${sw * 0.6}"/>` +
      `<text x="${(x + R2 * 1.7).toFixed(2)}" y="${(y - R2 * 1.1).toFixed(2)}" font-family="Menlo, monospace" font-size="${14 * u}" fill="#111">${m.label}</text>`;
  }
  const fs1 = 40 * u, fs2 = 20 * u;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="#ffffff"/>
<path d="${grid}" stroke="#c8c8c8" stroke-width="${u}" fill="none"/>
<path d="${kerb}" stroke="#7a7a7a" stroke-width="${1.4 * u}" fill="none"/>
<path d="${road}" stroke="#222" stroke-width="${2.2 * u}" stroke-dasharray="${8 * u} ${5 * u}" fill="none"/>
${mk}
<rect x="${12 * u}" y="${12 * u}" width="${330 * u}" height="${88 * u}" fill="#ffffff" stroke="#111" stroke-width="${u}"/>
<text x="${24 * u}" y="${56 * u}" font-family="Menlo, monospace" font-size="${fs1}" font-weight="700" fill="#111">#${pad(i)}</text>
<text x="${24 * u}" y="${88 * u}" font-family="Menlo, monospace" font-size="${fs2}" fill="#111">p=${p.toFixed(4)} ${v} ${w}x${h}</text>
</svg>`;
}

function coarseToFine(n) {
  const order = [], seen = new Set();
  for (let step = 64; step >= 1; step /= 2) for (let i = 0; i < n; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
  return order;
}

fs.rmSync(OUT, { recursive: true, force: true });
for (const v of Object.keys(VARIANTS)) fs.mkdirSync(path.join(OUT, v), { recursive: true });
const pAt = [], camera = [], bytes = { l: { avif: 0, webp: 0 }, p: { avif: 0, webp: 0 } };
for (let i = 0; i < COUNT; i++) {
  const p = i === COUNT - 1 ? P1 : P0 + (P1 - P0) * i / (COUNT - 1);
  const cam = frameCamera(THREE, rig, p, probe);
  pAt.push(p); camera.push(cam);
  for (const v of Object.keys(VARIANTS)) {
    const buf = await sharp(Buffer.from(drawFrame(i, p, cam, v))).webp({ quality: 80 }).toBuffer();
    fs.writeFileSync(path.join(OUT, v, pad(i) + '.webp'), buf); bytes[v].webp += buf.length;
  }
}
const manifest = { version: 1, count: COUNT, p: [P0, P1], pAt, variants: VARIANTS, formats: ['webp'], bytes, camera, order: coarseToFine(COUNT), stub: true };
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`wrote ${COUNT} frames x ${Object.keys(VARIANTS).length} variants to ${path.relative(ROOT, OUT)} (l ${(bytes.l.webp / 1e6).toFixed(2)} MB, p ${(bytes.p.webp / 1e6).toFixed(2)} MB)`);
