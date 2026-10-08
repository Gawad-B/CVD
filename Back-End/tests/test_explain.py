import math

import pytest

from ml import explain, inference
from ml.nhanes import RAW_COLUMNS

HIGH_RISK = {"age": 75, "sbp": 180, "smoker": "yes", "diabetic": "yes"}


def _high_risk_row():
    return inference.build_raw_row(HIGH_RISK, "male")


@pytest.mark.nodb
def test_row_equal_to_reference_returns_empty():
    reference = inference.get_schema()["reference_values"]
    row = {column: reference[column] for column in RAW_COLUMNS}
    assert explain.explain(row) == []


@pytest.mark.nodb
def test_high_risk_row_top_contribution_raises_risk():
    result = explain.explain(_high_risk_row())
    assert 0 < len(result) <= 5
    assert result[0]["delta"] > 0
    deltas = [abs(item["delta"]) for item in result]
    assert deltas == sorted(deltas, reverse=True)
    labels = inference.get_schema()["labels"]
    for item in result:
        assert set(item) == {"feature", "label", "value", "reference", "delta"}
        assert item["label"] == labels[item["feature"]]


@pytest.mark.nodb
def test_missing_columns_never_appear():
    row = _high_risk_row()
    missing = set(inference.missing_inputs(row))
    assert missing
    result = explain.explain(row, top_k=len(RAW_COLUMNS))
    assert not missing & {item["feature"] for item in result}
    assert not any(isinstance(item["value"], float) and math.isnan(item["value"]) for item in result)


@pytest.mark.nodb
def test_explain_calls_predict_proba_exactly_once():
    model = inference.get_model()
    original = model.predict_proba
    calls = []

    def counting(frame):
        calls.append(len(frame))
        return original(frame)

    model.predict_proba = counting
    try:
        explain.explain(_high_risk_row())
    finally:
        del model.predict_proba
    assert len(calls) == 1
    assert calls[0] > 1


@pytest.mark.nodb
def test_no_eligible_features_skips_model():
    model = inference.get_model()
    original = model.predict_proba
    calls = []
    model.predict_proba = lambda frame: calls.append(1) or original(frame)
    try:
        assert explain.explain(inference.build_raw_row({}, None)) == []
    finally:
        del model.predict_proba
    assert calls == []


@pytest.mark.nodb
def test_zero_delta_items_are_dropped(monkeypatch):
    import numpy as np

    row = _high_risk_row()
    eligible = len([c for c in RAW_COLUMNS if c in explain.inference.get_schema()["reference_values"]
                    and not inference._is_missing(row[c])])
    assert eligible > 2

    def flat(frame):
        proba = np.full((len(frame), 2), 0.3)
        proba[1, 1] = 0.3 + 0.1  # only the first substitution changes anything
        proba[0, 1] = 0.3
        return proba

    monkeypatch.setattr(inference.get_model(), "predict_proba", flat, raising=False)
    result = explain.explain(row, top_k=50)
    assert len(result) == 1 and result[0]["delta"] != 0


@pytest.fixture
def setup(client, make_user, auth_headers, make_patient):
    headers = auth_headers(make_user(role="doctor"))
    patient = make_patient(headers)
    pid = patient.get("patient_id") or patient.get("id") or patient.get("patientId")
    return headers, pid


def test_create_and_detail_carry_contributions(client, setup):
    headers, pid = setup
    payload = {"patientId": pid, "sbp": 180, "smoker": "yes", "diabetic": "yes", "age": 75}
    response = client.post("/api/risk-assessments", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    created = response.json()
    assert 0 < len(created["contributions"]) <= 5
    assert created["contributions"][0]["delta"] > 0

    detail = client.get(f"/api/risk-assessments/{created['assessmentId']}", headers=headers)
    assert detail.status_code == 200, detail.text
    explanation = detail.json()["explanation"]
    assert explanation["contributions"] == created["contributions"]
    assert explanation["modelVersion"] == created["modelVersion"]


def test_explain_failure_does_not_block_assessment(client, setup, monkeypatch):
    import app as app_module

    def boom(raw_row):
        raise RuntimeError("patient 123 secret")

    monkeypatch.setattr(app_module.explain_module, "explain", boom)
    headers, pid = setup
    response = client.post("/api/risk-assessments", json={"patientId": pid, "age": 60}, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["explanationError"] is True and body["contributions"] == []
    detail = client.get(f"/api/risk-assessments/{body['assessmentId']}", headers=headers).json()
    assert detail["explanation"]["explanationError"] is True
