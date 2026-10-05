import pytest

BASELINE = {
    "sbp": 140, "dbp": 85, "total_cholesterol": 220, "hdl": 45, "bmi": 28,
    "hba1c": 6.0, "crp": 2.0, "waist": 100,
    "smoker": "no", "diabetic": "no", "highBp": "no", "highChol": "no",
    "bpMed": "no", "cholMed": "no",
}
FLAGS = {"smoker": "yes", "diabetic": "yes", "highBp": "yes", "highChol": "yes", "bpMed": "yes", "cholMed": "yes"}


@pytest.fixture
def setup(client, make_user, auth_headers, make_patient):
    headers = auth_headers(make_user(role="doctor"))
    patient = make_patient(headers)
    pid = patient.get("patient_id") or patient.get("id") or patient.get("patientId")
    return headers, pid


def _predict(client, headers, payload):
    response = client.post("/api/predict", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_categorical_flags_change_probability(client, setup):
    headers, pid = setup
    baseline = _predict(client, headers, {"patientId": pid, **BASELINE})
    flagged = _predict(client, headers, {"patientId": pid, **BASELINE, **FLAGS})
    print("baseline", baseline["probability"], "flags", flagged["probability"])
    assert baseline["probability"] != flagged["probability"]
    assert flagged["probability"] > baseline["probability"]


def test_minimal_payload_reports_missing_inputs(client, setup, db):
    headers, pid = setup
    result = _predict(client, headers, {"patientId": pid})
    assert "BPXOSY1" in result["missingInputs"]
    assert "LBXHGB" in result["missingInputs"]
    assert "RIDAGEYR" not in result["missingInputs"]
    assert result["modelVersion"] == "3.0.0"
    with db.cursor() as cursor:
        cursor.execute(
            "SELECT feature_value FROM assessment_feature_values WHERE assessment_id = %s AND feature_name = 'LBXHGB'",
            (result["assessmentId"],),
        )
        row = cursor.fetchone()
        assert row is not None and row["feature_value"] is None
        cursor.execute(
            "SELECT feature_value, value_type FROM assessment_feature_values WHERE assessment_id = %s AND feature_name = 'RIDAGEYR'",
            (result["assessmentId"],),
        )
        age = cursor.fetchone()
        assert age["value_type"] == "number" and float(age["feature_value"]) > 0
        cursor.execute("SELECT explanation_json FROM risk_assessments WHERE id = %s", (result["assessmentId"],))
        explanation = cursor.fetchone()["explanation_json"]
        assert explanation["modelVersion"] == "3.0.0"
        assert "LBXHGB" in explanation["missingInputs"]
        assert isinstance(explanation["decisionThreshold"], float)


def test_only_one_active_model(client, setup):
    headers, _ = setup
    response = client.get("/api/models", headers=headers)
    assert response.status_code == 200, response.text
    active = [m for m in response.json() if m["is_active"]]
    assert len(active) == 1
    assert active[0]["model_name"] == "CVD Stacked Ensemble"
    assert active[0]["model_version"] == "3.0.0"


def test_patient_without_dob_and_no_age_is_400(client, setup, db):
    headers, pid = setup
    with db.cursor() as cursor:
        cursor.execute("DELETE FROM patient_sensitive_data WHERE patient_id = %s", (pid,))
    db.commit()
    response = client.post("/api/predict", json={"patientId": pid}, headers=headers)
    assert response.status_code == 400, response.text
