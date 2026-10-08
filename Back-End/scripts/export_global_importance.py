"""Export global feature importance for the landing page.

The served model is a calibrated logistic regression on standardised features
(model/cvd_nhanes_v2.ipynb), so a feature's importance is the absolute value of its coefficient
(averaged over the calibration folds): the change in log-odds per one standard deviation. The top 5 are scaled to
whole percentages of the largest one.

Usage (from Back-End/):  python scripts/export_global_importance.py
Writes Front-End/src/app/landing/featureImportance.json as [{"label": str, "value": int}].
Does not import the FastAPI app, so no env vars are required.
"""
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from ml import inference  # noqa: E402
from ml.nhanes import FEATURE_LABELS, model_coefficients  # noqa: E402

OUTPUT = BACKEND.parent / "Front-End" / "src" / "app" / "landing" / "featureImportance.json"
TOP_N = 5


def main() -> None:
    weights = model_coefficients(inference.get_model()).to_dict()
    top = sorted(weights.items(), key=lambda pair: abs(pair[1]), reverse=True)[:TOP_N]
    peak = abs(top[0][1])
    result = [{"label": FEATURE_LABELS[name], "value": round(100 * abs(weight) / peak)} for name, weight in top]

    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"-> {OUTPUT}")
    for name, weight in top:
        print(f"  {name:14s} coefficient={weight:+.3f}")


if __name__ == "__main__":
    main()
