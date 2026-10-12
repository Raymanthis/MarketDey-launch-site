// Usage: node domdiff.mjs <url> <cssSelector> [goldenDom=golden/desktop/dom.html]
// Renders <url> (fake clock, 1440x900, scroll 0), extracts the subtree matching <cssSelector>,
// normalizes it and diffs it line-by-line against the same subtree in the golden DOM.
// Styles are compared as the browser serialises them (el.style.cssText) on both sides.
// Normalization drops runtime-only noise: data-dc-tpl, data-sc-name, sc-host/scp* classes, React keys.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
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
        if (a.name === 'class' && tag === 'image-slot') return null;
        if (a.name === 'class') v = v.split(/\s+/).filter(c => c && !/^(sc-host|sc-host-x|scp[0-9a-z]+)$/.test(c)).join(' ');
        if (a.name === 'style') v = n.style.cssText.split(';').map(s => s.trim().replace(/\s*:\s*/, ':')).filter(Boolean).sort().join(';');
        return v === '' && a.name === 'class' ? null : `${a.name}="${v}"`;
      }).filter(Boolean).sort();
    // sc-host wrappers are kept as plain <div> so wrapper parity is still checked.
    lines.push('  '.repeat(d) + '<' + tag + (attrs.length ? ' ' + attrs.join(' ') : '') + '>');
    // <image-slot> content was shadow DOM in the original and light DOM in the port; compare the host only.
    if (tag === 'image-slot') return;
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
// Real line diff (handles insertions) instead of index-by-index comparison.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'domdiff-'));
fs.writeFileSync(path.join(tmp, 'golden.txt'), g.join('\n') + '\n');
fs.writeFileSync(path.join(tmp, 'candidate.txt'), c.join('\n') + '\n');
const r = spawnSync('diff', ['-U1', path.join(tmp, 'golden.txt'), path.join(tmp, 'candidate.txt')], { encoding: 'utf8' });
const changed = r.stdout.split('\n').filter(l => /^[-+][^-+]/.test(l)).length;
if (changed) console.log(r.stdout.split('\n').slice(2, 200).join('\n'));
console.log(changed ? `DIFF: ${changed} changed lines (golden ${g.length}, candidate ${c.length})` : `MATCH (${g.length} lines)`);
process.exit(changed ? 1 : 0);
