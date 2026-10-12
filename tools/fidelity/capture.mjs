// Usage: node capture.mjs <url> <outDir> [--dom]
// Deterministic capture: fake clock, fixed viewports, screenshots at scroll steps.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [url, outDir] = process.argv.slice(2);
const wantDom = process.argv.includes('--dom');
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
];
const STEP = 0.5; // fraction of viewport height between shots
const T0 = new Date('2026-10-12T10:00:00+01:00');

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
for (const vp of VIEWPORTS) {
  const dir = path.join(outDir, vp.name);
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
  await page.clock.install({ time: T0 });
  await page.goto(url, { waitUntil: 'load' });
  // Let real network/unpacking settle, then advance fake time for intros.
  await page.waitForTimeout(4000);
  await page.clock.runFor(8000);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  if (wantDom) {
    const dom = await page.evaluate(() => document.documentElement.outerHTML);
    fs.writeFileSync(path.join(dir, 'dom.html'), dom);
  }
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const shots = [];
  for (let y = 0, i = 0; y <= total - vp.height + vp.height * STEP; y += vp.height * STEP, i++) {
    const yy = Math.min(Math.round(y), total - vp.height);
    await page.evaluate(v => window.scrollTo(0, v), yy);
    await page.clock.runFor(1500);
    const file = `${String(i).padStart(3, '0')}.png`;
    await page.screenshot({ path: path.join(dir, file), animations: 'disabled' });
    shots.push({ file, y: yy });
  }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ total, shots, errors }, null, 1));
  console.log(vp.name, 'height', total, 'shots', shots.length, 'errors', errors.length);
  await ctx.close();
}
await browser.close();
