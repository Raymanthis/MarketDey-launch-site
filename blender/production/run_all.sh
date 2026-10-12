#!/bin/zsh
# Unattended production run: render (skip-existing) -> composite -> encode + manifest -> verify ->
# batch commits. Status line per stage in blender/production/out/STATUS; stops on the first error.
#   nohup blender/production/run_all.sh > blender/production/out/run_all.log 2>&1 &
set -e -o pipefail
cd "$(dirname "$0")/../.."
BPY=/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13
ST=blender/production/out/STATUS
TR=$'\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
status() { echo "$(date '+%F %T') $*" > $ST; echo "[run_all] $*"; }
trap 'status "FAILED at: $STAGE"' ERR
commit() { for i in 1 2 3 4 5 6 7 8 9 10; do git add -- "$2" && git commit -q -m "$1$TR" -- "$2" && return 0; sleep 5; done; return 1; }

for v in l p; do
  STAGE="render $v"; status "rendering $v"
  blender -b --factory-startup -P blender/production/render_frames.py -- --variants $v --skip-existing 2>&1 \
    | grep --line-buffered -E "\[frame|Traceback|Error: [^s]"
  n=$(ls blender/production/out/passes/$v/*.exr | wc -l | tr -d ' ')
  [[ $n -eq 400 ]] || { STAGE="render $v: only $n/400 passes"; false; }
  STAGE="composite $v"; status "compositing $v"
  $BPY blender/production/composite_frames.py --variants $v --jobs 4
  n=$(ls blender/production/out/frames/$v/*.png | wc -l | tr -d ' ')
  [[ $n -eq 400 ]] || { STAGE="composite $v: only $n/400 frames"; false; }
done

STAGE="encode"; status "encoding + manifest"
python3 blender/production/encode_manifest.py --jobs 6

STAGE="verify"; status "verifying manifest"
python3 - <<'PY'
import json, os
d = "public/media/ride"; m = json.load(open(f"{d}/manifest.json")); n = m["count"]
assert m["version"] == 1 and n == 400, n
assert len(m["pAt"]) == n and m["pAt"] == sorted(m["pAt"]) and m["p"] == [m["pAt"][0], m["pAt"][-1]]
assert sorted(m["order"]) == list(range(n)), "order is not a permutation"
assert set(m["camera"]) == {"l", "p"} and all(len(m["camera"][v]) == n for v in "lp")
assert m["variants"]["l"] == {"w": 1600, "h": 1000, "fov": 58} and m["variants"]["p"] == {"w": 780, "h": 1688, "fov": 58}
for v in "lp":
    for f in ("avif", "webp"):
        files = [f"{d}/{v}/{i:04d}.{f}" for i in range(n)]
        assert all(os.path.exists(x) for x in files), f"missing {v}/{f}"
        tot = sum(os.path.getsize(x) for x in files)
        assert m["bytes"][v][f] == tot > 0, (v, f, m["bytes"][v][f], tot)
print("[verify] ok", json.dumps(m["bytes"]))
PY

STAGE="commit"; status "committing"
for v in l p; do for f in avif webp; do
  git add -- public/media/ride/$v/*.$f
  for i in 1 2 3 4 5 6 7 8 9 10; do git commit -q -m "Add ride frames $v/$f$TR" -- public/media/ride/$v/*.$f && break; sleep 5; done
done; done
commit "Add ride frames manifest (contract rev 2)" public/media/ride/manifest.json
B=$(python3 -c "import json;print(json.dumps(json.load(open('public/media/ride/manifest.json'))['bytes']))")
status "DONE bytes $B"
