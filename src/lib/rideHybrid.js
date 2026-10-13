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

// An almond (umbrella) tree crown: three flat-ish horizontal tiers of foliage stepping in and up,
// each tier a ring of leaf clumps (squashed balls) around a centre clump, so the contour is
// scalloped from every side. The ink pass draws the outer contour and, where a clump stands in
// front of another, a short interior stroke suggesting a leaf cluster. Unit-sized: tiers span
// x, z in [-1, 1] (x = across the road, z = along it), bottom tier at y = 0, top near 1.
export function canopyGeometry(THREE, mergeGeometries, seed) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const parts = [];
  const clump = (x, y, z, rx, ry, rz) => {
    const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const vy = p.getY(i); p.setXYZ(i, x + p.getX(i) * rx, y + vy * ry * (vy > 0 ? 1 : 0.6), z + p.getZ(i) * rz); }
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    parts.push(g);
  };
  const tier = (y, R, T) => {
    clump((rnd() - 0.5) * 0.1, y + T * 0.15, (rnd() - 0.5) * 0.1, R * 0.62, T, R * 0.62);
    const n = 6 + Math.floor(rnd() * 3), a0 = rnd() * 6.28;
    for (let i = 0; i < n; i++) { const a = a0 + i / n * Math.PI * 2 + (rnd() - 0.5) * 0.4, d = R * (0.62 + rnd() * 0.12), c = R * (0.3 + rnd() * 0.1);
      clump(Math.cos(a) * d, y + (rnd() - 0.5) * T * 0.5, Math.sin(a) * d, c, T * (0.75 + rnd() * 0.3), c); }
  };
  tier(0, 0.92, 0.22);
  tier(0.5, 0.72, 0.2);
  tier(0.9, 0.46, 0.2);
  const g = mergeGeometries(parts, false);
  parts.forEach(x => x.dispose());
  return g;
}
