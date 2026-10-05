#!/usr/bin/env bash
# Approximate the Vercel Python function bundle inside the Lambda Python 3.12
# image: install requirements, apply vercel.json excludeFiles, check the size
# limit (500 MB), import the app without a DB and score one row.
# The Back-End dir is mounted read-only; all writes go to the container's /tmp.
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${BUNDLE_IMAGE:-public.ecr.aws/lambda/python:3.12}"
LIMIT_MB=500

docker run --rm --security-opt label=disable --entrypoint bash -v "$BACKEND_DIR:/src:ro" "$IMAGE" -c '
set -euo pipefail
LIMIT_MB='"$LIMIT_MB"'
WORK=$(mktemp -d)
mkdir "$WORK/bundle"
# Mirrors vercel.json functions."app.py".excludeFiles (no tar/rsync in the image)
python3 - "$WORK/bundle" <<"PY"
import shutil, sys
from pathlib import Path
src, dst = Path("/src"), Path(sys.argv[1])
top = {"tests", "scripts", "database", ".pytest_cache", "requirements-dev.txt", "pytest.ini"}
for item in src.rglob("*"):
    rel = item.relative_to(src)
    if rel.parts[0] in top or "__pycache__" in rel.parts:
        continue
    if rel.parts[0] == "model" and item.suffix in {".csv", ".ipynb", ".png", ".npy"}:
        continue
    if item.is_file():
        (dst / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, dst / rel)
PY
cd "$WORK/bundle"
python3 -m pip install --quiet --no-cache-dir --disable-pip-version-check -r requirements.txt -t ./pkgs
echo "== Top 10 packages by size (MB) =="
du -sm pkgs/* 2>/dev/null | sort -rn | head -10
SIZE=$(du -sm . | cut -f1)
echo "== Bundle size: ${SIZE} MB (limit ${LIMIT_MB} MB) =="
if [ "$SIZE" -gt "$LIMIT_MB" ]; then
  echo "FAIL: bundle exceeds ${LIMIT_MB} MB" >&2
  exit 1
fi
# The Lambda image ships no libgomp; the bundle must use vendor/libgomp.so.1.
echo "== Import and score =="
env -u DATABASE_URL -u DATABASE_URL_UNPOOLED PYTHONPATH="pkgs:." \
  PATIENT_DATA_KEY="dummy-key-for-bundle-check-0123456789" python3 - <<"PY"
import app  # noqa: F401  (must import without a database)
from ml.inference import get_model, build_raw_row, predict_probability
get_model()
row = build_raw_row({"age": 55}, "male")
p = predict_probability(row)
assert 0.0 <= p <= 1.0
print(f"probability={p:.4f}")
PY
echo "OK: bundle verified"
'
