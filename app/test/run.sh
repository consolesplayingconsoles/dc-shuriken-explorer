#!/usr/bin/env bash
# Shuriken's readers against the skill's: the same synthetic inputs through both, every result compared (parity), and the
# skill's version and compatibility list checked against Shuriken's reader table (it keeps up). No game data is used.
#   KICKOFF_SKILL=<folder of the skill>   (default: ~/workspace/skills/dc-decomp-kickoff)
set -euo pipefail
cd "$(dirname "$0")/.."
skill="${KICKOFF_SKILL:-$HOME/workspace/skills/dc-decomp-kickoff}"
[ -f "$skill/tests/compat/emit.py" ] || { echo "[parity] the skill is not at $skill (set KICKOFF_SKILL): the readers cannot be compared" >&2; exit 1; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
python3 "$skill/tests/compat/emit.py" --write "$tmp/files" > "$tmp/py.json"
node --import ./test/register.mjs test/parity.ts "$tmp/files" "$skill/VERSION" "$skill/tests/compat/golden.json" > "$tmp/ts.json"
python3 - "$tmp/py.json" "$tmp/ts.json" <<'PY'
import json, sys
py, ts = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
bad = 0
shared = [k for k in py if k.split(":")[0] in ("prs", "pressed", "pictures", "sounds", "motion", "motions", "motionimages", "md3", "zip", "tr4", "prm", "tagged", "trees", "ninja", "stretches", "flat", "scan")]
for k in shared:
    if k not in ts["cases"]:
        print("[parity] Shuriken has no result for " + k); bad = 1
    elif ts["cases"][k] != py[k]:
        print("[parity] DIFFERENT: %s\n    skill    %s\n    Shuriken %s" % (k, json.dumps(py[k]), json.dumps(ts["cases"][k]))); bad = 1
for p in ts["versionProblems"]:
    print("[versions] " + p); bad = 1
if bad:
    sys.exit(1)
print("[parity] ok: %d readers agree with the skill's; its version and compatibility list are read" % len(shared))
PY
