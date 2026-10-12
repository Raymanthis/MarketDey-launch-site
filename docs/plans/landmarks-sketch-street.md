# Plan: illustration-quality street sketch for the Landmarks Journey

Status: proposed, 2026-10-12. Owner request: the 3D "ride" view in the Landmarks Journey section
must reach the line density and craft of the reference sketch (dense window grids, varied line
weight, overhead wires, trees, cars, people, perspective road lines, distance fading to white).

## What exists today (facts)

- `src/components/sections/LandmarksJourneySection.jsx` (≈70 KB) builds the street procedurally
  in Three.js r160 from the same seeded geometry as the flat map (`seed = 11`, mirrored in
  `src/lib/lmMapBuild.js`): road centreline `fr(s)`, building footprints `FILL`, five landmarks
  `MK` at road stations s = 40, 100, 160, 209.8, 245.
- Look: white `MeshBasicMaterial` + `EdgesGeometry`/`LineBasicMaterial` — 1 px uniform lines,
  no facade detail. That is why it reads as thin compared with the reference.
- Choreography (1800vh of scroll): flat 2D map → camera tilts into a 3D overhead → drops to
  street level → rides the road; numbered pins (1–5), signboards and the phone "Check I'm here"
  checklist follow the landmarks via `vector.project(camera)`. Camera: `PerspectiveCamera(58°)`.
- The section is scroll-only: no clickable/draggable controls (verified in the port).
- The flat map must hand off seamlessly from the Try-it section (same seed/geometry).

## Decision: option 2 — pre-render in Blender, scrub frames on scroll — with four additions

Why option 2 over option 1:
1. **The look is the requirement.** The reference's character comes from line-weight variation,
   dense facade linework and depth fade. Blender's Freestyle / Line Art produce that natively; a
   browser Sobel pass would need modelled mullions *plus* heavy shader tuning and still lands
   short, and its cost runs on every visitor's GPU (weak Android phones are the core audience).
2. **The interactivity loss is near-zero here.** The camera path is already fixed and
   scroll-scrubbed, with no free-look. Option 2's main downside doesn't apply.
3. **Unlimited scene detail at no runtime cost.** Thousands of windows, wires, grilles, people.

The four additions that make option 2 safe for this site:

A. **Same geometry, same camera.** Export the scene data (road, footprints, landmark stations)
   and the *current* camera path (sampled from the existing JS at every frame) to JSON, and build
   the Blender scene from it. Timing, landmark arrival and the flat-map handoff stay identical.

B. **Overlays stay live, copy stays in JSON.** Pins, signboard text, labels and the phone remain
   DOM/canvas overlays positioned by projecting 3D points through a per-frame camera exported from
   Blender (`manifest.json`: position, quaternion, fov per frame). Nothing with words is baked
   into the renders, so `src/content/*.json` remains the source of truth.

C. **One render, two crops.** With a fixed *vertical* FOV, a portrait view is a centred crop of
   the landscape frame. Render once at 16:9 (2560×1440 master), export desktop tiers (1600w, 960w)
   and a portrait crop for mobile (720×1280, 360×640). Ultra-wide screens use cover-scaling.

D. **Built for slow networks** (the product's audience is on 2G/3G). Tiered, progressive loading:
   - first paint: ~12 keyframes at the low tier (≈ 200–300 KB), scrubbing works immediately by
     crossfading between the nearest loaded frames;
   - fill in every 8th → 4th → 2nd → every frame, low tier then full tier, only once the section
     is near the viewport;
   - `navigator.connection.saveData` / `effectiveType` in {slow-2g, 2g}: low tier, every 4th frame
     only, capped ≈ 2–3 MB;
   - `prefers-reduced-motion`: show the five landmark stills, crossfaded at their stations.
   Budget targets: low tier full set ≤ 10 MB desktop / ≤ 6 MB mobile; full tier ≤ 35 MB.

## Scene content (Delta State street, reference style)

- Architecture: 2–4 storey concrete buildings with balconies, burglar-proof window grilles,
  louvre windows, parapets, corrugated roofs, shopfront canopies, painted signboard *blanks*,
  kiosks, gutters/culverts. Generated with Geometry Nodes from the exported footprints (facade
  modules: window bays with mullions + grilles, balcony rails, signboard frames) so every window
  produces real edges for the line renderer.
- Street life: power poles with sagging, tangled wires; trees (almond, palm); parked cars, keke
  napep, danfo, okada; a few pedestrians and traders; road markings, kerbs, manholes.
- The five landmarks, modelled specifically: filling station with canopy (#1), water tank on
  stilts behind a fence (#2), row of umbrella stalls (#3), church with white walls / blue roof
  (#4), market gate with painted arch (#5).
- Assets: CC0 kits only for generic props (cars/trees/people), recorded in `blender/ASSETS.md`;
  Nigerian-specific vehicles and the landmarks are modelled in the pipeline.
- Overhead stretch: same scene seen from the tilt-down camera; line weight reduces with distance.

## Look development

- Renderer: EEVEE + Freestyle (line thickness by distance from camera, alpha by distance, slight
  calligraphic variation, crease + silhouette + border + material-boundary edges), with Grease
  Pencil Line Art evaluated as the alternative on the same test frames. Pick by side-by-side.
- Paper: very light warm white (#f5f3ee — matches the current section), ink #2a2823 → greys.
- Distance fade: mist pass fading to paper colour, matching the reference's pale skyline.
- Optional: per-landmark ID mask pass (cheap) so the active landmark can get a subtle brand-green
  highlight at runtime without re-rendering.

## Pipeline (versioned in `blender/`)

1. `blender/export/scene-data.mjs` — runs the existing geometry + camera code in Node, writes
   `blender/data/scene.json` (road, footprints, landmarks) and `camera.json` (per-frame camera).
2. `blender/build_scene.py` — `blender -b -P` builds the `.blend` from JSON (deterministic).
3. `blender/render.py` — renders frame ranges (resumable), writes PNG masters.
4. `blender/encode.mjs` — crops/resizes/encodes WebP tiers + `manifest.json` into
   `public/media/landmarks/`.
All scripted, headless, reproducible. (Blender 5.2.2 LTS is installed; the Blender MCP is not
connected in this session — not needed, the CLI is better for a repeatable pipeline. It can be used
for interactive look-dev if connected.)

## Runtime integration

- New `FrameScrubber` (canvas, `createImageBitmap` decode off-main-thread, LRU of decoded frames,
  crossfade between nearest frames) replaces the Three.js scene renderer in the street phase only.
  The flat-map phase stays as is; crossfade into frame 0 over a short scroll range, where frame 0
  is rendered to match the flat map's top-down framing.
- Overlay projection uses a Three.js camera fed from `manifest.json` (no scene, math only).
- Remove the procedural street meshes once parity is reached; keep the code path behind a flag
  until sign-off.

## Phases and checkpoints (owner approves at each ★)

| # | Phase | Output | Est. |
|---|---|---|---|
| 0 | ★ Look spike | 2 stills (landmark 1 and 3) in Freestyle and Line Art vs the reference | 1 day |
| 1 | Data + camera export | `scene.json`, `camera.json`, a camera-path preview video | 0.5 day |
| 2 | Scene build | procedural facades, props, five landmarks; ★ 6 key stills | 2–3 days |
| 3 | Full render + encode | all frames, tiers, manifest; size report vs budget | 0.5 day + render time (est. 2–6 h) |
| 4 | Runtime integration | scrubber, overlays, loading tiers, reduced motion, mobile crop | 1.5 days |
| 5 | QA | fidelity harness on the rest of the page, overlay alignment checks per landmark, throttled-3G and low-end Android profiling; ★ owner review | 1 day |

## Risks

- **Payload vs audience** — mitigated by D; if budgets can't be met, drop full tier on mobile.
- **Flat-map → frame-0 seam** — frame 0 must match the 2D map exactly; verified by a pixel check.
- **Overlay drift** — per-frame camera export + per-landmark projection check in QA.
- **Freestyle render time** at 2560×1440 — render low-res for iteration, final overnight.
- **Change requests after rendering** cost a re-render (hours, not days) — lock the look at ★0/★2.
