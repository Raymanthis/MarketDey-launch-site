// Usage: node diff.mjs <goldenDir> <candidateDir> <outDir>
// Compares screenshots pairwise per viewport; prints % differing pixels per shot.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [gDir, cDir, outDir] = process.argv.slice(2);
let worst = 0;
for (const vp of fs.readdirSync(gDir)) {
  const gm = JSON.parse(fs.readFileSync(path.join(gDir, vp, 'meta.json')));
  const cmPath = path.join(cDir, vp, 'meta.json');
  if (!fs.existsSync(cmPath)) { console.log(vp, 'MISSING candidate'); continue; }
  const cm = JSON.parse(fs.readFileSync(cmPath));
  console.log(`== ${vp}: height golden ${gm.total} candidate ${cm.total}${gm.total !== cm.total ? '  <-- HEIGHT MISMATCH' : ''}`);
  if (cm.errors.length) console.log('  candidate console:', cm.errors.slice(0, 10).join('\n   '));
  fs.mkdirSync(path.join(outDir, vp), { recursive: true });
  for (const s of gm.shots) {
    const cf = path.join(cDir, vp, s.file);
    if (!fs.existsSync(cf)) { console.log(`  ${s.file} y=${s.y} MISSING`); continue; }
    const a = PNG.sync.read(fs.readFileSync(path.join(gDir, vp, s.file)));
    const b = PNG.sync.read(fs.readFileSync(cf));
    if (a.width !== b.width || a.height !== b.height) { console.log(`  ${s.file} size mismatch`); continue; }
    const d = new PNG({ width: a.width, height: a.height });
    const n = pixelmatch(a.data, b.data, d.data, a.width, a.height, { threshold: 0.1 });
    const pct = (100 * n) / (a.width * a.height);
    worst = Math.max(worst, pct);
    if (pct > 0.05) {
      fs.writeFileSync(path.join(outDir, vp, s.file), PNG.sync.write(d));
      console.log(`  ${s.file} y=${s.y} diff ${pct.toFixed(2)}%`);
    }
  }
}
console.log('WORST', worst.toFixed(2) + '%');
