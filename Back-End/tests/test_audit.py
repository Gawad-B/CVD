import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def ctx(client, make_user, auth_headers, make_patient):
    user = make_user(role="doctor")
    headers = auth_headers(user)
    patient = make_patient(headers)
    pid = patient["patient_id"]
    enc = client.post("/api/encounters", json={"patientId": pid, "notes": "n", "features": []}, headers=headers)
    assert enc.status_code == 201, enc.text
    assessment = client.post("/api/risk-assessments", json={"patientId": pid, "sbp": 140, "dbp": 85}, headers=headers)
    assert assessment.status_code == 200, assessment.text
    return {"user": user, "headers": headers, "pid": pid, "aid": assessment.json()["assessmentId"]}


def _audit_rows(db):
    db.commit()
    with db.cursor() as cursor:
        cursor.execute("SELECT * FROM audit_log WHERE action_type NOT IN ('login','logout') ORDER BY id")
        return cursor.fetchall()


# (method, path template, body, action, resource_type, patient_id: "pid" | None | "new")
CASES = [
    ("GET", "/api/patients", None, "read", "patient_list", None),
    ("GET", "/api/dashboard/stats", None, "read", "dashboard", None),
    ("GET", "/api/patients/{pid}", None, "read", "patient", "pid"),
    ("POST", "/api/patients", {"firstName": "Bo", "lastName": "Ng", "dateOfBirth": "1970-01-01", "sex": "male"}, "create", "patient", "new"),
    ("PATCH", "/api/patients/{pid}", {"firstName": "Zed"}, "update", "patient", "pid"),
    ("DELETE", "/api/patients/{pid}", None, "delete", "patient", "pid"),
    ("GET", "/api/patients/{pid}/encounters", None, "read", "encounter_list", "pid"),
    ("POST", "/api/encounters", {"patientId": "{pid}", "notes": "x", "features": []}, "create", "encounter", "pid"),
    ("GET", "/api/patients/{pid}/risk-assessments", None, "read", "risk_assessment_list", "pid"),
    ("GET", "/api/risk-assessments", None, "read", "risk_assessment_list", None),
    ("GET", "/api/risk-assessments/{aid}", None, "read", "risk_assessment", "pid"),
    ("POST", "/api/risk-assessments", {"patientId": "{pid}", "sbp": 130, "dbp": 80}, "create", "risk_assessment", "pid"),
    ("POST", "/api/predict", {"patientId": "{pid}", "sbp": 130, "dbp": 80}, "create", "risk_assessment", "pid"),
    ("PATCH", "/api/risk-assessments/{aid}/review", {"reviewStatus": "reviewed"}, "update", "risk_assessment", "pid"),
    ("PATCH", "/api/risk-assessments/{aid}/override", {"riskLevel": "high", "reason": "Clinical judgement"}, "update", "risk_assessment_override", "pid"),
    ("DELETE", "/api/risk-assessments/{aid}", None, "delete", "risk_assessment", "pid"),
]


@pytest.mark.parametrize("method,path,body,action,resource,patient", CASES, ids=[f"{c[0]} {c[1]}" for c in CASES])
def test_exactly_one_audit_row_per_request(client, db, ctx, method, path, body, action, resource, patient):
    before = len(_audit_rows(db))
    url = path.format(pid=ctx["pid"], aid=ctx["aid"])
    kwargs = {"headers": ctx["headers"]}
    if body is not None:
        kwargs["json"] = {k: (ctx["pid"] if v == "{pid}" else v) for k, v in body.items()}
    response = client.request(method, url, **kwargs)
    assert response.status_code in (200, 201), response.text

    rows = _audit_rows(db)
    assert len(rows) == before + 1
    row = rows[-1]
    assert row["action_type"] == action
    assert row["resource_type"] == resource
    assert row["user_id"] == ctx["user"]["id"]
    assert row["outcome"] == "success"
    assert row["endpoint"] == url
    assert row["http_method"] == method
    if patient == "pid":
        assert row["patient_id"] == ctx["pid"]
    elif patient is None:
        assert row["patient_id"] is None
    else:
        assert row["patient_id"] is not None and row["patient_id"] != ctx["pid"]


def test_denied_request_writes_only_denied_row(client, db, make_user, auth_headers):
    auditor = auth_headers(make_user(role="auditor"))
    before = len(_audit_rows(db))
    assert client.get("/api/patients", headers=auditor).status_code == 403
    rows = _audit_rows(db)
    assert len(rows) == before + 1
    assert rows[-1]["outcome"] == "denied"


def test_audit_log_endpoint_exposes_endpoint(client, make_user, auth_headers, ctx):
    admin = auth_headers(make_user(role="admin"))
    rows = client.get("/api/audit-log", headers=admin).json()
    assert rows and all("endpoint" in row for row in rows)
    assert any(row["endpoint"] == "/api/patients" for row in rows)


def test_non_ip_client_host_stores_null_ip(client, make_user, auth_headers, db):
    import app as app_module

    headers = auth_headers(make_user(role="doctor"))
    with TestClient(app_module.app) as default_client:  # client host is "testclient"
        response = default_client.get("/api/patients", headers=headers)
    assert response.status_code == 200, response.text
    rows = _audit_rows(db)
    assert rows[-1]["resource_type"] == "patient_list"
    assert rows[-1]["ip_address"] is None


def test_valid_ip_is_stored(client, db, ctx):
    client.get("/api/patients", headers=ctx["headers"])
    assert str(_audit_rows(db)[-1]["ip_address"]) == "127.0.0.1"


@pytest.mark.parametrize("path", ["/api/patients/999999/encounters", "/api/patients/999999/risk-assessments"])
def test_unknown_patient_is_404_not_500(client, ctx, path):
    assert client.get(path, headers=ctx["headers"]).status_code == 404


def test_audit_log_paging_is_stable_with_identical_timestamps(client, db, make_user, auth_headers):
    admin_user = make_user(role="admin")
    admin = auth_headers(admin_user)
    with db.cursor() as cursor:
        cursor.execute("DELETE FROM audit_log")
        for _ in range(7):
            cursor.execute(
                "INSERT INTO audit_log (user_id, action_type, resource_type, outcome, created_at) "
                "VALUES (%s, 'read', 'tie', 'denied', '2026-01-01T00:00:00Z')",
                (admin_user["id"],),
            )
    db.commit()
    seen = []
    for offset in (0, 3, 6):
        page = client.get(f"/api/audit-log?outcome=denied&limit=3&offset={offset}", headers=admin).json()
        seen.extend(row["audit_log_id"] for row in page)
    assert len(seen) == 7 and len(set(seen)) == 7
    assert seen == sorted(seen, reverse=True)
