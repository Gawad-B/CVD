"""Personal demo sandboxes: account creation limits, synthetic seed data.

`create_demo_account` takes the `app` module as an argument (instead of importing it) so this
file has no import cycle with app.py. Seeding goes through the same code path as
POST /api/risk-assessments, so probabilities, contributions and recommendations are real.
"""
import ipaddress
import logging
import os
import secrets
import string
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

DEMO_TTL_DAYS_DEFAULT = 15
DEMO_MAX_ACTIVE_DEFAULT = 500
DEMO_PER_IP_LIMIT = 3
DEMO_MAX_PER_HOUR_DEFAULT = 30
logger = logging.getLogger(__name__)
DEFAULT_CONTACT_EMAIL = "abdelrahman.gawad.28@gmail.com"
_BASE32 = "abcdefghijklmnopqrstuvwxyz234567"
_ADVISORY_LOCK_KEY = 7_204_001  # serialises limit-check + insert across concurrent demo starts

# Fictional people only. `age` is turned into a date of birth relative to today so the
# derived age stays inside 38-79. `inputs` are model inputs; `heartRate` is stored on the
# assessment but is not a model input.
SYNTHETIC_PATIENTS: List[Dict[str, Any]] = [
    {
        "code": "DEMO-001", "firstName": "Alder", "lastName": "Fennimore", "sex": "male", "age": 79, "heartRate": 82,
        "inputs": {"sbp": 168, "dbp": 96, "total_cholesterol": 268, "hdl": 34, "bmi": 33.5, "hba1c": 8.1,
                   "smoker": "yes", "diabetic": "yes", "highBp": "yes", "highChol": "yes", "bpMed": "yes",
                   "smokesNow": "yes", "cholMed": "yes", "creatinine": 1.4},
    },
    {
        "code": "DEMO-002", "firstName": "Marisol", "lastName": "Quill", "sex": "female", "age": 66, "heartRate": None,
        "inputs": {"sbp": 152, "dbp": 88, "total_cholesterol": 232, "hdl": 41, "bmi": 31.2, "hba1c": 6.9,
                   "smoker": "no", "diabetic": "borderline", "highBp": "yes", "highChol": "yes",
                   "bpMed": "yes", "cholMed": "no", "creatinine": 0.9},
    },
    {
        "code": "DEMO-003", "firstName": "Teodor", "lastName": "Brisbane", "sex": "male", "age": 58, "heartRate": 74,
        "inputs": {"sbp": 138, "dbp": 86, "total_cholesterol": 221, "hdl": 44, "bmi": 28.9, "hba1c": 5.9,
                   "smoker": "yes", "diabetic": "no", "highBp": "no", "highChol": "yes",
                   "smokesNow": "yes", "cholMed": "no", "creatinine": 1.0},
    },
    {
        "code": "DEMO-004", "firstName": "Imogen", "lastName": "Larkspur", "sex": "female", "age": 51, "heartRate": None,
        "inputs": {"sbp": 126, "dbp": 82, "total_cholesterol": 205, "hdl": 52, "bmi": 27.4, "hba1c": 5.5,
                   "smoker": "no", "diabetic": "no", "highBp": "no", "highChol": "no",
                   "cholMed": "no", "creatinine": 0.8},
    },
    {
        "code": "DEMO-005", "firstName": "Cassian", "lastName": "Wrenfield", "sex": "male", "age": 44, "heartRate": 68,
        "inputs": {"sbp": 118, "dbp": 76, "total_cholesterol": 180, "hdl": 58, "bmi": 24.6, "hba1c": 5.2,
                   "smoker": "no", "diabetic": "no", "highBp": "no", "highChol": "no",
                   "cholMed": "no", "creatinine": 0.8},
    },
    {
        "code": "DEMO-006", "firstName": "Perpetua", "lastName": "Ashdown", "sex": "female", "age": 38, "heartRate": None,
        "inputs": {"sbp": 108, "dbp": 68, "total_cholesterol": 168, "hdl": 66, "bmi": 22.1, "hba1c": 5.0,
                   "smoker": "no", "diabetic": "no", "highBp": "no", "highChol": "no",
                   "cholMed": "no", "creatinine": 0.8},
    },
]


def contact_email() -> str:
    return os.getenv("DEMO_CONTACT_EMAIL") or DEFAULT_CONTACT_EMAIL


def expired_detail() -> Dict[str, str]:
    ttl_days = _env_int("DEMO_TTL_DAYS", DEMO_TTL_DAYS_DEFAULT)
    return {"code": "demo_expired", "message": f"Your {ttl_days}-day demo has ended.", "contactEmail": contact_email()}


def expired_error() -> HTTPException:
    return HTTPException(status_code=403, detail=expired_detail())


def _date_of_birth_for_age(age: int) -> date:
    today = date.today()
    try:
        anniversary = today.replace(year=today.year - age)
    except ValueError:  # Feb 29
        anniversary = today.replace(year=today.year - age, day=28)
    return anniversary - timedelta(days=90)  # three months past the birthday: age is exactly `age`


def _new_username(cursor: Any) -> str:
    for _ in range(20):
        name = "demo-" + "".join(secrets.choice(_BASE32) for _ in range(6))
        cursor.execute("SELECT 1 FROM users WHERE username = %s", (name,))
        if not cursor.fetchone():
            return name
    raise HTTPException(status_code=503, detail="Could not allocate a demo account. Please try again.")


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
        if value < 1:
            raise ValueError
        return value
    except ValueError:
        logger.warning("Invalid %s=%r; using default %s", name, raw, default)
        return default


def _ip_limit_sql(ip: Optional[str]) -> Tuple[str, tuple]:
    """Predicate on users.created_ip: exact for IPv4, /64 network for IPv6, NULL group when unknown."""
    if ip is None:
        return "created_ip IS NULL", ()
    if ipaddress.ip_address(ip).version == 6:
        return "created_ip << set_masklen(%s::inet, 64)", (ip,)
    return "created_ip = %s", (ip,)


def create_demo_account(app_module: Any, db: Any, request: Any) -> Dict[str, Any]:
    """Create a demo user with 6 scored synthetic patients; returns the public payload.

    Two transactions: (1) limit checks + user insert + audit under an advisory lock, short;
    (2) seeding. If seeding fails the just-created user is deleted again.
    """
    ip = app_module.client_ip(request)
    if ip is None:
        logger.warning("Demo start without a valid client IP; counting against the shared unknown-IP limit")
    ttl_days = _env_int("DEMO_TTL_DAYS", DEMO_TTL_DAYS_DEFAULT)
    max_active = _env_int("DEMO_MAX_ACTIVE", DEMO_MAX_ACTIVE_DEFAULT)
    max_per_hour = _env_int("DEMO_MAX_PER_HOUR", DEMO_MAX_PER_HOUR_DEFAULT)

    # These may commit (first-run registry / rule seeding), so do them before the locked section.
    app_module.require_patient_key(db)
    app_module.ensure_active_model_registry_entry(db)
    app_module.ensure_cds_rules_seeded(db)

    password = secrets.token_urlsafe(12)
    try:
        with db.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", (_ADVISORY_LOCK_KEY,))
            ip_sql, ip_params = _ip_limit_sql(ip)
            cursor.execute(
                f"SELECT COUNT(*) AS n FROM users WHERE is_demo AND {ip_sql} AND created_at > NOW() - INTERVAL '24 hours'",
                ip_params,
            )
            if int(cursor.fetchone()["n"]) >= DEMO_PER_IP_LIMIT:
                raise HTTPException(status_code=429, detail="Demo limit reached. Try again tomorrow.")
            cursor.execute("SELECT COUNT(*) AS n FROM users WHERE is_demo AND created_at > NOW() - INTERVAL '1 hour'")
            if int(cursor.fetchone()["n"]) >= max_per_hour:
                raise HTTPException(status_code=429, detail="Demo limit reached. Try again later.")
            cursor.execute("SELECT COUNT(*) AS n FROM users WHERE is_demo AND demo_expires_at > NOW()")
            if int(cursor.fetchone()["n"]) >= max_active:
                raise HTTPException(status_code=503, detail="Demo capacity reached. Please try again later.")

            password_hash = app_module.hash_password(password)  # only once the limits have passed
            username = _new_username(cursor)
            cursor.execute(
                """
                INSERT INTO users (username, email, role, password_hash, is_active, is_demo, demo_expires_at, created_ip)
                VALUES (%s, %s, 'doctor', %s, TRUE, TRUE, NOW() + make_interval(days => %s), %s)
                RETURNING id, demo_expires_at
                """,
                (username, f"{username}@demo.invalid", password_hash, ttl_days, ip),
            )
            row = cursor.fetchone()
            user = {"id": int(row["id"]), "username": username, "role": "doctor", "is_demo": True}
        app_module.audit(
            db, request, user, action_type="create", resource_type="demo_account", resource_id=user["id"]
        )
        db.commit()
    except BaseException:
        db.rollback()
        raise

    try:
        with db.cursor() as cursor:
            for spec in SYNTHETIC_PATIENTS:
                _seed_patient(app_module, db, cursor, user, spec)
        db.commit()
    except BaseException as exc:
        db.rollback()
        logger.error("Demo seeding failed (%s); removing demo user %s", type(exc).__name__, user["id"])
        try:
            with db.cursor() as cursor:
                cursor.execute("DELETE FROM users WHERE id = %s AND is_demo", (user["id"],))
            db.commit()
        except Exception:
            db.rollback()
            logger.error("Could not remove half-created demo user %s", user["id"])
        if isinstance(exc, (KeyboardInterrupt, SystemExit)):
            raise
        raise HTTPException(status_code=500, detail="Could not create the demo account. Please try again.") from None
    return {"username": username, "password": password, "expiresAt": app_module.to_iso(row["demo_expires_at"])}


def _seed_patient(app_module: Any, db: Any, cursor: Any, user: Dict[str, Any], spec: Dict[str, Any]) -> None:
    patient = app_module.insert_patient(
        cursor,
        first_name=spec["firstName"], last_name=spec["lastName"],
        date_of_birth=_date_of_birth_for_age(spec["age"]), sex=spec["sex"],
        external_patient_code=spec["code"],
        owner_user_id=user["id"],
    )
    payload = app_module.RiskAssessmentRequest(
        patientId=patient["patient_id"], heartRate=spec.get("heartRate"), **spec["inputs"]
    )
    app_module._predict_and_store(payload, db, user)
