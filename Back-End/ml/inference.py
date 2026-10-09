"""Serving-side helpers: map API inputs to the raw NHANES row and score it with the pipeline.

The pipeline (model/cvd_pipeline.joblib, built by model/cvd_nhanes_v2.ipynb) owns all feature
engineering, imputation and scaling via ml.nhanes. This module only translates request values
into raw NHANES columns with NHANES coding (yes = 1, no = 2, ...), leaving missing values as NaN
so the pipeline's imputer handles them.
"""
import json
import math
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import pandas as pd

from ml._native import import_lightgbm
from ml.nhanes import RAW_COLUMNS

NAN = float("nan")

RACE_CODES = {1, 2, 3, 4, 6, 7}

# input key -> raw NHANES column (numeric measurements)
NUMERIC_INPUTS = {
    "age": "RIDAGEYR",
    "income_ratio": "INDFMPIR",
    "bmi": "BMXBMI",
    "waist": "BMXWAIST",
    "sbp": "BPXOSY1",
    "dbp": "BPXODI1",
    "total_cholesterol": "LBXTC",
    "hdl": "LBDHDD",
    "hba1c": "LBXGH",
    "crp": "LBXHSCRP",
    "sodium": "LBXSNASI",
    "wbc": "LBXWBCSI",
    "hgb": "LBXHGB",
    "platelets": "LBXPLTSI",
    "rdw": "LBXRDW",
    "creatinine": "LBXSCR",
    "triglycerides": "LBXSTR",
    "uric_acid": "LBXSUA",
    "glucose": "LBXSGL",
    "urine_acr": "URDACT",
    "sleep_hours": "SLD012",
    "sleep_hours_weekend": "SLD013",
    "sedentary_minutes_alt": "PAD680",
}
# input key -> NHANES yes(1)/no(2) question
YES_NO_INPUTS = {
    "smoker": "SMQ020",
    "high_bp": "BPQ020",
    "high_chol": "BPQ080",
    "bp_med": "BPQ150",      # taking prescribed medicine for high blood pressure
    "chol_med": "BPQ101D",   # taking prescribed medicine to lower cholesterol
}
_YES = {"yes", "true", "1"}
_NO = {"no", "false", "0", "2"}

# Human-readable text for coded values (stored assessment inputs and explanations).
CODE_TEXT: Dict[str, Dict[int, str]] = {
    "RIAGENDR": {1: "Male", 2: "Female"},
    "RIDRETH3": {1: "Mexican American", 2: "Other Hispanic", 3: "Non-Hispanic White",
                 4: "Non-Hispanic Black", 6: "Non-Hispanic Asian", 7: "Other / multi-racial"},
    "DMDEDUC2": {1: "Less than 9th grade", 2: "9-11th grade", 3: "High school / GED",
                 4: "Some college / AA", 5: "College graduate or above"},
    "SMQ040": {1: "Yes", 2: "Yes", 3: "No"},
    "DIQ010": {1: "Yes", 2: "No", 3: "Borderline"},
    "HUQ010": {1: "Excellent", 2: "Very good", 3: "Good", 4: "Fair", 5: "Poor"},
    **{column: {1: "Yes", 2: "No"} for column in YES_NO_INPUTS.values()},
}


def _to_float(value: Any) -> float:
    if value is None or value == "":
        return NAN
    try:
        number = float(value)
    except (TypeError, ValueError):
        return NAN
    return number if math.isfinite(number) else NAN


def _text(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value).strip().lower()
    return text or None


def _yes_no(value: Any) -> float:
    text = _text(value)
    if text in _YES:
        return 1.0
    if text in _NO:
        return 2.0
    return NAN


def _diabetic(value: Any) -> float:
    return {"yes": 1.0, "true": 1.0, "1": 1.0, "no": 2.0, "false": 2.0, "0": 2.0, "2": 2.0,
            "borderline": 3.0, "3": 3.0}.get(_text(value) or "", NAN)


def _code_in(value: Any, allowed) -> float:
    number = _to_float(value)
    return number if not math.isnan(number) and number.is_integer() and int(number) in allowed else NAN


def _sex(value: Optional[str]) -> float:
    return {"male": 1.0, "female": 2.0}.get(_text(value) or "", NAN)


def build_raw_row(features: Dict[str, Any], patient_sex: Optional[str]) -> Dict[str, float]:
    row: Dict[str, float] = {column: NAN for column in RAW_COLUMNS}
    for key, column in NUMERIC_INPUTS.items():
        row[column] = _to_float(features.get(key))
    for key, column in YES_NO_INPUTS.items():
        row[column] = _yes_no(features.get(key))
    row["DIQ010"] = _diabetic(features.get("diabetic"))
    row["RIAGENDR"] = _sex(patient_sex)
    row["RIDRETH3"] = _code_in(features.get("race"), RACE_CODES)
    row["DMDEDUC2"] = _code_in(features.get("education"), range(1, 6))
    row["HUQ010"] = _code_in(features.get("general_health"), range(1, 6))
    smokes_now = _yes_no(features.get("smokes_now"))
    row["SMQ040"] = 1.0 if smokes_now == 1.0 else 3.0 if smokes_now == 2.0 else NAN
    # NHANES skip patterns: never-smokers are not asked about smoking now, and people never
    # told they have high BP are not asked about BP medication.
    if row["SMQ020"] == 2.0:
        row["SMQ040"] = 3.0
    if row["BPQ020"] == 2.0 and math.isnan(row["BPQ150"]):
        row["BPQ150"] = 2.0
    return {column: row[column] for column in RAW_COLUMNS}


def display_value(column: str, value: Any) -> Any:
    """Readable value for a raw column: decoded text for coded columns, the number otherwise."""
    if _is_missing(value):
        return None
    if column in CODE_TEXT:
        return CODE_TEXT[column].get(int(value), str(value))
    return float(value)


def _is_missing(value: Any) -> bool:
    return value is None or (isinstance(value, float) and math.isnan(value))


def missing_inputs(raw_row: Dict[str, Any]) -> List[str]:
    return [column for column in RAW_COLUMNS if _is_missing(raw_row.get(column))]


# Installed models: key -> sub-folder of the model directory and how the app should use the score.
# "prospective" models predict future events (inputs measured before the outcome), so their score can
# set the risk level; cross-sectional ones recognise existing disease and defer to AHA PREVENT.
# "age_range" is the age span of the training data; ages outside it are capped to it when scoring.
MODELS: Dict[str, Dict[str, Any]] = {
    "nhanes_cross_sectional": {
        "folder": "", "prospective": False, "age_range": (20, 80),
        "score_meaning": "probability of already-diagnosed CVD",
        "caveat": ("Shows how closely the profile resembles people already diagnosed with CVD. It is not a "
                   "future risk; use the AHA PREVENT 10-year risk for that."),
    },
    "nhanes_mortality": {
        "folder": "mortality", "prospective": True, "age_range": (20, 85),
        "score_meaning": "10-year probability of cardiovascular death",
        "caveat": ("Long-term risk for adults without existing CVD. It does not detect current disease or "
                   "short-term danger, and it counts deaths only, not survived heart attacks or strokes."),
    },
}
DEFAULT_MODEL_KEY = "nhanes_cross_sectional"


def _model_dir(key: str = DEFAULT_MODEL_KEY) -> Path:
    base = Path(os.getenv("MODEL_DIR") or (Path(__file__).resolve().parent.parent / "model"))
    return base / MODELS[key]["folder"]


def available_model_keys() -> List[str]:
    """Models whose artifacts are present (the default model is always listed first)."""
    return [key for key in MODELS if (_model_dir(key) / "cvd_pipeline.joblib").exists()]


def is_prospective(key: str) -> bool:
    return bool(MODELS.get(key, {}).get("prospective"))


def model_description(key: str) -> Dict[str, Any]:
    """What the model's score means, its caveat and the age span it was trained on."""
    config = MODELS.get(key, {})
    low, high = config.get("age_range", (None, None))
    return {"score_meaning": config.get("score_meaning"), "caveat": config.get("caveat"),
            "age_min": low, "age_max": high}


@lru_cache(maxsize=None)
def _load_model(key: str) -> Any:
    import_lightgbm()  # load the vendored libgomp first in case the pipeline holds a LightGBM model
    model = joblib.load(_model_dir(key) / "cvd_pipeline.joblib")
    features = model.named_steps.get("features") if hasattr(model, "named_steps") else None
    if features is not None:
        # Score ages outside the training data as the nearest trained age (NHANES top-codes age).
        features.age_min, features.age_max = MODELS[key]["age_range"]
    return model


@lru_cache(maxsize=None)
def _load_json(key: str, name: str) -> Dict[str, Any]:
    with (_model_dir(key) / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


# Public loaders: one cached object per model, however the key is passed.
def get_model(key: str = DEFAULT_MODEL_KEY) -> Any:
    return _load_model(key)


def get_schema(key: str = DEFAULT_MODEL_KEY) -> Dict[str, Any]:
    return _load_json(key, "feature_schema.json")


def get_metrics(key: str = DEFAULT_MODEL_KEY) -> Dict[str, Any]:
    return _load_json(key, "metrics_ml.json")


def to_frame(rows: List[Dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(
        [{column: row.get(column, NAN) for column in RAW_COLUMNS} for row in rows], columns=RAW_COLUMNS
    )
    return frame.apply(pd.to_numeric, errors="coerce")


def predict_probability(raw_row: Dict[str, Any], key: str = DEFAULT_MODEL_KEY) -> float:
    return float(get_model(key).predict_proba(to_frame([raw_row]))[0][1])
