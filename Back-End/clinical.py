"""Clinical additions shared by the assessment endpoints: heart rate, clinician override, effective values.

Everything here is pure (SQL fragments, serialisation, request model); the endpoints in app.py
still apply `scoping.patient_scope_sql` to every query that uses these fragments.
"""
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

RISK_LEVELS = ("low", "medium", "high")

# Select-list and join for the override columns; `ra` is risk_assessments.
OVERRIDE_COLUMNS_SQL = (
    "ra.heart_rate_bpm, ra.override_risk_level, ra.override_recommendation, ra.override_reason, "
    "ra.overridden_at, obu.username AS overridden_by_username"
)
OVERRIDE_JOIN_SQL = "LEFT JOIN users obu ON obu.id = ra.overridden_by"

# Risk level as the clinician sees it: an override wins over the model's level.
EFFECTIVE_RISK_SQL = "COALESCE(ra.override_risk_level, ra.risk_level)"


class OverrideRequest(BaseModel):
    riskLevel: Optional[str] = None
    recommendation: Optional[str] = Field(default=None, max_length=2000)
    reason: str = Field(max_length=2000)

    @field_validator("riskLevel")
    @classmethod
    def _check_level(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        level = value.strip().lower()
        if level not in RISK_LEVELS:
            raise ValueError("riskLevel must be one of low, medium, high")
        return level

    @field_validator("recommendation")
    @classmethod
    def _check_recommendation(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        text = value.strip()
        if not text:
            raise ValueError("recommendation must not be blank")
        return text

    @field_validator("reason")
    @classmethod
    def _check_reason(cls, value: str) -> str:
        text = value.strip()
        if len(text) < 5:
            raise ValueError("reason must be at least 5 characters")
        return text

    @model_validator(mode="after")
    def _need_a_change(self) -> "OverrideRequest":
        # Merge semantics: an omitted field is kept, an explicit null clears it.
        if not ({"riskLevel", "recommendation"} & self.model_fields_set):
            raise ValueError("Provide riskLevel and/or recommendation (null clears a field)")
        return self


def serialize_override(row: Dict[str, Any], to_iso: Any) -> Dict[str, Any]:
    """Override + effective fields for an assessment row carrying OVERRIDE_COLUMNS_SQL, risk_level, recommendation_text."""
    return {
        "heart_rate_bpm": row.get("heart_rate_bpm"),
        "override_risk_level": row.get("override_risk_level"),
        "override_recommendation": row.get("override_recommendation"),
        "override_reason": row.get("override_reason"),
        "overridden_by_username": row.get("overridden_by_username"),
        "overridden_at": to_iso(row.get("overridden_at")),
        "effective_risk_level": row.get("override_risk_level") or row.get("risk_level"),
        "effective_recommendation": row.get("override_recommendation") or row.get("recommendation_text") or "",
    }


def feature_value(row: Dict[str, Any]) -> Any:
    """Stored assessment feature -> JSON value: NULL stays null, numeric features come back as numbers."""
    raw = row["feature_value"]
    if raw is None:
        return None
    if row.get("value_type") == "number":
        try:
            number = float(raw)
        except ValueError:
            return raw
        return int(number) if number.is_integer() else number
    return raw
