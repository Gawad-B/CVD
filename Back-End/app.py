import hashlib
import logging
import hmac
import ipaddress
import json
import os
import secrets
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

import pandas as pd
import psycopg2
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator, model_validator
from psycopg2 import Binary
from psycopg2.extras import Json, RealDictCursor

BASE_DIR = Path(__file__).resolve().parent
# ml.inference unpickles the pipeline, which imports ml.nhanes: Back-End/ must be importable.
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from db_url import app_database_url  # noqa: E402
from ml import explain as explain_module  # noqa: E402
from ml import inference  # noqa: E402
from ml import prevent  # noqa: E402
from ml.nhanes import RAW_NUMERIC_COLUMNS, ckd_epi_2021  # noqa: E402
from phi_crypto import PhiDecryptionError, decrypt_text, encrypt_text, load_key, phi_aad  # noqa: E402
import clinical  # noqa: E402
import clinical_alerts  # noqa: E402
import demo as demo_module  # noqa: E402
from scoping import patient_scope_sql  # noqa: E402

load_dotenv(BASE_DIR / ".env")
load_dotenv()


DATABASE_URL = app_database_url()

PATIENT_DATA_KEY = load_key()  # RuntimeError at import if missing/short; never sent to the DB

SESSION_TTL_MINUTES = int(os.getenv("SESSION_TTL_MINUTES", "480"))
MIN_PASSWORD_LENGTH = 12
LOGIN_MAX_ATTEMPTS = int(os.getenv("LOGIN_MAX_ATTEMPTS", "5"))
LOGIN_LOCKOUT_MINUTES = int(os.getenv("LOGIN_LOCKOUT_MINUTES", "15"))
PBKDF2_ITERATIONS = int(os.getenv("PASSWORD_HASH_ITERATIONS", "600000"))
LOW_RISK_MAX_PROBABILITY = float(os.getenv("LOW_RISK_MAX_PROBABILITY", "0.30"))
MEDIUM_RISK_MAX_PROBABILITY = float(os.getenv("MEDIUM_RISK_MAX_PROBABILITY", "0.70"))


def cors_settings() -> Dict[str, Any]:
    """CORSMiddleware kwargs from env.

    CORS_ORIGINS: comma-separated exact origins (empty by default: fail closed).
    CORS_ORIGIN_REGEX: optional regex (full match) for e.g. Vercel preview URLs.
    """
    raw_origins = os.getenv("CORS_ORIGINS", "")
    return {
        "allow_origins": [o.strip() for o in raw_origins.split(",") if o.strip()],
        "allow_origin_regex": os.getenv("CORS_ORIGIN_REGEX") or None,
        # Auth is a Bearer header; the client never sends cookies/credentials.
        "allow_credentials": False,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }


def build_app() -> FastAPI:
    """Create the FastAPI app; interactive docs/schema are disabled on Vercel."""
    kwargs: Dict[str, Any] = {"title": "Cardiology Screening API"}
    if os.getenv("VERCEL"):
        kwargs.update(docs_url=None, redoc_url=None, openapi_url=None)
    return FastAPI(**kwargs)


app = build_app()
app.add_middleware(CORSMiddleware, **cors_settings())


@app.middleware("http")
async def add_security_headers(request: Request, call_next: Any) -> Any:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    return response


class LoginRequest(BaseModel):
    username: str
    password: str


class CreatePatientRequest(BaseModel):
    firstName: str
    lastName: str
    dateOfBirth: Optional[str] = None
    sex: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    externalPatientCode: Optional[str] = None


class UpdatePatientRequest(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    dateOfBirth: Optional[str] = None
    sex: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    externalPatientCode: Optional[str] = None


class EncounterFeatureIn(BaseModel):
    name: str
    value: Any
    valueType: Optional[str] = "string"


class CreateEncounterRequest(BaseModel):
    patientId: int
    notes: Optional[str] = ""
    features: List[EncounterFeatureIn] = []


VALID_RACE_CODES = {1, 2, 3, 4, 6, 7}


class RiskAssessmentRequest(BaseModel):
    patientId: int
    notes: Optional[str] = ""
    age: Optional[float] = Field(default=None, ge=18, le=120)
    bmi: Optional[float] = Field(default=None, ge=10, le=80)
    sbp: Optional[float] = Field(default=None, ge=60, le=260)
    dbp: Optional[float] = Field(default=None, ge=30, le=160)
    hdl: Optional[float] = Field(default=None, ge=10, le=150)
    ldl: Optional[float] = Field(default=None, ge=10, le=400)
    total_cholesterol: Optional[float] = Field(default=None, ge=70, le=500)
    triglycerides: Optional[float] = Field(default=None, ge=20, le=3000)
    fasting_glucose: Optional[float] = Field(default=None, ge=40, le=600)
    hba1c: Optional[float] = Field(default=None, ge=3, le=20)
    smoker: Optional[str] = None
    drink_count: Optional[float] = Field(default=None, ge=0, le=100)
    physically_active: Optional[str] = None
    sleep_hours: Optional[float] = Field(default=None, ge=0, le=24)
    waist: Optional[float] = Field(default=None, ge=40, le=200)
    crp: Optional[float] = Field(default=None, ge=0, le=300)
    systolicBp: Optional[float] = Field(default=None, ge=60, le=260)
    diastolicBp: Optional[float] = Field(default=None, ge=30, le=160)
    totalCholesterol: Optional[float] = Field(default=None, ge=70, le=500)
    diabetic: Optional[str] = None
    race: Optional[float] = None
    education: Optional[float] = Field(default=None, ge=1, le=5)
    incomeRatio: Optional[float] = Field(default=None, ge=0, le=5)
    waistCm: Optional[float] = Field(default=None, ge=40, le=200)
    hba1cPercent: Optional[float] = Field(default=None, ge=3, le=20)
    hsCrp: Optional[float] = Field(default=None, ge=0, le=300)
    sodium: Optional[float] = Field(default=None, ge=110, le=170)
    wbc: Optional[float] = Field(default=None, ge=1, le=50)
    hemoglobin: Optional[float] = Field(default=None, ge=5, le=22)
    platelets: Optional[float] = Field(default=None, ge=20, le=1500)
    rdw: Optional[float] = Field(default=None, ge=8, le=30)
    vigorousActivityMinutes: Optional[float] = Field(default=None, ge=0, le=50)  # PAD810Q: vigorous sessions per unit
    moderateActivityMinutes: Optional[float] = Field(default=None, ge=0, le=50)  # PAD790Q: moderate sessions per unit
    moderateActivityUnit: Optional[float] = Field(default=None, ge=1, le=4)
    sedentaryMinutes: Optional[float] = Field(default=None, ge=0, le=600)  # PAD800: moderate minutes per session
    sedentaryMinutesAlt: Optional[float] = Field(default=None, ge=0, le=1440)
    sleepHoursWeekday: Optional[float] = Field(default=None, ge=0, le=24)
    sleepHoursWeekend: Optional[float] = Field(default=None, ge=0, le=24)
    highBp: Optional[str] = None
    highChol: Optional[str] = None
    bpMed: Optional[str] = None
    cholMed: Optional[str] = None
    smokesNow: Optional[str] = None
    creatinine: Optional[float] = Field(default=None, ge=0.2, le=15)  # mg/dL
    triglycerides: Optional[float] = Field(default=None, ge=20, le=3000)  # mg/dL
    uricAcid: Optional[float] = Field(default=None, ge=1, le=20)  # mg/dL
    glucose: Optional[float] = Field(default=None, ge=40, le=600)  # mg/dL
    urineAcr: Optional[float] = Field(default=None, ge=0, le=25000)  # mg/g
    generalHealth: Optional[float] = Field(default=None, ge=1, le=5)  # 1 excellent .. 5 poor
    heartRate: Optional[int] = Field(default=None, ge=30, le=220)  # stored with the assessment, never a model input

    @field_validator("race")
    @classmethod
    def _check_race(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and value not in VALID_RACE_CODES:
            raise ValueError("race must be one of 1, 2, 3, 4, 6, 7")
        return value

    @field_validator("education", "moderateActivityUnit", "generalHealth")
    @classmethod
    def _check_integer_code(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and value != int(value):
            raise ValueError("must be a whole number")
        return value

    @field_validator("smoker", "physically_active", "highBp", "highChol", "bpMed", "cholMed", "smokesNow")
    @classmethod
    def _check_yes_no(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value.strip().lower() not in {"yes", "no"}:
            raise ValueError("must be 'yes' or 'no'")
        return value

    @field_validator("diabetic")
    @classmethod
    def _check_diabetic(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value.strip().lower() not in {"yes", "no", "borderline"}:
            raise ValueError("must be 'yes', 'no' or 'borderline'")
        return value

    @model_validator(mode="after")
    def _check_bp_order(self) -> "RiskAssessmentRequest":
        sbp = self.sbp if self.sbp is not None else self.systolicBp
        dbp = self.dbp if self.dbp is not None else self.diastolicBp
        if sbp is not None and dbp is not None and sbp <= dbp:
            raise ValueError("Systolic BP must be greater than diastolic BP")
        return self


class ReviewStatusRequest(BaseModel):
    reviewStatus: str
    reviewComment: Optional[str] = Field(default=None, max_length=2000)


class CreateUserRequest(BaseModel):
    username: str
    email: str
    role: str = "clinician"
    password: str


class UpdateUserRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    isActive: Optional[bool] = None
    password: Optional[str] = None


VALID_USER_ROLES = {"admin", "doctor", "clinician", "auditor"}


def get_db() -> Generator[Any, None, None]:
    try:
        if DATABASE_URL:
            conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
        else:
            conn = psycopg2.connect(cursor_factory=RealDictCursor)
    except psycopg2.Error as error:
        raise HTTPException(
            status_code=500,
            detail="Database unavailable",
        ) from error
    try:
        yield conn
    finally:
        conn.close()


# --- Patient identifier encryption (application layer, AES-256-GCM) ---------
# patient_sensitive_data stores each identifier encrypted in <field>_enc (BYTEA,
# see phi_crypto.py). The key never leaves the app process: SQL only ever sees
# ciphertext. Plaintext columns only hold not-yet-migrated legacy rows
# (see scripts/encrypt_patient_data.py).
PSD_FIELDS = ("first_name", "last_name", "date_of_birth", "phone", "email")


def psd_columns(alias: str = "psd") -> str:
    """Select-list fragment: ciphertext and legacy plaintext for every identifier."""
    return ", ".join(f"{alias}.{f} AS {f}, {alias}.{f}_enc AS {f}_enc" for f in PSD_FIELDS)


def psd_decrypt(row: Optional[Dict[str, Any]], patient_id: Optional[int] = None) -> Dict[str, Any]:
    """Decrypt identifiers from a row selected with psd_columns(); legacy plaintext as fallback.

    The ciphertext is bound to the patient id and column (AAD); the id is taken from
    the row's `patient_id` unless given.
    """
    row = row or {}
    pid = patient_id if patient_id is not None else row.get("patient_id")
    out: Dict[str, Any] = {}
    for field in PSD_FIELDS:
        blob = row.get(f"{field}_enc")
        value = decrypt_text(blob, PATIENT_DATA_KEY, aad=phi_aad(pid, field)) if blob is not None else row.get(field)
        if field == "date_of_birth" and isinstance(value, str):
            value = date.fromisoformat(value)
        out[field] = value
    return out


def psd_encrypt_value(patient_id: int, field: str, value: Any) -> Optional[Any]:
    """Ciphertext as psycopg2.Binary (or None) for one identifier; dates stored as YYYY-MM-DD."""
    if value is None:
        return None
    text = value.isoformat() if field == "date_of_birth" else value
    return Binary(encrypt_text(text, PATIENT_DATA_KEY, aad=phi_aad(patient_id, field)))


_PATIENT_KEY_VERIFIED = False
_KEY_MISMATCH_DETAIL = "Patient data key does not match stored data"


def require_patient_key(db: Any) -> None:
    """Refuse (503) to touch patient identifiers if PATIENT_DATA_KEY cannot decrypt stored data.

    Decrypts one existing *_enc value on first use and caches the successful result
    per process. With no encrypted data yet there is nothing to contradict, so the
    key is accepted (and re-checked on later requests until data exists).
    """
    global _PATIENT_KEY_VERIFIED
    if _PATIENT_KEY_VERIFIED:
        return
    cols = ", ".join(f"{f}_enc" for f in PSD_FIELDS)
    any_enc = " OR ".join(f"{f}_enc IS NOT NULL" for f in PSD_FIELDS)
    with db.cursor() as cursor:
        cursor.execute(f"SELECT patient_id, {cols} FROM patient_sensitive_data WHERE {any_enc} ORDER BY patient_id LIMIT 1")
        row = cursor.fetchone()
    if not row:
        return
    for field in PSD_FIELDS:
        blob = row[f"{field}_enc"]
        if blob is not None:
            try:
                decrypt_text(blob, PATIENT_DATA_KEY, aad=phi_aad(row["patient_id"], field))
            except PhiDecryptionError:
                logging.getLogger(__name__).error("PATIENT_DATA_KEY does not decrypt stored patient data")
                raise HTTPException(status_code=503, detail=_KEY_MISMATCH_DETAIL) from None
            break
    _PATIENT_KEY_VERIFIED = True


def insert_patient(
    cursor: Any,
    *,
    first_name: str,
    last_name: str,
    date_of_birth: Optional[date] = None,
    sex: Optional[str] = None,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    external_patient_code: Optional[str] = None,
    owner_user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Insert a patient with encrypted identifiers; owner_user_id marks demo-sandbox data."""
    cursor.execute(
        """
        INSERT INTO patients (external_patient_code, sex, owner_user_id)
        VALUES (%s, %s, %s)
        RETURNING id AS patient_id, external_patient_code, sex, created_at
        """,
        (external_patient_code, sex, owner_user_id),
    )
    patient = cursor.fetchone()
    pid = patient["patient_id"]
    cursor.execute(
        """
        INSERT INTO patient_sensitive_data (
            patient_id, first_name_enc, last_name_enc, date_of_birth_enc, phone_enc, email_enc
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            pid,
            psd_encrypt_value(pid, "first_name", first_name),
            psd_encrypt_value(pid, "last_name", last_name),
            psd_encrypt_value(pid, "date_of_birth", date_of_birth),
            psd_encrypt_value(pid, "phone", phone),
            psd_encrypt_value(pid, "email", email),
        ),
    )
    return patient


def patient_display_name(first_name: Optional[str], last_name: Optional[str], external_code: Optional[str], patient_id: Any) -> str:
    name = " ".join(part for part in (first_name, last_name) if part is not None).strip()
    return name or external_code or f"Patient {patient_id}"


def _assessment_patient_name(row: Dict[str, Any]) -> str:
    names = psd_decrypt(row)
    return patient_display_name(names["first_name"], names["last_name"], row["external_patient_code"], row["patient_id"])


def _assessment_patient_fields(row: Dict[str, Any]) -> Dict[str, Any]:
    """Minimal patient context for the dashboard: code, sex, age. Never DOB, phone or email."""
    return {
        "external_patient_code": row["external_patient_code"] or "",
        "patient_sex": row.get("patient_sex"),
        "patient_age": calculate_age_years(psd_decrypt(row).get("date_of_birth")),
    }


def parse_date_of_birth(value: Optional[str]) -> Optional[date]:
    """Validate an ISO date string (stored encrypted as text, so the DB cannot)."""
    if value is None:
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        raise HTTPException(status_code=422, detail="dateOfBirth must be a valid YYYY-MM-DD date")


def to_iso(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def calculate_age_years(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, datetime):
        dob = value.date()
    else:
        dob = value
    try:
        today = datetime.now(timezone.utc).date()
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    except Exception:
        return None
    return age if age >= 0 else None


def md5_hash(password: str) -> str:
    return hashlib.md5(password.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PBKDF2_ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_pbkdf2_password(raw_password: str, stored_hash: str) -> bool:
    parts = stored_hash.split("$")
    if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
        return False
    _, iteration_text, salt, expected_digest = parts
    try:
        iterations = int(iteration_text)
    except ValueError:
        return False
    actual_digest = hashlib.pbkdf2_hmac(
        "sha256",
        raw_password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return hmac.compare_digest(actual_digest, expected_digest)


def password_matches(raw_password: str, stored_hash: str) -> bool:
    if stored_hash.startswith("pbkdf2_sha256$"):
        return verify_pbkdf2_password(raw_password, stored_hash)
    digest = md5_hash(raw_password)
    return hmac.compare_digest(stored_hash, digest) or hmac.compare_digest(stored_hash, f"md5{digest}")


def password_hash_needs_upgrade(stored_hash: str) -> bool:
    return not stored_hash.startswith("pbkdf2_sha256$")


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def bearer_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    return authorization.replace("Bearer ", "", 1).strip()


def get_authenticated_user(db: Any, authorization: Optional[str]) -> Dict[str, Any]:
    token = bearer_token(authorization)
    token_hash = hash_session_token(token)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT u.id, u.username, u.email, u.role, u.is_demo, u.demo_expires_at,
                   (u.is_demo AND u.demo_expires_at IS NOT NULL AND u.demo_expires_at <= NOW()) AS demo_expired
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = %s
              AND s.expires_at > NOW()
              AND u.is_active = TRUE
            LIMIT 1
            """,
            (token_hash,),
        )
        user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    if user["demo_expired"]:
        raise demo_module.expired_error()
    return {
        "id": int(user["id"]),
        "username": user["username"],
        "email": user["email"],
        "role": user["role"],
        "is_demo": bool(user["is_demo"]),
        "demo_expires_at": to_iso(user["demo_expires_at"]) if user["is_demo"] else None,
    }


def authorize_user(
    db: Any,
    authorization: Optional[str],
    *,
    allowed_roles: set[str],
    request: Optional[Request] = None,
) -> Dict[str, Any]:
    user = get_authenticated_user(db, authorization)
    if user["role"] in allowed_roles:
        return user

    if request is not None:
        method_to_action = {
            "GET": "read",
            "POST": "create",
            "PUT": "update",
            "PATCH": "update",
            "DELETE": "delete",
        }
        log_audit_event(
            db,
            action_type=method_to_action.get(request.method.upper(), "read"),
            resource_type="authorization",
            endpoint=str(request.url.path),
            method=request.method,
            outcome="denied",
            ip_address=client_ip(request),
            user_id=user["id"],
        )
        db.commit()

    raise HTTPException(status_code=403, detail="Insufficient permissions")


def _valid_ip(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError:
        return None


def client_ip(request: Optional[Request]) -> Optional[str]:
    """Return the client IP only when valid (audit_log.ip_address is INET).

    With TRUST_PROXY_HEADERS=true (behind Vercel), the first X-Forwarded-For entry is used
    when it is a valid IP; otherwise falls back to the socket peer.
    """
    if request is None:
        return None
    if os.getenv("TRUST_PROXY_HEADERS", "").strip().lower() in {"true", "1", "yes"}:
        forwarded = _valid_ip((request.headers.get("x-forwarded-for") or "").split(",")[0])
        if forwarded:
            return forwarded
    return _valid_ip(request.client.host if request.client else None)


def log_audit_event(
    db: Any,
    *,
    action_type: str,
    resource_type: str,
    resource_id: Optional[int] = None,
    patient_id: Optional[int] = None,
    endpoint: Optional[str] = None,
    method: Optional[str] = None,
    outcome: str = "success",
    ip_address: Optional[str] = None,
    user_id: Optional[int] = None,
) -> None:
    with db.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO audit_log (
                user_id, action_type, resource_type, resource_id, patient_id,
                http_method, endpoint, outcome, ip_address
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_id,
                action_type,
                resource_type,
                resource_id,
                patient_id,
                method,
                endpoint,
                outcome,
                ip_address,
            ),
        )


def audit(
    db: Any,
    request: Request,
    user: Dict[str, Any],
    *,
    action_type: str,
    resource_type: str,
    resource_id: Optional[int] = None,
    patient_id: Optional[int] = None,
    outcome: str = "success",
) -> None:
    """Write one audit row for this request. Does not commit."""
    log_audit_event(
        db,
        action_type=action_type,
        resource_type=resource_type,
        resource_id=resource_id,
        patient_id=patient_id,
        endpoint=str(request.url.path),
        method=request.method,
        outcome=outcome,
        ip_address=client_ip(request),
        user_id=user["id"],
    )


def require_active_patient(db: Any, patient_id: int, user: Dict[str, Any]) -> None:
    scope_sql, scope_params = patient_scope_sql(user)
    with db.cursor() as cursor:
        cursor.execute(
            f"SELECT 1 FROM patients p WHERE p.id = %s AND p.is_active = TRUE AND {scope_sql}",
            (patient_id, *scope_params),
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Patient not found")


def serialize_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "user_id": user["user_id"],
        "username": user["username"],
        "email": user["email"],
        "full_name": user["username"],
        "role": user["role"],
        "is_active": bool(user["is_active"]),
        "last_login_at": to_iso(user["last_login"]),
        "created_at": to_iso(user["created_at"]),
        "is_demo": bool(user.get("is_demo", False)),
        "demo_expires_at": to_iso(user.get("demo_expires_at")),
    }


# Set once the active-model row has been upserted in this process. Tests that drop the
# schema between cases reset it (see tests/conftest.py).
_MODEL_REGISTRY_READY = False


def ensure_active_model_registry_entry(db: Any) -> None:
    """Upsert the deployed pipeline as the single active model (at most once per process)."""
    global _MODEL_REGISTRY_READY
    if _MODEL_REGISTRY_READY:
        return
    schema = inference.get_schema()
    metrics = inference.get_metrics()
    name = schema["model_name"]
    version = schema["model_version"]
    with db.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO model_registry (
                name, version, status, algorithm, use_case,
                accuracy, auc, precision_score, recall_score, f1_score,
                training_data_size, validation_metrics
            )
            VALUES (%s, %s, 'active', 'stacked_pipeline', 'cardiovascular_disease_risk',
                    %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (name, version)
            DO UPDATE SET
                status = 'active',
                algorithm = EXCLUDED.algorithm,
                use_case = EXCLUDED.use_case,
                accuracy = EXCLUDED.accuracy,
                auc = EXCLUDED.auc,
                precision_score = EXCLUDED.precision_score,
                recall_score = EXCLUDED.recall_score,
                f1_score = EXCLUDED.f1_score,
                training_data_size = EXCLUDED.training_data_size,
                validation_metrics = EXCLUDED.validation_metrics
            """,
            (
                name,
                version,
                metrics.get("accuracy"),
                metrics.get("auc"),
                metrics.get("precision"),
                metrics.get("recall"),
                metrics.get("f1"),
                metrics.get("n_train"),
                Json(metrics),
            ),
        )
        cursor.execute(
            "UPDATE model_registry SET status = 'retired' WHERE NOT (name = %s AND version = %s) AND status <> 'retired'",
            (name, version),
        )
    db.commit()
    _MODEL_REGISTRY_READY = True


def ensure_cds_rules_seeded(db: Any) -> None:
    with db.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) AS count FROM cds_rules WHERE active = TRUE")
        active_count = int(cursor.fetchone()["count"])
        if active_count > 0:
            return

        defaults = [
            (
                "low",
                0.0,
                LOW_RISK_MAX_PROBABILITY,
                "Low risk: continue healthy lifestyle and routine follow-up.",
                10,
            ),
            (
                "medium",
                LOW_RISK_MAX_PROBABILITY,
                MEDIUM_RISK_MAX_PROBABILITY,
                "Moderate risk: schedule clinician follow-up and risk-factor management.",
                20,
            ),
            (
                "high",
                MEDIUM_RISK_MAX_PROBABILITY,
                1.0,
                "High risk: prioritize clinician review and preventative intervention planning.",
                30,
            ),
        ]

        for risk_level, min_probability, max_probability, recommendation, priority in defaults:
            cursor.execute(
                """
                INSERT INTO cds_rules (risk_level, min_probability, max_probability, recommendation, active, priority)
                VALUES (%s, %s, %s, %s, TRUE, %s)
                """,
                (risk_level, min_probability, max_probability, recommendation, priority),
            )
    db.commit()


RECOMMENDATION_BY_LEVEL = {
    "low": "Low risk: continue healthy lifestyle and routine follow-up.",
    "medium": "Moderate risk: schedule clinician follow-up and risk-factor management.",
    "high": "High risk: prioritize clinician review and preventative intervention planning.",
}


def fallback_risk_classification(probability: float) -> Dict[str, str]:
    if probability < LOW_RISK_MAX_PROBABILITY:
        level = "low"
    elif probability < MEDIUM_RISK_MAX_PROBABILITY:
        level = "medium"
    else:
        level = "high"
    return {"risk_level": level, "recommendation": RECOMMENDATION_BY_LEVEL[level]}


@app.post("/api/auth/login")
def login(payload: LoginRequest, request: Request, db: Any = Depends(get_db)) -> Dict[str, Any]:
    ip_address = client_ip(request)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, username, email, role, password_hash, failed_login_attempts,
                   is_demo, demo_expires_at,
                   (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked,
                   (is_demo AND demo_expires_at IS NOT NULL AND demo_expires_at <= NOW()) AS demo_expired
            FROM users
            WHERE username = %s AND is_active = TRUE
            FOR UPDATE
            """,
            (payload.username,),
        )
        user = cursor.fetchone()
        if user and user["is_locked"]:
            log_audit_event(
                db,
                action_type="login",
                resource_type="session",
                endpoint=str(request.url.path),
                method=request.method,
                outcome="denied",
                ip_address=ip_address,
                user_id=user["id"],
            )
            db.commit()
            raise HTTPException(
                status_code=429,
                detail="Too many failed login attempts. Try again later.",
            )
        if not user or not password_matches(payload.password, user["password_hash"]):
            if user:
                attempts = int(user["failed_login_attempts"]) + 1
                if attempts >= LOGIN_MAX_ATTEMPTS:
                    cursor.execute(
                        """
                        UPDATE users
                        SET failed_login_attempts = 0,
                            locked_until = NOW() + make_interval(mins => %s)
                        WHERE id = %s
                        """,
                        (LOGIN_LOCKOUT_MINUTES, user["id"]),
                    )
                else:
                    cursor.execute(
                        "UPDATE users SET failed_login_attempts = %s WHERE id = %s",
                        (attempts, user["id"]),
                    )
            log_audit_event(
                db,
                action_type="login",
                resource_type="session",
                endpoint=str(request.url.path),
                method=request.method,
                outcome="failure",
                ip_address=ip_address,
                user_id=user["id"] if user else None,
            )
            db.commit()
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if user["demo_expired"]:
            # Only revealed after the password checked out, so usernames cannot be probed.
            log_audit_event(
                db,
                action_type="login",
                resource_type="session",
                endpoint=str(request.url.path),
                method=request.method,
                outcome="denied",
                ip_address=ip_address,
                user_id=user["id"],
            )
            db.commit()
            raise demo_module.expired_error()

        token = secrets.token_urlsafe(48)
        token_hash = hash_session_token(token)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=SESSION_TTL_MINUTES)
        if password_hash_needs_upgrade(user["password_hash"]):
            cursor.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (hash_password(payload.password), user["id"]),
            )
        cursor.execute(
            "INSERT INTO sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
            (user["id"], token_hash, expires_at),
        )
        cursor.execute(
            "UPDATE users SET last_login = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = %s",
            (user["id"],),
        )
        log_audit_event(
            db,
            action_type="login",
            resource_type="session",
            resource_id=user["id"],
            endpoint=str(request.url.path),
            method=request.method,
            outcome="success",
            ip_address=client_ip(request),
            user_id=user["id"],
        )
    db.commit()

    return {
        "token": token,
        "id": user["id"],
        "user_id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "role": user["role"],
        "is_demo": bool(user["is_demo"]),
        "demo_expires_at": to_iso(user["demo_expires_at"]) if user["is_demo"] else None,
    }


@app.post("/api/demo/start", status_code=201)
def start_demo(request: Request, db: Any = Depends(get_db)) -> Dict[str, Any]:
    """Public: create a personal 15-day demo account with synthetic patients."""
    return demo_module.create_demo_account(sys.modules[__name__], db, request)


@app.post("/api/auth/logout")
def logout(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, bool]:
    token = bearer_token(authorization)
    token_hash = hash_session_token(token)
    user_id: Optional[int] = None
    with db.cursor() as cursor:
        cursor.execute("SELECT user_id FROM sessions WHERE token = %s LIMIT 1", (token_hash,))
        session_row = cursor.fetchone()
        user_id = int(session_row["user_id"]) if session_row else None
        cursor.execute("DELETE FROM sessions WHERE token = %s", (token_hash,))
        log_audit_event(
            db,
            action_type="logout",
            resource_type="session",
            resource_id=user_id,
            endpoint=str(request.url.path),
            method=request.method,
            ip_address=client_ip(request),
            user_id=user_id,
        )
    db.commit()
    return {"success": True}


@app.get("/api/auth/me")
def me(authorization: Optional[str] = Header(default=None), db: Any = Depends(get_db)) -> Dict[str, Any]:
    user = get_authenticated_user(db, authorization)
    return {
        "id": user["id"],
        "user_id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "role": user["role"],
        "is_demo": user["is_demo"],
        "demo_expires_at": user["demo_expires_at"],
    }


@app.get("/api/patients")
def get_patients(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> List[Dict[str, Any]]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    require_patient_key(db)
    scope_sql, scope_params = patient_scope_sql(user)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT p.id AS patient_id, p.external_patient_code, p.sex, p.created_at,
                   {psd_cols},
                   la.assessment_id AS last_assessment_id, la.created_at AS last_created_at,
                   la.probability AS last_probability, la.risk_level AS last_risk_level,
                   la.override_risk_level AS last_override_risk_level, la.review_status AS last_review_status
            FROM patients p
            LEFT JOIN patient_sensitive_data psd ON psd.patient_id = p.id
            LEFT JOIN LATERAL (
                SELECT ra.id AS assessment_id, ra.created_at, ra.probability, ra.risk_level,
                       ra.override_risk_level, ra.review_status
                FROM risk_assessments ra
                WHERE ra.patient_id = p.id AND ra.deleted_at IS NULL
                ORDER BY ra.created_at DESC, ra.id DESC
                LIMIT 1
            ) la ON TRUE
            WHERE p.is_active = TRUE AND {scope}
            ORDER BY p.created_at DESC
            """.format(psd_cols=psd_columns(), scope=scope_sql),
            scope_params,
        )
        patients = [{**row, **psd_decrypt(row)} for row in cursor.fetchall()]
    audit(db, request, user, action_type="read", resource_type="patient_list")
    db.commit()
    return [
        {
            "patient_id": p["patient_id"],
            "external_patient_code": p["external_patient_code"] or "",
            "sex": p["sex"],
            "first_name": p["first_name"] or "",
            "last_name": p["last_name"] or "",
            "date_of_birth": to_iso(p["date_of_birth"]),
            "phone": p["phone"] or "",
            "email": p["email"] or "",
            "created_at": to_iso(p["created_at"]),
            "last_assessment": None if p["last_assessment_id"] is None else {
                "assessment_id": p["last_assessment_id"],
                "created_at": to_iso(p["last_created_at"]),
                "probability_cvd": float(p["last_probability"] or 0),
                "risk_level": p["last_risk_level"],
                "effective_risk_level": p["last_override_risk_level"] or p["last_risk_level"],
                "review_status": p["last_review_status"] or "pending",
            },
        }
        for p in patients
    ]


@app.get("/api/patients/{patient_id}")
def get_patient(
    patient_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    require_patient_key(db)
    scope_sql, scope_params = patient_scope_sql(user)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT p.id AS patient_id, p.external_patient_code, p.sex, p.created_at,
                   {psd_cols}
            FROM patients p
            LEFT JOIN patient_sensitive_data psd ON psd.patient_id = p.id
            WHERE p.id = %s AND p.is_active = TRUE AND {scope}
            """.format(psd_cols=psd_columns(), scope=scope_sql),
            (patient_id, *scope_params),
        )
        patient = cursor.fetchone()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    patient = {**patient, **psd_decrypt(patient)}
    audit(db, request, user, action_type="read", resource_type="patient", resource_id=patient_id, patient_id=patient_id)
    db.commit()
    return {
        "patient_id": patient["patient_id"],
        "external_patient_code": patient["external_patient_code"] or "",
        "sex": patient["sex"],
        "first_name": patient["first_name"] or "",
        "last_name": patient["last_name"] or "",
        "date_of_birth": to_iso(patient["date_of_birth"]),
        "phone": patient["phone"] or "",
        "email": patient["email"] or "",
        "created_at": to_iso(patient["created_at"]),
    }


@app.post("/api/patients", status_code=201)
def create_patient(
    payload: CreatePatientRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    require_patient_key(db)
    date_of_birth = parse_date_of_birth(payload.dateOfBirth)
    with db.cursor() as cursor:
        patient = insert_patient(
            cursor,
            first_name=payload.firstName, last_name=payload.lastName, date_of_birth=date_of_birth,
            sex=payload.sex, phone=payload.phone, email=payload.email,
            external_patient_code=payload.externalPatientCode,
            owner_user_id=user["id"] if user["is_demo"] else None,
        )
    audit(
        db, request, user, action_type="create", resource_type="patient",
        resource_id=patient["patient_id"], patient_id=patient["patient_id"],
    )
    db.commit()
    return {
        "patient_id": patient["patient_id"],
        "external_patient_code": patient["external_patient_code"] or "",
        "sex": patient["sex"],
        "first_name": payload.firstName,
        "last_name": payload.lastName,
        "date_of_birth": to_iso(date_of_birth),
        "phone": payload.phone or "",
        "email": payload.email or "",
        "created_at": to_iso(patient["created_at"]),
    }


@app.patch("/api/patients/{patient_id}")
def update_patient(
    patient_id: int,
    payload: UpdatePatientRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    require_patient_key(db)
    date_of_birth = parse_date_of_birth(payload.dateOfBirth)
    scope_sql, scope_params = patient_scope_sql(user, "patients")
    with db.cursor() as cursor:
        cursor.execute(
            f"""
            UPDATE patients
            SET external_patient_code = COALESCE(%s, external_patient_code),
                sex = COALESCE(%s, sex)
            WHERE id = %s AND is_active = TRUE AND {scope_sql}
            RETURNING id AS patient_id, external_patient_code, sex, created_at
            """,
            (payload.externalPatientCode, payload.sex, patient_id, *scope_params),
        )
        patient = cursor.fetchone()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        # New value wins; a None field keeps the stored value (decrypted, or legacy
        # plaintext). Everything is re-encrypted and the plaintext columns NULLed.
        cursor.execute(
            "SELECT {cols} FROM patient_sensitive_data WHERE patient_id = %s FOR UPDATE".format(cols=psd_columns("patient_sensitive_data")),
            (patient_id,),
        )
        existing = cursor.fetchone()
        sensitive = None
        if existing:
            current = psd_decrypt(existing, patient_id)
            new_values = {
                "first_name": payload.firstName, "last_name": payload.lastName,
                "date_of_birth": date_of_birth, "phone": payload.phone, "email": payload.email,
            }
            sensitive = {f: new_values[f] if new_values[f] is not None else current[f] for f in PSD_FIELDS}
            assignments = ", ".join(f"{f}_enc = %s, {f} = NULL" for f in PSD_FIELDS)
            cursor.execute(
                f"UPDATE patient_sensitive_data SET {assignments} WHERE patient_id = %s",
                (*(psd_encrypt_value(patient_id, f, sensitive[f]) for f in PSD_FIELDS), patient_id),
            )

    audit(db, request, user, action_type="update", resource_type="patient", resource_id=patient_id, patient_id=patient_id)
    db.commit()

    return {
        "patient_id": patient["patient_id"],
        "external_patient_code": patient["external_patient_code"] or "",
        "sex": patient["sex"],
        "first_name": sensitive["first_name"] if sensitive else payload.firstName or "",
        "last_name": sensitive["last_name"] if sensitive else payload.lastName or "",
        "date_of_birth": to_iso(sensitive["date_of_birth"]) if sensitive else to_iso(date_of_birth),
        "phone": sensitive["phone"] if sensitive else payload.phone or "",
        "email": sensitive["email"] if sensitive else payload.email or "",
        "created_at": to_iso(patient["created_at"]),
    }


@app.delete("/api/patients/{patient_id}")
def deactivate_patient(
    patient_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    scope_sql, scope_params = patient_scope_sql(user, "patients")
    with db.cursor() as cursor:
        cursor.execute(
            f"""
            UPDATE patients
            SET is_active = FALSE
            WHERE id = %s AND is_active = TRUE AND {scope_sql}
            RETURNING id
            """,
            (patient_id, *scope_params),
        )
        updated = cursor.fetchone()
        if not updated:
            raise HTTPException(status_code=404, detail="Patient not found")
    audit(db, request, user, action_type="delete", resource_type="patient", resource_id=patient_id, patient_id=patient_id)
    db.commit()
    return {"success": True}


@app.get("/api/patients/{patient_id}/encounters")
def get_patient_encounters(
    patient_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> List[Dict[str, Any]]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    require_active_patient(db, patient_id, user)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT e.id AS encounter_id, e.patient_id, e.encounter_date, e.notes, e.created_at,
                   ef.id AS feature_id, ef.feature_name, ef.feature_value, ef.value_type
            FROM encounters e
            LEFT JOIN encounter_features ef ON ef.encounter_id = e.id
            WHERE e.patient_id = %s
            ORDER BY e.encounter_date DESC, e.id DESC, ef.id
            """,
            (patient_id,),
        )
        rows = cursor.fetchall()

    by_id: Dict[int, Dict[str, Any]] = {}
    for row in rows:
        encounter = by_id.get(row["encounter_id"])
        if encounter is None:
            encounter = {
                "encounter_id": row["encounter_id"],
                "patient_id": row["patient_id"],
                "encounter_date": to_iso(row["encounter_date"]),
                "notes": row["notes"] or "",
                "created_at": to_iso(row["created_at"]),
                "features": [],
            }
            by_id[row["encounter_id"]] = encounter
        if row["feature_id"] is not None:
            encounter["features"].append(
                {
                    "feature_id": row["feature_id"],
                    "encounter_id": row["encounter_id"],
                    "feature_code": row["feature_name"],
                    "feature_value": row["feature_value"] or "",
                    "value_type": row["value_type"],
                }
            )
    audit(db, request, user, action_type="read", resource_type="encounter_list", patient_id=patient_id)
    db.commit()
    return list(by_id.values())


@app.post("/api/encounters", status_code=201)
def create_encounter(
    payload: CreateEncounterRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    require_active_patient(db, payload.patientId, user)
    with db.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO encounters (patient_id, notes)
            VALUES (%s, %s)
            RETURNING id AS encounter_id, patient_id, encounter_date, notes, created_at
            """,
            (payload.patientId, payload.notes),
        )
        encounter = cursor.fetchone()

        for feature in payload.features:
            cursor.execute(
                """
                INSERT INTO encounter_features (encounter_id, feature_name, feature_value, value_type)
                VALUES (%s, %s, %s, %s)
                """,
                (
                    encounter["encounter_id"],
                    feature.name,
                    str(feature.value),
                    feature.valueType or "string",
                ),
            )
    audit(
        db, request, user, action_type="create", resource_type="encounter",
        resource_id=encounter["encounter_id"], patient_id=payload.patientId,
    )
    db.commit()
    return {
        "encounter_id": encounter["encounter_id"],
        "patient_id": encounter["patient_id"],
        "encounter_date": to_iso(encounter["encounter_date"]),
        "notes": encounter["notes"] or "",
        "created_at": to_iso(encounter["created_at"]),
        "features": [
            {
                "feature_id": 0,
                "encounter_id": encounter["encounter_id"],
                "feature_code": feature.name,
                "feature_value": str(feature.value),
                "value_type": feature.valueType or "string",
            }
            for feature in payload.features
        ],
    }


@app.get("/api/models")
def get_models(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> List[Dict[str, Any]]:
    authorize_user(db, authorization, allowed_roles={"admin", "doctor"}, request=request)
    ensure_active_model_registry_entry(db)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT id AS model_id, name AS model_name, version AS model_version,
                   algorithm, use_case, status, accuracy, auc,
                   precision_score, recall_score, f1_score, created_at
            FROM model_registry
            ORDER BY created_at DESC
            """
        )
        models = cursor.fetchall()
    return [
        {
            "model_id": model["model_id"],
            "model_name": model["model_name"],
            "model_version": model["model_version"],
            "algorithm": model["algorithm"] or "",
            "use_case": model["use_case"] or "",
            "is_active": str(model["status"] or "").lower() == "active",
            "accuracy": float(model["accuracy"] or 0),
            "auc": float(model["auc"] or 0),
            "precision_score": float(model["precision_score"] or 0),
            "recall_score": float(model["recall_score"] or 0),
            "f1_score": float(model["f1_score"] or 0),
            "trained_at": to_iso(model["created_at"]),
        }
        for model in models
    ]


@app.get("/api/models/{model_id}")
def get_model(
    model_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    authorize_user(db, authorization, allowed_roles={"admin", "doctor"}, request=request)
    ensure_active_model_registry_entry(db)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT id AS model_id, name AS model_name, version AS model_version,
                   algorithm, use_case, status, accuracy, auc, precision_score,
                   recall_score, f1_score, validation_metrics, training_data_size, created_at
            FROM model_registry
            WHERE id = %s
            """,
            (model_id,),
        )
        model = cursor.fetchone()
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")

        cursor.execute(
            """
            SELECT feature_name, feature_type, description, importance_score
            FROM model_features
            WHERE model_id = %s
            ORDER BY importance_score DESC NULLS LAST, display_order ASC
            """,
            (model_id,),
        )
        features = cursor.fetchall()

    return {
        "model_id": model["model_id"],
        "model_name": model["model_name"],
        "model_version": model["model_version"],
        "algorithm": model["algorithm"] or "",
        "description": model["use_case"] or "",
        "is_active": str(model["status"] or "").lower() == "active",
        "accuracy": float(model["accuracy"] or 0),
        "auc": float(model["auc"] or 0),
        "precision_score": float(model["precision_score"] or 0),
        "recall_score": float(model["recall_score"] or 0),
        "f1_score": float(model["f1_score"] or 0),
        "training_data_size": model["training_data_size"],
        "validation_metrics": model["validation_metrics"],
        "trained_at": to_iso(model["created_at"]),
        "features": [
            {
                "feature_code": feature["feature_name"],
                "feature_type": feature["feature_type"],
                "description": feature["description"],
                "importance_score": float(feature["importance_score"] or 0),
            }
            for feature in features
        ],
    }


@app.get("/api/risk-assessments")
def get_risk_assessments(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    review_status: Optional[str] = Query(default=None, pattern="^(pending|reviewed)$"),
    limit: int = Query(default=100, ge=1, le=200),
    db: Any = Depends(get_db),
) -> List[Dict[str, Any]]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician", "auditor"}, request=request)
    require_patient_key(db)
    scope_sql, scope_params = patient_scope_sql(user)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT ra.id AS assessment_id, ra.patient_id, ra.encounter_id, ra.model_id,
                   ra.probability AS probability_cvd, ra.risk_level, ra.assessment_status, ra.review_status,
                   ra.recommendation AS recommendation_text, ra.notes, ra.created_at,
                   ra.reviewed_at, ra.review_comment, ru.username AS reviewed_by_username,
                   p.external_patient_code, p.sex AS patient_sex, {psd_cols}, {override_cols},
                   m.name AS model_name, m.version AS model_version
            FROM risk_assessments ra
            JOIN patients p ON p.id = ra.patient_id
            LEFT JOIN patient_sensitive_data psd ON psd.patient_id = ra.patient_id
            LEFT JOIN model_registry m ON m.id = ra.model_id
            LEFT JOIN users ru ON ru.id = ra.reviewed_by
            {override_join}
            WHERE ra.deleted_at IS NULL AND {scope}{review_filter}
            ORDER BY ra.created_at DESC, ra.id DESC
            LIMIT %s
            """.format(
                psd_cols=psd_columns(), scope=scope_sql, override_cols=clinical.OVERRIDE_COLUMNS_SQL,
                override_join=clinical.OVERRIDE_JOIN_SQL,
                review_filter=" AND ra.review_status = %s" if review_status else "",
            ),
            (*scope_params, *((review_status,) if review_status else ()), limit),
        )
        assessments = [{**row, "patient_label": _assessment_patient_name(row)} for row in cursor.fetchall()]

    audit(db, request, user, action_type="read", resource_type="risk_assessment_list")
    db.commit()
    return [
        {
            "assessment_id": assessment["assessment_id"],
            "encounter_id": assessment["encounter_id"],
            "patient_id": assessment["patient_id"],
            "patient_name": assessment["patient_label"],
            **_assessment_patient_fields(assessment),
            "model_id": assessment["model_id"],
            "model_name": assessment["model_name"] or "",
            "model_version": assessment["model_version"] or "",
            "probability_cvd": float(assessment["probability_cvd"] or 0),
            "predicted_label": assessment["risk_level"],
            "risk_level": assessment["risk_level"],
            "assessment_status": assessment["assessment_status"] or "completed",
            "review_status": assessment["review_status"] or "pending",
            "recommendation_text": assessment["recommendation_text"] or "",
            "notes": assessment["notes"] or "",
            "created_at": to_iso(assessment["created_at"]),
            "reviewed_by_username": assessment["reviewed_by_username"],
            "reviewed_at": to_iso(assessment["reviewed_at"]),
            "review_comment": assessment["review_comment"],
            **clinical.serialize_override(assessment, to_iso),
        }
        for assessment in assessments
    ]


@app.get("/api/risk-assessments/{assessment_id}")
def get_risk_assessment(
    assessment_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician", "auditor"}, request=request)
    require_patient_key(db)
    scope_sql, scope_params = patient_scope_sql(user)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT ra.id AS assessment_id, ra.patient_id, ra.encounter_id, ra.model_id,
                    ra.probability AS probability_cvd, ra.risk_level, ra.assessment_status, ra.review_status,
                    ra.recommendation AS recommendation_text, ra.notes, ra.created_at, ra.explanation_json,
                    ra.reviewed_at, ra.review_comment, ru.username AS reviewed_by_username,
                    p.external_patient_code, p.sex AS patient_sex, {psd_cols}, {override_cols},
                    m.name AS model_name, m.version AS model_version
            FROM risk_assessments ra
            JOIN patients p ON p.id = ra.patient_id
            LEFT JOIN patient_sensitive_data psd ON psd.patient_id = ra.patient_id
            LEFT JOIN model_registry m ON m.id = ra.model_id
            LEFT JOIN users ru ON ru.id = ra.reviewed_by
            {override_join}
            WHERE ra.id = %s AND ra.deleted_at IS NULL AND {scope}
            LIMIT 1
            """.format(
                psd_cols=psd_columns(), scope=scope_sql, override_cols=clinical.OVERRIDE_COLUMNS_SQL,
                override_join=clinical.OVERRIDE_JOIN_SQL,
            ),
            (assessment_id, *scope_params),
        )
        assessment = cursor.fetchone()
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")
        # Scope is re-applied on the join so the inputs can never come from the other world.
        cursor.execute(
            f"""
            SELECT afv.feature_name, afv.feature_value, afv.value_type
            FROM assessment_feature_values afv
            JOIN risk_assessments ra ON ra.id = afv.assessment_id
            JOIN patients p ON p.id = ra.patient_id
            WHERE afv.assessment_id = %s AND ra.deleted_at IS NULL AND {scope_sql}
            ORDER BY afv.feature_name
            """,
            (assessment_id, *scope_params),
        )
        inputs = {row["feature_name"]: clinical.feature_value(row) for row in cursor.fetchall()}
        # History is read through the (scoped) parent assessment, newest first.
        cursor.execute(
            f"""
            SELECT o.risk_level, o.recommendation, o.reason, o.created_at, ou.username AS overridden_by_username
            FROM risk_assessment_overrides o
            JOIN risk_assessments ra ON ra.id = o.assessment_id
            JOIN patients p ON p.id = ra.patient_id
            LEFT JOIN users ou ON ou.id = o.overridden_by
            WHERE o.assessment_id = %s AND ra.deleted_at IS NULL AND {scope_sql}
            ORDER BY o.created_at DESC, o.id DESC
            """,
            (assessment_id, *scope_params),
        )
        override_history = [
            {
                "risk_level": row["risk_level"],
                "recommendation": row["recommendation"],
                "reason": row["reason"],
                "overridden_by_username": row["overridden_by_username"],
                "created_at": to_iso(row["created_at"]),
            }
            for row in cursor.fetchall()
        ]
    assessment["patient_label"] = _assessment_patient_name(assessment)

    audit(
        db, request, user, action_type="read", resource_type="risk_assessment",
        resource_id=assessment_id, patient_id=assessment["patient_id"],
    )
    db.commit()
    return {
        "assessment_id": assessment["assessment_id"],
        "encounter_id": assessment["encounter_id"],
        "patient_id": assessment["patient_id"],
        "patient_name": assessment["patient_label"],
        **_assessment_patient_fields(assessment),
        "model_id": assessment["model_id"],
        "model_name": assessment["model_name"] or "",
        "model_version": assessment["model_version"] or "",
        "probability_cvd": float(assessment["probability_cvd"] or 0),
        "predicted_label": assessment["risk_level"],
        "risk_level": assessment["risk_level"],
        "assessment_status": assessment["assessment_status"] or "completed",
        "review_status": assessment["review_status"] or "pending",
        "recommendation_text": assessment["recommendation_text"] or "",
        "notes": assessment["notes"] or "",
        "created_at": to_iso(assessment["created_at"]),
        "reviewed_by_username": assessment["reviewed_by_username"],
        "reviewed_at": to_iso(assessment["reviewed_at"]),
        "review_comment": assessment["review_comment"],
        **clinical.serialize_override(assessment, to_iso),
        "inputs": inputs,
        "override_history": override_history,
        "explanation": assessment["explanation_json"] or {},
    }


@app.get("/api/patients/{patient_id}/risk-assessments")
def get_patient_risk_assessments(
    patient_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> List[Dict[str, Any]]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    require_active_patient(db, patient_id, user)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT ra.id AS assessment_id, ra.patient_id, ra.encounter_id, ra.model_id,
                   ra.probability AS probability_cvd, ra.risk_level, ra.assessment_status, ra.review_status,
                   ra.recommendation AS recommendation_text, ra.notes, ra.created_at,
                   ra.reviewed_at, ra.review_comment, ru.username AS reviewed_by_username,
                   {override_cols},
                   m.name AS model_name, m.version AS model_version
            FROM risk_assessments ra
            LEFT JOIN model_registry m ON m.id = ra.model_id
            LEFT JOIN users ru ON ru.id = ra.reviewed_by
            {override_join}
            WHERE ra.patient_id = %s AND ra.deleted_at IS NULL
            ORDER BY ra.created_at DESC
            """.format(override_cols=clinical.OVERRIDE_COLUMNS_SQL, override_join=clinical.OVERRIDE_JOIN_SQL),
            (patient_id,),
        )
        assessments = cursor.fetchall()

    audit(db, request, user, action_type="read", resource_type="risk_assessment_list", patient_id=patient_id)
    db.commit()
    return [
        {
            "assessment_id": assessment["assessment_id"],
            "encounter_id": assessment["encounter_id"],
            "patient_id": assessment["patient_id"],
            "model_id": assessment["model_id"],
            "model_name": assessment["model_name"] or "",
            "model_version": assessment["model_version"] or "",
            "probability_cvd": float(assessment["probability_cvd"] or 0),
            "predicted_label": assessment["risk_level"],
            "risk_level": assessment["risk_level"],
            "assessment_status": assessment["assessment_status"] or "completed",
            "review_status": assessment["review_status"] or "pending",
            "recommendation_text": assessment["recommendation_text"] or "",
            "notes": assessment["notes"] or "",
            "created_at": to_iso(assessment["created_at"]),
            "reviewed_by_username": assessment["reviewed_by_username"],
            "reviewed_at": to_iso(assessment["reviewed_at"]),
            "review_comment": assessment["review_comment"],
            **clinical.serialize_override(assessment, to_iso),
        }
        for assessment in assessments
    ]


def _assessment_inputs(payload: RiskAssessmentRequest) -> Dict[str, Any]:
    """Collect request values by model input key (snake_case field first, then its camelCase alias)."""

    def pick(*values: Any) -> Any:
        for value in values:
            if value is not None:
                return value
        return None

    return {
        "age": payload.age,
        "bmi": payload.bmi,
        "sbp": pick(payload.sbp, payload.systolicBp),
        "dbp": pick(payload.dbp, payload.diastolicBp),
        "total_cholesterol": pick(payload.total_cholesterol, payload.totalCholesterol),
        "hdl": payload.hdl,
        "hba1c": pick(payload.hba1c, payload.hba1cPercent),
        "crp": pick(payload.crp, payload.hsCrp),
        "waist": pick(payload.waist, payload.waistCm),
        "sodium": payload.sodium,
        "wbc": payload.wbc,
        "hgb": payload.hemoglobin,
        "platelets": payload.platelets,
        "rdw": payload.rdw,
        "vigorous_activity": payload.vigorousActivityMinutes,
        "moderate_activity": payload.moderateActivityMinutes,
        "moderate_activity_units": payload.moderateActivityUnit,
        "sedentary_minutes": payload.sedentaryMinutes,
        "sedentary_minutes_alt": payload.sedentaryMinutesAlt,
        "sleep_hours": pick(payload.sleep_hours, payload.sleepHoursWeekday),
        "sleep_hours_weekend": payload.sleepHoursWeekend,
        "income_ratio": payload.incomeRatio,
        "race": payload.race,
        "education": payload.education,
        "smoker": payload.smoker,
        "diabetic": payload.diabetic,
        "high_bp": payload.highBp,
        "high_chol": payload.highChol,
        "bp_med": payload.bpMed,
        "chol_med": payload.cholMed,
        "smokes_now": payload.smokesNow,
        "creatinine": payload.creatinine,
        "triglycerides": payload.triglycerides,
        "uric_acid": payload.uricAcid,
        "glucose": payload.glucose,
        "urine_acr": payload.urineAcr,
        "general_health": payload.generalHealth,
    }


# AHA PREVENT category -> app risk level (borderline and intermediate are both "medium").
PREVENT_RISK_LEVEL = {"low": "low", "borderline": "medium", "intermediate": "medium", "high": "high"}


def _prevent_for(inputs: Dict[str, Any], sex: Optional[str]) -> Dict[str, Any]:
    """AHA PREVENT 10-year CVD risk from the assessment inputs (unavailable outside its validated use)."""

    def number(key: str) -> Optional[float]:
        value = inputs.get(key)
        return float(value) if value is not None else None

    def yes_no(key: str) -> Optional[bool]:
        text = str(inputs.get(key) or "").strip().lower()
        return True if text == "yes" else False if text == "no" else None

    age, creatinine = number("age"), number("creatinine")
    sex_text = str(sex or "").strip().lower() or None
    egfr = None
    if creatinine is not None and age is not None and sex_text in ("male", "female"):
        egfr = float(ckd_epi_2021(pd.Series([creatinine]), pd.Series([age]),
                                  pd.Series([1.0 if sex_text == "male" else 0.0])).iloc[0])
    diabetic = str(inputs.get("diabetic") or "").strip().lower()
    smoking = yes_no("smokes_now")
    if smoking is None and yes_no("smoker") is False:
        smoking = False
    bp_tx = yes_no("bp_med")
    if bp_tx is None and yes_no("high_bp") is False:
        bp_tx = False
    result = prevent.ten_year_cvd(
        age=age, sex=sex_text, total_chol=number("total_cholesterol"), hdl=number("hdl"),
        sbp=number("sbp"), diabetes={"yes": True, "no": False, "borderline": False}.get(diabetic),
        smoking=smoking, bmi=number("bmi"), egfr=egfr, bp_tx=bp_tx, statin=yes_no("chol_med"),
        hba1c=number("hba1c"), uacr=number("urine_acr"),
    )
    if result["available"]:
        result = {**result, "risk": round(result["risk"], 4), "egfr": round(egfr, 1)}
    return result


def _predict_and_store(payload: RiskAssessmentRequest, db: Any, user: Dict[str, Any]) -> Dict[str, Any]:
    require_patient_key(db)
    ensure_active_model_registry_entry(db)
    ensure_cds_rules_seeded(db)
    require_active_patient(db, payload.patientId, user)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT p.id AS patient_id, p.sex, psd.date_of_birth, psd.date_of_birth_enc
            FROM patients p
            LEFT JOIN patient_sensitive_data psd ON psd.patient_id = p.id
            WHERE p.id = %s
            LIMIT 1
            """,
            (payload.patientId,),
        )
        patient = cursor.fetchone()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        cursor.execute(
            """
            SELECT id AS model_id, name AS model_name, version AS model_version, algorithm
            FROM model_registry
            WHERE lower(status) = 'active'
            ORDER BY created_at DESC
            LIMIT 1
            """
        )
        model_info = cursor.fetchone()
        if not model_info:
            raise HTTPException(status_code=400, detail="No active model found")

    if payload.age is None:
        derived_age = calculate_age_years(psd_decrypt(patient)["date_of_birth"])
        if derived_age is None:
            raise HTTPException(
                status_code=400,
                detail="Patient date of birth is required to derive age for risk assessment",
            )
        if not 18 <= derived_age <= 120:
            raise HTTPException(
                status_code=422,
                detail="Patient age derived from date of birth must be between 18 and 120",
            )
        payload.age = float(derived_age)

    inputs = _assessment_inputs(payload)
    raw_row = inference.build_raw_row(inputs, patient.get("sex"))
    missing = inference.missing_inputs(raw_row)
    probability = inference.predict_probability(raw_row)
    explanation = {
        "missingInputs": missing,
        "modelVersion": inference.get_schema()["model_version"],
        "decisionThreshold": float(inference.get_metrics().get("decision_threshold", 0.5)),
    }
    try:
        explanation["contributions"] = explain_module.explain(raw_row)
    except Exception as exc:  # explanation is auxiliary; never block the assessment
        logging.getLogger(__name__).error("Factor explanation failed: %s", type(exc).__name__)
        explanation["contributions"] = []
        explanation["explanationError"] = True

    with db.cursor() as cursor:
        # Risk level is determined by app thresholds first to keep classification
        # consistent across environments even when CDS rule ranges drift.
        model_risk_level = fallback_risk_classification(probability)["risk_level"]
        # PREVENT (10-year CVD risk from long-term cohorts) sets the level when it applies; the
        # cross-sectional ML model is the fallback. Guideline alerts can then raise (never lower) it.
        prevent_result = _prevent_for(inputs, patient.get("sex"))
        if prevent_result["available"]:
            base_risk_level, risk_source = PREVENT_RISK_LEVEL[prevent_result["category"]], "prevent"
        else:
            base_risk_level, risk_source = model_risk_level, "model"
        guideline = clinical_alerts.evaluate(inputs)
        risk_level = clinical_alerts.apply_floor(base_risk_level, guideline["floor"])
        explanation.update(
            modelRiskLevel=model_risk_level,
            baseRiskLevel=base_risk_level,
            riskSource=risk_source,
            prevent=prevent_result,
            clinicalAlerts=guideline["alerts"],
        )
        recommendation = RECOMMENDATION_BY_LEVEL[risk_level]

        cursor.execute(
            """
            SELECT recommendation
            FROM cds_rules
            WHERE active = TRUE
              AND lower(risk_level) = %s
            ORDER BY priority DESC, created_at DESC
            LIMIT 1
            """,
            (risk_level,),
        )
        cds_rule = cursor.fetchone()
        if cds_rule and cds_rule.get("recommendation"):
            recommendation = cds_rule["recommendation"]

        cursor.execute(
            """
            INSERT INTO encounters (patient_id, notes)
            VALUES (%s, %s)
            RETURNING id AS encounter_id
            """,
            (payload.patientId, payload.notes or ""),
        )
        encounter_id = cursor.fetchone()["encounter_id"]

        cursor.execute(
            """
            INSERT INTO risk_assessments (patient_id, model_id, encounter_id, probability, risk_level, recommendation, notes, assessment_status, review_status, explanation_json, heart_rate_bpm)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id AS assessment_id, created_at
            """,
            (
                payload.patientId,
                model_info["model_id"],
                encounter_id,
                probability,
                risk_level,
                recommendation,
                payload.notes or "",
                "completed",
                "pending",
                Json(explanation),
                payload.heartRate,
            ),
        )
        assessment = cursor.fetchone()

        numeric_columns = set(RAW_NUMERIC_COLUMNS)
        for key, value in raw_row.items():
            value_type = "number" if key in numeric_columns else "string"
            readable = inference.display_value(key, value)
            stored = None if readable is None else str(readable)
            cursor.execute(
                """
                INSERT INTO assessment_feature_values (assessment_id, feature_name, feature_value, value_type)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (assessment_id, feature_name)
                DO UPDATE SET feature_value = EXCLUDED.feature_value, value_type = EXCLUDED.value_type
                """,
                (assessment["assessment_id"], key, stored, value_type),
            )

    # No commit here: the caller writes the audit row and commits once, so the
    # assessment and its audit entry are stored atomically.
    return {
        "assessmentId": assessment["assessment_id"],
        "probability": round(probability, 4),
        "riskLevel": risk_level,
        "recommendation": recommendation,
        "createdAt": to_iso(assessment["created_at"]),
        "heartRate": payload.heartRate,
        "missingInputs": missing,
        "modelVersion": explanation["modelVersion"],
        "contributions": explanation["contributions"],
        "modelRiskLevel": model_risk_level,
        "baseRiskLevel": base_risk_level,
        "riskSource": risk_source,
        "prevent": prevent_result,
        "clinicalAlerts": guideline["alerts"],
        **({"explanationError": True} if explanation.get("explanationError") else {}),
    }


@app.post("/api/risk-assessments")
def create_risk_assessment(
    payload: RiskAssessmentRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    result = _predict_and_store(payload, db, user)
    audit(
        db, request, user, action_type="create", resource_type="risk_assessment",
        resource_id=int(result["assessmentId"]), patient_id=payload.patientId,
    )
    db.commit()
    return result


@app.post("/api/predict")
def predict(
    payload: RiskAssessmentRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    result = _predict_and_store(payload, db, user)
    audit(
        db, request, user, action_type="create", resource_type="risk_assessment",
        resource_id=int(result["assessmentId"]), patient_id=payload.patientId,
    )
    db.commit()
    return result


@app.patch("/api/risk-assessments/{assessment_id}/review")
def review_assessment(
    assessment_id: int,
    payload: ReviewStatusRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    status = payload.reviewStatus.strip().lower()
    if status not in {"pending", "reviewed"}:
        raise HTTPException(status_code=400, detail="Invalid review status")

    scope_sql, scope_params = patient_scope_sql(user)
    with db.cursor() as cursor:
        cursor.execute(
            f"""
            UPDATE risk_assessments
            SET review_status = %s,
                reviewed_by = CASE WHEN %s = 'reviewed' THEN %s ELSE NULL END,
                reviewed_at = CASE WHEN %s = 'reviewed' THEN NOW() ELSE NULL END,
                review_comment = CASE WHEN %s = 'reviewed' THEN %s ELSE NULL END
            WHERE id = %s AND deleted_at IS NULL
              AND patient_id IN (SELECT p.id FROM patients p WHERE {scope_sql})
            RETURNING id AS assessment_id, patient_id, review_status, assessment_status
            """,
            (status, status, user["id"], status, status, payload.reviewComment, assessment_id, *scope_params),
        )
        updated = cursor.fetchone()
        if not updated:
            raise HTTPException(status_code=404, detail="Assessment not found")

    audit(
        db, request, user, action_type="update", resource_type="risk_assessment",
        resource_id=assessment_id, patient_id=updated["patient_id"],
    )
    db.commit()
    return {
        "assessment_id": updated["assessment_id"],
        "review_status": updated["review_status"],
        "assessment_status": updated["assessment_status"],
    }


@app.patch("/api/risk-assessments/{assessment_id}/override")
def override_assessment(
    assessment_id: int,
    payload: clinical.OverrideRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Merge a clinician override into the assessment (omitted field kept, explicit null clears it).

    Each request also appends a row to risk_assessment_overrides. Changing content after sign-off
    sends a reviewed assessment back to pending.
    """
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    scope_sql, scope_params = patient_scope_sql(user)
    sent = payload.model_fields_set
    with db.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT id, override_risk_level, override_recommendation
            FROM risk_assessments
            WHERE id = %s AND deleted_at IS NULL
              AND patient_id IN (SELECT p.id FROM patients p WHERE {scope_sql})
            FOR UPDATE
            """,
            (assessment_id, *scope_params),
        )
        current = cursor.fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Assessment not found")
        level = payload.riskLevel if "riskLevel" in sent else current["override_risk_level"]
        recommendation = payload.recommendation if "recommendation" in sent else current["override_recommendation"]
        if level is None and recommendation is None and not {"riskLevel", "recommendation"} <= sent:
            raise HTTPException(
                status_code=422,
                detail="Override would be empty; send both riskLevel and recommendation as null to remove it",
            )
        cursor.execute(
            """
            UPDATE risk_assessments
            SET override_risk_level = %s, override_recommendation = %s, override_reason = %s,
                overridden_by = %s, overridden_at = NOW(),
                review_status = 'pending', reviewed_by = NULL, reviewed_at = NULL, review_comment = NULL
            WHERE id = %s
            RETURNING id AS assessment_id, patient_id, review_status, risk_level,
                      recommendation AS recommendation_text, heart_rate_bpm,
                      override_risk_level, override_recommendation, override_reason, overridden_at
            """,
            (level, recommendation, payload.reason, user["id"], assessment_id),
        )
        updated = cursor.fetchone()
        cursor.execute(
            """
            INSERT INTO risk_assessment_overrides (assessment_id, risk_level, recommendation, reason, overridden_by)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (assessment_id, level, recommendation, payload.reason, user["id"]),
        )

    audit(
        db, request, user, action_type="update", resource_type="risk_assessment_override",
        resource_id=assessment_id, patient_id=updated["patient_id"],
    )
    db.commit()
    return {
        "assessment_id": updated["assessment_id"],
        "review_status": updated["review_status"],
        **clinical.serialize_override({**updated, "overridden_by_username": user["username"]}, to_iso),
    }


@app.delete("/api/risk-assessments/{assessment_id}")
def delete_risk_assessment(
    assessment_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, bool]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor"}, request=request)
    scope_sql, scope_params = patient_scope_sql(user)
    with db.cursor() as cursor:
        cursor.execute(
            f"""
            UPDATE risk_assessments
            SET deleted_at = NOW(), deleted_by = %s
            WHERE id = %s AND deleted_at IS NULL
              AND patient_id IN (SELECT p.id FROM patients p WHERE {scope_sql})
            RETURNING id, patient_id
            """,
            (user["id"], assessment_id, *scope_params),
        )
        removed = cursor.fetchone()
        if not removed:
            raise HTTPException(status_code=404, detail="Assessment not found")

    audit(
        db, request, user, action_type="delete", resource_type="risk_assessment",
        resource_id=assessment_id, patient_id=removed["patient_id"],
    )
    db.commit()
    return {"success": True}


@app.get("/api/audit-log")
def get_audit_log(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    outcome: Optional[str] = Query(default=None, pattern="^(success|failure|denied)$"),
    db: Any = Depends(get_db),
) -> List[Dict[str, Any]]:
    authorize_user(db, authorization, allowed_roles={"admin", "auditor"}, request=request)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT al.id AS audit_log_id, al.user_id, al.action_type, al.resource_type, al.resource_id,
                   al.patient_id, al.outcome, al.endpoint, al.ip_address, al.created_at, u.username
            FROM audit_log al
            LEFT JOIN users u ON u.id = al.user_id
            {outcome_filter}
            ORDER BY al.created_at DESC, al.id DESC
            LIMIT %s OFFSET %s
            """.format(outcome_filter="WHERE al.outcome = %s" if outcome else ""),
            (*((outcome,) if outcome else ()), limit, offset),
        )
        rows = cursor.fetchall()
    return [
        {
            "audit_log_id": row["audit_log_id"],
            "actor_username": row["username"] or "system",
            "action_type": row["action_type"],
            "resource_type": row["resource_type"],
            "resource_id": row["resource_id"],
            "patient_id": row["patient_id"],
            "outcome": row["outcome"],
            "endpoint": row["endpoint"] or "",
            "ip_address": str(row["ip_address"]) if row["ip_address"] else "",
            "created_at": to_iso(row["created_at"]),
        }
        for row in rows
    ]


@app.get("/api/users")
def get_users(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> List[Dict[str, Any]]:
    authorize_user(db, authorization, allowed_roles={"admin"}, request=request)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT id AS user_id, username, email, role, is_active, last_login, created_at, is_demo, demo_expires_at
            FROM users
            WHERE role = ANY(%s)
            ORDER BY created_at DESC
            """,
            (list(VALID_USER_ROLES),),
        )
        users = cursor.fetchall()
    return [serialize_user(user) for user in users]


@app.post("/api/users", status_code=201)
def create_user(
    payload: CreateUserRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    actor = authorize_user(db, authorization, allowed_roles={"admin"}, request=request)
    role = payload.role.strip().lower()
    if role not in VALID_USER_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if not payload.username.strip():
        raise HTTPException(status_code=400, detail="Username is required")
    if not payload.email.strip():
        raise HTTPException(status_code=400, detail="Email is required")
    if len(payload.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )

    with db.cursor() as cursor:
        cursor.execute(
            "SELECT 1 FROM users WHERE username = %s LIMIT 1",
            (payload.username.strip(),),
        )
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Username already exists")

        cursor.execute(
            "SELECT 1 FROM users WHERE email = %s LIMIT 1",
            (payload.email.strip(),),
        )
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Email already exists")

        cursor.execute(
            """
            INSERT INTO users (username, email, role, password_hash, is_active)
            VALUES (%s, %s, %s, %s, TRUE)
            RETURNING id AS user_id, username, email, role, is_active, last_login, created_at, is_demo, demo_expires_at
            """,
            (
                payload.username.strip(),
                payload.email.strip(),
                role,
                hash_password(payload.password),
            ),
        )
        user = cursor.fetchone()

    log_audit_event(
        db,
        action_type="create",
        resource_type="user",
        resource_id=user["user_id"],
        endpoint=str(request.url.path),
        method=request.method,
        ip_address=client_ip(request),
        user_id=actor["id"],
    )
    db.commit()
    return serialize_user(user)


@app.get("/api/users/{user_id}")
def get_user(
    user_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    authorize_user(db, authorization, allowed_roles={"admin"}, request=request)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT id AS user_id, username, email, role, is_active, last_login, created_at, is_demo, demo_expires_at
            FROM users
            WHERE id = %s
            """,
            (user_id,),
        )
        user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return serialize_user(user)


@app.patch("/api/users/{user_id}")
def update_user(
    user_id: int,
    payload: UpdateUserRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    actor = authorize_user(db, authorization, allowed_roles={"admin"}, request=request)
    username = payload.username.strip() if payload.username is not None else None
    email = payload.email.strip() if payload.email is not None else None
    role = payload.role.strip().lower() if payload.role is not None else None
    password = payload.password

    if payload.username is not None and not username:
        raise HTTPException(status_code=400, detail="Username is required")
    if payload.email is not None and not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if role is not None and role not in VALID_USER_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if password is not None and len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )

    actor_user_id = actor["id"]
    if actor_user_id == user_id and payload.isActive is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")

    with db.cursor() as cursor:
        cursor.execute("SELECT id, role, is_demo FROM users WHERE id = %s", (user_id,))
        existing_user = cursor.fetchone()
        if not existing_user:
            raise HTTPException(status_code=404, detail="User not found")
        role_changed = role is not None and role != existing_user["role"]
        if role_changed and existing_user["is_demo"]:
            raise HTTPException(status_code=400, detail="Demo accounts cannot change role")

        if username is not None:
            cursor.execute(
                "SELECT 1 FROM users WHERE username = %s AND id <> %s LIMIT 1",
                (username, user_id),
            )
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail="Username already exists")
        if email is not None:
            cursor.execute(
                "SELECT 1 FROM users WHERE email = %s AND id <> %s LIMIT 1",
                (email, user_id),
            )
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail="Email already exists")

        assignments: List[str] = []
        values: List[Any] = []

        if username is not None:
            assignments.append("username = %s")
            values.append(username)
        if email is not None:
            assignments.append("email = %s")
            values.append(email)
        if role is not None:
            assignments.append("role = %s")
            values.append(role)
        if payload.isActive is not None:
            assignments.append("is_active = %s")
            values.append(payload.isActive)
        if password is not None:
            assignments.append("password_hash = %s")
            values.append(hash_password(password))

        if not assignments:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        values.append(user_id)
        cursor.execute(
            f"""
            UPDATE users
            SET {", ".join(assignments)}
            WHERE id = %s
            RETURNING id AS user_id, username, email, role, is_active, last_login, created_at, is_demo, demo_expires_at
            """,
            tuple(values),
        )
        updated_user = cursor.fetchone()

        if password is not None or role_changed:
            # Credentials/privileges changed: end existing sessions and clear any lockout.
            cursor.execute("DELETE FROM sessions WHERE user_id = %s", (user_id,))
            cursor.execute(
                "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = %s",
                (user_id,),
            )

    log_audit_event(
        db,
        action_type="update",
        resource_type="user",
        resource_id=user_id,
        endpoint=str(request.url.path),
        method=request.method,
        ip_address=client_ip(request),
        user_id=actor_user_id,
    )
    db.commit()
    return serialize_user(updated_user)


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> None:
    actor = authorize_user(db, authorization, allowed_roles={"admin"}, request=request)
    actor_user_id = actor["id"]
    if actor_user_id == user_id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")

    with db.cursor() as cursor:
        cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        cursor.execute(
            """
            UPDATE users
            SET is_active = FALSE
            WHERE id = %s AND is_active = TRUE
            """,
            (user_id,),
        )

    log_audit_event(
        db,
        action_type="delete",
        resource_type="user",
        resource_id=user_id,
        endpoint=str(request.url.path),
        method=request.method,
        ip_address=client_ip(request),
        user_id=actor_user_id,
    )
    db.commit()
    return None


@app.get("/api/dashboard/stats")
def dashboard_stats(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    user = authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician", "auditor"}, request=request)
    ensure_active_model_registry_entry(db)
    scope_sql, scope_params = patient_scope_sql(user)
    with db.cursor() as cursor:
        cursor.execute(
            f"SELECT COUNT(*) AS count FROM patients p WHERE p.is_active = TRUE AND {scope_sql}",
            scope_params,
        )
        total_patients = int(cursor.fetchone()["count"])

        cursor.execute(
            f"""
            SELECT COUNT(*) AS count
            FROM risk_assessments ra JOIN patients p ON p.id = ra.patient_id
            WHERE ra.deleted_at IS NULL AND {scope_sql}
            """,
            scope_params,
        )
        total_assessments = int(cursor.fetchone()["count"])

        cursor.execute(
            f"""
            SELECT {clinical.EFFECTIVE_RISK_SQL} AS risk_level, COUNT(*) AS count
            FROM risk_assessments ra JOIN patients p ON p.id = ra.patient_id
            WHERE ra.deleted_at IS NULL AND {scope_sql}
            GROUP BY {clinical.EFFECTIVE_RISK_SQL}
            """,
            scope_params,
        )
        distribution = {row["risk_level"]: int(row["count"]) for row in cursor.fetchall()}

        cursor.execute(
            f"""
            SELECT COUNT(*) FILTER (WHERE ra.review_status = 'pending') AS pending_review,
                   COUNT(*) FILTER (WHERE {clinical.EFFECTIVE_RISK_SQL} = 'high') AS high_risk
            FROM risk_assessments ra JOIN patients p ON p.id = ra.patient_id
            WHERE ra.deleted_at IS NULL AND {scope_sql}
            """,
            scope_params,
        )
        review_counts = cursor.fetchone()

        cursor.execute(
            """
            SELECT accuracy
            FROM model_registry
            WHERE lower(status) = 'active'
            ORDER BY created_at DESC
            LIMIT 1
            """
        )
        active_model_row = cursor.fetchone()

        cursor.execute(
            f"""
            SELECT ra.id AS assessment_id, ra.patient_id, ra.probability AS probability_cvd,
                   ra.risk_level, {clinical.EFFECTIVE_RISK_SQL} AS effective_risk_level,
                   ra.created_at, p.external_patient_code
            FROM risk_assessments ra
            JOIN patients p ON p.id = ra.patient_id
            WHERE ra.deleted_at IS NULL AND {scope_sql}
            ORDER BY ra.created_at DESC
            LIMIT 10
            """,
            scope_params,
        )
        recent_rows = cursor.fetchall()

    audit(db, request, user, action_type="read", resource_type="dashboard")
    db.commit()

    recent = [
        {
            "id": row["assessment_id"],
            "patient_id": row["patient_id"],
            "probability_cvd": float(row["probability_cvd"] or 0),
            "risk_level": row["risk_level"],
            "effective_risk_level": row["effective_risk_level"],
            "created_at": to_iso(row["created_at"]),
            "external_patient_code": row["external_patient_code"] or "",
        }
        for row in recent_rows
    ]

    return {
        "totalPatients": total_patients,
        "totalAssessments": total_assessments,
        "riskDistribution": distribution,
        "pendingReview": int(review_counts["pending_review"]),
        "highRisk": int(review_counts["high_risk"]),
        "activeModelAccuracy": float((active_model_row or {}).get("accuracy") or 0),
        "recentAssessments": recent,
    }


@app.get("/api/live")
def live() -> Dict[str, str]:
    """Liveness probe: never touches the database (does not wake Neon compute)."""
    return {"status": "alive"}


@app.get("/api/health")
def health(db: Any = Depends(get_db)) -> Dict[str, str]:
    with db.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    return {"status": "healthy", "database": "connected"}


if __name__ == "__main__":
    try:
        import uvicorn
    except ImportError as error:
        raise RuntimeError(
            "Missing runtime dependency 'uvicorn'. Run with the project virtualenv interpreter or install requirements for this interpreter."
        ) from error

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload_enabled = os.getenv("UVICORN_RELOAD", "false").lower() == "true"

    uvicorn.run("app:app", host=host, port=port, reload=reload_enabled)

