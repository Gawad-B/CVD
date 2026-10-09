"""Two installed models (cross-sectional NHANES 2021-2023, 10-year CVD death) and switching between them."""
import pytest

from ml import inference

MORTALITY = "CVD 10-year Mortality Logistic"
CROSS_SECTIONAL = "CVD NHANES Logistic"

pytestmark = pytest.mark.skipif(
    "nhanes_mortality" not in inference.available_model_keys(), reason="mortality model artifacts not built"
)

PAYLOAD = {"age": 62, "bmi": 29, "systolicBp": 150, "diastolicBp": 85, "totalCholesterol": 230, "hdl": 40,
           "creatinine": 1.0, "diabetic": "no", "smoker": "yes", "smokesNow": "yes", "highBp": "yes",
           "bpMed": "yes", "highChol": "yes", "cholMed": "no", "hba1cPercent": 5.8, "generalHealth": 3}


@pytest.fixture
def admin(make_user, auth_headers):
    return auth_headers(make_user(role="admin"))


def _models(client, headers):
    response = client.get("/api/models", headers=headers)
    assert response.status_code == 200, response.text
    return {m["model_name"]: m for m in response.json()}


def test_both_models_are_listed_and_the_default_is_active(client, admin):
    models = _models(client, admin)
    assert models[CROSS_SECTIONAL]["status"] == "active"
    assert models[MORTALITY]["status"] == "available"
    assert models[MORTALITY]["metrics"]["score_meaning"] == "10-year probability of cardiovascular death"
    assert models[MORTALITY]["metrics"]["age_max"] == 85 and models[CROSS_SECTIONAL]["metrics"]["age_max"] == 80
    assert sum(m["is_active"] for m in models.values()) == 1


def test_admin_switches_model_and_new_assessments_use_it(client, admin, make_patient):
    pid = make_patient(admin)["patient_id"]
    before = client.post("/api/risk-assessments", json={"patientId": pid, **PAYLOAD}, headers=admin).json()
    assert before["modelName"] == CROSS_SECTIONAL and before["riskSource"] == "prevent"

    target = _models(client, admin)[MORTALITY]["model_id"]
    response = client.post(f"/api/models/{target}/activate", headers=admin)
    assert response.status_code == 200, response.text
    models = _models(client, admin)
    assert models[MORTALITY]["is_active"] and not models[CROSS_SECTIONAL]["is_active"]

    after = client.post("/api/risk-assessments", json={"patientId": pid, **PAYLOAD}, headers=admin).json()
    assert after["modelName"] == MORTALITY
    assert after["scoreMeaning"] == "10-year probability of cardiovascular death"
    assert "does not detect current disease" in after["scoreCaveat"]
    assert after["prevent"]["available"] is True
    # With a prospective model the level is the higher of the model's and PREVENT's levels.
    order = {"low": 0, "medium": 1, "high": 2}
    prevent_level = {"low": "low", "borderline": "medium", "intermediate": "medium", "high": "high"}[after["prevent"]["category"]]
    assert after["baseRiskLevel"] == max(after["modelRiskLevel"], prevent_level, key=order.get)
    assert "SLD012" not in after["missingInputs"]  # sleep is not an input of this model


def test_admin_choice_survives_a_new_process(client, admin):
    import app as app_module

    target = _models(client, admin)[MORTALITY]["model_id"]
    assert client.post(f"/api/models/{target}/activate", headers=admin).status_code == 200
    app_module._MODEL_REGISTRY_READY = False  # simulate a fresh serverless instance
    assert _models(client, admin)[MORTALITY]["is_active"]


def test_doctors_cannot_switch(client, make_user, auth_headers, admin):
    doctor = auth_headers(make_user(role="doctor"))
    target = _models(client, admin)[MORTALITY]["model_id"]
    assert client.post(f"/api/models/{target}/activate", headers=doctor).status_code == 403


def test_models_that_are_not_installed_cannot_be_activated(client, admin, db):
    with db.cursor() as cursor:
        cursor.execute(
            "INSERT INTO model_registry (name, version, status, artifact_uri) VALUES ('Old', '0.1', 'retired', NULL) RETURNING id"
        )
        old_id = cursor.fetchone()["id"]
    db.commit()
    assert client.post(f"/api/models/{old_id}/activate", headers=admin).status_code == 409
    assert "Old" not in _models(client, admin)  # retired models are not listed
    assert client.post("/api/models/999999/activate", headers=admin).status_code == 404


@pytest.mark.nodb
def test_mortality_model_rises_with_blood_pressure_and_cholesterol():
    base = {"age": 60, "bmi": 28, "dbp": 80, "hdl": 50, "creatinine": 0.9, "smoker": "no", "diabetic": "no",
            "high_bp": "no", "high_chol": "no", "chol_med": "no", "general_health": 3}
    low = inference.predict_probability(inference.build_raw_row({**base, "sbp": 118, "total_cholesterol": 170}, "male"), "nhanes_mortality")
    high = inference.predict_probability(inference.build_raw_row({**base, "sbp": 175, "total_cholesterol": 290}, "male"), "nhanes_mortality")
    assert high > low


def test_prevent_lifts_a_low_mortality_score(client, admin, make_patient):
    """A 45-year-old with moderate risk factors: CVD death is rare, but PREVENT shows real event risk."""
    target = _models(client, admin)[MORTALITY]["model_id"]
    assert client.post(f"/api/models/{target}/activate", headers=admin).status_code == 200
    pid = make_patient(admin, sex="male")["patient_id"]
    payload = {"patientId": pid, "age": 45, "bmi": 27, "systolicBp": 138, "diastolicBp": 86, "totalCholesterol": 235,
               "hdl": 38, "creatinine": 1.0, "diabetic": "yes", "smoker": "yes", "smokesNow": "yes", "highBp": "no",
               "highChol": "yes", "cholMed": "no", "hba1cPercent": 6.4, "generalHealth": 3}
    body = client.post("/api/risk-assessments", json=payload, headers=admin).json()
    assert body["modelRiskLevel"] == "low"
    assert body["prevent"]["category"] in ("borderline", "intermediate", "high")
    assert body["riskSource"] == "prevent" and body["baseRiskLevel"] in ("medium", "high")
    listed = client.get("/api/patients", headers=admin).json()
    last = next(p for p in listed if p["patient_id"] == pid)["last_assessment"]
    assert body["scoreType"] == "death_10y" and last["score_type"] == "death_10y"
    assert last["level_source"] == "prevent" and last["prevent_risk"] == pytest.approx(body["prevent"]["risk"])


@pytest.mark.nodb
def test_level_driver_names_what_set_the_level():
    from app import level_driver

    prevent = {"available": True, "risk": 0.11}
    assert level_driver({"baseRiskLevel": "medium", "riskSource": "prevent", "prevent": prevent}, "high") == \
        {"level_source": "alerts", "prevent_risk": 0.11, "score_type": "level"}
    assert level_driver({"baseRiskLevel": "medium", "riskSource": "prevent", "prevent": prevent}, "medium")["level_source"] == "prevent"
    assert level_driver(None, "low") == {"level_source": None, "prevent_risk": None, "score_type": "level"}
    assert level_driver({"modelKey": "nhanes_mortality"}, "low")["score_type"] == "death_10y"
