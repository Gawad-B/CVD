"""Export global feature importance for the landing page.

Same method as the notebook's feature_importance.png: each tree model's feature_importances_
(XGBoost, LightGBM, random forest) is normalised to sum to 1 and the three are averaged. The
one-hot columns of a categorical input (e.g. BPQ101D_Yes and BPQ101D_No) are summed back into
that input, the top 5 are kept and scaled to whole percentages of the largest one.

Usage (from Back-End/):  python scripts/export_global_importance.py
Writes Front-End/src/app/landing/featureImportance.json as [{"label": str, "value": int}].
Does not import the FastAPI app, so no env vars are required.
"""
import json
import sys
from pathlib import Path

import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from ml import inference  # noqa: E402
from ml.features import RAW_CATEGORICAL_COLUMNS  # noqa: E402

OUTPUT = BACKEND.parent / "Front-End" / "src" / "app" / "landing" / "featureImportance.json"
TOP_N = 5
TREE_MODELS = ["xgb", "lgbm", "rf"]
ENGINEERED_LABELS = {
    "pulse_pressure": "Pulse pressure", "tc_hdl_ratio": "Cholesterol/HDL ratio",
    "bmi_age": "BMI × age", "waist_bmi": "Waist/BMI ratio", "sleep_diff": "Sleep difference",
    "hba1c_age": "HbA1c × age", "sbp_age": "Systolic BP × age", "log_crp": "hs-CRP (log)",
}


def source_column(name: str) -> str:
    """'num__LBXTC' -> 'LBXTC'; 'cat__BPQ101D_Yes' -> 'BPQ101D'."""
    name = name.split("__", 1)[-1]
    for column in RAW_CATEGORICAL_COLUMNS:
        if name.startswith(column + "_"):
            return column
    return name


def main() -> None:
    model = inference.get_model()
    labels = {**inference.get_schema()["labels"], **ENGINEERED_LABELS}
    importances = [np.asarray(model.base_models[name].feature_importances_, dtype=float) for name in TREE_MODELS]
    average = sum(values / (values.sum() + 1e-12) for values in importances) / len(importances)

    totals: dict = {}
    for name, value in zip(model.feature_names(), average):
        column = source_column(name)
        totals[column] = totals.get(column, 0.0) + float(value)

    top = sorted(totals.items(), key=lambda pair: pair[1], reverse=True)[:TOP_N]
    peak = top[0][1]
    result = [{"label": labels.get(column, column), "value": round(100 * value / peak)} for column, value in top]

    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"-> {OUTPUT}")
    for column, value in top:
        print(f"  {column:14s} importance={value:.4f}")


if __name__ == "__main__":
    main()
