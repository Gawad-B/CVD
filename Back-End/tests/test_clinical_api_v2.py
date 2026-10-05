import pytest


@pytest.fixture
def world(client, make_user, auth_headers, make_patient):
    """A real doctor with one patient, and a demo sandbox with its seeded patients."""
    real = auth_headers(make_user(role="doctor"))
    pid = make_patient(real, firstName="Real", lastName="Person")["patient_id"]
    resp = client.post(
        "/api/risk-assessments",
        json={"patientId": pid, "sbp": 150, "dbp": 90, "age": 60, "heartRate": 71},
        headers=real,
    )
    assert resp.status_code == 200, resp.text
    creds = client.post("/api/demo/start").json()
    token = client.post("/api/auth/login", json={"username": creds["username"], "password": creds["password"]}).json()["token"]
    demo = {"Authorization": f"Bearer {token}"}
    demo_assessments = client.get("/api/risk-assessments", headers=demo).json()
    return {
        "real": real, "pid": pid, "aid": resp.json()["assessmentId"], "create": resp.json(),
        "demo": demo, "daid": demo_assessments[0]["assessment_id"], "demo_assessments": demo_assessments,
    }


# ---- heart rate -----------------------------------------------------------------------

def test_heart_rate_is_stored_and_returned_everywhere(client, db, world):
    assert world["create"]["heartRate"] == 71
    detail = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()
    assert detail["heart_rate_bpm"] == 71
    listing = client.get("/api/risk-assessments", headers=world["real"]).json()
    assert listing[0]["heart_rate_bpm"] == 71
    per_patient = client.get(f"/api/patients/{world['pid']}/risk-assessments", headers=world["real"]).json()
    assert per_patient[0]["heart_rate_bpm"] == 71
    with db.cursor() as cursor:
        cursor.execute("SELECT heart_rate_bpm FROM risk_assessments WHERE id = %s", (world["aid"],))
        assert cursor.fetchone()["heart_rate_bpm"] == 71


def test_heart_rate_is_not_a_model_input(client, world):
    detail = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()
    assert "heartRate" not in detail["inputs"] and "heart_rate_bpm" not in detail["inputs"]
    assert detail["heart_rate_bpm"] == 71
    base = {"patientId": world["pid"], "sbp": 150, "dbp": 90, "age": 60}
    a = client.post("/api/predict", json=base, headers=world["real"]).json()
    b = client.post("/api/predict", json={**base, "heartRate": 200}, headers=world["real"]).json()
    assert a["probability"] == b["probability"]


def test_heart_rate_absent_is_null_and_create_returns_null(client, world):
    resp = client.post("/api/risk-assessments", json={"patientId": world["pid"], "sbp": 120, "dbp": 80, "age": 50}, headers=world["real"])
    assert resp.json()["heartRate"] is None
    detail = client.get(f"/api/risk-assessments/{resp.json()['assessmentId']}", headers=world["real"]).json()
    assert detail["heart_rate_bpm"] is None


@pytest.mark.parametrize("value", [29, 221, 72.5, "abc", 0, -5])
def test_heart_rate_validation(client, world, value):
    resp = client.post("/api/risk-assessments", json={"patientId": world["pid"], "sbp": 120, "dbp": 80, "heartRate": value}, headers=world["real"])
    assert resp.status_code == 422


@pytest.mark.parametrize("value", [30, 220])
def test_heart_rate_bounds_accepted(client, world, value):
    resp = client.post("/api/risk-assessments", json={"patientId": world["pid"], "sbp": 120, "dbp": 80, "age": 50, "heartRate": value}, headers=world["real"])
    assert resp.status_code == 200 and resp.json()["heartRate"] == value


def test_demo_seed_heart_rate_is_visible_through_api(client, world):
    rates = [a["heart_rate_bpm"] for a in world["demo_assessments"]]
    assert sorted(r for r in rates if r is not None) == [68, 74, 82]


# ---- override -------------------------------------------------------------------------

def _override(client, headers, aid, **body):
    return client.patch(f"/api/risk-assessments/{aid}/override", json=body, headers=headers)


def test_override_stores_and_is_returned(client, db, world):
    resp = _override(client, world["real"], world["aid"], riskLevel="high", recommendation="Refer to cardiology", reason="Family history")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["effective_risk_level"] == "high" and body["effective_recommendation"] == "Refer to cardiology"
    detail = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()
    assert detail["override_risk_level"] == "high"
    assert detail["override_recommendation"] == "Refer to cardiology"
    assert detail["override_reason"] == "Family history"
    assert detail["overridden_by_username"] and detail["overridden_at"]
    assert detail["effective_risk_level"] == "high"
    assert detail["effective_recommendation"] == "Refer to cardiology"
    # the model result is preserved
    assert detail["risk_level"] == world["create"]["riskLevel"]
    assert detail["recommendation_text"] == world["create"]["recommendation"]
    with db.cursor() as cursor:
        cursor.execute("SELECT overridden_by FROM risk_assessments WHERE id = %s", (world["aid"],))
        assert cursor.fetchone()["overridden_by"] is not None


def test_no_override_means_effective_equals_model(client, world):
    detail = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()
    assert detail["override_risk_level"] is None and detail["overridden_by_username"] is None
    assert detail["effective_risk_level"] == detail["risk_level"]
    assert detail["effective_recommendation"] == detail["recommendation_text"]


def test_override_merge_keeps_omitted_field(client, world):
    assert _override(client, world["real"], world["aid"], riskLevel="high", reason="Reassessed").status_code == 200
    assert _override(client, world["real"], world["aid"], recommendation="Watchful waiting", reason="Patient preference").status_code == 200
    detail = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()
    assert detail["effective_risk_level"] == "high"  # earlier level kept
    assert detail["effective_recommendation"] == "Watchful waiting"
    assert detail["override_reason"] == "Patient preference"
    assert _override(client, world["real"], world["aid"], riskLevel="low", reason="Downgraded").status_code == 200
    detail = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()
    assert detail["effective_risk_level"] == "low" and detail["effective_recommendation"] == "Watchful waiting"


def test_override_explicit_null_clears_one_field(client, world):
    _override(client, world["real"], world["aid"], riskLevel="high", recommendation="Refer", reason="first one")
    assert _override(client, world["real"], world["aid"], riskLevel=None, reason="Level withdrawn").status_code == 200
    detail = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()
    assert detail["override_risk_level"] is None and detail["effective_risk_level"] == detail["risk_level"]
    assert detail["effective_recommendation"] == "Refer"


def test_override_clearing_both_removes_override(client, world):
    _override(client, world["real"], world["aid"], riskLevel="high", recommendation="Refer", reason="first one")
    assert _override(client, world["real"], world["aid"], riskLevel=None, recommendation=None, reason="Remove override").status_code == 200
    detail = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()
    assert detail["override_risk_level"] is None and detail["override_recommendation"] is None
    assert detail["effective_risk_level"] == detail["risk_level"]
    assert detail["effective_recommendation"] == detail["recommendation_text"]
    assert detail["override_reason"] == "Remove override"
    assert len(detail["override_history"]) == 2


def test_override_that_would_leave_both_null_is_rejected(client, world):
    # nothing set yet: clearing only one field leaves nothing
    assert _override(client, world["real"], world["aid"], recommendation=None, reason="valid reason").status_code == 422
    _override(client, world["real"], world["aid"], riskLevel="high", reason="first one")
    assert _override(client, world["real"], world["aid"], riskLevel=None, reason="valid reason").status_code == 422
    detail = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()
    assert detail["override_risk_level"] == "high" and len(detail["override_history"]) == 1


def test_override_history_is_append_only_newest_first(client, db, world):
    _override(client, world["real"], world["aid"], riskLevel="high", reason="first one")
    _override(client, world["real"], world["aid"], recommendation="Refer", reason="second one")
    hist = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()["override_history"]
    assert [h["reason"] for h in hist] == ["second one", "first one"]
    assert (hist[0]["risk_level"], hist[0]["recommendation"]) == ("high", "Refer")  # post-merge values
    assert (hist[1]["risk_level"], hist[1]["recommendation"]) == ("high", None)
    assert hist[0]["overridden_by_username"] and hist[0]["created_at"]
    assert set(hist[0]) == {"risk_level", "recommendation", "reason", "overridden_by_username", "created_at"}


def test_override_history_empty_and_scoped(client, world):
    assert client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()["override_history"] == []
    _override(client, world["real"], world["aid"], riskLevel="high", reason="valid reason")
    assert client.get(f"/api/risk-assessments/{world['aid']}", headers=world["demo"]).status_code == 404
    demo = client.get(f"/api/risk-assessments/{world['daid']}", headers=world["demo"]).json()
    assert demo["override_history"] == []


def test_override_resets_reviewed_to_pending(client, world):
    client.patch(f"/api/risk-assessments/{world['aid']}/review", json={"reviewStatus": "reviewed", "reviewComment": "ok"}, headers=world["real"])
    before = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()
    assert before["review_status"] == "reviewed" and before["reviewed_by_username"]
    resp = _override(client, world["real"], world["aid"], riskLevel="high", reason="New information")
    assert resp.json()["review_status"] == "pending"
    after = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()
    assert after["review_status"] == "pending"
    assert after["reviewed_by_username"] is None and after["reviewed_at"] is None and after["review_comment"] is None


def test_override_can_be_repeated_latest_wins(client, world):
    _override(client, world["real"], world["aid"], riskLevel="high", reason="first one")
    _override(client, world["real"], world["aid"], riskLevel="medium", reason="second one")
    detail = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()
    assert detail["override_risk_level"] == "medium" and detail["override_reason"] == "second one"


@pytest.mark.parametrize("body", [
    {"reason": "valid reason"},
    {"riskLevel": None, "reason": "valid reason"},  # nothing to keep -> would be empty
    {"riskLevel": "critical", "reason": "valid reason"},
    {"riskLevel": "high"},
    {"riskLevel": "high", "reason": "abcd"},
    {"riskLevel": "high", "reason": "    "},
    {"riskLevel": "high", "reason": "x" * 2001},
    {"recommendation": "x" * 2001, "reason": "valid reason"},
    {"recommendation": "   ", "reason": "valid reason"},
])
def test_override_validation(client, world, body):
    assert _override(client, world["real"], world["aid"], **body).status_code == 422


def test_override_is_audited(client, db, world):
    _override(client, world["real"], world["aid"], riskLevel="high", reason="Family history")
    db.commit()
    with db.cursor() as cursor:
        cursor.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
    assert (row["action_type"], row["resource_type"], row["resource_id"], row["patient_id"], row["outcome"]) == (
        "update", "risk_assessment_override", world["aid"], world["pid"], "success")


def test_override_roles(client, make_user, auth_headers, world):
    assert _override(client, auth_headers(make_user(role="auditor")), world["aid"], riskLevel="high", reason="valid reason").status_code == 403
    assert _override(client, auth_headers(make_user(role="admin")), world["aid"], riskLevel="high", reason="valid reason").status_code == 200
    assert _override(client, auth_headers(make_user(role="clinician")), world["aid"], riskLevel="low", reason="valid reason").status_code == 200
    assert client.patch(f"/api/risk-assessments/{world['aid']}/override", json={"riskLevel": "high", "reason": "valid reason"}).status_code == 401


def test_override_unknown_or_deleted_is_404(client, world):
    assert _override(client, world["real"], 999999, riskLevel="high", reason="valid reason").status_code == 404
    assert client.delete(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).status_code == 200
    assert _override(client, world["real"], world["aid"], riskLevel="high", reason="valid reason").status_code == 404


def test_override_is_scoped_between_demo_and_real(client, world):
    assert _override(client, world["demo"], world["aid"], riskLevel="high", reason="valid reason").status_code == 404
    assert _override(client, world["real"], world["daid"], riskLevel="high", reason="valid reason").status_code == 404
    real_detail = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()
    assert real_detail["override_risk_level"] is None
    demo_detail = client.get(f"/api/risk-assessments/{world['daid']}", headers=world["demo"]).json()
    assert demo_detail["override_risk_level"] is None
    assert _override(client, world["demo"], world["daid"], riskLevel="low", reason="valid reason").status_code == 200


def test_override_shows_in_list_and_patient_list(client, world):
    _override(client, world["real"], world["aid"], riskLevel="high", reason="valid reason")
    row = client.get("/api/risk-assessments", headers=world["real"]).json()[0]
    assert row["effective_risk_level"] == "high" and row["override_risk_level"] == "high"
    row = client.get(f"/api/patients/{world['pid']}/risk-assessments", headers=world["real"]).json()[0]
    assert row["effective_risk_level"] == "high" and row["overridden_by_username"]


# ---- inputs ---------------------------------------------------------------------------

def test_detail_inputs_maps_raw_columns_with_nulls(client, world):
    inputs = client.get(f"/api/risk-assessments/{world['aid']}", headers=world["real"]).json()["inputs"]
    assert inputs["BPXOSY1"] == 150 and inputs["BPXODI1"] == 90 and inputs["RIDAGEYR"] == 60
    assert "BMXBMI" in inputs and inputs["BMXBMI"] is None
    assert any(v is None for v in inputs.values())


def test_detail_inputs_scoped(client, world):
    assert client.get(f"/api/risk-assessments/{world['aid']}", headers=world["demo"]).status_code == 404
    inputs = client.get(f"/api/risk-assessments/{world['daid']}", headers=world["demo"]).json()["inputs"]
    assert inputs["BPXOSY1"] is not None


# ---- patients.last_assessment -----------------------------------------------------------

def test_patients_last_assessment(client, world, make_patient):
    patients = {p["patient_id"]: p for p in client.get("/api/patients", headers=world["real"]).json()}
    last = patients[world["pid"]]["last_assessment"]
    assert last["assessment_id"] == world["aid"]
    assert set(last) == {"assessment_id", "created_at", "probability_cvd", "risk_level", "effective_risk_level", "review_status"}
    assert last["risk_level"] == last["effective_risk_level"] and last["review_status"] == "pending"

    newer = client.post("/api/risk-assessments", json={"patientId": world["pid"], "sbp": 120, "dbp": 80, "age": 60}, headers=world["real"]).json()
    _override(client, world["real"], newer["assessmentId"], riskLevel="high", reason="valid reason")
    last = {p["patient_id"]: p for p in client.get("/api/patients", headers=world["real"]).json()}[world["pid"]]["last_assessment"]
    assert last["assessment_id"] == newer["assessmentId"] and last["effective_risk_level"] == "high"

    client.delete(f"/api/risk-assessments/{newer['assessmentId']}", headers=world["real"])
    last = {p["patient_id"]: p for p in client.get("/api/patients", headers=world["real"]).json()}[world["pid"]]["last_assessment"]
    assert last["assessment_id"] == world["aid"]  # soft-deleted ones are skipped

    empty = make_patient(world["real"], firstName="No", lastName="Assessment")["patient_id"]
    assert {p["patient_id"]: p for p in client.get("/api/patients", headers=world["real"]).json()}[empty]["last_assessment"] is None


def test_patients_last_assessment_scoped(client, world):
    demo = client.get("/api/patients", headers=world["demo"]).json()
    assert len(demo) == 6 and all(p["last_assessment"] for p in demo)
    assert world["aid"] not in {p["last_assessment"]["assessment_id"] for p in demo}
    real = client.get("/api/patients", headers=world["real"]).json()
    assert [p["last_assessment"]["assessment_id"] for p in real] == [world["aid"]]


# ---- dashboard --------------------------------------------------------------------------

def test_dashboard_pending_high_and_effective_distribution(client, world):
    stats = client.get("/api/dashboard/stats", headers=world["real"]).json()
    model_level = world["create"]["riskLevel"]
    assert stats["pendingReview"] == 1
    assert stats["highRisk"] == (1 if model_level == "high" else 0)
    assert stats["riskDistribution"] == {model_level: 1}

    _override(client, world["real"], world["aid"], riskLevel="high", reason="valid reason")
    stats = client.get("/api/dashboard/stats", headers=world["real"]).json()
    assert stats["highRisk"] == 1 and stats["riskDistribution"] == {"high": 1}

    _override(client, world["real"], world["aid"], riskLevel="low", reason="valid reason")
    stats = client.get("/api/dashboard/stats", headers=world["real"]).json()
    assert stats["highRisk"] == 0 and stats["riskDistribution"] == {"low": 1}

    client.patch(f"/api/risk-assessments/{world['aid']}/review", json={"reviewStatus": "reviewed"}, headers=world["real"])
    assert client.get("/api/dashboard/stats", headers=world["real"]).json()["pendingReview"] == 0


def test_dashboard_excludes_deleted(client, world):
    _override(client, world["real"], world["aid"], riskLevel="high", reason="valid reason")
    client.delete(f"/api/risk-assessments/{world['aid']}", headers=world["real"])
    stats = client.get("/api/dashboard/stats", headers=world["real"]).json()
    assert (stats["pendingReview"], stats["highRisk"], stats["riskDistribution"]) == (0, 0, {})


def test_dashboard_counts_scoped(client, world):
    _override(client, world["real"], world["aid"], riskLevel="high", reason="valid reason")
    demo_before = client.get("/api/dashboard/stats", headers=world["demo"]).json()
    assert demo_before["pendingReview"] == 6 and sum(demo_before["riskDistribution"].values()) == 6
    real = client.get("/api/dashboard/stats", headers=world["real"]).json()
    assert real["pendingReview"] == 1 and real["highRisk"] == 1
    _override(client, world["demo"], world["daid"], riskLevel="high", reason="valid reason")
    assert client.get("/api/dashboard/stats", headers=world["real"]).json()["highRisk"] == 1


# ---- list filters -----------------------------------------------------------------------

def test_review_status_filter_and_limit(client, world):
    second = client.post("/api/risk-assessments", json={"patientId": world["pid"], "sbp": 120, "dbp": 80, "age": 60}, headers=world["real"]).json()
    client.patch(f"/api/risk-assessments/{second['assessmentId']}/review", json={"reviewStatus": "reviewed"}, headers=world["real"])
    pending = client.get("/api/risk-assessments?review_status=pending", headers=world["real"]).json()
    reviewed = client.get("/api/risk-assessments?review_status=reviewed", headers=world["real"]).json()
    assert [a["assessment_id"] for a in pending] == [world["aid"]]
    assert [a["assessment_id"] for a in reviewed] == [second["assessmentId"]]
    assert len(client.get("/api/risk-assessments?limit=1", headers=world["real"]).json()) == 1
    assert len(client.get("/api/risk-assessments", headers=world["real"]).json()) == 2


@pytest.mark.parametrize("query", ["review_status=bogus", "limit=0", "limit=201", "limit=abc"])
def test_list_filter_validation(client, world, query):
    assert client.get(f"/api/risk-assessments?{query}", headers=world["real"]).status_code == 422


def test_review_filter_is_scoped(client, world):
    demo_pending = client.get("/api/risk-assessments?review_status=pending", headers=world["demo"]).json()
    assert len(demo_pending) == 6 and world["aid"] not in {a["assessment_id"] for a in demo_pending}
    assert len(client.get("/api/risk-assessments?limit=200", headers=world["demo"]).json()) == 6


# ---- audit-log outcome filter -------------------------------------------------------------

def test_audit_log_outcome_filter(client, make_user, auth_headers):
    admin = auth_headers(make_user(role="admin"))
    auditor = auth_headers(make_user(role="auditor"))
    assert client.get("/api/patients", headers=auditor).status_code == 403  # writes a denied row
    denied = client.get("/api/audit-log?outcome=denied", headers=admin).json()
    assert denied and all(r["outcome"] == "denied" for r in denied)
    success = client.get("/api/audit-log?outcome=success", headers=admin).json()
    assert success and all(r["outcome"] == "success" for r in success)
    assert client.get("/api/audit-log?outcome=failure", headers=admin).status_code == 200
    assert client.get("/api/audit-log?outcome=weird", headers=admin).status_code == 422


def test_assessment_list_orders_newest_first_with_id_tiebreak(client, db, world):
    second = client.post("/api/risk-assessments", json={"patientId": world["pid"], "sbp": 120, "dbp": 80, "age": 60}, headers=world["real"]).json()
    with db.cursor() as cursor:
        cursor.execute("UPDATE risk_assessments SET created_at = (SELECT created_at FROM risk_assessments WHERE id = %s) WHERE id = %s", (world["aid"], second["assessmentId"]))
    db.commit()
    ids = [a["assessment_id"] for a in client.get("/api/risk-assessments", headers=world["real"]).json()]
    assert ids == [second["assessmentId"], world["aid"]]
