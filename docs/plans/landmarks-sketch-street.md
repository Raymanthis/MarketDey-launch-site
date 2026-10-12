# Plan: illustration-quality street sketch for the Landmarks Journey

Status: proposed (rev. 2, after critique), 2026-10-12. Owner request: the 3D "ride" view in the
Landmarks Journey section must reach the line density and craft of the reference sketch (dense
window grids, varied line weight, overhead wires, trees, cars, people, perspective road lines,
distance fading to white).

> **Owner decision, 2026-10-12 (after ★0 bake-off): quality first — pre-rendered Blender frames
> (option 2), not live lines.** The live-line version (D) showed see-through geometry, broken figures,
> doubled edges and chaotic foliage at full size. Download size is acceptable if compressed as far as
> quality allows; frames preload on the hero with a percentage under the Marketdey wordmark while the
> visitor watches the animated skyline. The target is a *proper sketch*: ink lines **plus** tonal
> pencil shading (glass, shadow, depth) and paper grain, with professional-quality figures, vehicles
> and trees. A look-development pass on stills must reach that bar before any full render.
> Sections below that argue against option 2 are kept for the record.

## What exists today (facts)

- `src/components/sections/LandmarksJourneySection.jsx` builds the street procedurally in
  Three.js r160 from the same seeded geometry as the flat map (`seed = 11`, mirrored verbatim in
  `src/lib/lmMapBuild.js`): road centreline `fr(s)`, footprints `FILL`, five landmarks `MK` at
  road stations s = 40, 100, 160, 209.8, 245.
- Look: white `MeshBasicMaterial` + `EdgesGeometry`/`LineBasicMaterial` — uniform 1 px lines, no
  facade detail. That is why it reads as thin next to the reference.
- Choreography over 1800vh: flat map (p < `MAP_END` 0.47) → tilt (0.47–`RIDE_START` 0.56, during
  which buildings grow `city.scale.y`, lines fade in, road/trail fade, fog ramps) → street-level
  ride (0.56–1) past the five landmarks. Scroll is smoothed (`cur += (p − cur) · 0.12`).
  Pins/signboards are in-scene objects (boards rise from the ground as you approach); the phone
  checklist and tip cards are DOM. No clickable controls.
- The section currently ships **zero media bytes**; the product promises "works on 2G".

## Decision: Blender-modelled scene, baked line geometry, drawn live in Three.js

Neither offered option fits as-is; the plan takes option 1's runtime and option 2's authoring:

- **Model the street in Blender** (the detail the owner is missing is *geometry*: window bays,
  mullions, grilles, balconies, poles, wires, trees, vehicles, people).
- **Extract the lines offline in Blender**, not in the browser: crease, border, silhouette-prone
  and material-boundary edges, each tagged with a weight class (structure / detail / fine) and a
  feature id. Export as a quantised line buffer (int16 positions, uint8 weight/id), gzip/Brotli.
  Target ≈ 100–150k segments ≈ 1–1.5 MB on the wire.
- **Draw it in the existing scene** with a fat-line material (`LineSegments2`/`LineMaterial` or a
  custom instanced-quad shader): width from weight class × distance falloff (thick near, hairline
  far), opacity fade to paper with fog, subtle low-frequency wobble and pressure variation in the
  vertex shader for a hand-drawn feel. Depth-only white fills (from the same geometry) occlude
  lines behind buildings.

Why not option 2 (pre-rendered frames), per the critique:
1. **Bytes vs audience.** Realistic dense line-art WebP is 200–400 KB/frame; even the trimmed
   budget (6–35 MB) is minutes of download on 2G/slow 3G, and connection detection
   (`navigator.connection`) doesn't exist on Safari/Firefox. The degraded "few keyframes" state
   would be the *normal* state for the audience.
2. **Ghosting.** ~150 frames over ~250 m of road is 1.5–2.5 m per frame; crossfading two line
   drawings shows two drawings. Stepping without blending looks choppy.
3. **Line weight tied to pixels.** A look approved at a 2560 master ships thinner at 960/360 —
   the exact complaint we're fixing. Live lines stay crisp at every size and pixel density.
4. **Seams and overlays.** The tilt is animated (growth, fades, fog) and the camera heading is
   smoothed by scroll history, so a fixed frame 0 can't reliably match the live map; DOM overlays
   would also lose occlusion behind the new foreground poles/trees and the rise-from-ground reveal.
   With live lines the scene, tilt, pins and boards all stay in one renderer — zero new seams.
5. **Three.js stays regardless** (flat map + tilt), so option 2 would add a second renderer.

What this gives up: Freestyle-only niceties (view-dependent silhouette lines, calligraphic
stroke textures). The reference's density is overwhelmingly border/crease edges, which bake fine.
**This trade-off is tested at ★0, not assumed** — a Freestyle still is rendered beside it.

## ★0 must answer two questions first

1. **Look bake-off** — one hand-built dense block (facade module with grilles and balconies, a
   power pole with wires, a tree, a car, a keke, two people) shown three ways at the *delivered*
   sizes (1440×900 desktop and 390×844 mobile), beside the reference:
   a. baked lines drawn live in Three.js (recommended), as a 20-frame scroll scrub;
   b. Blender Freestyle still (option 2's look ceiling), with measured seconds/frame;
   c. today's renderer, for contrast.
   Plus profiling of (a) on a low-end Android and throttled "Slow 3G" load time.
2. **Composition — decided 2026-10-12: Delta State street.** The reference is a high-rise CBD; its density comes from curtain-wall towers.
   Owner decides: *the reference's line craft on a Delta State street* (2–4 storeys, balconies,
   grilles, kiosks, poles) — recommended, it's the product's world — or *the tall-city composition
   too*.

## Scene content (Delta State street — owner decision 2026-10-12)

- 2–4 storey concrete buildings with balconies, burglar-proof grilles, louvre windows, parapets,
  corrugated roofs, shop canopies, signboard blanks, kiosks, gutters — Geometry Nodes facade
  modules on the shared footprints so every window yields real edges.
- Power poles with sagging, tangled wires; almond and palm trees; cars, keke napep, danfo, okada;
  traders and pedestrians; kerbs, road markings, manholes.
- The five landmarks modelled specifically: filling station canopy (1), water tank on stilts
  behind a fence (2), umbrella stalls (3), church with white walls / blue roof (4), market gate
  with painted arch (5).
- CC0 assets only for generic props, listed in `blender/ASSETS.md`.

## Pipeline (`blender/`, headless `blender -b -P`, reproducible)

0. **Extract the shared geometry/camera code** into one module (`src/lib/landmarksGeometry.js`)
   used by the section, `lmMapBuild` and the exporter — guarded by a snapshot hash of
   `lmMapBuild()` output taken *before* the refactor, so the Try-it handoff is provably unchanged.
1. `blender/export/scene-data.mjs` → `blender/data/scene.json` (road, footprints, landmarks).
2. `blender/build_scene.py` → `.blend` built from JSON (facades, props, landmarks).
3. `blender/bake_lines.py` → `public/media/landmarks/lines.bin` (+ `lines.json` header:
   quantisation, weight classes, feature ids, bounds); white fill mesh as a small Draco GLB.
4. Hashed filenames + long-cache `headers()` in `next.config.ts`. `.blend` sources tracked with
   Git LFS or kept out of git (decide at phase 1); intermediates gitignored.

## Runtime integration

- Load `lines.bin` only when the section approaches the viewport; until it arrives (or if it
  fails) the current procedural street renders — it remains the permanent zero-byte fallback.
- Lines fade in during the existing tilt exactly like today's `lineK`, so the flat-map seam and
  tilt choreography are untouched.
- Pins, signboards (text from JSON) and occlusion stay in-scene as today.
- Device budget: cap segment count by GPU tier (fewer "fine" segments on low-end), DPR cap 1.5,
  `prefers-reduced-motion` respected. All browser reads in `componentDidMount` (SSR rule).

## Phases and checkpoints (★ = owner sign-off)

| # | Phase | Output | Est. |
|---|---|---|---|
| 0 | ★ Bake-off + composition question | 3-way comparison at delivered sizes, Android profile, Slow-3G timing, Freestyle s/frame | 1.5 days |
| 1 | Shared geometry module + exporter | snapshot-hash-verified refactor, `scene.json` | 0.5 day |
| 2 | Scene build | facades, props, landmarks; ★ 6 key views rendered live in the browser | 3 days |
| 3 | Line bake + runtime | `lines.bin`, fat-line material, LOD by GPU tier, fallback path | 1.5 days |
| 4 | QA | fidelity sequence harness (fixed p = 0.47, 0.56, each landmark stop) for the ride, full-page harness for everything else unchanged, Android + Slow-3G; ★ owner review | 1 day |

## Risks

- **Low-end GPU cost of 100k+ fat lines** — measured at ★0; LOD by weight class is the lever.
- **Baked lines look too clean** next to Freestyle — the bake-off shows this before any scene work;
  if the owner prefers Freestyle, revisit option 2 with its costs stated (bytes, ghosting, seam).
- **Geometry drift** between section, Try-it map and Blender — single shared module + hash guard.
- **No objective parity check for the ride today** — phase 4 promotes a fixed-p sequence capture
  into `tools/fidelity/`.
- Grease Pencil Line Art in Blender 5.2 could not be verified from the CLI; not relied on.
