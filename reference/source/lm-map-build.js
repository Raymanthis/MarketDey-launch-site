// Mirrors the flat-map geometry of "Landmarks Journey Section" (same seed, same code) so the Try-it map hands off without a seam.
window.LM_MAP_BUILD = function () {
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    // road centreline: straight, LEFT, straight, RIGHT, straight, LEFT, straight
    const DS = 0.5, S0 = -420, PX = [0], PZ = [0], PT = [0];
    { let x = 0, z = 0, th = 0; for (const [len, deg] of [[100, 0], [22, 90], [110, 0], [22, -90], [126, 0], [95, 0], [30, -55], [30, 0], [34, 70], [25, 0], [26, -50], [210, 0]]) { const n = Math.round(len / DS), k = deg * Math.PI / 180 / n; for (let i = 0; i < n; i++) { th += k / 2; x += Math.sin(th) * DS; z -= Math.cos(th) * DS; th += k / 2; PX.push(x); PZ.push(z); PT.push(th); } } }
    const SMAX = S0 + (PX.length - 1) * DS;
    const fr = s => { const f = Math.min(Math.max((s - S0) / DS, 0), PX.length - 1.001), i = Math.floor(f), u = f - i; return [PX[i] + (PX[i + 1] - PX[i]) * u, PZ[i] + (PZ[i + 1] - PZ[i]) * u, PT[i] + (PT[i + 1] - PT[i]) * u]; };
    const W = (s, lat) => { const [x, z, t] = fr(s); return [x + Math.cos(t) * lat, z + Math.sin(t) * lat]; };
    let TX = 0, TZ = 0, TC = 1, TS = 0, TR = 0;
    const setT = (s, lat) => { const [x, z, t] = fr(s); TC = Math.cos(t); TS = Math.sin(t); TR = t; TX = x + TC * lat; TZ = z + TS * lat; };
    const setW = () => { TX = 0; TZ = 0; TC = 1; TS = 0; TR = 0; };
    const SEG = { ink: [], fine: [], green: [] };
    let NOL = false; const seg = (k, x1, y1, z1, x2, y2, z2) => NOL || SEG[k].push(TX + x1 * TC - z1 * TS, y1, TZ + x1 * TS + z1 * TC, TX + x2 * TC - z2 * TS, y2, TZ + x2 * TS + z2 * TC);
    const poly = (k, p) => { for (let i = 0; i < p.length - 1; i++) seg(k, p[i][0], p[i][1], p[i][2], p[i + 1][0], p[i + 1][1], p[i + 1][2]); };
    const FILL = { box: [], pr: [], cyl: [], cone: [], cone4: [], sph: [] };
    const fill = (k, x, y, z, sx, sy, sz, r) => FILL[k].push([TX + x * TC - z * TS, y, TZ + x * TS + z * TC, sx, sy, sz, -TR + (r || 0)]);
    const boxE = (k, x, y, z, w, hh, d) => { const A = x - w / 2, B = x + w / 2, C = y + hh, E = z - d / 2, F = z + d / 2;
      seg(k,A,y,E,B,y,E); seg(k,A,C,E,B,C,E); seg(k,A,y,F,B,y,F); seg(k,A,C,F,B,C,F); seg(k,A,y,E,A,y,F); seg(k,B,y,E,B,y,F);
      seg(k,A,C,E,A,C,F); seg(k,B,C,E,B,C,F); seg(k,A,y,E,A,C,E); seg(k,B,y,E,B,C,E); seg(k,A,y,F,A,C,F); seg(k,B,y,F,B,C,F); };
    const solid = (k, x, y, z, w, hh, d) => { fill('box', x, y + hh / 2, z, w, hh, d); boxE(k, x, y, z, w, hh, d); };
    const rectX = (k, x, z0, z1, y0, y1) => poly(k, [[x,y0,z0],[x,y0,z1],[x,y1,z1],[x,y1,z0],[x,y0,z0]]);
    const rectZ = (k, z, x0, x1, y0, y1) => poly(k, [[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z],[x0,y0,z]]);
    const rectY = (k, y, x0, x1, z0, z1) => poly(k, [[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1],[x0,y,z0]]);
    const ring = (k, cx, y, cz, r, n) => { const p = []; for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2; p.push([cx + Math.cos(t) * r, y, cz + Math.sin(t) * r]); } poly(k, p); };
    const circX = (k, x, cy, cz, r, n) => { const p = []; for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2; p.push([x, cy + Math.sin(t) * r, cz + Math.cos(t) * r]); } poly(k, p); };
    const archX = (k, x, zc, y0, w, hh) => { const r = w / 2, p = [[x, y0 + hh - r, zc - r], [x, y0, zc - r], [x, y0, zc + r]]; for (let i = 0; i <= 8; i++) { const t = i / 8 * Math.PI; p.push([x, y0 + hh - r + Math.sin(t) * r, zc + Math.cos(t) * r]); } poly(k, p); };
    const archZ = (k, z, xc, y0, w, hh) => { const r = w / 2, p = [[xc - r, y0 + hh - r, z], [xc - r, y0, z], [xc + r, y0, z]]; for (let i = 0; i <= 8; i++) { const t = i / 8 * Math.PI; p.push([xc + Math.cos(t) * r, y0 + hh - r + Math.sin(t) * r, z]); } poly(k, p); };
    const tankE = (k, cx, y, cz, r, hh, ribs) => { fill('cyl', cx, y + hh / 2, cz, r, hh, r); const R = r * 1.01;
      ring(k, cx, y, cz, R, 20); ring(k, cx, y + hh, cz, R, 20); ring('fine', cx, y + hh * 0.33, cz, R, 20); ring('fine', cx, y + hh * 0.66, cz, R, 20);
      for (let i = 0; i < ribs; i++) { const t = i / ribs * Math.PI * 2; seg('fine', cx + Math.cos(t) * R, y, cz + Math.sin(t) * R, cx + Math.cos(t) * R, y + hh, cz + Math.sin(t) * R); } };
    const ptank = (x, y, z) => { tankE('ink', x, y, z, 0.68, 1.3, 8); ring('ink', x, y + 1.42, z, 0.5, 14); ring('ink', x, y + 1.52, z, 0.22, 10); seg('fine', x - 0.5, y + 1.42, z, x - 0.68, y + 1.3, z); seg('fine', x + 0.5, y + 1.42, z, x + 0.68, y + 1.3, z); };
    const wire = (k, A, B, sag) => { const p = []; for (let i = 0; i <= 14; i++) { const t = i / 14; p.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t]); } poly(k, p); };
    const W3 = (s, lat, y) => { const [x, z] = W(s, lat); return [x, y, z]; };
    // footprints keep things out of each other and off the road
    const FOOT = [];
    const quad = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => [TX + x * TC - z * TS, TZ + x * TS + z * TC]);
    const sep = (A, B) => { for (const Q of [A, B]) for (let i = 0; i < 4; i++) { const p = Q[i], q = Q[(i + 1) % 4], nx = q[1] - p[1], nz = p[0] - q[0]; let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const v of A) { const d = v[0] * nx + v[1] * nz; if (d < a0) a0 = d; if (d > a1) a1 = d; } for (const v of B) { const d = v[0] * nx + v[1] * nz; if (d < b0) b0 = d; if (d > b1) b1 = d; } if (a1 < b0 || b1 < a0) return true; } return false; };
    const roadD = (x, z) => { let m = 1e9; for (let i = 0; i < PX.length; i += 2) { const dx = PX[i] - x, dz = PZ[i] - z, d = dx * dx + dz * dz; if (d < m) m = d; } return Math.sqrt(m); };
    const ok = (q, rd) => { if (rd > 0) { for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; if (roadD(a[0], a[1]) < rd || roadD((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) < rd) return false; } } return FOOT.every(f => sep(q, f)); };
    const okPt = (lat, r) => ok(quad(lat - r, lat + r, -r, r), 0);
    // Nigerian facade vocabulary: louvre (naco) windows with burglar bars, painted signboards, shutters, zinc roofs
    const louvX = (fx, sd, zc, y0, w, hh, det) => { const xo = fx - sd * 0.03, z0 = zc - w / 2, z1 = zc + w / 2; rectX('ink', xo, z0, z1, y0, y0 + hh);
      if (det) { for (let y = y0 + 0.17; y < y0 + hh - 0.06; y += 0.17) seg('fine', xo, y, z0, xo, y, z1); for (let i = 1; i < 4; i++) seg('ink', xo - sd * 0.05, y0, z0 + w * i / 4, xo - sd * 0.05, y0 + hh, z0 + w * i / 4); seg('ink', xo - sd * 0.05, y0 + hh / 2, z0, xo - sd * 0.05, y0 + hh / 2, z1); }
      else seg('fine', xo, y0 + hh / 2, z0, xo, y0 + hh / 2, z1);
      seg('ink', fx - sd * 0.12, y0 + hh + 0.14, z0 - 0.14, fx - sd * 0.12, y0 + hh + 0.14, z1 + 0.14); };
    const louvZ = (zf, xc, y0, w, hh, det) => { const zo = zf + 0.03, A = xc - w / 2, B = xc + w / 2; rectZ('ink', zo, A, B, y0, y0 + hh);
      if (det) { for (let y = y0 + 0.17; y < y0 + hh - 0.06; y += 0.17) seg('fine', A, y, zo, B, y, zo); for (let i = 1; i < 4; i++) seg('ink', A + w * i / 4, y0, zo + 0.05, A + w * i / 4, y0 + hh, zo + 0.05); }
      seg('ink', A - 0.14, y0 + hh + 0.14, zf + 0.1, B + 0.14, y0 + hh + 0.14, zf + 0.1); };
    const doorX = (fx, sd, zc, y0, w, hh) => { const xo = fx - sd * 0.03; rectX('ink', xo, zc - w / 2, zc + w / 2, y0, y0 + hh); rectX('fine', xo, zc - w / 2 + 0.12, zc + w / 2 - 0.12, y0 + 0.15, y0 + hh * 0.48); rectX('fine', xo, zc - w / 2 + 0.12, zc + w / 2 - 0.12, y0 + hh * 0.55, y0 + hh - 0.12); };
    const shutterX = (x, sd, zc, w, hh) => { const xo = x - sd * 0.03, z0 = zc - w / 2, z1 = zc + w / 2; rectX('ink', xo, z0, z1, 0.18, hh); for (let y = 0.42; y < hh - 0.05; y += 0.2) seg('fine', xo, y, z0, xo, y, z1); seg('ink', x - sd * 0.1, hh + 0.12, z0 - 0.1, x - sd * 0.1, hh + 0.12, z1 + 0.1); };
    const signX = (fx, sd, zc, w, y0, y1) => { rectX('ink', fx - sd * 0.07, zc - w / 2, zc + w / 2, y0, y1); rectX('fine', fx - sd * 0.08, zc - w / 2 + 0.1, zc + w / 2 - 0.1, y0 + 0.08, y1 - 0.08); };
    const leanTo = (fx, sd, z0, z1, yTop, depth, drop, det) => { const xo = fx - sd * depth, yo = yTop - drop;
      seg('ink', fx, yTop, z0, fx, yTop, z1); seg('ink', xo, yo, z0, xo, yo, z1); seg('ink', xo, yo - 0.12, z0, xo, yo - 0.12, z1); seg('ink', fx, yTop, z0, xo, yo, z0); seg('ink', fx, yTop, z1, xo, yo, z1);
      for (let z = z0 + 0.36; z < z1 - 0.05; z += det ? 0.36 : 0.9) seg('fine', fx, yTop, z, xo, yo, z);
      const np = Math.max(2, Math.round((z1 - z0) / 2.6)); for (let i = 0; i <= np; i++) { const z = z0 + 0.15 + (z1 - z0 - 0.3) * i / np; seg('ink', xo + sd * 0.08, 0, z, xo + sd * 0.08, yo - 0.12, z); seg('fine', xo + sd * 0.16, 0, z, xo + sd * 0.16, yo - 0.12, z); } };
    const zincRoof = (xa, xb, y, z0, z1, rise, sd, det) => { const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), xm = (x0 + x1) / 2, yr = y + rise, xe = sd > 0 ? x0 : x1;
      fill('pr', xm, y, (z0 + z1) / 2, x1 - x0, rise, z1 - z0);
      seg('ink', x0, y, z0, x0, y, z1); seg('ink', x1, y, z0, x1, y, z1); seg('ink', xm, yr, z0, xm, yr, z1);
      poly('ink', [[x0, y, z1], [xm, yr, z1], [x1, y, z1]]); poly('ink', [[x0, y, z0], [xm, yr, z0], [x1, y, z0]]);
      seg('fine', xe, y - 0.2, z0, xe, y - 0.2, z1); seg('fine', xe, y - 0.2, z1, xe, y, z1);
      const st = det ? 0.36 : 0.9; for (let z = z0 + st; z < z1 - 0.05; z += st) seg('fine', xe, y, z, xm, yr, z);
      poly('fine', [[x0 + 0.25, y + 0.05, z1 + 0.03], [xm, yr - 0.22, z1 + 0.03], [x1 - 0.25, y + 0.05, z1 + 0.03]]);
      if (det) { seg('fine', (xe + xm) / 2, (y + yr) / 2, z0, (xe + xm) / 2, (y + yr) / 2, z1); for (let i = 0; i < 2; i++) if (rnd() < 0.6) { const t = 0.3 + rnd() * 0.5, zz = z0 + 1 + rnd() * (z1 - z0 - 2); solid('ink', xe + (xm - xe) * t, y + rise * t - 0.05, zz, 0.4, 0.22, 0.4); } } };
    const dish = (x, y, z, sd) => { const p = []; for (let i = 0; i <= 16; i++) { const t = i / 16 * Math.PI * 2; p.push([x - sd * 0.18 * (1 + Math.sin(t)), y + Math.sin(t) * 0.5, z + Math.cos(t) * 0.5]); } poly('ink', p); seg('ink', x, y - 0.5, z, x, y - 1.3, z); seg('fine', x, y - 0.45, z, x - sd * 0.8, y - 0.1, z); };
    const bungalow = (sd, xn, w, len, det) => { const X = d => sd * (xn + d), fx = sd * xn, z0 = -len / 2, z1 = len / 2, wh = 1.9, gw = 3, zg = (rnd() - 0.5) * (len - gw - 2) * 0.6;
      const wall = (za, zb) => { if (zb - za < 0.3) return; solid('ink', X(0.13), 0, (za + zb) / 2, 0.26, wh, zb - za); seg('fine', fx - sd * 0.01, wh - 0.2, za, fx - sd * 0.01, wh - 0.2, zb); };
      wall(z0, zg - gw / 2); wall(zg + gw / 2, z1); solid('ink', X(w / 2), 0, z1 - 0.13, w - 0.5, wh, 0.26);
      [z0 + 0.25, zg - gw / 2 - 0.25, zg + gw / 2 + 0.25, z1 - 0.25].forEach(z => { solid('ink', X(0.13), 0, z, 0.5, wh + 0.3, 0.5); solid('ink', X(0.13), wh + 0.3, z, 0.62, 0.12, 0.62); });
      const gx = fx + sd * 0.1; fill('box', gx, 0.55, zg, 0.06, 0.9, gw);
      rectX('ink', gx, zg - gw / 2, zg, 0.1, 2.05); rectX('ink', gx, zg, zg + gw / 2, 0.1, 2.05); seg('ink', gx, 1.0, zg - gw / 2, gx, 1.0, zg + gw / 2);
      if (det) { for (let z = zg - gw / 2 + 0.2; z < zg + gw / 2 - 0.1; z += 0.2) seg('fine', gx, 1.0, z, gx, 2.05, z); const sp = []; let j = 0; for (let z = zg - gw / 2; z <= zg + gw / 2 + 0.01; z += 0.2) sp.push([gx, 2.05 + (j++ % 2 ? 0.22 : 0), z]); poly('ink', sp); rectX('fine', gx, zg - gw / 2 + 0.2, zg - 0.2, 0.25, 0.85); rectX('fine', gx, zg + 0.2, zg + gw / 2 - 0.2, 0.25, 0.85); }
      const hf = 4.4, H = 3.3, za = z0 + 0.7, zb = z1 - 0.7;
      solid('ink', X((hf + w - 0.3) / 2), 0, 0, w - hf - 0.3, H, zb - za);
      solid('ink', X((2.8 + hf) / 2), 0, 0, hf - 2.8, 0.45, zb - za);
      const np = Math.max(2, Math.round((zb - za) / 2.8)); for (let i = 0; i <= np; i++) solid('ink', X(3.0), 0.45, za + 0.2 + (zb - za - 0.4) * i / np, 0.3, H - 0.45, 0.3);
      for (let i = 0; i < np; i++) { const zm = za + 0.2 + (zb - za - 0.4) * (i + 0.5) / np; if (i === Math.floor(np / 2)) doorX(X(hf), sd, zm, 0.45, 1.0, 2.2); else louvX(X(hf), sd, zm, 1.1, 1.3, 1.4, det); }
      louvZ(zb, X((hf + w) / 2), 1.1, 1.3, 1.4, det);
      zincRoof(X(2.5), X(w), H, za - 0.4, zb + 0.4, 1.6, sd, det);
      if (rnd() < 0.4) { const tx = X(w - 1.2), tz = za + 1.2; [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].forEach(([p, q]) => seg('ink', tx + p, 0, tz + q, tx + p, H + 1.9, tz + q)); seg('fine', tx - 0.5, 0.5, tz + 0.5, tx + 0.5, H + 1.4, tz + 0.5); solid('ink', tx, H + 1.9, tz, 1.3, 0.12, 1.3); ptank(tx, H + 2.02, tz); }
      else if (det && rnd() < 0.4) dish(X(w - 0.8), H + 1.4, zb - 1.4, sd); };
    const storey = (sd, xn, w, len, fl, det) => { const H = fl * 3, fx = sd * xn, xo = fx - sd * 0.03, X = d => sd * (xn + d), z0 = -len / 2, z1 = len / 2, open = rnd() < 0.4;
      solid('ink', X(w / 2), 0, 0, w, H, len);
      const bays = Math.max(2, Math.round(len / 3.3)), bw = len / bays, bal = rnd() < 0.6, eb = Math.max(1, Math.floor(w / 3));
      for (let i = 1; i < bays; i++) { const z = z0 + bw * i; seg('fine', xo, 0, z - 0.17, xo, H, z - 0.17); seg('fine', xo, 0, z + 0.17, xo, H, z + 0.17); }
      for (let f = 1; f <= fl; f++) { const y = f * 3; seg('ink', xo, y, z0, xo, y, z1); seg('fine', xo, y - 0.25, z0, xo, y - 0.25, z1); seg('ink', X(0), y, z1 + 0.03, X(w), y, z1 + 0.03); seg('fine', X(0), y - 0.25, z1 + 0.03, X(w), y - 0.25, z1 + 0.03); }
      for (let f = 1; f < fl; f++) { const y = f * 3;
        if (bal) { const bd = 1.25, xb = fx - sd * bd; solid('ink', fx - sd * bd / 2, y - 0.2, 0, bd, 0.2, len);
          if (det) { seg('ink', xb, y + 1.0, z0, xb, y + 1.0, z1); seg('fine', xb, y + 0.88, z0, xb, y + 0.88, z1); seg('fine', xb, y + 0.14, z0, xb, y + 0.14, z1); for (let z = z0 + 0.3; z < z1 - 0.1; z += 0.3) seg('fine', xb, y, z, xb, y + 0.88, z);
            [z0, z1].forEach(z => { seg('ink', xb, y + 1, z, fx, y + 1, z); seg('ink', xb, y, z, xb, y + 1, z); for (let q = 0.3; q < bd - 0.05; q += 0.3) seg('fine', xb + sd * q, y, z, xb + sd * q, y + 0.88, z); });
            if (rnd() < 0.4) { const zl = z0 + 0.6, zr = z1 - 0.6, yl = y + 2.2, xl = xb + sd * 0.25, p = []; for (let i = 0; i <= 10; i++) { const t = i / 10; p.push([xl, yl - 1.2 * t * (1 - t), zl + (zr - zl) * t]); } poly('fine', p); for (let i = 0; i < 4; i++) { const t = 0.12 + rnd() * 0.76, zz = zl + (zr - zl) * t, yy = yl - 1.2 * t * (1 - t), cw = 0.4 + rnd() * 0.3; rectX('fine', xl, zz - cw / 2, zz + cw / 2, yy - 0.5 - rnd() * 0.3, yy); } } }
          else rectX('fine', xb, z0, z1, y, y + 1.0); }
        for (let i = 0; i < bays; i++) { const z = z0 + bw * (i + 0.5); if (bal && det && i % 3 === 1) doorX(fx, sd, z, y, 0.95, 2.2); else louvX(fx, sd, z, y + 0.85, Math.min(1.5, bw * 0.48), 1.45, det); }
        for (let i = 0; i < eb; i++) louvZ(z1, X(w * (i + 0.5) / eb), y + 0.85, 1.2, 1.4, det); }
      const shops = Math.max(1, Math.round(len / 3.1)), sw = len / shops;
      for (let i = 0; i < shops; i++) { const z = z0 + sw * (i + 0.5); if (rnd() < 0.7) shutterX(fx, sd, z, sw * 0.76, 2.25); else { doorX(fx, sd, z - sw * 0.2, 0, 0.95, 2.2); louvX(fx, sd, z + sw * 0.22, 0.9, Math.min(1.2, sw * 0.3), 1.25, det); } if (det) signX(fx, sd, z, sw * (0.6 + rnd() * 0.3), 2.42, 2.92); }
      if (!bal && det && rnd() < 0.7) leanTo(fx, sd, z0 + 0.2, z1 - 0.2, 2.35, 1.7, 0.4, det);
      if (open) { for (let i = 0; i <= bays; i++) { const z = z0 + bw * i + (i === 0 ? 0.25 : i === bays ? -0.25 : 0); [0.25, w - 0.25].forEach(q => { solid('ink', X(q), H, z, 0.35, 0.7, 0.35); for (const [a, b] of [[-0.08, -0.08], [0.08, -0.08], [0.08, 0.08], [-0.08, 0.08]]) seg('ink', X(q) + a, H + 0.7, z + b, X(q) + a * 2.2, H + 1.9, z + b * 2.2); }); } }
      else { fill('box', X(w / 2), H + 0.45, 0, w, 0.9, len); boxE('ink', X(w / 2), H, 0, w, 0.9, len); rectY('fine', H + 0.9, X(0.22), X(w - 0.22), z0 + 0.22, z1 - 0.22); seg('fine', xo, H + 0.72, z0, xo, H + 0.72, z1); }
      const ry = open ? H : H + 0.9;
      if (rnd() < 0.6) { const tx = X(w * (0.35 + rnd() * 0.3)), tz = (rnd() - 0.5) * (len - 3); solid('ink', tx, ry, tz, 1.6, 0.35, 1.6); ptank(tx, ry + 0.35, tz); }
      if (det && rnd() < 0.35) dish(X(w * 0.8), ry + 1.3, z1 - 1.2, sd); };
    const shopRow = (sd, xn, len, det) => { const d = 4.2, H = 3.0, fx = sd * (xn + 1.9), X = q => sd * (xn + q), z0 = -len / 2, z1 = len / 2;
      solid('ink', X(1.9 + d / 2), 0, 0, d, H, len); solid('ink', X(2.0), H, 0, 0.2, 0.9, len); rectY('fine', H + 0.02, X(2.2), X(1.9 + d - 0.1), z0 + 0.15, z1 - 0.15);
      const n = Math.max(2, Math.round(len / 2.8)), sw = len / n;
      for (let i = 0; i < n; i++) { const z = z0 + sw * (i + 0.5); shutterX(fx, sd, z, sw * 0.8, 2.3); seg('ink', fx - sd * 0.03, 0, z0 + sw * i, fx - sd * 0.03, H, z0 + sw * i);
        if (det) { signX(fx, sd, z, sw * 0.86, H + 0.1, H + 0.8); if (rnd() < 0.55) solid('ink', X(1.9 - 0.6 - rnd() * 0.5), 0, z + (rnd() - 0.5) * sw * 0.4, 0.7, 0.45 + rnd() * 0.4, 0.7); } }
      leanTo(fx, sd, z0 + 0.1, z1 - 0.1, 2.75, 1.8, 0.45, det); };
    const container = (sd, xn, len, det) => { const w = 2.45, hh = 2.6, X = q => sd * (xn + q), fx = sd * xn, xo = fx - sd * 0.03, z0 = -len / 2, z1 = len / 2;
      solid('ink', X(w / 2), 0.2, 0, w, hh, len); [z0 + 0.4, z1 - 0.4].forEach(z => solid('ink', X(w / 2), 0, z, w - 0.2, 0.2, 0.4));
      for (let z = z0 + 0.25; z < z1 - 0.1; z += 0.25) { if (Math.abs(z) < 1.45) continue; seg('fine', xo, 0.3, z, xo, hh + 0.1, z); }
      rectX('ink', xo, -1.4, 1.4, 0.75, 2.4); for (let y = 1.2; y < 2.4; y += 0.45) seg('fine', xo + sd * 0.4, y, -1.35, xo + sd * 0.4, y, 1.35);
      leanTo(fx, sd, -1.7, 1.7, hh + 0.1, 1.4, 0.35, det);
      const ze = z1 + 0.03; rectZ('ink', ze, X(0.1), X(w / 2), 0.3, hh + 0.1); rectZ('ink', ze, X(w / 2), X(w - 0.1), 0.3, hh + 0.1); [0.4, 0.9, 1.55, 2.05].forEach(q => seg('fine', X(q), 0.35, ze + 0.04, X(q), hh + 0.05, ze + 0.04));
      if (det) { [-1.1, 1.1].forEach(z => seg('ink', X(0.3), hh + 0.2, z, X(0.3), hh + 0.4, z)); signX(X(0.3), sd, 0, 2.8, hh + 0.4, hh + 1.1); } };
    const unfinished = (sd, xn, w, len, det) => { const X = q => sd * (xn + q), z0 = -len / 2, nb = Math.max(2, Math.round(len / 3.6));
      for (let i = 0; i <= nb; i++) { const z = z0 + 0.2 + (len - 0.4) * i / nb; [0.2, w / 2, w - 0.2].forEach(q => { solid('ink', X(q), 0, z, 0.3, 3, 0.3); solid('ink', X(q), 3.22, z, 0.3, 0.8, 0.3); for (const [a, b] of [[-0.07, -0.07], [0.07, -0.07], [0.07, 0.07], [-0.07, 0.07]]) seg('ink', X(q) + a, 4.02, z + b, X(q) + a * 2.5, 5.3, z + b * 2.5); }); }
      solid('ink', X(w / 2), 3, 0, w, 0.22, len);
      for (let i = 0; i < nb; i++) { if (rnd() < 0.35) continue; const za = z0 + 0.35 + (len - 0.4) * i / nb, zb = z0 + 0.05 + (len - 0.4) * (i + 1) / nb, hh = 0.8 + rnd() * 1.8; solid('ink', X(0.2), 0, (za + zb) / 2, 0.22, hh, zb - za); if (det) for (let y = 0.23; y < hh; y += 0.23) seg('fine', X(0.2) - sd * 0.12, y, za, X(0.2) - sd * 0.12, y, zb); }
      if (det) { const bz = z0 + (len - 0.4) / nb * 0.5 + 0.2; for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) solid('ink', X(1.3), i * 0.23, bz - 0.46 + j * 0.46 + i * 0.23, 0.45, 0.23, 0.45);
        const sx = X(w * 0.75), sz = z0 + (len - 0.4) / nb * 1.5 + 0.2; fill('cone', sx, 0.5, sz, 1.1, 1.0, 1.1); ring('fine', sx, 0.02, sz, 1.12, 14); for (let i = 0; i < 7; i++) { const t = i / 7 * Math.PI * 2 + 0.3; seg('fine', sx, 1.0, sz, sx + Math.cos(t) * 1.1, 0.02, sz + Math.sin(t) * 1.1); } } };
    const pole = x => { seg('ink', x - 0.1, 0, 0, x - 0.07, 9.3, 0); seg('ink', x + 0.1, 0, 0, x + 0.07, 9.3, 0); solid('ink', x, 8.5, 0, 2.6, 0.16, 0.16); solid('ink', x, 7.7, 0, 1.8, 0.14, 0.14);
      [-1.1, -0.4, 0.4, 1.1].forEach(o => seg('ink', x + o, 8.66, 0, x + o, 8.92, 0)); seg('fine', x - 0.9, 7.84, 0, x, 7.0, 0); seg('fine', x + 0.9, 7.84, 0, x, 7.0, 0);
      if (rnd() < 0.35) { solid('ink', x + 0.45, 5.6, 0, 0.6, 0.9, 0.6); seg('fine', x + 0.45, 6.5, 0, x + 0.4, 8.5, 0); }
      if (rnd() < 0.5) rectX('fine', x - 0.12, -0.25, 0.25, 2.0, 2.7); };
    const tree = x => { const hh = 2.4 + rnd() * 0.8; seg('ink', x - 0.1, 0, 0, x - 0.07, hh, 0); seg('ink', x + 0.1, 0, 0, x + 0.07, hh, 0); ring('fine', x, 0.05, 0, 0.5, 8);
      const r = 1.6 + rnd() * 0.6, cy = hh + r * 0.65; fill('sph', x, cy, 0, r, r * 0.8, r);
      seg('ink', x, hh, 0, x + 0.6, hh + 0.8, 0.2); seg('ink', x, hh, 0, x - 0.5, hh + 0.9, -0.3);
      for (let i = 0; i < 26; i++) { const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, q = Math.sqrt(1 - u * u), px = x + q * Math.cos(t) * r * 1.02, py = cy + u * r * 0.82, pz = q * Math.sin(t) * r * 1.02, d = t + 1.57 + (rnd() - 0.5);
        poly('fine', [[px, py, pz], [px + Math.cos(d) * 0.2, py + 0.12, pz + Math.sin(d) * 0.2], [px + Math.cos(d) * 0.38, py - 0.02, pz + Math.sin(d) * 0.38]]); } };
    const lamp = x => { solid('ink', x, 0, 0, 0.4, 0.5, 0.4); seg('ink', x - 0.06, 0.5, 0, x - 0.06, 6.2, 0); seg('ink', x + 0.06, 0.5, 0, x + 0.06, 6.2, 0); seg('ink', x, 6.2, 0, x - 1.6, 6.5, 0); solid('ink', x - 1.7, 6.3, 0, 0.9, 0.22, 0.4); };
    const car = () => { solid('ink', 0, 0.32, 0, 1.8, 0.62, 4.2); solid('ink', 0, 0.94, 0.25, 1.6, 0.56, 2.2);
      for (const sx of [-1, 1]) { const xf = sx * 0.83; rectX('fine', xf, -0.7, 0.2, 1.02, 1.4); rectX('fine', xf, 0.3, 1.2, 1.02, 1.4); circX('ink', sx * 0.92, 0.34, -1.3, 0.34, 16); circX('ink', sx * 0.92, 0.34, 1.3, 0.34, 16); circX('fine', sx * 0.93, 0.34, -1.3, 0.15, 10); circX('fine', sx * 0.93, 0.34, 1.3, 0.15, 10); }
      rectZ('fine', 1.38, -0.68, 0.68, 1.0, 1.42); rectZ('ink', 2.13, -0.82, -0.5, 0.6, 0.8); rectZ('ink', 2.13, 0.5, 0.82, 0.6, 0.8); };
    const danfo = () => { solid('ink', 0, 0.45, 0.3, 1.9, 1.7, 4.2); solid('ink', 0, 0.45, -2.15, 1.85, 0.75, 0.7);
      for (const sx of [-1, 1]) { const xf = sx * 0.96; for (let i = 0; i < 4; i++) rectX('fine', xf, -1.5 + i * 0.95, -0.75 + i * 0.95, 1.3, 1.95); seg('ink', xf, 1.0, -1.8, xf, 1.0, 2.4); seg('ink', xf, 1.12, -1.8, xf, 1.12, 2.4); circX('ink', sx * 0.97, 0.4, -1.5, 0.4, 16); circX('ink', sx * 0.97, 0.4, 1.5, 0.4, 16); circX('fine', sx * 0.98, 0.4, -1.5, 0.17, 10); circX('fine', sx * 0.98, 0.4, 1.5, 0.17, 10); }
      rectZ('fine', -1.83, -0.8, 0.8, 1.3, 2.0); rectZ('fine', 2.43, -0.8, 0.8, 1.3, 1.95); rectZ('ink', 2.43, -0.85, -0.6, 0.75, 0.95); rectZ('ink', 2.43, 0.6, 0.85, 0.75, 0.95);
      seg('ink', -0.7, 2.35, -1.4, -0.7, 2.35, 2.0); seg('ink', 0.7, 2.35, -1.4, 0.7, 2.35, 2.0); for (let z = -1.4; z <= 2.01; z += 0.85) { seg('ink', -0.7, 2.35, z, 0.7, 2.35, z); seg('fine', -0.7, 2.15, z, -0.7, 2.35, z); seg('fine', 0.7, 2.15, z, 0.7, 2.35, z); }
      solid('ink', 0, 2.35, 0.4, 1.2, 0.35, 1.2); };
    const keke = () => { solid('ink', 0, 0.3, 0.45, 1.3, 0.7, 1.5); solid('ink', 0, 0.3, -0.6, 0.75, 0.6, 0.5);
      [[-0.62, -0.85], [0.62, -0.85], [-0.62, 1.15], [0.62, 1.15]].forEach(([x, z]) => seg('ink', x, 1.0, z, x, 1.9, z));
      solid('ink', 0, 1.9, 0.15, 1.42, 0.12, 2.3); seg('fine', -0.35, 2.02, -0.95, -0.35, 2.02, 1.3); seg('fine', 0.35, 2.02, -0.95, 0.35, 2.02, 1.3);
      rectZ('fine', -0.88, -0.55, 0.55, 1.05, 1.8); seg('fine', -0.66, 0.7, -0.3, -0.66, 0.7, 1.2); seg('fine', 0.66, 0.7, -0.3, 0.66, 0.7, 1.2);
      circX('ink', -0.67, 0.3, 0.75, 0.3, 14); circX('ink', 0.67, 0.3, 0.75, 0.3, 14); circX('ink', 0, 0.28, -1.05, 0.28, 14); circX('fine', -0.68, 0.3, 0.75, 0.12, 8); circX('fine', 0.68, 0.3, 0.75, 0.12, 8); };
    const veh = (s, lat, flip, fn) => { setT(s, lat); if (flip) { TC = -TC; TS = -TS; TR += Math.PI; } fn(); };
    // landmarks, boards and their clearances go in first
    const LS = [40, 100, 160, 215, 245], LSD = [1, -1, 1, -1, -1], SB = [28, 88, 144, 203, 228];
    const MK = [[11, 8, 40], [-12, 15.5, 100], [8, 5.4, 160], [-10.4, 14.5, 209.8], [-6.4, 10.4, 245]];
    [[40, 4.6, 20, -14, 14], [100, -20, -4.6, -9, 9], [160, 4.6, 10, -11, 11], [215, -22, -4.6, -9.5, 9.5], [245, -62, -4.6, -16, 16]].forEach(([s, a, b, c, d]) => { setT(s, 0); FOOT.push(quad(a, b, c, d)); });
    SB.forEach((s, i) => { setT(s, 0); FOOT.push(LSD[i] > 0 ? quad(4.6, 7.4, -2.6, 2.6) : quad(-7.4, -4.6, -2.6, 2.6)); });
    // side streets: same in the map and on the ground
    const SIDES = [[-360, 1], [-270, -1], [-230, 1], [-120, -1], [-60, 1], [15, -1], [185, 1], [275, 1]], sideQ = [];
    SIDES.forEach(([s, sd]) => { setT(s, 0); const a = sd * 4, b = sd * 80, q = quad(Math.min(a, b), Math.max(a, b), -3.6, 3.6); FOOT.push(q); sideQ.push(q);
      NOL = s < -48; seg('ink', sd * 5.25, 0.02, -3.6, sd * 80, 0.02, -3.6); seg('ink', sd * 5.25, 0.02, 3.6, sd * 80, 0.02, 3.6); for (let x = 8; x < 78; x += 7) seg('green', sd * x, 0.03, 0, sd * (x + 3), 0.03, 0); NOL = false; });
    // 1 filling station (right)
    setT(40, 0); { const x = 11, z = 0;
      solid('ink', x, 4.85, z, 11, 0.75, 7); [5.1, 5.35].forEach(y => { seg('fine', x - 5.5, y, z + 3.53, x + 5.5, y, z + 3.53); seg('fine', x - 5.53, y, z - 3.5, x - 5.53, y, z + 3.5); });
      [[-4.5, -2.8], [4.5, -2.8], [-4.5, 2.8], [4.5, 2.8]].forEach(([p, q]) => solid('ink', x + p, 0, z + q, 0.4, 4.85, 0.4));
      solid('ink', x, 0, z, 6, 0.25, 1.4);
      [-1.8, 1.8].forEach(o => { solid('ink', x + o, 0.25, z, 0.8, 1.7, 0.6); rectZ('fine', z + 0.33, x + o - 0.28, x + o + 0.28, 1.25, 1.75); rectZ('fine', z + 0.33, x + o - 0.2, x + o + 0.2, 0.6, 1.0); poly('ink', [[x + o + 0.42, 1.5, z], [x + o + 0.62, 0.9, z + 0.2], [x + o + 0.56, 0.45, z + 0.4]]); });
      solid('ink', x + 8, 0, z - 1, 5, 3.2, 4); solid('ink', x + 8, 3.2, z - 1, 5.6, 0.35, 4.6); louvX(x + 5.5, 1, z - 1.9, 1.0, 1.6, 1.3, true); doorX(x + 5.5, 1, z - 0.1, 0, 1.0, 2.3); louvZ(z + 1, x + 9.2, 1.0, 1.6, 1.3, true);
      solid('ink', x + 8, 0, z + 2.6, 1.6, 1.0, 1.0); for (let q = -0.4; q <= 0.41; q += 0.2) seg('fine', x + 7.17, 0.3, z + 2.6 + q, x + 7.17, 0.85, z + 2.6 + q);
      solid('ink', x - 4.4, 0, z - 8, 0.3, 5.6, 0.3); solid('ink', x - 4.4, 5.6, z - 8, 0.35, 2.6, 2); for (let i = 0; i < 3; i++) rectX('fine', x - 4.6, z - 8.8, z - 7.2, 5.85 + i * 0.75, 6.4 + i * 0.75);
      rectY('fine', 0.03, x - 5.8, x + 5.8, z - 4, z + 4); }
    // 2 water tank on stilts (left)
    setT(100, 0); { const x = -12, z = 0, LG = [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]];
      LG.forEach(([p, q]) => solid('ink', x + p, 0, z + q, 0.3, 9, 0.3));
      for (let i = 0; i < 4; i++) { const [a1, b1] = LG[i], [a2, b2] = LG[(i + 1) % 4]; [[0.4, 3.2], [3.2, 6], [6, 8.8]].forEach(([y0, y1]) => { seg('fine', x + a1, y0, z + b1, x + a2, y1, z + b2); seg('fine', x + a2, y0, z + b2, x + a1, y1, z + b1); }); [3.2, 6].forEach(y => seg('ink', x + a1, y, z + b1, x + a2, y, z + b2)); }
      solid('ink', x, 9, z, 4.4, 0.3, 4.4); poly('ink', [[x - 2.2, 10.3, z - 2.2], [x + 2.2, 10.3, z - 2.2], [x + 2.2, 10.3, z + 2.2], [x - 2.2, 10.3, z + 2.2], [x - 2.2, 10.3, z - 2.2]]);
      for (let t = -2.2; t <= 2.21; t += 0.55) { seg('fine', x + t, 9.3, z + 2.2, x + t, 10.3, z + 2.2); seg('fine', x + 2.2, 9.3, z + t, x + 2.2, 10.3, z + t); }
      tankE('ink', x, 9.3, z, 2.6, 3.6, 20);
      fill('cone', x, 13.4, z, 2.7, 1, 2.7); ring('ink', x, 12.9, z, 2.72, 24); for (let i = 0; i < 10; i++) { const t = i / 10 * Math.PI * 2; seg('fine', x, 13.9, z, x + Math.cos(t) * 2.72, 12.9, z + Math.sin(t) * 2.72); }
      seg('ink', x + 1.85, 0, z - 0.3, x + 1.85, 9, z - 0.3); seg('ink', x + 1.85, 0, z + 0.3, x + 1.85, 9, z + 0.3); for (let y = 0.4; y < 9; y += 0.4) seg('fine', x + 1.85, y, z - 0.3, x + 1.85, y, z + 0.3);
      for (let i = -5; i <= 5; i++) seg('ink', x + 4.2, 0, z + i * 0.9, x + 4.2, 1.6, z + i * 0.9); [0.6, 1.4].forEach(y => seg('ink', x + 4.2, y, z - 4.5, x + 4.2, y, z + 4.5));
      unfinished(-1, 15, 5, 7, true); }
    // 3 umbrella stalls (right) with lock-up shops behind
    setT(160, 0); for (let i = 0; i < 6; i++) { const x = 7.6 + (i % 2) * 0.6, z = 8 - i * 3.2; seg('ink', x, 0, z, x, 3.2, z);
      fill('cone', x, 2.8, z, 1.6, 0.8, 1.6);
      const rim = []; for (let j = 0; j <= 16; j++) { const t = j / 16 * Math.PI * 2, r = j % 2 ? 1.5 : 1.62; rim.push([x + Math.cos(t) * r, j % 2 ? 2.47 : 2.4, z + Math.sin(t) * r]); } poly('ink', rim);
      for (let j = 0; j < 8; j++) { const t = j / 8 * Math.PI * 2; seg(j % 2 ? 'fine' : 'ink', x, 3.2, z, x + Math.cos(t) * 1.62, 2.4, z + Math.sin(t) * 1.62); }
      solid('ink', x, 0, z, 1.4, 0.8, 0.9); seg('fine', x - 0.7, 0.6, z + 0.46, x + 0.7, 0.6, z + 0.46); [-0.4, 0, 0.4].forEach(o => ring('fine', x + o, 0.82, z, 0.17, 10)); solid('ink', x + 0.35, 0.8, z - 0.2, 0.3, 0.25, 0.3); }
    setT(160, 0); shopRow(1, 10.4, 18, true); FOOT.push(quad(10.4, 16.6, -9.3, 9.3));
    // 4 St Paul's church (left)
    setT(215, 0); { const x = -14, z = 0; solid('ink', x, 0, z, 8, 5, 12);
      fill('pr', x, 5, z, 8.6, 3.2, 12.6);
      [z - 6.3, z + 6.3].forEach(zz => poly('ink', [[x - 4.3, 5, zz], [x, 8.2, zz], [x + 4.3, 5, zz]])); seg('ink', x, 8.2, z - 6.3, x, 8.2, z + 6.3); [-4.3, 4.3].forEach(o => seg('ink', x + o, 5, z - 6.3, x + o, 5, z + 6.3));
      for (let zz = z - 6.1; zz < z + 6.2; zz += 0.42) seg('fine', x + 4.3, 5, zz, x, 8.2, zz);
      for (let zz = z - 4.5; zz <= z + 4.6; zz += 2.25) { archX('fine', x + 4.03, zz, 1.2, 0.9, 2.4); seg('ink', x + 4.12, 1.14, zz - 0.55, x + 4.12, 1.14, zz + 0.55); }
      archZ('fine', z + 6.03, x - 1.5, 1.5, 1, 2.2); archZ('fine', z + 6.03, x - 3.0, 1.5, 1, 2.2);
      const tx = x + 3.6, tz = z + 5.2; solid('ink', tx, 0, tz, 2.6, 9, 2.6); [5, 7.6].forEach(y => { seg('fine', tx + 1.33, y, tz - 1.3, tx + 1.33, y, tz + 1.3); seg('fine', tx - 1.3, y, tz + 1.33, tx + 1.3, y, tz + 1.33); });
      archX('ink', tx + 1.33, tz, 5.8, 1, 1.5); archZ('ink', tz + 1.33, tx, 5.8, 1, 1.5); archZ('ink', tz + 1.33, tx, 0, 1.3, 2.6); seg('fine', tx, 0, tz + 1.34, tx, 1.95, tz + 1.34); archX('fine', tx + 1.33, tz, 2.6, 0.6, 1.4);
      fill('cone4', tx, 10.3, tz, 1.84, 2.6, 1.84, Math.PI / 4);
      [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]].forEach(([p, q]) => seg('ink', tx, 11.6, tz, tx + p, 9, tz + q));
      seg('ink', tx, 11.6, tz, tx, 13.0, tz); seg('ink', tx, 12.55, tz - 0.4, tx, 12.55, tz + 0.4);
      [[z - 8.5, z - 1.8], [z + 1.8, z + 8.5]].forEach(([a, b]) => { solid('ink', x + 5.4, 0, (a + b) / 2, 0.26, 1.5, b - a); seg('fine', x + 5.26, 1.3, a, x + 5.26, 1.3, b); }); [z - 8.5, z - 1.8, z + 1.8, z + 8.5].forEach(zz => { solid('ink', x + 5.4, 0, zz, 0.45, 1.85, 0.45); solid('ink', x + 5.4, 1.85, zz, 0.55, 0.1, 0.55); }); }
    // 5 market gate (left, no lettering) + stalls behind
    setT(245, 0); { const x = -6.4, z = 0;
      [-5, 5].forEach(o => { solid('green', x, 0, z + o, 1.5, 0.6, 1.5); solid('green', x, 0.6, z + o, 1.2, 5.8, 1.2); solid('green', x, 6.4, z + o, 1.6, 0.35, 1.6); rectX('green', x + 0.63, z + o - 0.38, z + o + 0.38, 1.0, 5.9); solid('green', x, 8.35, z + o, 0.5, 0.5, 0.5); seg('green', x, 8.85, z + o, x, 9.4, z + o); });
      solid('green', x, 6.75, z, 1.2, 1.6, 11.4); rectX('green', x + 0.63, z - 4.3, z + 4.3, 7.0, 8.1); rectX('green', x + 0.64, z - 4.0, z + 4.0, 7.15, 7.95); rectZ('green', z + 5.73, x - 0.4, x + 0.4, 7.0, 8.1);
      rectY('fine', 0.03, x - 10, x + 0.6, z - 4.4, z + 4.4); for (let zz = z - 4; zz <= z + 4.01; zz += 2) seg('fine', x - 10, 0.03, zz, x + 0.6, 0.03, zz);
      const lane = 3.2;
      for (let i = 0; i < 5; i++) for (const j of [-1, 1]) { const sx = x - 9 - i * 6.6, d = 4.4, sz = j * (lane + d / 2), fz = j * lane, ze = fz - j * 1.6;
        solid('ink', sx, 0, sz, 5.6, 2.5, d); rectZ('ink', fz - j * 0.03, sx - 2.3, sx + 2.3, 0.95, 2.2); for (let xx = sx - 2.3 + 1.15; xx < sx + 2.3; xx += 1.15) seg('fine', xx, 1.2, fz - j * 0.03, xx, 2.2, fz - j * 0.03);
        solid('ink', sx, 0, fz - j * 0.4, 5.2, 0.95, 0.8); [-1.7, -0.6, 0.5, 1.6].forEach(o => { ring('fine', sx + o, 0.97, fz - j * 0.4, 0.32, 10); ring('fine', sx + o, 1.1, fz - j * 0.4, 0.18, 8); });
        seg('ink', sx - 2.8, 2.5, fz, sx + 2.8, 2.5, fz); seg('ink', sx - 2.8, 2.15, ze, sx + 2.8, 2.15, ze); seg('ink', sx - 2.8, 2.5, fz, sx - 2.8, 2.15, ze); seg('ink', sx + 2.8, 2.5, fz, sx + 2.8, 2.15, ze);
        for (let xx = sx - 2.45; xx < sx + 2.8; xx += 0.35) seg('fine', xx, 2.5, fz, xx, 2.15, ze); [sx - 2.6, sx + 2.6].forEach(xx => seg('ink', xx, 0, ze, xx, 2.15, ze));
        solid('ink', sx, 2.5, sz, 5.9, 0.15, d + 0.3); for (let xx = sx - 2.7; xx <= sx + 2.71; xx += 0.45) seg('fine', xx, 2.66, sz - d / 2, xx, 2.66, sz + d / 2);
        if (rnd() < 0.7) solid('ink', sx + (rnd() - 0.5) * 3, 0, fz - j * 1.15, 0.7, 0.5 + rnd() * 0.25, 0.55);
        if (rnd() < 0.6) { const bx = sx + 1.3, bz = fz - j * 1.25; fill('cyl', bx, 0.3, bz, 0.28, 0.6, 0.28); ring('ink', bx, 0.6, bz, 0.28, 10); ring('ink', bx, 0.02, bz, 0.28, 10); seg('fine', bx - 0.28, 0, bz, bx - 0.28, 0.6, bz); seg('fine', bx + 0.28, 0, bz, bx + 0.28, 0.6, bz); } }
      for (let xx = x - 10.5; xx > x - 44; xx -= 6.6) { [-1, 1].forEach(j => seg('ink', xx, 2.5, j * (lane + 0.3), xx, 3.9, j * (lane + 0.3)));
        const p = []; for (let t = 0; t <= 12; t++) p.push([xx, 3.8 - 0.55 * Math.sin(Math.PI * t / 12), -lane - 0.3 + (2 * lane + 0.6) * t / 12]); poly('fine', p);
        for (let t = 1; t < 12; t++) { const zz = -lane - 0.3 + (2 * lane + 0.6) * t / 12, yy = 3.8 - 0.55 * Math.sin(Math.PI * t / 12); poly(t % 2 ? 'ink' : 'fine', [[xx, yy, zz - 0.2], [xx, yy - 0.42, zz], [xx, yy, zz + 0.2]]); } }
      { const cx = x - 27, cz = 1.05; solid('ink', cx, 0.45, cz, 1.9, 0.45, 0.95); [-1, 1].forEach(q => { circX('ink', cx + 0.25, 0.32, cz + q * 0.55, 0.32, 14); }); seg('ink', cx + 0.95, 0.9, cz - 0.3, cx + 1.8, 1.1, cz - 0.3); seg('ink', cx + 0.95, 0.9, cz + 0.3, cx + 1.8, 1.1, cz + 0.3); solid('ink', cx - 0.3, 0.9, cz, 0.8, 0.45, 0.6); }
      for (let xx = x - 6; xx > x - 48; xx -= 1.8) seg('fine', xx, 0.03, -lane + 0.4, xx - 0.9, 0.03, -lane + 0.4);
      storey(-1, 50, 8, 24, 2, true); }
    // streetscape
    const tryPlace = (sd, xn, s, len, w, fn) => { setT(s + len / 2, 0); const a = sd * xn, b = sd * (xn + w), q = quad(Math.min(a, b), Math.max(a, b), -len / 2 - 0.3, len / 2 + 0.3); if (!ok(q, Math.min(xn - 1.2, 8))) return false; FOOT.push(q); NOL = s + len < -48; fn(); NOL = false; return true; };
    for (const sd of [-1, 1]) { let s = S0 + 2; while (s < 300) { const t = rnd(), mk = s > 170; let len, w, xn = 8.8, fn;
      if (t < 0.28 && !mk) { len = 10 + rnd() * 4; w = 11 + rnd() * 1.5; fn = () => bungalow(sd, xn, w, len, true); }
      else if (t < 0.62) { len = 8 + rnd() * 7; w = 7 + rnd() * 2.5; const fl = 2 + Math.floor(rnd() * (mk ? 3 : 2.4)); fn = () => storey(sd, xn, w, len, fl, true); }
      else if (t < 0.82) { len = 8 + rnd() * 8; w = 6.1; fn = () => shopRow(sd, xn, len, true); }
      else if (t < 0.9) { len = 6.1; w = 2.6; xn = 9.6; fn = () => container(sd, xn, len, true); }
      else { len = 9 + rnd() * 3; w = 7; fn = () => unfinished(sd, xn, w, len, true); }
      s += tryPlace(sd, xn, s, len, w, fn) ? len + 0.5 + rnd() * 1.4 : 2; } }
    for (const sd of [-1, 1]) { let s = S0 + 2; while (s < 300) { const len = 9 + rnd() * 8, t = rnd(), w = t < 0.5 ? 7 + rnd() * 2 : 10, xn = 21.4 + rnd() * 0.8, fl = 2 + Math.floor(rnd() * 3);
      s += tryPlace(sd, xn, s, len, w, t < 0.5 ? () => storey(sd, xn, w, len, fl, false) : () => bungalow(sd, xn, w, len, false)) ? len + 0.8 + rnd() * 2 : 3; } }
    for (const sd of [-1, 1]) { let s = S0 + 4; while (s < 320) { const len = 10 + rnd() * 6, fl = 4 + Math.floor(rnd() * 5);
      s += tryPlace(sd, 33, s, len, 9, () => storey(sd, 33, 9, len, fl, false)) ? len + 2 + rnd() * 5 : 4; } }
    // vehicles: oncoming lane, parked on the shoulder, one keke ahead past the gate
    [[30, danfo], [66, keke], [118, keke], [160, danfo], [205, keke], [290, danfo]].forEach(([s, f]) => veh(s, -2.2, true, f));
    veh(262, 1.6, false, keke);
    [[20, 6.9, keke], [58, 6.9, car], [120, 6.9, danfo], [182, 6.9, keke], [8, -6.9, car], [112, -6.9, keke], [178, -6.9, danfo]].forEach(([s, lat, f]) => { setT(s, 0); const q = quad(lat - 1.1, lat + 1.1, -2.6, 2.6); if (ok(q, 0)) { FOOT.push(q); veh(s, lat, lat < 0, f); } });
    // poles + tangled wires (left), trees + a few lamps (right)
    const poles = []; for (let s = -30; s < 300; s += 22) { setT(s, 0); if (!okPt(-6.4, 1.4)) continue; pole(-6.4); FOOT.push(quad(-6.6, -6.2, -0.2, 0.2)); poles.push(s); }
    setW();
    for (let i = 0; i < poles.length - 1; i++) { const a = poles[i], b = poles[i + 1]; if (b - a > 50) continue;
      [-1.1, -0.4, 0.4, 1.1].forEach((o, j) => wire('ink', W3(a, -6.4 + o, 8.92), W3(b, -6.4 + o, 8.92), 0.75 + j * 0.08));
      [-0.8, 0.8].forEach(o => wire('fine', W3(a, -6.4 + o, 7.84), W3(b, -6.4 + o, 7.84), 0.6)); }
    poles.forEach((s, i) => { wire('fine', W3(s, -7.5, 8.92), W3(s + 3, -9.0, 5.6), 0.4); if (i % 2 === 0) wire('ink', W3(s, -5.3, 8.92), W3(s - 5, 8.7, 6.2), 0.9); if (i % 3 === 1) wire('fine', W3(s, -5.3, 8.92), W3(s + 6, 8.7, 5.4), 1.2); });
    for (let s = -24; s < 300; s += 19) { setT(s, 0); if (rnd() < 0.6 && okPt(6.9, 1.3)) { tree(6.9); FOOT.push(quad(6.6, 7.2, -0.3, 0.3)); } }
    for (let s = -8; s < 300; s += 31) { setT(s, 0); if (rnd() < 0.3 && okPt(-7.4, 1.0)) tree(-7.4); }
    for (let s = 0; s < 300; s += 56) { setT(s, 0); if (okPt(5.0, 0.6)) lamp(5.0); }
    // road: kerb, open drain with slabs, centre dashes, zebra, potholes
    setW();
    const along = (k, lat, a, b, y) => { const p = []; for (let s = a; s <= b; s += 2) p.push(W3(s, lat, y)); poly(k, p); };
    for (const sd of [-1, 1]) { along('ink', sd * 4, S0, SMAX, 0.02); along('fine', sd * 3.6, S0, SMAX, 0.025); along('fine', sd * 4.45, S0, 320, 0.02); along('ink', sd * 5.25, S0, 320, 0.02); }
    for (let s = S0 + 4; s < SMAX - 4; s += 7) { const [a, b] = W(s, 0), [c, d] = W(s + 3, 0); seg('green', a, 0.03, b, c, 0.03, d); }
    for (const sd of [-1, 1]) for (let s = S0; s < 300; s += 6) if (rnd() < 0.45) for (let q = 0; q < 6; q += 1.2) { setT(s + q, 0); seg('fine', sd * 4.45, 0.02, 0, sd * 5.25, 0.02, 0); }
    setT(197, 0); for (let x = -3.4; x <= 3.4; x += 0.85) rectY('ink', 0.035, x - 0.25, x + 0.25, -1.25, 1.25);
    for (let i = 0; i < 10; i++) { setT(rnd() * 300, (rnd() - 0.5) * 6); const r = 0.35 + rnd() * 0.55, p = []; for (let j = 0; j < 9; j++) { const t = j / 9 * Math.PI * 2, rr = r * (0.75 + rnd() * 0.5); p.push([Math.cos(t) * rr, 0.03, Math.sin(t) * rr * 1.4]); } p.push(p[0]); poly('fine', p); }
    // distant skyline beyond the market
    setT(SMAX - 10, 0); for (let i = 0; i < 14; i++) { const lat = (rnd() < 0.5 ? -1 : 1) * (16 + rnd() * 60), z = -10 - rnd() * 70, w = 7 + rnd() * 9, d = 7 + rnd() * 8, hh = 22 + rnd() * 40;
      solid('ink', lat, 0, z, w, hh, d); for (let y = 3; y < hh; y += 3) seg('fine', lat - w / 2, y, z + d / 2 + 0.03, lat + w / 2, y, z + d / 2 + 0.03); for (let x = lat - w / 2 + 1.5; x < lat + w / 2 - 0.5; x += 1.5) seg('fine', x, 0, z + d / 2 + 0.03, x, hh, z + d / 2 + 0.03); if (rnd() < 0.4) seg('ink', lat, hh, z, lat, hh + 6, z); }

    const patches = []; [[245, -60, -5.6, -9, 9], [40, 5, 16.8, -4.2, 4.2], [160, 5.8, 10, -10.5, 10.5]].forEach(([s, a, b, c, d]) => { setT(s, 0); patches.push(quad(a, b, c, d)); }); setW();
    return { PX, PZ, PT, S0, SMAX, DS, FILL, sideQ, patches, fr, W, MK, LS, SIDES };
};
