import { chromium } from '/Volumes/theBigTank M2 Drive/thebigtank works/marketdey marketing site/tools/fidelity/node_modules/playwright/index.mjs';
const out = process.argv[2];
const b = await chromium.launch({ args: ['--use-angle=metal','--ignore-gpu-blocklist'] });
const MODES = (process.argv[3] || 'day,night,minimal').split(',');
for (const mode of MODES) {
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
  await p.goto('http://localhost:3000/launching?citydebug=1', { waitUntil: 'networkidle' }); await p.waitForTimeout(9000);
  if (mode === 'night') { await p.evaluate(() => window.__city.hero.setPhaseTime(150)); await p.waitForTimeout(2500); }
  const info = await p.evaluate(() => {
    const css = document.createElement('style');
    css.textContent = 'nextjs-portal,[data-h="sign"],[data-h="badges"],[data-rope]{display:none!important}';
    document.head.appendChild(css);
    // hide every fixed layer that holds the sign/rope
    document.querySelectorAll('[data-eyelet]').forEach(e => { let n = e; for (let i = 0; i < 8 && n; i++) n = n.parentElement; });
    const svgRope = [...document.querySelectorAll('svg')].filter(s => s.querySelector('path') && getComputedStyle(s).position !== 'static' && s.getBoundingClientRect().width < 5);
    svgRope.forEach(s => s.style.display = 'none');
    const logo = document.querySelector('[data-h="logo"]');
    const lr = logo.getBoundingClientRect();
    return { lr: [lr.top, lr.bottom, lr.left, lr.right] };
  });
  const C = {
    day: { h: 'Market dey today?', sub: 'Shop the market or dodge its traffic.', pill: 'We\u2019re launching soon', bg: '#a7c957', fg: '#252422', url: true },
    night: { h: 'We\u2019re launching soon', sub: 'Things suppose cheap for market today', pill: 'I go lie for you?', bg: '#ffffff', fg: '#252422', url: true },
    // just the wordmark, the launching-soon label and the store logos
    minimal: { h: '', sub: '', pill: 'We\u2019re launching soon', bg: '#a7c957', fg: '#252422', url: false },
  }[mode];
  await p.evaluate(({ lr, C }) => {
    const F = 'font-family:Lato,sans-serif;';
    const top = document.createElement('div');
    top.style.cssText = 'position:fixed;left:0;right:0;z-index:60;text-align:center;color:#fff;pointer-events:none;' + F + 'top:' + (lr[0] - 170) + 'px';
    top.innerHTML = '<div style="font-weight:900;font-size:58px;letter-spacing:-.5px">' + C.h + '</div>';
    if (C.h) document.body.appendChild(top);
    const under = document.createElement('div');
    under.style.cssText = 'position:fixed;left:0;right:0;z-index:60;text-align:center;color:#fff;pointer-events:none;' + F + 'top:' + (lr[1] + 26) + 'px';
    under.innerHTML = (C.sub ? '<div style="font-size:32px;opacity:.9">' + C.sub + '</div>' : '')
      + '<div style="margin-top:' + (C.sub ? 34 : 40) + 'px;display:inline-block;background:' + C.bg + ';color:' + C.fg + ';font-weight:900;font-size:30px;padding:14px 34px;border-radius:12px;box-shadow:0 8px 22px rgba(0,0,0,.18);transform:rotate(-4deg)">' + C.pill + '</div>'
      + (C.url ? '<div style="margin-top:22px;font-weight:900;font-size:26px;letter-spacing:.5px;opacity:.95">marketdey.com</div>' : '')
      + '<div style="margin-top:' + (C.url ? 26 : 44) + 'px;display:flex;gap:40px;justify-content:center;align-items:center"><img src="/images/badges/apple-logo.svg" style="height:50px"><img src="/images/badges/google-play-icon.svg" style="height:47px"></div>';
    document.body.appendChild(under);
  }, { ...info, C });
  await p.evaluate(() => {
    const txt = [...document.body.children].filter(e => e.style && e.style.zIndex === '60').map(e => e.getBoundingClientRect());
    const logo = document.querySelector('[data-h="logo"]').getBoundingClientRect();
    const boxes = txt.concat([logo]).map(r => ({ l: 0, r: 1080, t: r.top - 8, b: r.bottom + 8 }));
    const hit = r => boxes.some(b => r.right > b.l && r.left < b.r && r.bottom > b.t && r.top < b.b);
    // planes, helicopter, birds: all of them go; clouds only where they touch the text
    const sun = document.querySelector('svg circle[r="26"]'); if (sun) sun.ownerSVGElement.style.display = 'none';
    // planes and the helicopter go; the birds (flapping-path groups) stay unless they touch the text
    document.querySelectorAll('[data-sky]').forEach(g => { const bird = !!g.querySelector('path[d^="M-7 -3Q"]'); if (!bird || hit(g.getBoundingClientRect())) g.style.display = 'none'; });
    // clouds that touch the text are lifted into the empty sky above the headline (staggered heights), not dropped
    const top = boxes[0].t;
    // obstacles: the moon (and sun) glow, plus every cloud already in the sky; lifted clouds try heights in turn
    const moon = document.querySelector('svg circle[r="46"]');
    const obs = [];
    if (moon && moon.ownerSVGElement.style.opacity !== '0') obs.push(moon.ownerSVGElement.getBoundingClientRect());
    const cl = [...document.querySelectorAll('[data-cloud]')];
    cl.forEach(g => { const r = g.getBoundingClientRect(); if (!hit(r)) obs.push(r); });
    const ov = (a, b) => a.l < b.right + 12 && a.r > b.left - 12 && a.t < b.bottom + 12 && a.b > b.top - 12;
    cl.forEach(g => {
      const r = g.getBoundingClientRect();
      if (!hit(r)) return;
      for (const y of [60, 110, 160, 210, 260, 310, 360, 410]) {
        if (y + r.height > top - 30) break;
        const c = { l: r.left, r: r.right, t: y, b: y + r.height };
        if (obs.some(o => ov(c, o))) continue;
        g.style.translate = '0 ' + Math.round(y - r.top) + 'px';
        obs.push({ left: c.l, right: c.r, top: c.t, bottom: c.b });
        return;
      }
      g.style.display = 'none';   // no free spot: drop it rather than cover something
    });
  });
  await p.waitForFunction(() => [...document.images].filter(i => i.src.includes('/badges/')).every(i => i.complete && i.naturalWidth));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/poster-${mode}.png` });
  console.log(mode, JSON.stringify(info));
  await p.close();
}
await b.close();
