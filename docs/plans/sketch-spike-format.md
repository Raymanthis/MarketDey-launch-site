# ★0 sketch spike — data contract between Blender and the browser viewer

All files live in `public/media/<set>/` (`<set>` = `spike` for the Blender block,
`spike-synth` for the viewer's synthetic test data). Coordinates are **Three.js convention:
Y up, metres, right-handed** (Blender Z-up must be converted on export: x→x, z→y, −y→z).

## Street frame of reference

Road centreline is the line x = 0, running from z = +10 to z = −130. Camera starts near
z = 0 looking toward −Z. Road 7 m wide (x ∈ [−3.5, 3.5]), kerbs, 2 m walkways, building
fronts at |x| ≈ 6–7.

## `lines.json`

```json
{
  "version": 1,
  "count": 123456,
  "min": [-40, -0.5, -140],
  "max": [40, 30, 20],
  "stride": 14,
  "classes": ["structure", "detail", "fine"],
  "features": ["general", "building", "vehicle", "tree", "wire", "person", "landmark"]
}
```

## `lines.bin`

`count` records, little-endian, `stride` = 14 bytes each:

| bytes | type | field |
|---|---|---|
| 0–11 | 6 × int16 | ax, ay, az, bx, by, bz — quantised |
| 12 | uint8 | class index into `classes` |
| 13 | uint8 | feature index into `features` |

Dequantise: `v = min[i] + (q + 32768) / 65535 * (max[i] − min[i])`.

## `fills.glb`

White occluder geometry (buildings, vehicles, poles, trees' trunk volumes) in the same frame.
glTF is Y-up natively. No materials needed (the viewer assigns its own). Keep under ~1 MB.

## `camera.json`

```json
{ "fov": 58, "frames": [ { "pos": [-1.2, 1.75, 0], "target": [-1.2, 1.6, -60] } ] }
```

`fov` is vertical, in degrees. 20 frames for the spike; the viewer interpolates linearly
between consecutive frames as the page scrolls.
