"""Per-prediction factor explanations by reference substitution.

For each provided (non-missing) input that differs from the training-population
reference value, the input is replaced by its reference and the model is re-scored.
delta = p(original) - p(substituted): the counterfactual change in model score if
this input took the reference value. Positive means the patient's value gives a higher
model score than the reference value would (not a causal effect). All variants are scored in one batch.
"""
import math
from typing import Any, Dict, List

from ml import inference
from ml.nhanes import RAW_COLUMNS

_TOLERANCE = 1e-9


def _missing(value: Any) -> bool:
    return value is None or (isinstance(value, float) and math.isnan(value))


def _differs(column: str, value: Any, reference: Any) -> bool:
    # Every raw column is numeric (coded answers use NHANES numeric codes).
    return abs(float(value) - float(reference)) > _TOLERANCE


def _plain(column: str, value: Any) -> Any:
    return inference.display_value(column, value)


def explain(raw_row: Dict[str, Any], top_k: int = 5, model_key: str = inference.DEFAULT_MODEL_KEY) -> List[Dict[str, Any]]:
    schema = inference.get_schema(model_key)
    references = schema["reference_values"]
    labels = schema["labels"]

    eligible = [
        column
        for column in RAW_COLUMNS
        if not _missing(raw_row.get(column))
        and column in references
        and _differs(column, raw_row[column], references[column])
    ]
    if not eligible:
        return []

    base = {column: raw_row.get(column, float("nan")) for column in RAW_COLUMNS}
    rows = [base]
    for column in eligible:
        variant = dict(base)
        variant[column] = references[column]
        rows.append(variant)

    probabilities = inference.get_model(model_key).predict_proba(inference.to_frame(rows))[:, 1]

    original = float(probabilities[0])
    items = [
        {
            "feature": column,
            "label": labels.get(column, column),
            "value": _plain(column, raw_row[column]),
            "reference": _plain(column, references[column]),
            "delta": round(original - float(probabilities[index]), 4),
        }
        for index, column in enumerate(eligible, start=1)
    ]
    items = [item for item in items if item["delta"] != 0]
    items.sort(key=lambda item: abs(item["delta"]), reverse=True)
    return items[:top_k]
