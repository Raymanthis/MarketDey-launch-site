# Production street

`out/` is gitignored; everything in it is rebuilt by the scripts here.

| Step | Command | Output |
|---|---|---|
| Section export | `node blender/production/export_section.mjs` | `out/section.json` |
| Build the street | `blender -b --factory-startup -P blender/production/build_city.py` | `out/city.blend` |
| Pre-rendered ride frames | `blender/production/run_all.sh` | `public/media/ride/` (`?ride=frames`, the default) |
| Live model glb | see below | `public/media/street/` (`?ride=model`) |

## Live model (`?ride=model`)

```
blender -b --factory-startup blender/production/out/city.blend -P blender/production/export_glb.py
blender -b --factory-startup blender/production/out/city.blend -P blender/production/export_glb.py -- --only lite
```

Never saves `city.blend`. Writes `public/media/street/city.glb` (desktop, budget 400k triangles /
6 MB) and `city-lite.glb` (phones, 150k / 3 MB); raw exports stay in `out/glb/`. It decimates
(people and canopies to fixed budgets, buildings with a planar dissolve and a distance-graded
collapse), bakes one flat palette colour per face (COLOR_0, no normals, no textures), splits the
static city and the ground into 50 m road chunks, and compresses with `npx @gltf-transform/cli`
(instancing) and `npx gltfpack` (meshopt, float positions). Both tools are fetched by npx at
pinned versions; nothing is added to `package.json`. Ends with one `RESULT` line per file:
unique and drawn triangles, bytes.

The site loads the file in `src/components/sections/RideModel.js` and draws the ink lines in
real time with `src/lib/inkPass.js`. Node `city` grows during the map tilt; node `ground` does not.
Set `EXPORT_DEBUG=1` to print the heaviest remaining objects.

## Figures only (`?ride=hybrid`)

```
blender -b --factory-startup blender/production/out/city.blend -P blender/production/export_figures.py
```

Exports just the vehicles (veh*, parked xp*, okadas ok*) and the people to
`public/media/street/figures.glb` (desktop, ~1 MB, 4.2k-triangle people) and `figures-lite.glb`
(phones, ~0.5 MB). Hybrid mode draws everything else as the procedural line art and outlines the
figures with the ink pass.
