import os
import sys
import uuid
from pathlib import Path

import psycopg2
import pytest
from psycopg2.extras import RealDictCursor

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(BACKEND_DIR / "scripts"))

TEST_DB_URL = "postgresql://cardio_test:cardio_test@localhost:55432/cardio_test"
UNREACHABLE_MSG = "Test DB not reachable — run Back-End/scripts/test_db.sh up"

# app reads DATABASE_URL at import time, so this must happen before `import app`.
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["PATIENT_DATA_KEY"] = "test-patient-key-0123"

from migrate import apply_all  # noqa: E402


@pytest.fixture(scope="session")
def db_url() -> str:
    os.environ["DATABASE_URL"] = TEST_DB_URL
    os.environ["PATIENT_DATA_KEY"] = "test-patient-key-0123"
    return TEST_DB_URL


@pytest.fixture(autouse=True)
def clean_db(request, db_url):
    if request.node.get_closest_marker("nodb"):
        return
    try:
        conn = psycopg2.connect(db_url)
    except psycopg2.OperationalError:
        pytest.fail(UNREACHABLE_MSG, pytrace=False)
    try:
        with conn.cursor() as cursor:
            cursor.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        conn.commit()
        apply_all(conn)
    finally:
        conn.close()
    # The schema was just rebuilt, so the model registry row must be re-ensured.
    app_module = sys.modules.get("app")
    if app_module is not None:
        app_module._MODEL_REGISTRY_READY = False
        app_module._PATIENT_KEY_VERIFIED = False


@pytest.fixture
def db(db_url, clean_db):
    conn = psycopg2.connect(db_url, cursor_factory=RealDictCursor)
    try:
        yield conn
    finally:
        conn.close()


@pytest.fixture
def client(db_url, clean_db):
    from fastapi.testclient import TestClient

    import app as app_module

    # audit_log.ip_address is INET; TestClient's default host "testclient" is not an IP.
    with TestClient(app_module.app, client=("127.0.0.1", 50000)) as test_client:
        yield test_client


@pytest.fixture
def make_user(db):
    import app as app_module

    def _make_user(role="admin", username=None, password="Correct-Horse-9"):
        username = username or f"user_{uuid.uuid4().hex[:8]}"
        with db.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (username, email, role, password_hash, is_active)
                VALUES (%s, %s, %s, %s, TRUE)
                RETURNING id
                """,
                (username, f"{username}@example.test", role, app_module.hash_password(password)),
            )
            user_id = cursor.fetchone()["id"]
        db.commit()
        return {"id": user_id, "username": username, "password": password, "role": role}

    return _make_user


@pytest.fixture
def auth_headers(client):
    def _auth_headers(user):
        response = client.post(
            "/api/auth/login",
            json={"username": user["username"], "password": user["password"]},
        )
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['token']}"}

    return _auth_headers


@pytest.fixture
def make_patient(client):
    def _make_patient(headers, **overrides):
        payload = {
            "firstName": "Ada",
            "lastName": "Lovelace",
            "dateOfBirth": "1965-04-02",
            "sex": "female",
        }
        payload.update(overrides)
        response = client.post("/api/patients", json=payload, headers=headers)
        assert response.status_code in (200, 201), response.text
        return response.json()

    return _make_patient
