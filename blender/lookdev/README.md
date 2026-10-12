# Look development: pencil-and-ink street stills

This folder holds the second pass at the Landmarks Journey street, after the owner rejected the ★0
spike (`blender/spike/`) as not professional. It renders pre-rendered frames that combine ink lines,
tonal pencil shading and paper grain, all from one scripted Blender scene. `blender/spike/` is
unchanged.

Owner review stills (WebP q92) are in `docs/plans/lookdev/`:

| still | desktop | mobile |
|---|---|---|
| (a) the spike's camera frame 10 | `a-1440x900.webp` | `a-390x844.webp` |
| (b) close pass at a shopfront, with a parked keke and a pedestrian | `b-1440x900.webp` | `b-390x844.webp` |
| (c) a transformer pole with wires against the sky, an almond tree and palms | `c-1440x900.webp` | `c-390x844.webp` |

Every size uses a 58° vertical FOV and a 1.75 m eye height. The portrait cut of (b) moves the
camera back 5.6 m, because a 28° horizontal view can't hold both the keke and the pedestrian.

## Build and render

Run these from the repo root. They need Blender 5.2 (`/opt/homebrew/bin/blender`).

```sh
# one-off, only to regenerate the people (see blender/ASSETS.md for the vendor setup)
BLENDER_USER_RESOURCES="$PWD/blender/assets/vendor/mpfb-extension/blender-user" \
  blender -b --factory-startup -P blender/lookdev/make_people.py -- --sheet

blender -b --factory-startup -P blender/lookdev/build_scene.py              # -> out/scene.blend (~3 s)
blender -b --factory-startup -P blender/lookdev/render.py -- --shots a,b,c --sizes 1440x900,390x844
blender -b --factory-startup -P blender/lookdev/render.py -- --ride 0-23 --sizes 1440x900,390x844
BPY=/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13   # numpy + OpenImageIO
$BPY blender/lookdev/composite.py blender/lookdev/out/passes/*.exr          # EXR passes -> out/*.png
python3 blender/lookdev/encode_test.py      # needs Pillow + numpy, cwebp/dwebp, avifenc/avifdec, ssimulacra2

# single-asset turnarounds while modelling: sedan suv danfo keke okada almond neem palm people
blender -b --factory-startup -P blender/lookdev/preview_asset.py -- keke
```

`render.py` writes a multilayer EXR per frame, containing tone, Freestyle ink and depth.
`composite.py` turns that EXR into the drawing in about a second, so you can tune the paper, grain
and ink weight without re-rendering. All randomness is seeded, so the paper texture is the same in
every frame.

The scripts:

| file | what |
|---|---|
| `common.py` | paths, sizes, the three shots, the ride camera (0.5 m steps) |
| `geo.py` | mesh builder; line collections; Manifold-boolean union per object; finalize |
| `materials.py` | pencil-tone emission materials; light curve; procedural line textures (slats, joints, corrugations, blocks, sign lettering) |
| `street.py` | buildings, compound walls, road section, poles, wires, kiosk, stalls, bench, tank |
| `carbody.py` | parametric saloon / SUV bodies with projected glass, lamp and plate decals |
| `vehicles.py` | wheels, danfo (VW T3), keke napep (Bajaj RE), okada (Boxer 150) |
| `trees.py` | tiered tropical almond, rounded shade tree, oil palm |
| `make_people.py` | MakeHuman/MPFB people → `blender/assets/people/people.blend` |
| `build_scene.py` | assembles the street |
| `render.py` | EEVEE tone layer + Freestyle ink layer → EXR |
| `composite.py` | graphite, paper tooth, atmosphere, ink → PNG |
| `encode_test.py` | WebP / AVIF compression test |

## What changed versus the spike, and why

| owner complaint / reference quality | spike | look-dev |
|---|---|---|
| **See-through line art** | white emission fills, lines only | Every surface is shaded. Freestyle runs with visibility culling against solid geometry, so hidden lines are gone. |
| **Doubled edges, z-fighting slivers** | overlapping boxes (frame on wall, sill on frame); every box's edges inked | Each building, wall, kiosk and pole is one object, fused with a Geometry-Nodes **Mesh Boolean (Manifold)**. Every loose part is its own operand, so overlapping parts become a single manifold. Every visible edge exists once, and coplanar splits are 180° creases that Freestyle ignores. Parts that rest on a surface float 2 mm above it. |
| **Lines through solids, plotted look** | 1 lineset per class, all edge types | Five linesets with a hierarchy: **outline** (silhouette, border, external contour) 1.6 px; **crease** 1.0 px; **material boundary** 0.7 px; **fine** small solids 0.85 px; **wires** 0.75 px; **foliage** 1.1 px with scalloped, broken strokes (px at 900 px height). Thickness falls to ×0.32 by 140 m, strokes taper at both ends, and colour and alpha fade to paper with distance. A 0.2–0.3 px Perlin wobble and a calligraphic term add hand texture. |
| **Grilles, slats, hatching as geometry edges** | thin quads inked twice (both long edges) | Grille bars, balusters, gate bars, razor wire, spokes, roof racks and palm leaflets are thin dark solids in a `nolines` collection. The tonal pass draws each as one anti-aliased dark stroke whose width follows perspective. Shutter slats, paving joints, corrugations, block courses and sign lettering are procedural line textures, held at about 1 px and faded out with distance, so they never alias into moiré. |
| **Tonal pencil shading** | none | Emission materials output a *pencil tone* = albedo × light curve(sun + sky, EEVEE shadows) × AO. Sunlit faces stay paper, shade and cast shadow are soft greys, and recesses are darker. Glass has a sill-to-head gradient and a soft reflection band, and shop interiors are dark. |
| **Paper and graphite** | flat colour | In `composite.py`, darkness is laid down as graphite on a toothy paper: a fine paper-tooth noise plus a faint diagonal stroke texture modulate the shading, and the ink is slightly broken by the same tooth. The paper is warm (#F6F4EE) with a low-frequency mottle, and the graphite is #2C2B29. Depth-based atmosphere fades to paper from 45 m to 260 m. |
| **Broken, stiff figures (box man)** | capsule people | **MakeHuman CC0** bodies, clothes, shoes and hair, rigged with MPFB's game-engine skeleton and posed in armature space: walk, stand, talk, head-load (hand steadying a basin of oranges on a head pad), okada rider, keke driver, seated on a bench. Wrappers, head-ties and basins are fitted to each posed body (hull-sampled skirt rings). Fingers are curled. |
| **Vehicles** | boxes | **Saloon and SUV**: parametric section lofts at 4 cm stations (Camry XV40 / Highlander XU40 dimensions), with boolean-cut wheel arches. Glass, lamps, grille and plates are fan-meshed decals projected onto the body. **Danfo**: VW T3 proportions, yellow with black waist stripes, sliding-door track and a roof rack. **Keke**: Bajaj RE proportions (2.64 × 1.30 × 1.71 m) — a curved tub with D-shaped doorways and rear arches, a lofted nose, a windscreen frame with wiper and mirrors, a swept canvas canopy with side and rear curtains and windows, a bench and saddle, and a spare wheel on the back. **Okada**: Boxer 150 with 26° fork rake, 36-spoke wheels, a finned inclined cylinder, exhaust, tank, seat and rack. |
| **Chaotic tree scribble** | random leaf strokes | Trees are leaf *masses*: flat, noise-displaced clumps on near-horizontal limbs (the almond's pagoda tiers) that are shaded as soft grey volume. Thousands of tangent leaf cards (never inked) break the silhouette and dapple the tone. Only the long contour runs of the mass get the scalloped foliage line. The palm is a ringed trunk with frond-base stubs, arching rachises and paired leaflet blades. |
| Freestyle cost | 30–38 s/frame | The ink is rendered on its own view layer that excludes `nolines` (≈80 % of the faces). That makes a frame **~10× faster** than putting everything in Freestyle's view map. |

Sapling Tree Gen is not bundled with Blender 5.2, so the trees are generated by our own script.
Quaternius assets are no longer CC0; see `blender/ASSETS.md`.

## Timings

Machine: M1 Pro, 8 cores, 16 GB. It was shared with other agents and a browser test run, so the load
average was 6–13 during the final renders, and above 40 during earlier tests. EEVEE at 64 TAA
samples. The tone layer alone takes about 3 s; the rest is Freestyle.

| frame | 1440×900 | 390×844 |
|---|---:|---:|
| still (a) | 25.9 s | 17.7 s |
| still (b) | 16.4 s | 6–8 s |
| still (c) | 14.5 s | 6.5 s |
| ride frames 0–23, mean (max) | 22.3 s (33.1 s) | 23.7 s (89.6 s, one frame under load) |

At about 22 s/frame, 300 ride frames take about 1.8 h per size on this machine. Compositing adds
about 1 s/frame.

## Compression test

The test uses 24 consecutive ride frames, 0.5 m apart along the driving lane from y = 15 m. Each
encode is scored with SSIMULACRA2 against the 8-bit PNG master: 90 or more is visually lossless,
about 80 is very high quality, and 70 is high. Grayscale variants are scored against the grayscale
master. I also read 100 % and 200 % crops of the window and grille region (`out/compress/<size>/crops/`).

Settings:
- WebP: `cwebp -m 6 -sharp_yuv -preset drawing`.
- AVIF: `avifenc -s 4`, 4:2:0 for colour and 4:0:0 for gray.

**1440×900** (PNG master is 1 692 KB/frame)

| variant | KB/frame | SSIMULACRA2 mean / min |
|---|---:|---:|
| webp q50 / q60 / q70 / q80 / q90 | 112 / 124 / 141 / 180 / 272 | 65.7 / 68.9 / 72.2 / 77.1 / 84.3 |
| webp-gray q50 / q60 / q70 / q80 / q90 | 112 / 123 / 140 / 180 / 272 | 68.7 / 71.7 / 75.1 / 80.2 / 87.0 |
| avif q40 / q50 / q60 / q70 / q80 | 62 / 99 / 150 / 190 / 244 | 60.3 / 70.5 / 79.0 / 82.9 / 86.3 |
| avif-gray q40 / q50 / q60 / q70 / q80 | 61 / 99 / 150 / 190 / 244 | 61.5 / 71.5 / **79.7** (min 78.8) / 83.8 / 87.4 |

**390×844** (PNG master is 343 KB/frame)

| variant | KB/frame | SSIMULACRA2 mean |
|---|---:|---:|
| webp q50 / q60 / q70 / q80 / q90 | 24 / 27 / 30 / 37 / 55 | 70.4 / 72.8 / 74.9 / 78.7 / 84.5 |
| webp-gray q50 / q60 / q70 / q80 / q90 | 24 / 27 / 30 / 37 / 55 | 73.2 / 75.4 / 77.5 / 81.2 / 86.7 |
| avif q40 / q50 / q60 / q70 / q80 | 15 / 23 / 32 / 38 / 49 | 65.9 / 73.6 / 79.5 / 82.3 / 85.9 |
| avif-gray q40 / q50 / q60 / q70 / q80 | 15 / 22 / **31** / 38 / 49 | 68.2 / 74.8 / **80.4** / 83.6 / 87.1 |

What the crops show:
- **Hairlines survive everywhere down to AVIF q50 and WebP q60.** The ink is high-contrast and
  compresses well.
- **What degrades first is the paper grain and the graphite tooth.** At AVIF q50 and below, and
  WebP q70 and below, the plaster walls go smooth and plastic, and the drawing loses its pencil feel.
- AVIF q60 keeps most of the grain. AVIF q70 and WebP q90 are indistinguishable from the master
  at 100 %.
- WebP has no true grayscale mode, so the "gray" input saves no bytes. It only scores higher
  because it skips the colour error. AVIF 4:0:0 saves under 1 %, because the frames are already
  near-neutral.

**Recommendation:**
- Ship **AVIF 4:0:0 at q60**: about **150 KB/frame** on desktop and **31 KB/frame** on mobile, the
  lowest setting with no visible loss of hairlines or grain.
- Use **q70** (190 / 38 KB) for hero or slow-scroll frames.
- Fall back to **WebP q80** (180 / 37 KB) for browsers without AVIF.
- Restore the warm paper tint in the page: draw the gray frame over a #F6F4EE background with
  `mix-blend-mode: multiply`.
- One more saving: bake the grain into a static overlay instead of every frame. I estimate 30–40 %
  smaller frames, but it is untested.

## Known gaps

- Figures are clean, believable silhouettes, but the faces have no drawn features, and the clothing
  set is MakeHuman's Western casual wear. There is no agbada or ankara print.
- Sign boards carry illegible scribble lettering, not real Delta State shop names.
- The almond tiers still read slightly cloud-like up close (shot (c)). The leaf-card density is the
  lever to push further.
- Far detail is a little sparse past about 120 m. The block ends at the junction, and the closing
  buildings are plain.
