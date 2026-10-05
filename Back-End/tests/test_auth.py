import hashlib
import importlib.util
from pathlib import Path

import pytest

import migrate

SEED_ADMIN_PATH = Path(__file__).resolve().parent.parent / "scripts" / "seed_admin.py"


def _login(client, username, password):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def _user_row(db, user_id):
    with db.cursor() as cursor:
        cursor.execute(
            "SELECT failed_login_attempts, locked_until FROM users WHERE id = %s", (user_id,)
        )
        return cursor.fetchone()


def test_lockout_after_five_failures(client, db, make_user):
    user = make_user(role="clinician")
    for _ in range(5):
        assert _login(client, user["username"], "wrong-password-1").status_code == 401
    response = _login(client, user["username"], user["password"])
    assert response.status_code == 429
    assert response.json() == {"detail": "Too many failed login attempts. Try again later."}
    row = _user_row(db, user["id"])
    assert row["locked_until"] is not None
    assert row["failed_login_attempts"] == 0
    with db.cursor() as cursor:
        cursor.execute(
            "SELECT 1 FROM audit_log WHERE action_type='login' AND outcome='denied' AND user_id=%s",
            (user["id"],),
        )
        assert cursor.fetchone() is not None


def test_success_resets_counter(client, db, make_user):
    user = make_user(role="clinician")
    for _ in range(3):
        assert _login(client, user["username"], "wrong-password-1").status_code == 401
    assert _user_row(db, user["id"])["failed_login_attempts"] == 3
    assert _login(client, user["username"], user["password"]).status_code == 200
    row = _user_row(db, user["id"])
    assert row["failed_login_attempts"] == 0
    assert row["locked_until"] is None


def test_expired_lock_allows_login(client, db, make_user):
    user = make_user(role="clinician")
    with db.cursor() as cursor:
        cursor.execute(
            "UPDATE users SET locked_until = NOW() - interval '1 minute' WHERE id = %s",
            (user["id"],),
        )
    db.commit()
    response = _login(client, user["username"], user["password"])
    assert response.status_code == 200
    assert _user_row(db, user["id"])["locked_until"] is None


def test_unknown_user_is_401_with_null_user_audit(client, db):
    response = _login(client, "no-such-user", "whatever-password")
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"
    with db.cursor() as cursor:
        cursor.execute(
            "SELECT user_id FROM audit_log WHERE action_type='login' AND outcome='failure'"
        )
        rows = cursor.fetchall()
    assert len(rows) == 1 and rows[0]["user_id"] is None


def _new_user_payload(password):
    return {
        "username": "newbie",
        "email": "newbie@example.test",
        "role": "clinician",
        "password": password,
    }


def test_short_password_rejected_on_create(client, make_user, auth_headers):
    headers = auth_headers(make_user(role="admin"))
    response = client.post("/api/users", json=_new_user_payload("a" * 11), headers=headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "Password must be at least 12 characters"
    ok = client.post("/api/users", json=_new_user_payload("a" * 12), headers=headers)
    assert ok.status_code in (200, 201), ok.text


def test_short_password_rejected_on_update(client, make_user, auth_headers):
    admin = make_user(role="admin")
    target = make_user(role="clinician")
    headers = auth_headers(admin)
    response = client.patch(f"/api/users/{target['id']}", json={"password": "a" * 11}, headers=headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "Password must be at least 12 characters"
    ok = client.patch(f"/api/users/{target['id']}", json={"password": "a" * 12}, headers=headers)
    assert ok.status_code == 200, ok.text


def test_plaintext_token_not_accepted(client, db, make_user):
    user = make_user(role="admin")
    raw = "raw-plaintext-token-value"
    with db.cursor() as cursor:
        cursor.execute(
            "INSERT INTO sessions (user_id, token, expires_at) VALUES (%s, %s, NOW() + interval '1 hour')",
            (user["id"], raw),
        )
    db.commit()
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {raw}"})
    assert response.status_code == 401
    # sanity: the hashed form of a token does work
    hashed_raw = "another-token-value"
    with db.cursor() as cursor:
        cursor.execute(
            "INSERT INTO sessions (user_id, token, expires_at) VALUES (%s, %s, NOW() + interval '1 hour')",
            (user["id"], hashlib.sha256(hashed_raw.encode()).hexdigest()),
        )
    db.commit()
    ok = client.get("/api/auth/me", headers={"Authorization": f"Bearer {hashed_raw}"})
    assert ok.status_code == 200


def _load_seed_admin():
    spec = importlib.util.spec_from_file_location("seed_admin", SEED_ADMIN_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_seed_admin_creates_and_is_idempotent(client, db, db_url, monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("ADMIN_USERNAME", "root-admin")
    monkeypatch.setenv("ADMIN_EMAIL", "root@example.test")
    monkeypatch.setenv("ADMIN_PASSWORD", "Seeded-Password-123")
    seed_admin = _load_seed_admin()
    assert seed_admin.main() == 0
    assert "created" in capsys.readouterr().out.lower()
    assert seed_admin.main() == 0
    assert "already exists" in capsys.readouterr().out.lower()
    with db.cursor() as cursor:
        cursor.execute("SELECT role FROM users WHERE username = 'root-admin'")
        rows = cursor.fetchall()
    assert [r["role"] for r in rows] == ["admin"]
    assert _login(client, "root-admin", "Seeded-Password-123").status_code == 200


def test_seed_admin_rejects_short_password(db_url, monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("ADMIN_EMAIL", "root@example.test")
    monkeypatch.setenv("ADMIN_PASSWORD", "short")
    assert _load_seed_admin().main() == 1
    assert "12" in capsys.readouterr().err


def test_schema_has_no_seeded_users(db):
    with db.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) AS n FROM users")
        assert cursor.fetchone()["n"] == 0


def test_migrations_are_rerunnable(db_url):
    import psycopg2

    conn = psycopg2.connect(db_url)
    try:
        migrate.apply_all(conn)
        migrate.apply_all(conn)
    finally:
        conn.close()
