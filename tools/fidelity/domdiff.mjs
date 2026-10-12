// Usage: node domdiff.mjs <url> <cssSelector> [goldenDom=golden/desktop/dom.html]
// Renders <url> (fake clock, 1440x900, scroll 0), extracts the subtree matching <cssSelector>,
// normalizes it and diffs it line-by-line against the same subtree in the golden DOM.
// Normalization drops runtime-only noise: data-dc-tpl, data-sc-name, sc-host/scp* classes, React keys.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [url, selector, goldenPath = path.join(here, 'golden/desktop/dom.html')] = process.argv.slice(2);
const T0 = new Date('2026-10-12T10:00:00+01:00');

const normalize = () => (root) => {
  const lines = [];
  const walk = (n, d) => {
    if (n.nodeType === 3) { const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t) lines.push('  '.repeat(d) + '"' + t + '"'); return; }
    if (n.nodeType !== 1) return;
    const tag = n.localName;
    if (tag === 'script') return;
    const attrs = [...n.attributes]
      .filter(a => !['data-dc-tpl', 'data-sc-name'].includes(a.name))
      .map(a => {
        let v = a.value;
        if (a.name === 'class') v = v.split(/\s+/).filter(c => c && !/^(sc-host|sc-host-x|scp[0-9a-z]+)$/.test(c)).join(' ');
        if (a.name === 'style') v = v.split(';').map(s => s.trim().replace(/\s*:\s*/, ':')).filter(Boolean).sort().join(';');
        return v === '' && a.name === 'class' ? null : `${a.name}="${v}"`;
      }).filter(Boolean).sort();
    // sc-host wrappers are kept as plain <div> so wrapper parity is still checked.
    lines.push('  '.repeat(d) + '<' + tag + (attrs.length ? ' ' + attrs.join(' ') : '') + '>');
    for (const c of n.childNodes) walk(c, d + 1);
  };
  walk(root, 0);
  return lines;
};

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const extract = async (gotoUrl, html) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.clock.install({ time: T0 });
  if (html) await page.setContent(html, { waitUntil: 'domcontentloaded' });
  else { await page.goto(gotoUrl, { waitUntil: 'load' }); await page.waitForTimeout(3000); await page.clock.runFor(8000); }
  const fn = normalize().toString();
  const out = await page.evaluate(([sel, fnSrc]) => {
    const el = document.querySelector(sel); if (!el) return null;
    return eval('(' + fnSrc + ')')(el);
  }, [selector, fn]);
  await page.close();
  return out;
};
// Golden is loaded with scripts stripped so it stays a static snapshot.
const goldenHtml = fs.readFileSync(goldenPath, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const g = await extract(null, goldenHtml);
const c = await extract(url);
await browser.close();
if (!g) { console.log('selector not found in golden'); process.exit(2); }
if (!c) { console.log('selector not found in candidate'); process.exit(2); }
let diffs = 0;
const max = Math.max(g.length, c.length);
for (let i = 0; i < max && diffs < 40; i++) {
  if (g[i] !== c[i]) { diffs++; console.log(`@${i}\n  - ${g[i] ?? '(none)'}\n  + ${c[i] ?? '(none)'}`); }
}
console.log(diffs ? `DIFF: ${diffs}+ mismatching lines (golden ${g.length}, candidate ${c.length})` : `MATCH (${g.length} lines)`);
process.exit(diffs ? 1 : 0);
