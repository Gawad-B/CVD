"""Regression tests for the final whole-branch review fixes."""
import pytest

import app as app_module


@pytest.fixture
def ctx(client, make_user, auth_headers, make_patient):
    headers = auth_headers(make_user(role="doctor"))
    return {"headers": headers, "pid": make_patient(headers)["patient_id"]}


def _count(db, table):
    db.commit()
    with db.cursor() as cursor:
        cursor.execute(f"SELECT COUNT(*) AS n FROM {table}")
        return cursor.fetchone()["n"]


@pytest.mark.parametrize("path", ["/api/risk-assessments", "/api/predict"])
def test_predict_is_atomic_with_audit(client, db, ctx, monkeypatch, path):
    def boom(*args, **kwargs):
        raise RuntimeError("audit failed")

    monkeypatch.setattr(app_module, "audit", boom)
    before = {t: _count(db, t) for t in ("risk_assessments", "encounters", "assessment_feature_values")}
    with pytest.raises(RuntimeError):
        client.post(path, json={"patientId": ctx["pid"], "sbp": 140, "dbp": 85}, headers=ctx["headers"])
    after = {t: _count(db, t) for t in before}
    assert after == before


def _deactivate(client, ctx):
    assert client.delete(f"/api/patients/{ctx['pid']}", headers=ctx["headers"]).status_code == 200


def test_predict_deactivated_patient_is_404(client, db, ctx):
    _deactivate(client, ctx)
    before = _count(db, "risk_assessments")
    resp = client.post("/api/risk-assessments", json={"patientId": ctx["pid"], "sbp": 140, "dbp": 85}, headers=ctx["headers"])
    assert resp.status_code == 404
    assert _count(db, "risk_assessments") == before


@pytest.mark.parametrize("deactivate", [False, True])
def test_create_encounter_unknown_or_deactivated_is_404(client, ctx, deactivate):
    pid = ctx["pid"]
    if deactivate:
        _deactivate(client, ctx)
    else:
        pid = 999999
    resp = client.post("/api/encounters", json={"patientId": pid, "notes": "x", "features": []}, headers=ctx["headers"])
    assert resp.status_code == 404, resp.text


def _sessions(db, user_id):
    db.commit()
    with db.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) AS n FROM sessions WHERE user_id = %s", (user_id,))
        return cursor.fetchone()["n"]


@pytest.mark.parametrize("change", [{"password": "Another-Horse-77"}, {"role": "auditor"}])
def test_admin_password_or_role_change_revokes_sessions_and_unlocks(client, db, make_user, auth_headers, change):
    admin_headers = auth_headers(make_user(role="admin"))
    target = make_user(role="clinician")
    auth_headers(target)
    assert _sessions(db, target["id"]) == 1
    with db.cursor() as cursor:
        cursor.execute(
            "UPDATE users SET failed_login_attempts = 3, locked_until = NOW() + interval '1 hour' WHERE id = %s",
            (target["id"],),
        )
    db.commit()
    resp = client.patch(f"/api/users/{target['id']}", json=change, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert _sessions(db, target["id"]) == 0
    with db.cursor() as cursor:
        cursor.execute("SELECT failed_login_attempts, locked_until FROM users WHERE id = %s", (target["id"],))
        row = cursor.fetchone()
    assert row["failed_login_attempts"] == 0 and row["locked_until"] is None


def test_other_admin_edits_keep_sessions(client, db, make_user, auth_headers):
    admin_headers = auth_headers(make_user(role="admin"))
    target = make_user(role="clinician")
    auth_headers(target)
    resp = client.patch(f"/api/users/{target['id']}", json={"email": "new@example.test"}, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert _sessions(db, target["id"]) == 1


def test_unchanged_role_keeps_sessions(client, db, make_user, auth_headers):
    admin_headers = auth_headers(make_user(role="admin"))
    target = make_user(role="clinician")
    auth_headers(target)
    resp = client.patch(
        f"/api/users/{target['id']}",
        json={"email": "same-role@example.test", "role": "clinician"},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    assert _sessions(db, target["id"]) == 1
