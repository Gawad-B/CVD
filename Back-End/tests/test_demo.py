import sys
from datetime import date

import pytest


def _start(client):
    response = client.post("/api/demo/start")
    assert response.status_code == 201, response.text
    return response.json()


def _login(client, creds):
    return client.post("/api/auth/login", json={"username": creds["username"], "password": creds["password"]})


def _expire(db, username, days_ago):
    with db.cursor() as cursor:
        cursor.execute(
            "UPDATE users SET demo_expires_at = NOW() - make_interval(days => %s) WHERE username = %s",
            (days_ago, username),
        )
    db.commit()




def test_demo_start_returns_working_credentials(client, db):
    creds = _start(client)
    assert creds["username"].startswith("demo-")
    suffix = creds["username"][len("demo-"):]
    assert len(suffix) == 6 and suffix == suffix.lower() and suffix.isalnum()
    assert len(creds["password"]) >= 16
    assert creds["expiresAt"]

    login = _login(client, creds)
    assert login.status_code == 200, login.text
    assert login.json()["role"] == "doctor"

    with db.cursor() as cursor:
        cursor.execute(
            "SELECT is_demo, demo_expires_at - NOW() AS ttl, host(created_ip) AS ip FROM users WHERE username = %s",
            (creds["username"],),
        )
        row = cursor.fetchone()
    assert row["is_demo"] is True
    assert 14.9 < row["ttl"].total_seconds() / 86400 <= 15
    assert row["ip"] == "127.0.0.1"


def test_demo_start_is_audited(client, db):
    creds = _start(client)
    with db.cursor() as cursor:
        cursor.execute("SELECT id FROM users WHERE username = %s", (creds["username"],))
        uid = cursor.fetchone()["id"]
        cursor.execute(
            "SELECT user_id, resource_id, outcome FROM audit_log WHERE action_type = 'create' AND resource_type = 'demo_account'"
        )
        rows = cursor.fetchall()
    assert len(rows) == 1
    assert rows[0]["resource_id"] == uid and rows[0]["user_id"] == uid and rows[0]["outcome"] == "success"


def test_demo_seeds_six_synthetic_patients_with_varied_risk(client, db):
    creds = _start(client)
    headers = {"Authorization": f"Bearer {_login(client, creds).json()['token']}"}

    patients = client.get("/api/patients", headers=headers).json()
    assert len(patients) == 6
    assert {p["sex"] for p in patients} == {"male", "female"}
    today = date.today()
    for p in patients:
        dob = date.fromisoformat(p["date_of_birth"])
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        assert 38 <= age <= 79, (p["first_name"], age)
        assert p["first_name"] and p["last_name"]

    assessments = client.get("/api/risk-assessments", headers=headers).json()
    assert len(assessments) == 6
    assert {a["risk_level"] for a in assessments} == {"low", "medium", "high"}
    for a in assessments:
        assert 0 < a["probability_cvd"] < 1 and a["recommendation_text"]
        detail = client.get(f"/api/risk-assessments/{a['assessment_id']}", headers=headers).json()
        assert detail["explanation"]["contributions"]

    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*) AS total, COUNT(ra.heart_rate_bpm) AS with_hr
            FROM risk_assessments ra JOIN patients p ON p.id = ra.patient_id
            JOIN users u ON u.id = p.owner_user_id WHERE u.username = %s
            """,
            (creds["username"],),
        )
        counts = cursor.fetchone()
    assert counts["total"] == 6 and counts["with_hr"] == 3

    with db.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) AS n FROM patients WHERE owner_user_id IS NULL")
        assert cursor.fetchone()["n"] == 0


def test_demo_rate_limit_per_ip(client, db):
    for _ in range(3):
        _start(client)
    response = client.post("/api/demo/start")
    assert response.status_code == 429
    assert response.json() == {"detail": "Demo limit reached. Try again tomorrow."}


def test_demo_rate_limit_ignores_other_ips_and_old_accounts(client, db, monkeypatch):
    with db.cursor() as cursor:
        for i, (ip, age_hours) in enumerate([("10.0.0.1", 1), ("10.0.0.1", 1), ("127.0.0.1", 30), ("127.0.0.1", 48), ("127.0.0.1", 72)]):
            cursor.execute(
                """
                INSERT INTO users (username, email, role, password_hash, is_demo, demo_expires_at, created_ip, created_at)
                VALUES (%s, %s, 'doctor', 'x', TRUE, NOW() + INTERVAL '5 days', %s, NOW() - make_interval(hours => %s))
                """,
                (f"demo-seed{i}", f"seed{i}@demo.invalid", ip, age_hours),
            )
    db.commit()
    assert client.post("/api/demo/start").status_code == 201


def test_demo_capacity_limit(client, db, monkeypatch):
    monkeypatch.setenv("DEMO_MAX_ACTIVE", "1")
    first = _start(client)
    response = client.post("/api/demo/start")
    assert response.status_code == 503
    assert response.json() == {"detail": "Demo capacity reached. Please try again later."}
    _expire(db, first["username"], 1)  # expired demos no longer count
    assert client.post("/api/demo/start").status_code == 201


def test_expired_demo_login_refused_with_contact_email(client, db, monkeypatch):
    monkeypatch.delenv("DEMO_CONTACT_EMAIL", raising=False)
    creds = _start(client)
    _expire(db, creds["username"], 1)
    response = _login(client, creds)
    assert response.status_code == 403
    assert response.json()["detail"] == {
        "code": "demo_expired",
        "message": "Your 15-day demo has ended.",
        "contactEmail": "abdelrahman.gawad.28@gmail.com",
    }
    with db.cursor() as cursor:
        cursor.execute("SELECT outcome FROM audit_log WHERE action_type = 'login' ORDER BY id DESC LIMIT 1")
        assert cursor.fetchone()["outcome"] == "denied"


def test_expired_demo_contact_email_from_env(client, db, monkeypatch):
    monkeypatch.setenv("DEMO_CONTACT_EMAIL", "sales@example.test")
    creds = _start(client)
    _expire(db, creds["username"], 1)
    assert _login(client, creds).json()["detail"]["contactEmail"] == "sales@example.test"


def test_expired_demo_token_is_refused_on_every_request(client, db):
    creds = _start(client)
    headers = {"Authorization": f"Bearer {_login(client, creds).json()['token']}"}
    assert client.get("/api/patients", headers=headers).status_code == 200
    _expire(db, creds["username"], 1)
    for path in ("/api/patients", "/api/auth/me", "/api/dashboard/stats"):
        response = client.get(path, headers=headers)
        assert response.status_code == 403, path
        assert response.json()["detail"]["code"] == "demo_expired"
        assert response.json()["detail"]["contactEmail"]


def test_wrong_password_on_expired_demo_stays_401(client, db):
    creds = _start(client)
    _expire(db, creds["username"], 1)
    response = client.post("/api/auth/login", json={"username": creds["username"], "password": "not-the-password"})
    assert response.status_code == 401


def test_demo_cannot_use_admin_endpoints(client):
    creds = _start(client)
    headers = {"Authorization": f"Bearer {_login(client, creds).json()['token']}"}
    for path in ("/api/users", "/api/users/1", "/api/audit-log"):
        assert client.get(path, headers=headers).status_code == 403, path
    assert client.post("/api/users", json={"username": "x", "email": "x@x.test", "password": "a" * 14}, headers=headers).status_code == 403


def test_users_list_exposes_demo_fields(client, make_user, auth_headers):
    admin = make_user(role="admin")
    creds = _start(client)
    users = client.get("/api/users", headers=auth_headers(admin)).json()
    by_name = {u["username"]: u for u in users}
    assert by_name[creds["username"]]["is_demo"] is True
    assert by_name[creds["username"]]["demo_expires_at"]
    assert by_name[admin["username"]]["is_demo"] is False
    assert by_name[admin["username"]]["demo_expires_at"] is None


def test_purge_script(client, db, capsys):
    import purge_expired_demos

    stale = _start(client)
    recent = _start(client)
    active = _start(client)
    real = {"username": "keepme"}
    with db.cursor() as cursor:
        cursor.execute(
            "INSERT INTO users (username, email, role, password_hash) VALUES ('keepme', 'keep@x.test', 'admin', 'x')"
        )
    db.commit()
    # stale: log in so audit rows reference it, then expire 31 days ago
    assert _login(client, stale).status_code == 200
    _expire(db, stale["username"], 31)
    _expire(db, recent["username"], 10)

    with db.cursor() as cursor:
        cursor.execute("SELECT id FROM users WHERE username = %s", (stale["username"],))
        stale_id = cursor.fetchone()["id"]
        cursor.execute("SELECT COUNT(*) AS n FROM audit_log WHERE user_id = %s", (stale_id,))
        audit_before = cursor.fetchone()["n"]
    assert audit_before >= 2

    assert purge_expired_demos.main([]) == 0
    out = capsys.readouterr().out
    assert "1" in out and "dry" in out.lower()
    with db.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) AS n FROM users WHERE is_demo")
        assert cursor.fetchone()["n"] == 3

    assert purge_expired_demos.main(["--apply"]) == 0
    with db.cursor() as cursor:
        cursor.execute("SELECT username FROM users WHERE is_demo ORDER BY username")
        remaining = {r["username"] for r in cursor.fetchall()}
        cursor.execute("SELECT COUNT(*) AS n FROM users WHERE username = 'keepme'")
        assert cursor.fetchone()["n"] == 1
        cursor.execute("SELECT COUNT(*) AS n FROM patients WHERE owner_user_id = %s", (stale_id,))
        assert cursor.fetchone()["n"] == 0
        # 18 = 3 demos x 6 patients; the purged one's 6 are gone
        cursor.execute("SELECT COUNT(*) AS n FROM patients")
        assert cursor.fetchone()["n"] == 12
        cursor.execute("SELECT COUNT(*) AS n FROM risk_assessments")
        assert cursor.fetchone()["n"] == 12
        cursor.execute("SELECT COUNT(*) AS n FROM sessions WHERE user_id = %s", (stale_id,))
        assert cursor.fetchone()["n"] == 0
        # audit history is kept, with the user reference nulled
        cursor.execute(
            "SELECT COUNT(*) AS n FROM audit_log WHERE action_type = 'create' AND resource_type = 'demo_account' AND resource_id = %s",
            (stale_id,),
        )
        assert cursor.fetchone()["n"] == 1
        cursor.execute("SELECT COUNT(*) AS n FROM audit_log WHERE user_id = %s", (stale_id,))
        assert cursor.fetchone()["n"] == 0
    assert remaining == {recent["username"], active["username"]}


def test_expired_message_uses_configured_ttl(client, db, monkeypatch):
    monkeypatch.setenv("DEMO_TTL_DAYS", "7")
    creds = _start(client)
    _expire(db, creds["username"], 1)
    response = _login(client, creds)
    assert response.status_code == 403
    assert response.json()["detail"]["message"] == "Your 7-day demo has ended."


def test_purge_apply_writes_one_audit_row(client, db):
    import purge_expired_demos

    stale = _start(client)
    _expire(db, stale["username"], 31)
    with db.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) AS n FROM audit_log WHERE resource_type = 'demo_purge'")
        assert cursor.fetchone()["n"] == 0
    assert purge_expired_demos.main([]) == 0  # dry run writes nothing
    with db.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) AS n FROM audit_log WHERE resource_type = 'demo_purge'")
        assert cursor.fetchone()["n"] == 0
    assert purge_expired_demos.main(["--apply"]) == 0
    with db.cursor() as cursor:
        cursor.execute(
            "SELECT user_id, action_type, endpoint, outcome, metadata FROM audit_log WHERE resource_type = 'demo_purge'"
        )
        rows = cursor.fetchall()
    assert len(rows) == 1
    row = rows[0]
    assert row["user_id"] is None
    assert row["action_type"] == "delete"
    assert row["endpoint"] == "scripts/purge_expired_demos.py"
    assert row["outcome"] == "success"
    assert row["metadata"]["users"] == 1
    assert row["metadata"]["patients"] == 6
    assert row["metadata"]["assessments"] == 6
    assert purge_expired_demos.main(["--apply"]) == 0  # a no-op run is still recorded
    with db.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) AS n FROM audit_log WHERE resource_type = 'demo_purge'")
        assert cursor.fetchone()["n"] == 2


def test_migration_004_is_idempotent(db):
    from migrate import apply_all

    apply_all(db)
    apply_all(db)


def _seed_demo_rows(db, ip, count, hours_ago=1):
    with db.cursor() as cursor:
        for i in range(count):
            cursor.execute(
                """
                INSERT INTO users (username, email, role, password_hash, is_demo, demo_expires_at, created_ip, created_at)
                VALUES (%s, %s, 'doctor', 'x', TRUE, NOW() + INTERVAL '5 days', %s, NOW() - make_interval(hours => %s))
                """,
                (f"demo-r{abs(hash((ip, i, hours_ago)))%10**8}", f"r{abs(hash((ip, i, hours_ago)))%10**8}@demo.invalid", ip, hours_ago),
            )
    db.commit()


def test_password_not_hashed_when_rate_limited(client, db, monkeypatch):
    import app as app_module

    _seed_demo_rows(db, "127.0.0.1", 3, hours_ago=2)
    calls = []
    real = app_module.hash_password
    monkeypatch.setattr(app_module, "hash_password", lambda p: calls.append(1) or real(p))
    assert client.post("/api/demo/start").status_code == 429
    monkeypatch.setenv("DEMO_MAX_ACTIVE", "1")
    assert client.post("/api/demo/start").status_code in (429, 503)
    assert calls == []


def test_unknown_ip_fails_closed(client, db, monkeypatch):
    import app as app_module

    monkeypatch.setattr(app_module, "client_ip", lambda request: None)
    _seed_demo_rows(db, None, 3, hours_ago=2)
    response = client.post("/api/demo/start")
    assert response.status_code == 429
    assert response.json() == {"detail": "Demo limit reached. Try again tomorrow."}


def test_unknown_ip_start_counts_toward_limit(client, db, monkeypatch):
    import app as app_module

    monkeypatch.setattr(app_module, "client_ip", lambda request: None)
    for _ in range(3):
        _start(client)
    assert client.post("/api/demo/start").status_code == 429


def test_ipv6_limited_by_slash_64(client, db, monkeypatch):
    import app as app_module

    _seed_demo_rows(db, "2001:db8:0:1::5", 3, hours_ago=2)
    monkeypatch.setattr(app_module, "client_ip", lambda request: "2001:db8:0:1:aaaa::99")
    assert client.post("/api/demo/start").status_code == 429
    monkeypatch.setattr(app_module, "client_ip", lambda request: "2001:db8:0:2::1")
    assert client.post("/api/demo/start").status_code == 201


def test_ipv4_stays_exact(client, db):
    _seed_demo_rows(db, "127.0.0.2", 3, hours_ago=2)
    assert client.post("/api/demo/start").status_code == 201


def test_global_hourly_cap(client, db, monkeypatch):
    monkeypatch.setenv("DEMO_MAX_PER_HOUR", "2")
    _seed_demo_rows(db, "10.1.1.1", 1, hours_ago=0)
    _seed_demo_rows(db, "10.1.1.2", 1, hours_ago=0)
    response = client.post("/api/demo/start")
    assert response.status_code == 429
    assert response.json() == {"detail": "Demo limit reached. Try again later."}
    _seed_demo_rows(db, "10.1.1.3", 0)
    monkeypatch.setenv("DEMO_MAX_PER_HOUR", "3")
    assert client.post("/api/demo/start").status_code == 201


def test_seeding_failure_removes_user_and_returns_generic_500(client, db, monkeypatch):
    import app as app_module

    real = app_module._predict_and_store
    count = {"n": 0}

    def flaky(payload, conn, user):
        count["n"] += 1
        if count["n"] == 3:
            raise RuntimeError("model exploded: secret detail")
        return real(payload, conn, user)

    monkeypatch.setattr(app_module, "_predict_and_store", flaky)
    response = client.post("/api/demo/start")
    assert response.status_code == 500
    assert "secret" not in response.text and "exploded" not in response.text
    with db.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) AS n FROM users WHERE is_demo")
        assert cursor.fetchone()["n"] == 0
        cursor.execute("SELECT COUNT(*) AS n FROM patients")
        assert cursor.fetchone()["n"] == 0


def test_invalid_env_values_fall_back_to_defaults(client, db, monkeypatch):
    monkeypatch.setenv("DEMO_TTL_DAYS", "abc")
    monkeypatch.setenv("DEMO_MAX_ACTIVE", "-4")
    monkeypatch.setenv("DEMO_MAX_PER_HOUR", "")
    creds = _start(client)
    with db.cursor() as cursor:
        cursor.execute("SELECT demo_expires_at - NOW() AS ttl FROM users WHERE username = %s", (creds["username"],))
        assert 14.9 < cursor.fetchone()["ttl"].total_seconds() / 86400 <= 15


def test_demo_role_change_rejected(client, db, make_user, auth_headers):
    admin = auth_headers(make_user(role="admin"))
    creds = _start(client)
    with db.cursor() as cursor:
        cursor.execute("SELECT id FROM users WHERE username = %s", (creds["username"],))
        uid = cursor.fetchone()["id"]
    response = client.patch(f"/api/users/{uid}", json={"role": "admin"}, headers=admin)
    assert response.status_code == 400
    assert response.json()["detail"] == "Demo accounts cannot change role"
    assert client.patch(f"/api/users/{uid}", json={"role": "doctor"}, headers=admin).status_code == 200


def test_purge_grace_days_validation(client, db, capsys):
    import purge_expired_demos

    assert purge_expired_demos.main(["--grace-days", "5"]) == 2
    assert "--force" in capsys.readouterr().err
    assert purge_expired_demos.main(["--grace-days", "5", "--force"]) == 0
    assert purge_expired_demos.main(["--grace-days", "30"]) == 0


def test_login_and_me_expose_demo_fields(client, db):
    creds = _start(client)
    login = _login(client, creds).json()
    assert login["is_demo"] is True
    assert login["demo_expires_at"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {login['token']}"}).json()
    assert me["is_demo"] is True
    assert me["demo_expires_at"] == login["demo_expires_at"]


def test_login_and_me_for_real_user_are_not_demo(client, make_user):
    user = make_user("doctor")
    login = client.post("/api/auth/login", json={"username": user["username"], "password": user["password"]}).json()
    assert login["is_demo"] is False
    assert login["demo_expires_at"] is None
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {login['token']}"}).json()
    assert me["is_demo"] is False
    assert me["demo_expires_at"] is None


def test_demo_patients_have_codes_and_assessment_patient_fields(client, db):
    creds = _start(client)
    headers = {"Authorization": f"Bearer {_login(client, creds).json()['token']}"}
    rows = client.get("/api/risk-assessments", headers=headers).json()
    assert sorted(r["external_patient_code"] for r in rows) == [f"DEMO-{i:03d}" for i in range(1, 7)]
    for r in rows:
        assert r["patient_sex"] in {"male", "female"}
        assert isinstance(r["patient_age"], int) and 38 <= r["patient_age"] <= 79
        assert not {"date_of_birth", "phone", "email"} & set(r)
    detail = client.get(f"/api/risk-assessments/{rows[0]['assessment_id']}", headers=headers).json()
    assert detail["external_patient_code"] == rows[0]["external_patient_code"]
    assert detail["patient_age"] == rows[0]["patient_age"] and detail["patient_sex"] == rows[0]["patient_sex"]
    assert not {"date_of_birth", "phone", "email"} & set(detail)


def test_assessment_patient_fields_for_auditor_and_unknown_dob(client, make_user, auth_headers, make_patient):
    doctor = auth_headers(make_user(role="doctor"))
    auditor = auth_headers(make_user(role="auditor"))
    known = make_patient(doctor, externalPatientCode="MRN-77", dateOfBirth="1965-04-02", sex="female")
    unknown = make_patient(doctor, firstName="No", lastName="Dob", dateOfBirth=None, sex=None)
    for pid in (known["patient_id"], unknown["patient_id"]):
        r = client.post("/api/risk-assessments", json={"patientId": pid, "sbp": 130, "dbp": 80, "age": 60}, headers=doctor)
        assert r.status_code == 200, r.text
    rows = {r["patient_id"]: r for r in client.get("/api/risk-assessments", headers=auditor).json()}
    k, u = rows[known["patient_id"]], rows[unknown["patient_id"]]
    assert k["external_patient_code"] == "MRN-77" and k["patient_sex"] == "female"
    assert isinstance(k["patient_age"], int) and k["patient_age"] >= 58
    assert u["patient_age"] is None and u["patient_sex"] is None and u["external_patient_code"] == ""
    detail = client.get(f"/api/risk-assessments/{k['assessment_id']}", headers=auditor).json()
    assert detail["patient_age"] == k["patient_age"] and "date_of_birth" not in detail
