"""Export global feature influence for the landing page.

For every row of model/testdata.csv, ml.explain computes the per-input counterfactual change
in model score (reference substitution). This script averages |delta| per raw column over all
test rows (inputs that are missing or equal to the reference contribute 0), keeps the top 5 and
scales them to whole percentages of the largest one.

Usage (from Back-End/):  python scripts/export_global_importance.py
Writes Front-End/src/app/landing/featureImportance.json as [{"label": str, "value": int}].
Does not import the FastAPI app, so no env vars are required.
"""
import json
import sys
from pathlib import Path

import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from ml import explain, inference  # noqa: E402
from ml.features import RAW_COLUMNS  # noqa: E402

OUTPUT = BACKEND.parent / "Front-End" / "src" / "app" / "landing" / "featureImportance.json"
TOP_N = 5


def main() -> None:
    frame = pd.read_csv(BACKEND / "model" / "testdata.csv")
    labels = inference.get_schema()["labels"]
    totals = {column: 0.0 for column in RAW_COLUMNS}

    for record in frame[RAW_COLUMNS].to_dict(orient="records"):
        for item in explain.explain(record, top_k=len(RAW_COLUMNS)):
            totals[item["feature"]] += abs(item["delta"])

    n_rows = len(frame)
    means = {column: total / n_rows for column, total in totals.items()}
    top = sorted(means.items(), key=lambda pair: pair[1], reverse=True)[:TOP_N]
    peak = top[0][1]
    result = [{"label": labels.get(column, column), "value": round(100 * mean / peak)} for column, mean in top]

    OUTPUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"{n_rows} test rows -> {OUTPUT}")
    for column, mean in top:
        print(f"  {column:10s} mean|delta|={mean:.4f}")


if __name__ == "__main__":
    main()
