# Pre-rendered ride frames — contract between the Blender pipeline and the site

Owner-approved look: `docs/plans/lookdev/` (Blender lookdev pipeline, `blender/lookdev/`).

## What the frames cover

`LandmarksJourneySection` progress `p` (0→1 over the section's 1800vh):

- `p < MAP_END (0.47)` — flat 2D map, **stays live** (unchanged; seamless handoff from Try-it).
- `MAP_END → RIDE_START (0.56)` — tilt from top-down to street level: **pre-rendered**.
- `RIDE_START → 1` — street-level ride past the five landmarks: **pre-rendered**.

The camera for every frame is sampled from the section's existing camera code at that frame's `p`,
with the heading smoothing (`hdS`) converged (deterministic), so overlays and timing stay identical.
At `p = MAP_END` the live map crossfades into frame 0 over `p ∈ [0.47, 0.475]`.

## Files

```
public/media/ride/
  manifest.json
  l/0000.avif … l/NNNN.avif     landscape 1600×1000 (16:10), native render
  l/0000.webp …                 WebP fallback
  p/0000.avif … p/NNNN.avif     portrait 780×1688 (≈ 390×844 @2x), native render
  p/0000.webp …
```

Grayscale AVIF q60 (q70 for frames within ±3 of each landmark stop), WebP q80 fallback. Frames are
drawn over the paper colour `#f7f5ef` with `mix-blend-mode: multiply` (paper tint lives in CSS).

## `manifest.json`

```json
{
  "version": 1,
  "count": 400,
  "p": [0.47, 1.0],
  "pAt": [0.47, 0.4713, "… one p value per frame, ascending"],
  "variants": {
    "l": { "w": 1600, "h": 1000, "fov": 58 },
    "p": { "w": 780, "h": 1688, "fov": 58 }
  },
  "formats": ["avif", "webp"],
  "bytes": { "l": { "avif": 0, "webp": 0 }, "p": { "avif": 0, "webp": 0 } },
  "camera": [ { "pos": [0, 0, 0], "quat": [0, 0, 0, 1] } ],
  "order": [0, 200, 100, 300, "… coarse-to-fine preload order (every 64th, 32nd, … 1st)"]
}
```

- `camera[i]` is in the **section's Three.js scene coordinates** (Y up, metres — the same frame as
  `W(s, side)` / `MK` in `LandmarksJourneySection.jsx`), so in-scene overlays (pins, signboards)
  project correctly through a `PerspectiveCamera` with the variant's vertical `fov`.
- `order` lists every index exactly once.

## Display rules (site)

- Variant by **aspect**: viewport aspect ≥ 1 → `l`, else `p`. Image is `object-fit: cover` centred.
- Show the frame whose `pAt` is nearest the current (smoothed) `p`; **cut, never crossfade** between
  adjacent frames. If that frame isn't loaded yet, show the nearest loaded frame.
- Overlays use `camera[i]` of the frame being shown (not an interpolated camera).
