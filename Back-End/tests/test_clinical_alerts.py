import pytest

import clinical_alerts
from tests.test_predict_api import setup  # noqa: F401  (fixture; client comes from conftest)


def codes(result):
    return [a["code"] for a in result["alerts"]]


@pytest.mark.nodb
def test_normal_readings_raise_nothing():
    result = clinical_alerts.evaluate({"sbp": 118, "dbp": 76, "total_cholesterol": 180, "hdl": 55, "hba1c": 5.4,
                                       "bmi": 24, "crp": 1, "smoker": "no"})
    assert result == {"alerts": [], "floor": "low"}


@pytest.mark.nodb
def test_hypertensive_crisis_is_critical_and_floors_high():
    result = clinical_alerts.evaluate({"sbp": 182, "dbp": 95})
    assert codes(result) == ["bp_crisis"]
    assert result["alerts"][0]["severity"] == "critical"
    assert result["floor"] == "high"
    assert clinical_alerts.evaluate({"sbp": 150, "dbp": 120})["floor"] == "high"  # diastolic alone


@pytest.mark.nodb
def test_single_warning_floors_medium():
    stage2 = clinical_alerts.evaluate({"sbp": 145, "dbp": 85})
    assert codes(stage2) == ["bp_stage2"]
    assert stage2["floor"] == "medium"
    assert clinical_alerts.evaluate({"total_cholesterol": 240})["floor"] == "medium"
    assert clinical_alerts.evaluate({"hba1c": 6.5})["floor"] == "medium"


@pytest.mark.nodb
def test_info_alerts_alone_do_not_raise_but_three_major_factors_do():
    assert clinical_alerts.evaluate({"smoker": "yes", "bmi": 32, "crp": 12})["floor"] == "low"
    assert clinical_alerts.evaluate({"smoker": "yes", "hdl": 35, "total_cholesterol": 250})["floor"] == "high"


@pytest.mark.nodb
def test_missing_and_invalid_values_are_ignored():
    assert clinical_alerts.evaluate({"sbp": None, "dbp": "", "hba1c": float("nan"), "smoker": None}) == {
        "alerts": [], "floor": "low"}


@pytest.mark.nodb
def test_apply_floor_never_lowers():
    assert clinical_alerts.apply_floor("low", "high") == "high"
    assert clinical_alerts.apply_floor("high", "medium") == "high"
    assert clinical_alerts.apply_floor("medium", "low") == "medium"


def test_young_patient_with_crisis_readings_is_raised_to_high(client, setup):  # noqa: F811
    headers, patient_id = setup
    payload = {"patientId": patient_id, "age": 21, "bmi": 30, "waistCm": 90, "systolicBp": 190, "diastolicBp": 110,
               "totalCholesterol": 300, "hdl": 80, "hba1cPercent": 7, "hsCrp": 20, "wbc": 7, "hemoglobin": 12,
               "platelets": 250, "rdw": 17, "incomeRatio": 0.01, "smoker": "yes", "highBp": "yes", "bpMed": "no"}
    response = client.post("/api/risk-assessments", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["modelRiskLevel"] == "low"  # the ML model alone says low
    assert body["prevent"]["available"] is False and "age 21" in body["prevent"]["reason"]
    assert body["riskSource"] == "model" and body["baseRiskLevel"] == "low"
    assert body["riskLevel"] == "high"
    assert body["recommendation"].startswith("High risk")
    assert {"bp_crisis", "cholesterol_high", "hba1c_diabetes", "smoker"} <= {a["code"] for a in body["clinicalAlerts"]}

    stored = client.get(f"/api/risk-assessments/{body['assessmentId']}", headers=headers).json()
    assert stored["risk_level"] == "high"
    assert stored["explanation"]["modelRiskLevel"] == "low"
    assert stored["explanation"]["clinicalAlerts"][0]["code"] == "bp_crisis"


def test_prevent_sets_the_level_when_it_applies(client, setup):  # noqa: F811
    headers, patient_id = setup
    payload = {"patientId": patient_id, "age": 62, "bmi": 29, "systolicBp": 150, "diastolicBp": 85,
               "totalCholesterol": 230, "hdl": 40, "creatinine": 1.0, "diabetic": "yes", "smoker": "yes",
               "smokesNow": "yes", "highBp": "yes", "bpMed": "yes", "cholMed": "no", "hba1cPercent": 7.2}
    body = client.post("/api/risk-assessments", json=payload, headers=headers).json()
    assert body["prevent"]["available"] is True
    assert body["prevent"]["model"] == "hba1c" and body["prevent"]["risk"] > 0.2
    assert body["riskSource"] == "prevent" and body["baseRiskLevel"] == "high"
    assert body["riskLevel"] == "high"
