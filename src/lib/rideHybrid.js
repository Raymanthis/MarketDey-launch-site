// Helpers for the ?ride=hybrid street (LandmarksJourneySection): the procedural line art drawn
// with fat, anti-aliased, fog-faded lines, and line-art tree canopies outlined by the ink pass.
// Pure functions; three and the line classes are passed in (the section imports three lazily).

// Remove zero-length and coincident segments (either direction, 2 mm grid). `taken` collects
// keys across calls, so a segment already drawn by a heavier weight is not drawn again lighter.
export function dedupeSegments(arr, taken) {
  const out = [], q = v => Math.round(v * 500);
  for (let i = 0; i < arr.length; i += 6) {
    const a = q(arr[i]) + ',' + q(arr[i + 1]) + ',' + q(arr[i + 2]), b = q(arr[i + 3]) + ',' + q(arr[i + 4]) + ',' + q(arr[i + 5]);
    if (a === b) continue;
    const k = a < b ? a + '|' + b : b + '|' + a;
    if (taken.has(k)) continue;
    taken.add(k);
    for (let j = 0; j < 6; j++) out.push(arr[i + j]);
  }
  return new Float32Array(out);
}

// LineMaterial with three's fog applied before the sRGB conversion (the stock shader mixes the
// linear fog colour into display values, which greys distant lines instead of fading them to paper).
export function fatLineMaterial(THREE, LineMaterial, color, widthCss, opacity) {
  const m = new LineMaterial({ color, linewidth: widthCss, worldUnits: false, alphaToCoverage: true, transparent: false, fog: true, opacity });
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', '').replace('#include <tonemapping_fragment>', '#include <fog_fragment>\n#include <tonemapping_fragment>');
  };
  return m;
}

export function fatLines(THREE, mods, positions, material) {
  const g = new mods.LineSegmentsGeometry(); g.setPositions(positions);
  const l = new mods.LineSegments2(g, material); l.frustumCulled = false;
  return l;
}

// A canopy: a cluster of jittered puffs (low icospheres pushed in and out by smooth noise), so
// the ink pass draws an organic scalloped outline with a few interior strokes where puffs overlap.
// Unit-sized around (0, 0, 0); the section scales and places it per tree.
export function canopyGeometry(THREE, mergeGeometries, seed) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const parts = [], n = 6 + Math.floor(rnd() * 3);
  const puff = (x, y, z, r) => {
    const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position, ph = rnd() * 6.28, ph2 = rnd() * 6.28;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), a = Math.atan2(vz, vx);
      const k = 1 + 0.06 * Math.sin(a * 3 + ph) + 0.04 * Math.sin(vy * 4 + ph2) - (vy < -0.3 ? 0.22 * (-vy - 0.3) : 0);
      p.setXYZ(i, x + vx * r * k, y + vy * r * 0.78 * k, z + vz * r * k);
    }
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    parts.push(g);
  };
  puff(0, 0.2, 0, 0.55);
  for (let i = 0; i < n + 2; i++) { // lower ring: scalloped outline
    const a = i / (n + 2) * Math.PI * 2 + rnd() * 0.4, d = 0.52 + rnd() * 0.14, r = 0.3 + rnd() * 0.13;
    puff(Math.cos(a) * d, -0.08 + rnd() * 0.18, Math.sin(a) * d, r);
  }
  for (let i = 0; i < 3; i++) { // crown
    const a = i / 3 * Math.PI * 2 + rnd(), d = 0.2 + rnd() * 0.15, r = 0.3 + rnd() * 0.1;
    puff(Math.cos(a) * d, 0.48 + rnd() * 0.12, Math.sin(a) * d, r);
  }
  const g = mergeGeometries(parts, false);
  parts.forEach(x => x.dispose());
  return g;
}
