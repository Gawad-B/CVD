"""Serving-side helpers: map API inputs to the raw NHANES row and score it with the pipeline.

The pipeline owns all preprocessing (imputation, scaling, encoding). This module only
translates request values into the raw columns the pipeline was trained on, leaving
missing values as NaN so the pipeline's imputers handle them.
"""
import json
import math
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

from ml.features import RAW_COLUMNS, RAW_NUMERIC_COLUMNS
from ml.stacked import StackedEnsemble

NAN = float("nan")

RACE_CODES = {
    1: "Mexican American",
    2: "Other Hispanic",
    3: "Non-Hispanic White",
    4: "Non-Hispanic Black",
    6: "Non-Hispanic Asian",
    7: "Other Race - Including Multi-Racial",
}
EDUCATION_CODES = {
    1: "Less than 9th grade",
    2: "9-11th grade (Includes 12th grade with no diploma)",
    3: "High school graduate/GED or equivalent",
    4: "Some college or AA degree",
    5: "College graduate or above",
}
ACTIVITY_UNIT_CODES = {1: "D", 2: "W", 3: "M", 4: "Y"}

# input key -> raw column
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
    # API names kept for compatibility, but the NHANES meaning differs from the names:
    #   vigorousActivityMinutes  -> PAD810Q: vigorous activity SESSIONS per unit (0-50)
    #   moderateActivityMinutes  -> PAD790Q: moderate activity SESSIONS per unit (0-50)
    #   sedentaryMinutes         -> PAD800 : MINUTES of moderate activity per SESSION (0-600)
    #   sedentaryMinutesAlt      -> PAD680 : SEDENTARY minutes per day (0-1440)
    "vigorous_activity": "PAD810Q",
    "moderate_activity": "PAD790Q",
    "sedentary_minutes": "PAD800",
    "sedentary_minutes_alt": "PAD680",
    "sleep_hours": "SLD012",
    "sleep_hours_weekend": "SLD013",
}
YES_NO_INPUTS = {
    "smoker": "SMQ020",
    "high_bp": "BPQ020",
    "high_chol": "BPQ080",
    "bp_med": "BPQ101D",
    "chol_med": "RXQ033",
}
_YES = {"yes", "true", "1"}
_NO = {"no", "false", "0", "2"}


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


def _yes_no(value: Any) -> Any:
    text = _text(value)
    if text in _YES:
        return "Yes"
    if text in _NO:
        return "No"
    return NAN


def _diabetic(value: Any) -> Any:
    text = _text(value)
    if text in _YES:
        return "Yes"
    if text in _NO:
        return "No"
    if text == "borderline":
        return "Borderline"
    return NAN


def _coded(value: Any, table: Dict[int, str]) -> Any:
    number = _to_float(value)
    if math.isnan(number) or not number.is_integer():
        return NAN
    return table.get(int(number), NAN)


def _activity_unit(value: Any) -> Any:
    text = _text(value)
    if text is not None and text.upper() in ACTIVITY_UNIT_CODES.values():
        return text.upper()
    return _coded(value, ACTIVITY_UNIT_CODES)


def _sex(value: Optional[str]) -> Any:
    text = _text(value)
    if text == "male":
        return "Male"
    if text == "female":
        return "Female"
    return NAN


def build_raw_row(features: Dict[str, Any], patient_sex: Optional[str]) -> Dict[str, object]:
    row: Dict[str, object] = {column: NAN for column in RAW_COLUMNS}
    for key, column in NUMERIC_INPUTS.items():
        row[column] = _to_float(features.get(key))
    for key, column in YES_NO_INPUTS.items():
        row[column] = _yes_no(features.get(key))
    row["DIQ010"] = _diabetic(features.get("diabetic"))
    row["RIAGENDR"] = _sex(patient_sex)
    row["RIDRETH3"] = _coded(features.get("race"), RACE_CODES)
    row["DMDEDUC2"] = _coded(features.get("education"), EDUCATION_CODES)
    row["PAD790U"] = _activity_unit(features.get("moderate_activity_units"))
    return {column: row[column] for column in RAW_COLUMNS}


def _is_missing(value: Any) -> bool:
    return value is None or (isinstance(value, float) and math.isnan(value))


def missing_inputs(raw_row: Dict[str, Any]) -> List[str]:
    return [column for column in RAW_COLUMNS if _is_missing(raw_row.get(column))]


def _model_dir() -> Path:
    return Path(os.getenv("MODEL_DIR") or (Path(__file__).resolve().parent.parent / "model"))


@lru_cache(maxsize=1)
def get_model() -> StackedEnsemble:
    return StackedEnsemble.load(_model_dir(), get_schema()["skew_columns"])


@lru_cache(maxsize=1)
def get_schema() -> Dict[str, Any]:
    with (_model_dir() / "feature_schema.json").open("r", encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def get_metrics() -> Dict[str, Any]:
    with (_model_dir() / "metrics_ml.json").open("r", encoding="utf-8") as handle:
        return json.load(handle)


def to_frame(rows: List[Dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(
        [{column: row.get(column, NAN) for column in RAW_COLUMNS} for row in rows], columns=RAW_COLUMNS
    )
    for column in RAW_NUMERIC_COLUMNS:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    return frame


def predict_probability(raw_row: Dict[str, Any]) -> float:
    return float(get_model().predict_proba(to_frame([raw_row]))[0][1])
