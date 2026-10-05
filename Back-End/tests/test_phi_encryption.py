import os
import subprocess
import sys
from pathlib import Path

import encrypt_patient_data
import phi_crypto
import psycopg2.extras
import pytest
from app import PATIENT_DATA_KEY as KEY

BACKEND_DIR = Path(__file__).resolve().parent.parent

OTHER_KEY = "another-key-for-tests-9999"


@pytest.fixture
def headers(make_user, auth_headers):
    return auth_headers(make_user(role="doctor"))


def _raw(db, pid):
    db.commit()
    with db.cursor() as cursor:
        cursor.execute("SELECT * FROM patient_sensitive_data WHERE patient_id = %s", (pid,))
        return cursor.fetchone()


def _legacy_patient(db, first="Grace", last="Hopper", dob="1970-01-02"):
    with db.cursor() as cursor:
        cursor.execute("INSERT INTO patients (sex) VALUES ('female') RETURNING id")
        pid = cursor.fetchone()["id"]
        cursor.execute(
            """INSERT INTO patient_sensitive_data (patient_id, first_name, last_name, date_of_birth, phone, email)
               VALUES (%s, %s, %s, %s, '555-0100', 'grace@example.test')""",
            (pid, first, last, dob),
        )
    db.commit()
    return pid


def _run_script(monkeypatch, db_url, key, *args):
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("PATIENT_DATA_KEY", key)
    return encrypt_patient_data.main(list(args))


def test_create_patient_stores_only_encrypted(client, db, headers, make_patient):
    patient = make_patient(headers, phone="555-0111", email="ada@example.test")
    row = _raw(db, patient["patient_id"])
    for col in ("first_name", "last_name", "date_of_birth", "phone", "email"):
        assert row[col] is None
        assert row[f"{col}_enc"] is not None
    assert b"Ada" not in bytes(row["first_name_enc"])
    assert b"Lovelace" not in bytes(row["last_name_enc"])

    got = client.get(f"/api/patients/{patient['patient_id']}", headers=headers).json()
    assert got["first_name"] == "Ada"
    assert got["last_name"] == "Lovelace"
    assert got["date_of_birth"] == "1965-04-02"
    assert got["phone"] == "555-0111"
    assert got["email"] == "ada@example.test"
    listed = client.get("/api/patients", headers=headers).json()
    assert listed[0]["first_name"] == "Ada" and listed[0]["date_of_birth"] == "1965-04-02"


def test_patch_updates_encrypted_and_none_keeps_existing(client, db, headers, make_patient):
    pid = make_patient(headers, phone="555-0111")["patient_id"]
    resp = client.patch(f"/api/patients/{pid}", json={"firstName": "Augusta"}, headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["first_name"] == "Augusta"
    assert body["last_name"] == "Lovelace"
    assert body["phone"] == "555-0111"
    assert body["date_of_birth"] == "1965-04-02"
    row = _raw(db, pid)
    assert row["first_name"] is None and row["phone"] is None
    assert b"Augusta" not in bytes(row["first_name_enc"])
    assert client.get(f"/api/patients/{pid}", headers=headers).json()["first_name"] == "Augusta"


def test_patch_on_legacy_row_does_not_lose_plaintext_fields(client, db, headers):
    pid = _legacy_patient(db)
    resp = client.patch(f"/api/patients/{pid}", json={"firstName": "Gracie"}, headers=headers)
    assert resp.status_code == 200, resp.text
    body = client.get(f"/api/patients/{pid}", headers=headers).json()
    assert (body["first_name"], body["last_name"], body["phone"]) == ("Gracie", "Hopper", "555-0100")
    assert body["date_of_birth"] == "1970-01-02"
    assert _raw(db, pid)["last_name"] is None


def test_invalid_date_of_birth_is_422(client, headers):
    resp = client.post(
        "/api/patients",
        json={"firstName": "A", "lastName": "B", "dateOfBirth": "not-a-date"},
        headers=headers,
    )
    assert resp.status_code == 422


def test_legacy_plaintext_row_readable_then_encrypted_by_script(client, db, db_url, headers, monkeypatch, capsys):
    pid = _legacy_patient(db)
    body = client.get(f"/api/patients/{pid}", headers=headers).json()
    assert (body["first_name"], body["date_of_birth"], body["email"]) == ("Grace", "1970-01-02", "grace@example.test")

    assert _run_script(monkeypatch, db_url, KEY) == 0  # dry-run default
    assert _raw(db, pid)["first_name"] == "Grace"
    out = capsys.readouterr().out
    assert "rows with plaintext to encrypt: 1\n" in out
    assert "rows already encrypted: 0\n" in out

    assert _run_script(monkeypatch, db_url, KEY, "--apply") == 0
    row = _raw(db, pid)
    for col in ("first_name", "last_name", "date_of_birth", "phone", "email"):
        assert row[col] is None
        assert row[f"{col}_enc"] is not None
    assert b"Grace" not in bytes(row["first_name_enc"])
    body = client.get(f"/api/patients/{pid}", headers=headers).json()
    assert (body["first_name"], body["last_name"], body["date_of_birth"]) == ("Grace", "Hopper", "1970-01-02")


def test_script_wrong_key_exits_2_and_changes_nothing(client, db, db_url, headers, make_patient, monkeypatch):
    enc_pid = make_patient(headers)["patient_id"]
    legacy_pid = _legacy_patient(db)
    before = (_raw(db, enc_pid), _raw(db, legacy_pid))
    assert _run_script(monkeypatch, db_url, OTHER_KEY, "--apply") == 2
    after = (_raw(db, enc_pid), _raw(db, legacy_pid))
    assert before == after


def test_script_wrong_key_on_non_first_row_exits_2(client, db, db_url, headers, make_patient, monkeypatch):
    good_pid = make_patient(headers)["patient_id"]  # encrypted with KEY, lower patient_id
    bad_pid = _legacy_patient(db, first="Bad")
    with db.cursor() as cursor:
        cursor.execute(
            "UPDATE patient_sensitive_data SET first_name = NULL, first_name_enc = %s WHERE patient_id = %s",
            (psycopg2.Binary(phi_crypto.encrypt_text("Other", OTHER_KEY, aad=f"{bad_pid}:first_name".encode())), bad_pid),
        )
    legacy_pid = _legacy_patient(db)
    before = [_raw(db, p) for p in (good_pid, bad_pid, legacy_pid)]
    assert _run_script(monkeypatch, db_url, KEY, "--apply") == 2
    assert [_raw(db, p) for p in (good_pid, bad_pid, legacy_pid)] == before


def test_key_never_sent_to_database(client, headers, monkeypatch):
    sent = []
    original = psycopg2.extras.RealDictCursor.execute

    def recording_execute(self, query, vars=None):
        result = original(self, query, vars)
        sent.append(bytes(self.query).decode("utf-8", "replace"))
        return result

    monkeypatch.setattr(psycopg2.extras.RealDictCursor, "execute", recording_execute)
    pid = client.post(
        "/api/patients", json={"firstName": "Ada", "lastName": "Lovelace", "dateOfBirth": "1965-04-02"}, headers=headers
    ).json()["patient_id"]
    client.get(f"/api/patients/{pid}", headers=headers)
    client.get("/api/patients", headers=headers)
    client.patch(f"/api/patients/{pid}", json={"firstName": "Augusta"}, headers=headers)
    client.post("/api/risk-assessments", json={"patientId": pid, "sbp": 140, "dbp": 85}, headers=headers)
    client.get("/api/risk-assessments", headers=headers)
    assert any("patient_sensitive_data" in q for q in sent)
    assert not [q for q in sent if KEY in q or "pgp_sym" in q]


@pytest.mark.nodb
def test_phi_crypto_roundtrip_and_errors():
    aad = b"1:first_name"
    blob = phi_crypto.encrypt_text("Ada", KEY, aad=aad)
    assert blob.startswith(b"v1") and b"Ada" not in blob
    assert phi_crypto.encrypt_text("Ada", KEY, aad=aad) != blob  # random nonce
    assert phi_crypto.decrypt_text(memoryview(blob), KEY, aad=aad) == "Ada"
    assert phi_crypto.encrypt_text(None, KEY, aad=aad) is None and phi_crypto.decrypt_text(None, KEY, aad=aad) is None
    for bad, key, bad_aad in (
        (blob, OTHER_KEY, aad),
        (blob[:-1] + bytes([blob[-1] ^ 1]), KEY, aad),
        (b"junk", KEY, aad),
        (blob, KEY, b"2:first_name"),
        (blob, KEY, b"1:last_name"),
    ):
        with pytest.raises(phi_crypto.PhiDecryptionError) as exc:
            phi_crypto.decrypt_text(bad, key, aad=bad_aad)
        assert KEY not in str(exc.value) and OTHER_KEY not in str(exc.value)


def test_risk_assessment_age_derivation_with_encrypted_dob(client, headers, make_patient):
    pid = make_patient(headers)["patient_id"]
    resp = client.post("/api/risk-assessments", json={"patientId": pid, "sbp": 140, "dbp": 85}, headers=headers)
    assert resp.status_code == 200, resp.text
    detail = client.get(f"/api/risk-assessments/{resp.json()['assessmentId']}", headers=headers).json()
    assert detail["patient_name"] == "Ada Lovelace"


def test_risk_assessment_age_derivation_with_legacy_dob(client, db, headers):
    pid = _legacy_patient(db)
    resp = client.post("/api/risk-assessments", json={"patientId": pid, "sbp": 140, "dbp": 85}, headers=headers)
    assert resp.status_code == 200, resp.text


@pytest.mark.nodb
@pytest.mark.parametrize("key", ["", "short"])
def test_import_requires_patient_data_key(key):
    env = {**os.environ, "PATIENT_DATA_KEY": key, "DATABASE_URL": "postgresql://x:y@localhost:1/z"}
    result = subprocess.run(
        [sys.executable, "-c", "import app"], cwd=BACKEND_DIR, env=env, capture_output=True, text=True
    )
    assert result.returncode != 0
    assert "PATIENT_DATA_KEY must be set (min 16 chars)" in result.stderr


def _swap_columns(db, source_pid, target_pid, field):
    with db.cursor() as cursor:
        cursor.execute(f"SELECT {field}_enc FROM patient_sensitive_data WHERE patient_id = %s", (source_pid,))
        blob = cursor.fetchone()[f"{field}_enc"]
        cursor.execute(
            f"UPDATE patient_sensitive_data SET {field}_enc = %s WHERE patient_id = %s",
            (psycopg2.Binary(bytes(blob)), target_pid),
        )
    db.commit()


def test_ciphertext_swapped_between_patients_fails(client, db, headers, make_patient):
    a = make_patient(headers, firstName="Alice")["patient_id"]
    b = make_patient(headers, firstName="Bob")["patient_id"]
    _swap_columns(db, a, b, "first_name")
    with pytest.raises(phi_crypto.PhiDecryptionError):
        client.get(f"/api/patients/{b}", headers=headers)


def test_ciphertext_swapped_between_fields_fails(client, db, headers, make_patient):
    pid = make_patient(headers, firstName="Alice", lastName="Smith")["patient_id"]
    with db.cursor() as cursor:
        cursor.execute("UPDATE patient_sensitive_data SET last_name_enc = first_name_enc WHERE patient_id = %s", (pid,))
    db.commit()
    with pytest.raises(phi_crypto.PhiDecryptionError):
        client.get(f"/api/patients/{pid}", headers=headers)


def test_wrong_patient_data_key_refuses_patient_endpoints(client, db, headers, make_patient, monkeypatch):
    import app as app_module

    pid = make_patient(headers)["patient_id"]
    # Simulate a deployment restarted with the wrong key.
    monkeypatch.setattr(app_module, "PATIENT_DATA_KEY", OTHER_KEY)
    monkeypatch.setattr(app_module, "_PATIENT_KEY_VERIFIED", False)
    before = _raw(db, pid)
    for method, path, body in (
        ("get", "/api/patients", None),
        ("get", f"/api/patients/{pid}", None),
        ("post", "/api/patients", {"firstName": "New", "lastName": "Person", "dateOfBirth": "1980-01-01"}),
        ("patch", f"/api/patients/{pid}", {"firstName": "X"}),
        ("post", "/api/risk-assessments", {"patientId": pid, "sbp": 140, "dbp": 85}),
        ("get", "/api/risk-assessments", None),
    ):
        resp = getattr(client, method)(path, headers=headers, **({"json": body} if body else {}))
        assert resp.status_code == 503, (method, path, resp.text)
        assert "does not match" in resp.json()["detail"]
    db.commit()
    with db.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) AS n FROM patients")
        assert cursor.fetchone()["n"] == 1
    assert _raw(db, pid) == before


def test_key_check_passes_when_no_encrypted_data_exists(client, headers, monkeypatch):
    import app as app_module

    monkeypatch.setattr(app_module, "_PATIENT_KEY_VERIFIED", False)
    assert client.get("/api/patients", headers=headers).status_code == 200
