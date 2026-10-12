# ★0 sketch spike: Blender side

This folder builds the dense Delta State street block for the ★0 look bake-off described in
`docs/plans/landmarks-sketch-street.md`. It renders a Freestyle still (option b) and bakes the
line buffer that the browser viewer draws live (option a). The output format is the contract in
`docs/plans/sketch-spike-format.md`.

Everything is scripted and headless, so no GUI steps are needed. All randomness is seeded, so a
rebuild gives bit-identical `lines.bin` and `fills.glb`.

## Run

Run these from the repo root. Blender 5.2.2 LTS is at `/opt/homebrew/bin/blender`.

```sh
blender -b --factory-startup -P blender/spike/build_block.py      # -> blender/spike/out/block.blend      (~2 s)
blender -b --factory-startup -P blender/spike/bake_lines.py       # -> public/media/spike/*               (~2 s)
blender -b --factory-startup -P blender/spike/check_bake.py       # -> stats + PNGs in blender/spike/out/ (~4 s)
blender -b --factory-startup -P blender/spike/render_freestyle.py # -> freestyle-1440x900.png, -390x844.png
#   options: -- --sizes 1440x900,390x844 --frame 10
```

`common.py` holds the shared constants: the frame conversion, the camera path, the colours, the
fade ranges and the line weights. `blender/spike/out/` is gitignored.

## What is in the block

The block is about 142 m of street. The road centreline is x = 0, running from Three z = +10 to
z = −132. A cross street and three closing buildings stand at z ≈ −124 to −143.

- **Road:** 7 m of asphalt, kerbs, open culverts with cover slabs at intervals, and 2 m walkways
  with paving joints. It has a dashed centreline, edge lines, paving seams, a zebra crossing, a
  stop line, 2 manholes, patches and cracks.
- **Buildings:** 14 buildings, 7 per side, plus 3 at the far end. They are 2–4 storeys of 3.2 m,
  8–16 m wide, and set back 0–1.5 m from the walkway. The gaps between them have block or
  plastered compound walls with piers, steel gates and razor-wire coils, and some have a
  bungalow behind.
- **Facade modules:**
  - window bays with frames, mullions, glazing beads and sills;
  - sunshade hoods, with shadow hatching on the glass under them;
  - louvre windows;
  - burglar-proof grilles, in bars and diamond-lattice variants;
  - balconies, either railed with balusters or solid with pierced openings;
  - parapets with breeze-block panels, or gable roofs with corrugations;
  - roll-up shutters with slats, and glazed shopfronts with hatched interiors;
  - corrugated canopies with blank signboard frames;
  - blade signs, drainpipes, AC units, one water tank on a stand and one rooftop sign frame.
- **Street life:**
  - 4 power poles with crossarms, braces, stacked insulators, a transformer and a street lamp;
  - 10 sagging wires (catenary), including a tangled telecom pair and 2 that cross the street;
  - 2 almond trees with tiered canopies, and 2 palms with ringed trunks and leaflets;
  - a sedan and an SUV parked at the kerbs;
  - a keke napep, and an okada with its rider;
  - 4 pedestrians: a trader with a head basin, a woman in a wrapper, a man with a cap and a
    bag, and a man at the kiosk;
  - a kiosk, and 3 umbrella stalls with tables and wares.

Every object carries the custom props `line_class` (structure/detail/fine), `feature`
(contract list), `bake_mode` and `fill`. Parts are split into separate objects by class. For
example, a building has a shell (structure), frames and bands (detail), and grille bars,
slats, louvres and hatching (fine).

## Bake rules (`bake_lines.py`)

Each object's `bake_mode` decides which of its edges are exported:

| `bake_mode` | used for | exported |
|---|---|---|
| `edges` | boxes, prisms | boundary edges, creases with dihedral > 25°, material boundaries, loose edges |
| `smooth` | poles, trunks, people, wheels, pipes, tank | boundary edges, creases > 60°, silhouettes seen from camera frame 10 |
| `centerline` | grille bars, slats, corrugations, joints, hatching, leaf strokes, palm leaflets | one segment per thin quad |
| `curve` | wires | the stored catenary polyline (12–16 segments per span) |
| `none` | canopy volumes, ground | nothing, because these are occluders only |

Tree foliage is exported as clustered short curved strokes on the canopy surface, two segments
each, not as mesh edges. Coplanar split edges fail the angle test. Duplicates are removed
globally on a 1 mm grid, in either direction.

`fills.glb` merges every `fill=1` object: building shells, roofs, canopies, road and walkways,
vehicle bodies and wheels, poles, trunks, tree canopy volumes, people, the kiosk and the
umbrellas. Vertices are welded at 1 mm and the mesh is triangulated. It has no materials, no
normals and no UVs.

## Measured (2026-10-12, M1 Pro, machine shared with another agent, load avg ≈ 12)

Segments: **88,201**.

| class | segments |
|---|---|
| structure | 1,682 |
| detail | 36,202 |
| fine | 50,317 |

The same segments by feature:

| feature | segments |
|---|---|
| building | 60,199 |
| general | 11,709 |
| tree | 12,784 |
| vehicle | 1,891 |
| person | 1,466 |
| wire | 152 |

File sizes:

| file | raw | gzip -9 |
|---|---|---|
| `lines.bin` | 1,234,814 B | 491,320 B |
| `fills.glb` | 109,152 B (4,737 verts, 8,602 tris) | 65,787 B |
| `camera.json` | 2,289 B | 327 B |
| `lines.json` | 334 B | 201 B |

Bounds in Three.js coordinates run from (−30.01, −0.62, −143.51) to (30.01, 14.01, 10.01).
The quantisation step is 0.9 / 0.2 / 2.3 mm in x / y / z.

Freestyle wall-clock time per frame on EEVEE, from camera frame 10:

| size | first runs, lighter scene, load avg ≈ 7 | final scene, load avg ≈ 12 |
|---|---|---|
| 1440×900 | 29 s | 37 s |
| 390×844 | 26 s | 38 s |

Almost all of that time is Freestyle's view map and strokes, not EEVEE. The 390×844 frame
costs about the same as the large one because the cost scales with edges, not pixels.

## Camera

`camera.json` is 20 frames in Three.js coordinates:

- x = −1.2 throughout;
- z runs from 0 to −40 in equal steps;
- eye height is 1.75 + 0.03·sin(2πi/10);
- the target is 60 m ahead at y = 1.6;
- `fov` is 58, vertical.

"Frame 10" in the renders and previews means `frames[10]`, counting from 0, which is z ≈ −21.05.

## Outputs in `blender/spike/out/`

- `block.blend`
- `freestyle-1440x900.png` and `freestyle-390x844.png`
- `preview-bake-1440x900.png` and `preview-bake-390x844.png`: the baked segments drawn as 1 px
  lines from frame 10. They are depth-tested against `fills.glb` and fade with distance.
- `bake-topdown.png`: a plan view of all segments. Black is structure, blue is detail and
  orange is fine. The far end is at the top.
