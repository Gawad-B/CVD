import pytest
from psycopg2.extras import RealDictCursor


@pytest.fixture
def ctx(client, make_user, auth_headers, make_patient):
    user = make_user(role="doctor")
    headers = auth_headers(user)
    patient = make_patient(headers)
    pid = patient["patient_id"]
    resp = client.post("/api/risk-assessments", json={"patientId": pid, "sbp": 140, "dbp": 85}, headers=headers)
    assert resp.status_code == 200, resp.text
    return {"user": user, "headers": headers, "pid": pid, "aid": resp.json()["assessmentId"]}


def test_soft_delete_hides_assessment_everywhere(client, db, ctx):
    h, pid, aid = ctx["headers"], ctx["pid"], ctx["aid"]
    assert client.get("/api/dashboard/stats", headers=h).json()["totalAssessments"] == 1
    assert client.delete(f"/api/risk-assessments/{aid}", headers=h).status_code == 200

    assert client.get("/api/risk-assessments", headers=h).json() == []
    assert client.get(f"/api/patients/{pid}/risk-assessments", headers=h).json() == []
    assert client.get(f"/api/risk-assessments/{aid}", headers=h).status_code == 404
    stats = client.get("/api/dashboard/stats", headers=h).json()
    assert stats["totalAssessments"] == 0
    assert stats["recentAssessments"] == []
    assert stats["riskDistribution"] == {}

    db.commit()
    with db.cursor() as cursor:
        cursor.execute("SELECT deleted_at, deleted_by FROM risk_assessments WHERE id = %s", (aid,))
        row = cursor.fetchone()
    assert row["deleted_at"] is not None
    assert row["deleted_by"] == ctx["user"]["id"]


def test_delete_twice_is_404(client, ctx):
    url = f"/api/risk-assessments/{ctx['aid']}"
    assert client.delete(url, headers=ctx["headers"]).status_code == 200
    assert client.delete(url, headers=ctx["headers"]).status_code == 404


def test_review_stores_and_clears_attribution(client, ctx):
    h, aid = ctx["headers"], ctx["aid"]
    resp = client.patch(
        f"/api/risk-assessments/{aid}/review",
        json={"reviewStatus": "reviewed", "reviewComment": "Looks right"},
        headers=h,
    )
    assert resp.status_code == 200, resp.text
    detail = client.get(f"/api/risk-assessments/{aid}", headers=h).json()
    assert detail["review_status"] == "reviewed"
    assert detail["reviewed_by_username"] == ctx["user"]["username"]
    assert detail["reviewed_at"]
    assert detail["review_comment"] == "Looks right"
    listed = client.get("/api/risk-assessments", headers=h).json()[0]
    assert listed["reviewed_by_username"] == ctx["user"]["username"]

    resp = client.patch(f"/api/risk-assessments/{aid}/review", json={"reviewStatus": "pending"}, headers=h)
    assert resp.status_code == 200
    detail = client.get(f"/api/risk-assessments/{aid}", headers=h).json()
    assert detail["review_status"] == "pending"
    assert detail["reviewed_by_username"] is None
    assert detail["reviewed_at"] is None
    assert detail["review_comment"] is None


def test_review_comment_too_long_rejected(client, ctx):
    resp = client.patch(
        f"/api/risk-assessments/{ctx['aid']}/review",
        json={"reviewStatus": "reviewed", "reviewComment": "x" * 2001},
        headers=ctx["headers"],
    )
    assert resp.status_code == 422


def test_patient_name_from_sensitive_data_with_fallbacks(client, db, ctx):
    h, aid, pid = ctx["headers"], ctx["aid"], ctx["pid"]
    assert client.get(f"/api/risk-assessments/{aid}", headers=h).json()["patient_name"] == "Ada Lovelace"
    assert client.get("/api/risk-assessments", headers=h).json()[0]["patient_name"] == "Ada Lovelace"

    with db.cursor() as cursor:
        cursor.execute(
            "UPDATE patient_sensitive_data SET first_name = '', last_name = '', first_name_enc = NULL, last_name_enc = NULL WHERE patient_id = %s",
            (pid,),
        )
        cursor.execute("UPDATE patients SET external_patient_code = 'EXT-9' WHERE id = %s", (pid,))
    db.commit()
    assert client.get(f"/api/risk-assessments/{aid}", headers=h).json()["patient_name"] == "EXT-9"
    with db.cursor() as cursor:
        cursor.execute("UPDATE patients SET external_patient_code = NULL WHERE id = %s", (pid,))
    db.commit()
    assert client.get(f"/api/risk-assessments/{aid}", headers=h).json()["patient_name"] == f"Patient {pid}"


def test_dashboard_total_patients_ignores_inactive(client, make_patient, ctx):
    h = ctx["headers"]
    other = make_patient(h, firstName="Gone")
    assert client.get("/api/dashboard/stats", headers=h).json()["totalPatients"] == 2
    assert client.delete(f"/api/patients/{other['patient_id']}", headers=h).status_code == 200
    assert client.get("/api/dashboard/stats", headers=h).json()["totalPatients"] == 1


def test_encounters_single_query_and_shape(client, ctx, monkeypatch):
    h, pid = ctx["headers"], ctx["pid"]
    for i in range(3):
        r = client.post(
            "/api/encounters",
            json={"patientId": pid, "notes": f"n{i}", "features": [
                {"name": "a", "value": 1, "valueType": "number"},
                {"name": "b", "value": "x"},
            ]},
            headers=h,
        )
        assert r.status_code == 201, r.text
    client.post("/api/encounters", json={"patientId": pid, "notes": "bare", "features": []}, headers=h)

    # Count only statements touching encounter tables: auth/audit queries never mention them,
    # so this isolates the handler's own data access regardless of auth/audit implementation.
    statements = []
    original = RealDictCursor.execute

    def counting(self, query, vars=None):
        text = query if isinstance(query, str) else query.decode()
        if "encounter" in text.lower():
            statements.append(text)
        return original(self, query, vars)

    monkeypatch.setattr(RealDictCursor, "execute", counting)
    response = client.get(f"/api/patients/{pid}/encounters", headers=h)
    monkeypatch.undo()

    assert response.status_code == 200
    assert len(statements) == 1, statements
    body = response.json()
    assert len(body) == 5  # 4 created here + the encounter made by the fixture prediction
    with_features = [e for e in body if e["notes"].startswith("n")]
    assert len(with_features) == 3
    for encounter in with_features:
        assert set(encounter) == {"encounter_id", "patient_id", "encounter_date", "notes", "created_at", "features"}
        assert [f["feature_code"] for f in encounter["features"]] == ["a", "b"]
        assert set(encounter["features"][0]) == {"feature_id", "encounter_id", "feature_code", "feature_value", "value_type"}
    assert [e for e in body if e["notes"] == "bare"][0]["features"] == []
    assert body == sorted(body, key=lambda e: e["encounter_date"], reverse=True)
