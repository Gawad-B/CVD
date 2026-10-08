"""Guideline-based clinical alerts that run alongside the ML model.

The model is trained on a small NHANES sample in which young adults almost never have CVD,
so it can score a young patient with dangerous readings as low risk. These rules look at the
raw readings only (never at the model score) and can raise the assessment's risk level to a
minimum ("floor"); they never lower it. Thresholds follow common ACC/AHA and ADA cut-offs.
"""
from typing import Any, Dict, List, Optional

RISK_ORDER = {"low": 0, "medium": 1, "high": 2}

# Major risk factors: three or more together raise the floor to high.
_MAJOR = {"bp_crisis", "bp_stage2", "cholesterol_high", "hba1c_diabetes", "hdl_low", "smoker"}


def _number(value: Any) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None  # drop NaN


def _yes(value: Any) -> bool:
    return str(value).strip().lower() in {"yes", "true", "1"}


def _alert(code: str, severity: str, title: str, detail: str) -> Dict[str, str]:
    return {"code": code, "severity": severity, "title": title, "detail": detail}


def evaluate(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Alerts for the assessment inputs (keys as in app._assessment_inputs) and the risk floor."""
    sbp, dbp = _number(inputs.get("sbp")), _number(inputs.get("dbp"))
    total_cholesterol = _number(inputs.get("total_cholesterol"))
    hdl, hba1c = _number(inputs.get("hdl")), _number(inputs.get("hba1c"))
    bmi, crp = _number(inputs.get("bmi")), _number(inputs.get("crp"))
    bp = f"{sbp:g}/{dbp:g} mmHg" if sbp is not None and dbp is not None else "BP"

    alerts: List[Dict[str, str]] = []
    if (sbp is not None and sbp >= 180) or (dbp is not None and dbp >= 120):
        alerts.append(_alert("bp_crisis", "critical", "Hypertensive crisis range",
                             f"{bp} (≥180 systolic or ≥120 diastolic). Needs prompt clinical assessment."))
    elif (sbp is not None and sbp >= 140) or (dbp is not None and dbp >= 90):
        alerts.append(_alert("bp_stage2", "warning", "Stage 2 hypertension range",
                             f"{bp} (≥140 systolic or ≥90 diastolic)."))
    if total_cholesterol is not None and total_cholesterol >= 240:
        alerts.append(_alert("cholesterol_high", "warning", "High total cholesterol",
                             f"{total_cholesterol:g} mg/dL (≥240)."))
    if hba1c is not None and hba1c >= 6.5:
        alerts.append(_alert("hba1c_diabetes", "warning", "HbA1c in diabetes range",
                             f"{hba1c:g}% (≥6.5)."))
    if hdl is not None and hdl < 40:
        alerts.append(_alert("hdl_low", "info", "Low HDL", f"{hdl:g} mg/dL (<40)."))
    if _yes(inputs.get("smoker")):
        alerts.append(_alert("smoker", "info", "Smoker", "Current or former smoker."))
    if bmi is not None and bmi >= 30:
        alerts.append(_alert("obesity", "info", "Obesity", f"BMI {bmi:g} (≥30)."))
    if crp is not None and crp > 10:
        alerts.append(_alert("crp_high", "info", "Markedly raised hs-CRP",
                             f"{crp:g} mg/L (>10); may reflect acute inflammation, consider repeating."))

    codes = {a["code"] for a in alerts}
    if any(a["severity"] == "critical" for a in alerts) or len(codes & _MAJOR) >= 3:
        floor = "high"
    elif any(a["severity"] == "warning" for a in alerts):
        floor = "medium"
    else:
        floor = "low"
    return {"alerts": alerts, "floor": floor}


def apply_floor(model_level: str, floor: str) -> str:
    """The higher of the model's level and the guideline floor."""
    return floor if RISK_ORDER.get(floor, 0) > RISK_ORDER.get(model_level, 0) else model_level
