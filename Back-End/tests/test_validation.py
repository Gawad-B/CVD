import pytest


@pytest.fixture
def setup(client, make_user, auth_headers, make_patient):
    headers = auth_headers(make_user(role="doctor"))
    patient = make_patient(headers)
    pid = patient.get("patient_id") or patient.get("id") or patient.get("patientId")
    return headers, pid


def _post(client, headers, pid, **fields):
    return client.post("/api/risk-assessments", json={"patientId": pid, **fields}, headers=headers)


@pytest.mark.parametrize(
    "fields",
    [
        {"sbp": 300},
        {"systolicBp": 300},
        {"sbp": 59},
        {"hemoglobin": 0},
        {"age": 17},
        {"bmi": 9},
        {"dbp": 161},
        {"diastolicBp": 29},
        {"totalCholesterol": 501},
        {"hba1cPercent": 21},
        {"hsCrp": 301},
        {"waistCm": 201},
        {"sleepHoursWeekend": 25},
        {"sedentaryMinutesAlt": 1441},
        {"vigorousActivityMinutes": 51},
        {"moderateActivityMinutes": 51},
        {"sedentaryMinutes": 601},
        {"incomeRatio": 5.1},
        {"race": 5},
        {"education": 9},
        {"education": 2.5},
        {"moderateActivityUnit": 2.5},
        {"moderateActivityUnit": 5},
        {"smoker": "maybe"},
        {"diabetic": "perhaps"},
        {"highBp": "borderline"},
        {"sbp": 80, "dbp": 90},
        {"sbp": 80, "diastolicBp": 80},
        {"systolicBp": 90, "diastolicBp": 100},
    ],
)
def test_out_of_range_inputs_rejected(client, setup, fields):
    headers, pid = setup
    response = _post(client, headers, pid, **fields)
    assert response.status_code == 422, (fields, response.text)


def test_sbp_dbp_message(client, setup):
    headers, pid = setup
    response = _post(client, headers, pid, sbp=80, dbp=90)
    assert response.status_code == 422
    assert "Systolic BP must be greater than diastolic BP" in response.text


def test_boundary_values_accepted(client, setup):
    headers, pid = setup
    response = _post(client, headers, pid, sbp=260, dbp=30, age=120, race=6, education=5,
                     moderateActivityUnit=4, smoker="YES", diabetic="Borderline", hemoglobin=5)
    assert response.status_code in (200, 201), response.text


def test_activity_boundaries_accepted(client, setup):
    headers, pid = setup
    response = _post(client, headers, pid, vigorousActivityMinutes=50, moderateActivityMinutes=50,
                     sedentaryMinutes=600, sedentaryMinutesAlt=1440)
    assert response.status_code in (200, 201), response.text


def test_omitted_categoricals_are_reported_missing(client, setup):
    headers, pid = setup
    response = _post(client, headers, pid, sbp=140, dbp=85)
    assert response.status_code == 200, response.text
    missing = response.json()["missingInputs"]
    for name in ("RIDRETH3", "DMDEDUC2", "HUQ010"):
        assert name in missing


def test_only_one_bp_value_is_not_compared(client, setup):
    headers, pid = setup
    assert _post(client, headers, pid, sbp=100).status_code in (200, 201)


@pytest.mark.parametrize("dob", ["2015-01-01", "1850-01-01"])
def test_derived_age_out_of_range_rejected(client, make_user, auth_headers, make_patient, dob):
    headers = auth_headers(make_user(role="doctor"))
    patient = make_patient(headers, dateOfBirth=dob)
    pid = patient.get("patient_id") or patient.get("id") or patient.get("patientId")
    response = _post(client, headers, pid)
    assert response.status_code == 422, response.text
    assert "between 18 and 120" in response.text
