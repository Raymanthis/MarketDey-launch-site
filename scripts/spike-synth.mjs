// Synthetic test data for the sketch spike viewer. Writes public/media/spike-synth/
// {lines.bin, lines.json, camera.json} per docs/plans/sketch-spike-format.md.
// Usage: node scripts/spike-synth.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'media', 'spike-synth');
const CLASSES = ['structure', 'detail', 'fine'];
const FEATURES = ['general', 'building', 'vehicle', 'tree', 'wire', 'person', 'landmark'];
const [STRUCTURE, DETAIL, FINE] = [0, 1, 2];
const [GENERAL, BUILDING, , , WIRE] = [0, 1, 2, 3, 4];

let seed = 7;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const range = (a, b) => a + (b - a) * rnd();

const segs = []; // [ax,ay,az,bx,by,bz,cls,feat]
const seg = (a, b, cls, feat) => segs.push([a[0], a[1], a[2], b[0], b[1], b[2], cls, feat]);
const poly = (pts, cls, feat) => {
  for (let i = 0; i < pts.length - 1; i++) seg(pts[i], pts[i + 1], cls, feat);
};
const rect = (x0, y0, x1, y1, fixed, axis, cls, feat) => {
  // rectangle in the plane where `axis` ('x' or 'z') is fixed; x0/x1 run along the other axis
  const P = (u, v) => (axis === 'x' ? [fixed, v, u] : [u, v, fixed]);
  poly([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1), P(x0, y0)], cls, feat);
};

function building(side, z0, z1) {
  const front = side * range(6, 8);
  const back = side * range(13, 20);
  const h = range(6, 14);
  const [xa, xb] = [front, back];
  // box outline = structure
  const c = (x, y, z) => [x, y, z];
  const quad = (y) => [c(xa, y, z0), c(xb, y, z0), c(xb, y, z1), c(xa, y, z1), c(xa, y, z0)];
  poly(quad(0), STRUCTURE, BUILDING);
  poly(quad(h), STRUCTURE, BUILDING);
  for (const [x, z] of [[xa, z0], [xb, z0], [xb, z1], [xa, z1]]) seg(c(x, 0, z), c(x, h, z), STRUCTURE, BUILDING);
  // storey lines
  const floorH = 3.2;
  for (let y = floorH; y < h - 0.5; y += floorH) seg(c(xa, y, z0), c(xa, y, z1), STRUCTURE, BUILDING);
  // windows on the street face (x = front), z runs z0 -> z1 (z1 < z0)
  const span = z0 - z1;
  const bay = 1.4;
  const cols = Math.floor(span / bay);
  const zStart = z0 - (span - cols * bay) / 2;
  for (let r = 0; r * floorH + 1 < h - 1.5; r++) {
    const yb = r * floorH + (r === 0 ? 1.0 : 0.9);
    const yt = yb + (r === 0 ? 2.0 : 1.6);
    for (let k = 0; k < cols; k++) {
      const zc = zStart - (k + 0.5) * bay;
      const w = 0.5;
      rect(zc + w, yb, zc - w, yt, xa, 'x', DETAIL, BUILDING); // zc+w > zc-w : still fine
      rect(zc + w - 0.08, yb + 0.08, zc - w + 0.08, yt - 0.08, xa, 'x', DETAIL, BUILDING);
      seg([xa, yb, zc], [xa, yt, zc], DETAIL, BUILDING); // mullion
      const ym = (yb + yt) / 2;
      seg([xa, ym, zc + w], [xa, ym, zc - w], DETAIL, BUILDING); // transom
      // grille bars
      for (let g = 0; g < 9; g++) {
        const zz = zc + w - 0.1 - g * ((2 * w - 0.2) / 8);
        seg([xa, yb + 0.08, zz], [xa, yt - 0.08, zz], FINE, BUILDING);
      }
      // sill
      seg([xa, yb - 0.08, zc + w + 0.1], [xa, yb - 0.08, zc - w - 0.1], DETAIL, BUILDING);
    }
  }
  // masonry / clapboard hatch, short broken courses (fine)
  for (let y = 0.15; y < h; y += 0.075) {
    for (let z = z0 - range(0, 0.5); z > z1 + 0.3; z -= range(0.5, 0.9)) {
      const zz = Math.max(z - range(0.4, 0.8), z1);
      seg([xa, y, z], [xa, y + range(-0.01, 0.01), zz], FINE, BUILDING);
    }
  }
  // side wall faces toward the street gaps: sparse courses
  for (const zf of [z0, z1]) {
    for (let y = 0.3; y < h; y += 0.4) seg([xa, y, zf], [xb, y, zf], FINE, BUILDING);
  }
  // shopfront grille on the ground floor between windows
  for (let z = z0 - 0.3; z > z1 + 0.3; z -= 0.12) seg([xa, 0.05, z], [xa, 0.9, z], FINE, BUILDING);
}

// buildings both sides, z 0 -> -130
const NB = 7;
for (const side of [-1, 1]) {
  const len = 130 / NB;
  for (let i = 0; i < NB; i++) building(side, -i * len - 0.3, -(i + 1) * len + 0.3);
}

// road: kerbs, walkway edges, centre dashes, joints
for (let z = 10; z > -130; z -= 2) {
  for (const s of [-1, 1]) {
    seg([s * 3.5, 0, z], [s * 3.5, 0, z - 2], STRUCTURE, GENERAL);
    seg([s * 3.5, 0.12, z], [s * 3.5, 0.12, z - 2], DETAIL, GENERAL);
    seg([s * 5.5, 0.12, z], [s * 5.5, 0.12, z - 2], DETAIL, GENERAL);
  }
}
for (let z = 10; z > -130; z -= 6) seg([0, 0, z], [0, 0, z - 3], DETAIL, GENERAL);
for (let z = 10; z > -130; z -= 1.5) {
  for (const s of [-1, 1]) {
    seg([s * 3.5, 0.12, z], [s * 5.5, 0.12, z], FINE, GENERAL);
    seg([s * 5.5, 0, z], [s * 6.5, 0, z], FINE, GENERAL);
  }
}

// poles + wires
const poles = [[-4.6, -18], [4.6, -52], [-4.6, -92]];
for (const [x, z] of poles) {
  for (let y = 0; y < 8.5; y += 1) seg([x, y, z], [x, y + 1 > 8.5 ? 8.5 : y + 1, z], STRUCTURE, GENERAL);
  seg([x - 1.2, 8, z], [x + 1.2, 8, z], STRUCTURE, GENERAL);
  seg([x - 1.0, 7.4, z], [x + 1.0, 7.4, z], DETAIL, GENERAL);
}
const catenary = (a, b, sag, n = 40) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  return pts;
};
const stops = [[0, 10], ...poles.map(([x, z]) => [x, z]), [0, -130]];
for (let i = 0; i < stops.length - 1; i++) {
  for (const dy of [-0.6, 0, 0.6]) {
    const [ax, az] = stops[i];
    const [bx, bz] = stops[i + 1];
    poly(catenary([ax + dy, 8 + dy * 0.2, az], [bx + dy, 8 + dy * 0.2, bz], 0.9 + Math.abs(dy)), FINE, WIRE);
  }
}
// cross-street wires
for (const [x, z] of poles) {
  for (let k = 0; k < 3; k++) poly(catenary([x, 7.4 + k * 0.2, z], [-x * 1.4, 7 + k * 0.3, z - 2 + k], 0.7), FINE, WIRE);
}

// ---- encode ----
const n = segs.length;
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (const s of segs) {
  for (let i = 0; i < 6; i++) {
    min[i % 3] = Math.min(min[i % 3], s[i]);
    max[i % 3] = Math.max(max[i % 3], s[i]);
  }
}
const STRIDE = 14;
const buf = Buffer.alloc(n * STRIDE);
const q = (v, i) => Math.round(((v - min[i]) / (max[i] - min[i])) * 65535) - 32768;
segs.forEach((s, k) => {
  const o = k * STRIDE;
  for (let i = 0; i < 6; i++) buf.writeInt16LE(q(s[i], i % 3), o + i * 2);
  buf.writeUInt8(s[6], o + 12);
  buf.writeUInt8(s[7], o + 13);
});

const camera = { fov: 58, frames: [] };
for (let i = 0; i < 20; i++) {
  const z = (-40 * i) / 19;
  camera.frames.push({ pos: [-1.2, 1.75, +z.toFixed(3)], target: [-1.2, 1.6, +(z - 60).toFixed(3)] });
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'lines.bin'), buf);
writeFileSync(
  join(outDir, 'lines.json'),
  JSON.stringify({ version: 1, count: n, min, max, stride: STRIDE, classes: CLASSES, features: FEATURES }, null, 2) + '\n'
);
writeFileSync(join(outDir, 'camera.json'), JSON.stringify(camera, null, 2) + '\n');
const per = CLASSES.map((c, i) => `${c}=${segs.filter((s) => s[6] === i).length}`).join(' ');
console.log(`spike-synth: ${n} segments (${per}), ${buf.length} bytes -> ${outDir}`);
