def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "healthy", "database": "connected"}


def test_login_success_and_me(client, make_user, auth_headers):
    user = make_user(role="doctor")
    r = client.get("/api/auth/me", headers=auth_headers(user))
    assert r.status_code == 200 and r.json()["role"] == "doctor"


def test_failed_login_is_audited(client, db, make_user):
    make_user(username="bob")
    r = client.post("/api/auth/login", json={"username": "bob", "password": "wrong"})
    assert r.status_code == 401
    with db.cursor() as c:
        c.execute("SELECT outcome, action_type FROM audit_log")
        assert c.fetchall() == [{"outcome": "failure", "action_type": "login"}]


def test_clinician_cannot_list_users(client, make_user, auth_headers):
    r = client.get("/api/users", headers=auth_headers(make_user(role="clinician")))
    assert r.status_code == 403
