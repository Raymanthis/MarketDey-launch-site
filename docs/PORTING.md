# Porting the Claude Design export to Next.js

The site was exported from Claude Design as one self-unpacking HTML file
(`Marketdey Site (standalone).html`). Its decoded sources are in `reference/source/`.
**The port must be pixel- and behaviour-identical.** Nothing is redesigned, refactored or
"cleaned up" — logic is moved, not rewritten.

## Source → target map

| Source (`reference/source/`) | Target |
|---|---|
| `main.dc.html` (page "orig") | `src/components/HomePage.jsx` + `src/content/home/*.json` |
| `AudiencesSection.dc.html` | `src/components/sections/AudiencesSection.jsx` + `src/content/audiences.json` |
| `MarketSearchSection.dc.html` | `src/components/sections/MarketSearchSection.jsx` + `src/content/market-search.json` |
| `LandmarksJourneySection.dc.html` | `src/components/sections/LandmarksJourneySection.jsx` + `src/content/landmarks-journey.json` |
| `LandmarkPhone.dc.html` | `src/components/sections/LandmarkPhone.jsx` + `src/content/landmark-phone.json` |
| `ContributorsSection.dc.html` | `src/components/sections/ContributorsSection.jsx` + `src/content/contributors.json` |
| `ios.jsx` (`IOSDevice`) | `src/components/shared/IOSDevice.jsx` |
| `image-slot.js` (`<image-slot>`) | `src/components/shared/ImageSlot.jsx` |
| `lm-map-build.js` (`window.LM_MAP_BUILD`) | `src/lib/lmMapBuild.js` (named export `lmMapBuild`) |

## How a `.dc.html` file works

- `<x-dc>` holds the template. `<helmet>` holds `<style>`/`<script>` for `<head>`.
- `<script type="text/x-dc" data-dc-script>` defines `class Component extends DCLogic`.
  `DCLogic` behaves like `React.Component`: `state`, `setState`, `forceUpdate`, `props`,
  `componentDidMount/DidUpdate/WillUnmount`. `renderVals()` returns the object the template
  binds against, merged **over** props: `vals = { ...props, ...renderVals() }`.
- `data-props` on that script declares props and their defaults.
- Every rendered component is wrapped by the runtime in
  `<div class="sc-host" data-sc-name="<Name>">…</div>`. The page root is
  `<div id="dc-root"><div class="sc-host" data-sc-name="orig">…</div></div>`.
- Runtime page CSS that **must** be kept (it affects layout):
  `html,body{height:100%;margin:0}#dc-root,#dc-root>.sc-host{height:100%}`.

## Conversion recipe (apply mechanically)

1. **File shape.** `.jsx` (not TS). First line `'use client';`, then a file-level
   `/* eslint-disable */` (ported verbatim code). `class <Name> extends React.Component`,
   default export.
2. **Logic is verbatim.** Copy every field, constant and method of the `Component` class and every
   top-level helper unchanged. Do not rename, reorder, convert to hooks, "fix", or change any
   number, easing, timing, colour, string-built SVG/HTML, or event wiring. `extends DCLogic` →
   `extends React.Component`.
3. **render().** `const v = { ...this.props, ...this.renderVals() };` then return the template as
   JSX, wrapped exactly as the runtime did:
   `<div className="sc-host" data-sc-name="<Name>">…</div>`.
4. **Bindings.** `{{ path }}` → `v.path`. The runtime expression language only has paths,
   `=== !== == !=`, leading `!`, parentheses and literals — translate literally. An attribute
   mixing text and bindings becomes a template literal. `undefined`/`null` in text renders empty.
5. **style.** The runtime turned style strings into objects with **string values**. Do the same:
   `style="opacity:0;left:{{ x }}px"` → `style={{ opacity: '0', left: `${v.x}px` }}` (camelCase
   keys, custom properties keep `'--name'`, every value a string so React never appends `px`).
6. **Attributes.** `class`→`className`, `for`→`htmlFor`, SVG attributes to their React names
   (`stroke-width`→`strokeWidth`, …), `sc-camel-<kebab>`→camelCase (`sc-camel-view-box`→`viewBox`,
   `sc-camel-on-click`→`onClick`, `sc-camel-on-pointer-down`→`onPointerDown`). `data-*`/`aria-*`
   stay as-is. Drop `data-dc-tpl`, `hint-*` attributes.
7. **refs.** `ref="{{ fooRef }}"` → `ref={v.fooRef}`.
8. **Control flow.** `<sc-if value="{{ c }}">X</sc-if>` → `{v.c ? <>X</> : null}`.
   `<sc-for list="{{ items }}" as="it">X</sc-for>` → `{v.items.map((it, i) => <React.Fragment key={i}>X</React.Fragment>)}`
   (index keys, as the runtime used).
9. **Pseudo-class attrs.** `style-hover="css"` / `style-active="css"` → a class in a co-located
   CSS module (`<Name>.module.css`) whose rule is `.cls:hover{…}` / `.cls:active{…}` with
   **`!important` on every declaration** (the runtime did this).
10. **Imports.** `<dc-import name="X" a="{{ b }}">` → `<X a={v.b} />` (the child renders its own
    sc-host wrapper). `<x-import component-from-global-scope="IOSDevice" …>` → wrap exactly as the
    golden DOM shows (`<div class="sc-host-x" style="display:contents">` around `<IOSDevice …>`),
    passing the same props/children.
11. **Helmet styles.** Copy each `<style>` from `<helmet>` verbatim into
    `<Name>.global.css` beside the component and `import './<Name>.global.css'`. Keyframe names
    must not change (JS references them). Skip Lato/Remix Icon `@font-face` blocks — the layout
    provides those. Helmet `<script src>` → ES imports of the ported module.
12. **Three.js.** `await import(window.__resources.three)` → `await import('three')`
    (`three@0.160.0`, same revision as the export).
13. **Globals.** Cross-section globals like `window.__mdReveal` stay globals — that is how sections
    talk to each other. `window.LM_MAP_BUILD(...)` → `lmMapBuild(...)` from `@/lib/lmMapBuild`.

## Server rendering

Sections are server-rendered, then hydrated. Any read of `window`, `document`, `matchMedia`,
`Date`/`new Date()` or layout during constructor, field initialisers, `renderVals()` or `render()`
must produce identical output on server and first client render. Where the original reads the
browser during render, guard it (`typeof window === 'undefined'`) and move the browser-dependent
value into state set in `componentDidMount`. **Zero hydration warnings** is an acceptance check.

## Content JSON

Every human-readable string moves to that component's JSON: headings, body copy, labels, button
text, `aria-label`, `alt`, `placeholder`, image-slot captions, FAQ, data tables such as
`MARKETS`/`FAQS`/`FLM`/`LGAS`/`TOWNS`, and words inside string-built SVG. Geometry, timings,
colours, ids and class names stay in code.

- Import statically: `import content from '@/content/audiences.json'`.
- Keys are readable and grouped by block in visual order. Tuples may become objects
  (`["q","a"]` → `{ "q": …, "a": … }`) only if every use site is updated to match.
- Copy containing inline markup (`<br>`, `<em>`, `<strong>`, `<span …>`) uses a key ending in
  `Html`, rendered via `dangerouslySetInnerHTML` on the same element that held it.
- Image slots: `{ "id": …, "placeholder": "…", "src": null, "alt": "…" }`. When `src` is null,
  `ImageSlot` renders the original empty state; when set, the photo.

## Verification (`tools/fidelity/`)

Golden captures of the original are in `tools/fidelity/golden/` (gitignored; regenerate with
`node capture.mjs "file://<repo>/Marketdey%20Site%20(standalone).html" golden --dom`).

- **Structure:** `node tools/fidelity/domdiff.mjs <url> '<selector>'` diffs a rendered subtree
  against the golden DOM (desktop, scroll 0, fixed clock). Use
  `[data-sc-name="<Name>"]` for sections, `section[data-screen-label="…"]` for page blocks.
- **Pixels:** `node tools/fidelity/capture.mjs <url> tools/fidelity/candidate` then
  `node tools/fidelity/diff.mjs tools/fidelity/golden tools/fidelity/candidate tools/fidelity/diff`.
