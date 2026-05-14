import hashlib
import hmac
import json
import math
import os
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

import psycopg2
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from psycopg2.extras import Json, RealDictCursor

try:
    import joblib
except ImportError:  # pragma: no cover - runtime fallback for env incompatibilities
    joblib = None

try:
    import numpy as np
except ImportError:  # pragma: no cover - runtime fallback for env incompatibilities
    np = None

try:
    import pandas as pd
except ImportError:  # pragma: no cover - runtime fallback for env incompatibilities
    pd = None

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv()


def resolve_database_url() -> Optional[str]:
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url

    pg_host = os.getenv("PGHOST")
    pg_port = os.getenv("PGPORT")
    pg_db = os.getenv("PGDATABASE")
    pg_user = os.getenv("PGUSER")
    pg_password = os.getenv("PGPASSWORD")

    if all([pg_host, pg_port, pg_db, pg_user, pg_password]):
        return f"postgresql://{pg_user}:{pg_password}@{pg_host}:{pg_port}/{pg_db}"

    return None


DATABASE_URL = resolve_database_url()

MODEL_PATH = os.getenv("MODEL_PATH") or str(BASE_DIR / "model" / "meta_learner.joblib")
MODEL_DIR = Path(os.getenv("MODEL_DIR") or (BASE_DIR / "model"))
PREPROCESSOR_PATH = MODEL_DIR / "preprocessor_ml.joblib"
BASE_MODEL_PATHS = {
    "xgb": MODEL_DIR / "model_xgb.joblib",
    "lgbm": MODEL_DIR / "model_lgbm.joblib",
    "rf": MODEL_DIR / "model_rf.joblib",
    "lr": MODEL_DIR / "model_lr.joblib",
}
META_MODEL_PATH = MODEL_DIR / "meta_learner.joblib"
METRICS_PATH = MODEL_DIR / "metrics_ml.json"
SESSION_TTL_MINUTES = int(os.getenv("SESSION_TTL_MINUTES", "480"))
PBKDF2_ITERATIONS = int(os.getenv("PASSWORD_HASH_ITERATIONS", "600000"))


raw_origins = os.getenv("CORS_ORIGINS", "https://cvd-pi.vercel.app")
cors_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

app = FastAPI(title="Cardiology Screening API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


class RiskAssessmentRequest(BaseModel):
    patientId: int
    notes: Optional[str] = ""
    age: Optional[float] = None
    bmi: Optional[float] = None
    sbp: Optional[float] = None
    dbp: Optional[float] = None
    hdl: Optional[float] = None
    ldl: Optional[float] = None
    total_cholesterol: Optional[float] = None
    triglycerides: Optional[float] = None
    fasting_glucose: Optional[float] = None
    hba1c: Optional[float] = None
    smoker: Optional[str] = None
    drink_count: Optional[float] = None
    physically_active: Optional[str] = None
    sleep_hours: Optional[float] = None
    waist: Optional[float] = None
    crp: Optional[float] = None
    systolicBp: Optional[float] = None
    diastolicBp: Optional[float] = None
    totalCholesterol: Optional[float] = None
    diabetic: Optional[str] = None
    race: Optional[float] = None
    education: Optional[float] = None
    incomeRatio: Optional[float] = None
    waistCm: Optional[float] = None
    hba1cPercent: Optional[float] = None
    hsCrp: Optional[float] = None
    sodium: Optional[float] = None
    wbc: Optional[float] = None
    hemoglobin: Optional[float] = None
    platelets: Optional[float] = None
    rdw: Optional[float] = None
    vigorousActivityMinutes: Optional[float] = None
    moderateActivityMinutes: Optional[float] = None
    moderateActivityUnit: Optional[float] = None
    sedentaryMinutes: Optional[float] = None
    sedentaryMinutesAlt: Optional[float] = None
    sleepHoursWeekday: Optional[float] = None
    sleepHoursWeekend: Optional[float] = None
    highBp: Optional[str] = None
    highChol: Optional[str] = None
    bpMed: Optional[str] = None
    cholMed: Optional[str] = None


class ReviewStatusRequest(BaseModel):
    reviewStatus: str


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
            detail=(
                "Database connection failed. Set DATABASE_URL in Back-End/.env or export DATABASE_URL, "
                "or configure PGHOST, PGPORT, PGDATABASE, PGUSER, and PGPASSWORD."
            ),
        ) from error
    try:
        yield conn
    finally:
        conn.close()


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
        today = datetime.utcnow().date()
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


def optional_session_user_id(db: Any, authorization: Optional[str]) -> Optional[int]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "", 1).strip()
    if not token:
        return None
    token_hash = hash_session_token(token)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT user_id
            FROM sessions
            WHERE (token = %s OR token = %s) AND expires_at > NOW()
            LIMIT 1
            """,
            (token_hash, token),
        )
        row = cursor.fetchone()
    return int(row["user_id"]) if row else None


def get_authenticated_user(db: Any, authorization: Optional[str]) -> Dict[str, Any]:
    token = bearer_token(authorization)
    token_hash = hash_session_token(token)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT u.id, u.username, u.email, u.role
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE (s.token = %s OR s.token = %s)
              AND s.expires_at > NOW()
              AND u.is_active = TRUE
            LIMIT 1
            """,
            (token_hash, token),
        )
        user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return {
        "id": int(user["id"]),
        "username": user["username"],
        "email": user["email"],
        "role": user["role"],
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
            ip_address=request.client.host if request.client else None,
            user_id=user["id"],
        )
        db.commit()

    raise HTTPException(status_code=403, detail="Insufficient permissions")


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
    }


def read_default_model_metrics() -> Dict[str, float]:
    if METRICS_PATH.exists():
        with METRICS_PATH.open("r", encoding="utf-8") as metrics_file:
            metrics = json.load(metrics_file)
        return {
            "accuracy": float(metrics.get("accuracy") or 0),
            "auc": float(metrics.get("auc") or 0),
            "precision_score": float(metrics.get("precision") or 0),
            "recall_score": float(metrics.get("recall") or 0),
            "f1_score": float(metrics.get("f1") or 0),
        }
    return {
        "accuracy": 0.0,
        "auc": 0.0,
        "precision_score": 0.0,
        "recall_score": 0.0,
        "f1_score": 0.0,
    }


def ensure_active_model_registry_entry(db: Any) -> None:
    with db.cursor() as cursor:
        cursor.execute(
            "SELECT id FROM model_registry WHERE lower(status) = 'active' ORDER BY created_at DESC LIMIT 1"
        )
        if cursor.fetchone():
            return

        cursor.execute("SELECT id FROM model_registry ORDER BY created_at DESC LIMIT 1")
        latest_model = cursor.fetchone()
        if latest_model:
            cursor.execute("UPDATE model_registry SET status = 'active' WHERE id = %s", (latest_model["id"],))
            db.commit()
            return

        metrics = read_default_model_metrics()
        validation_metrics = {
            "source": "bootstrap_metrics_ml",
            "accuracy": metrics["accuracy"],
            "auc": metrics["auc"],
            "precision": metrics["precision_score"],
            "recall": metrics["recall_score"],
            "f1": metrics["f1_score"],
        }
        cursor.execute(
            """
            INSERT INTO model_registry (
                name, version, status, algorithm, use_case,
                accuracy, auc, precision_score, recall_score, f1_score, validation_metrics
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (name, version)
            DO UPDATE SET
                status = EXCLUDED.status,
                algorithm = EXCLUDED.algorithm,
                use_case = EXCLUDED.use_case,
                accuracy = EXCLUDED.accuracy,
                auc = EXCLUDED.auc,
                precision_score = EXCLUDED.precision_score,
                recall_score = EXCLUDED.recall_score,
                f1_score = EXCLUDED.f1_score,
                validation_metrics = EXCLUDED.validation_metrics
            """,
            (
                "CVD Meta Learner",
                "1.0.0",
                "active",
                "meta_learner",
                "cardiovascular_disease_risk",
                metrics["accuracy"],
                metrics["auc"],
                metrics["precision_score"],
                metrics["recall_score"],
                metrics["f1_score"],
                Json(validation_metrics),
            ),
        )
    db.commit()


def load_ml_model() -> Optional[Any]:
    if joblib is None:
        return None
    if Path(MODEL_PATH).exists():
        return joblib.load(MODEL_PATH)
    return None


def patch_sklearn_pickle_compat() -> None:
    # Compatibility shim for models serialized with sklearn 1.6.x and loaded on newer versions.
    try:
        from sklearn.compose import _column_transformer as ct  # type: ignore
    except Exception:
        return
    if not hasattr(ct, "_RemainderColsList"):
        class _RemainderColsList(list):
            pass
        ct._RemainderColsList = _RemainderColsList  # type: ignore[attr-defined]


def load_meta_bundle() -> Dict[str, Any]:
    if joblib is None:
        raise RuntimeError("joblib is required to load ML models")
    if pd is None or np is None:
        raise RuntimeError("pandas and numpy are required to run ML models")

    if not PREPROCESSOR_PATH.exists():
        raise RuntimeError(f"Missing preprocessor: {PREPROCESSOR_PATH}")
    if not META_MODEL_PATH.exists():
        raise RuntimeError(f"Missing meta model: {META_MODEL_PATH}")

    patch_sklearn_pickle_compat()
    try:
        preprocessor = joblib.load(PREPROCESSOR_PATH)
    except Exception as error:
        raise RuntimeError(
            "Failed to load model preprocessor. Install Back-End requirements in the same Python "
            "interpreter used to run app.py (scikit-learn==1.6.1), or run with the project virtualenv."
        ) from error
    try:
        meta_model = joblib.load(META_MODEL_PATH)
    except Exception as error:
        raise RuntimeError(
            "Failed to load meta model artifact. Ensure all Back-End requirements are installed in "
            "the Python interpreter running app.py."
        ) from error
    base_models: Dict[str, Any] = {}
    for key, path in BASE_MODEL_PATHS.items():
        if not path.exists():
            raise RuntimeError(f"Missing base model: {path}")
        try:
            base_models[key] = joblib.load(path)
        except Exception as error:
            raise RuntimeError(
                f"Failed to load base model '{key}'. Install Back-End requirements in the current "
                "interpreter (notably xgboost/lightgbm/scikit-learn pinned versions)."
            ) from error

    return {
        "preprocessor": preprocessor,
        "meta": meta_model,
        "base_models": base_models,
    }


def create_cvd_features(df: Any) -> Any:
    if pd is None or np is None:
        return df
    df = df.copy()
    numeric_cols = [
        "age",
        "bmi",
        "sbp",
        "dbp",
        "total_cholesterol",
        "hdl",
        "ldl",
        "triglycerides",
        "fasting_glucose",
        "hba1c",
        "crp",
        "waist",
        "sleep_hours",
        "drink_count",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    if "sbp" in df.columns and "dbp" in df.columns:
        df["pulse_pressure"] = df["sbp"] - df["dbp"]
    if "total_cholesterol" in df.columns and "hdl" in df.columns:
        df["tc_hdl_ratio"] = df["total_cholesterol"] / (df["hdl"] + 0.01)
    if "bmi" in df.columns and "age" in df.columns:
        df["bmi_age"] = (df["bmi"] * df["age"]) / 100
    if "waist" in df.columns and "bmi" in df.columns:
        df["waist_bmi"] = df["waist"] / (df["bmi"] + 0.01)
    if "sleep_hours" in df.columns:
        df["sleep_diff"] = abs(df["sleep_hours"] - 7)
    if "crp" in df.columns:
        df["log_crp"] = np.log1p(df["crp"].fillna(0))
    if "hba1c" in df.columns and "age" in df.columns:
        df["hba1c_age"] = (df["hba1c"] * df["age"]) / 100
    if "sbp" in df.columns and "age" in df.columns:
        df["sbp_age"] = df["sbp"] / (df["age"] + 0.01)
    for col in ["triglycerides", "fasting_glucose", "crp"]:
        if col in df.columns:
            df[f"log_{col}"] = np.log1p(df[col].fillna(0))
    return df


def preprocess_for_model(df: Any, feature_cols: List[str]) -> Any:
    normalized = df.copy()
    for col in feature_cols:
        if col in normalized.columns:
            median_val = normalized[col].median()
            is_nan = False
            if median_val is None:
                is_nan = True
            elif np is not None:
                try:
                    is_nan = bool(np.isnan(median_val))
                except TypeError:
                    is_nan = False
            else:
                try:
                    is_nan = math.isnan(float(median_val))
                except (TypeError, ValueError):
                    is_nan = False

            fallback = 0 if is_nan else median_val
            normalized[col] = normalized[col].fillna(fallback)
        else:
            normalized[col] = 0
    return normalized


def latest_feature_map(db: Any, patient_id: int) -> Dict[str, Any]:
    feature_map: Dict[str, Any] = {}
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT ef.feature_name, ef.feature_value
            FROM encounter_features ef
            JOIN encounters e ON e.id = ef.encounter_id
            WHERE e.patient_id = %s
            ORDER BY e.encounter_date DESC, ef.created_at DESC
            """,
            (patient_id,),
        )
        rows = cursor.fetchall()
    for row in rows:
        name = row.get("feature_name")
        if name and name not in feature_map:
            feature_map[name] = row.get("feature_value")
    return feature_map


def as_float(value: Any, default: float) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def yes_no_flag(value: Any, yes_value: int = 1, no_value: int = 2) -> int:
    return yes_value if str(value or "").strip().lower() in {"yes", "1", "true"} else no_value


def diabetic_feature_value(value: Any) -> float:
    text = str(value or "").strip().lower()
    if text in {"yes", "1", "true"}:
        return 1.0
    if text in {"borderline", "3"}:
        return 0.5
    return 0.0


def diabetic_nhanes_code(value: Any) -> int:
    text = str(value or "").strip().lower()
    if text in {"yes", "1", "true"}:
        return 1
    if text in {"borderline", "3", "0.5"}:
        return 3
    return 2


def build_nhanes_row(input_features: Dict[str, Any]) -> Dict[str, Any]:
    sex_code = 1 if input_features.get("sex") == 1 else 2
    return {
        "RIDAGEYR": as_float(input_features.get("age"), 50),
        "RIAGENDR": sex_code,
        "RIDRETH3": as_float(input_features.get("race"), 3),
        "INDFMPIR": as_float(input_features.get("income_ratio"), 1.0),
        "DMDEDUC2": as_float(input_features.get("education"), 3),
        "BMXBMI": as_float(input_features.get("bmi"), 25),
        "BMXWAIST": as_float(input_features.get("waist"), 90),
        "BPXOSY1": as_float(input_features.get("sbp"), 120),
        "BPXODI1": as_float(input_features.get("dbp"), 80),
        "LBXTC": as_float(input_features.get("total_cholesterol"), 200),
        "LBDHDD": as_float(input_features.get("hdl"), 50),
        "LBXGH": as_float(input_features.get("hba1c"), 5.5),
        "LBXHSCRP": as_float(input_features.get("crp"), 1.0),
        "LBXSNASI": as_float(input_features.get("sodium"), 0),
        "LBXWBCSI": as_float(input_features.get("wbc"), 0),
        "LBXHGB": as_float(input_features.get("hgb"), 0),
        "LBXPLTSI": as_float(input_features.get("platelets"), 0),
        "LBXRDW": as_float(input_features.get("rdw"), 0),
        "PAD810Q": as_float(input_features.get("vigorous_activity"), 0),
        "PAD790Q": as_float(input_features.get("moderate_activity"), 0),
        "PAD790U": as_float(input_features.get("moderate_activity_units"), 1),
        "PAD800": as_float(input_features.get("sedentary_minutes"), 0),
        "PAD680": as_float(input_features.get("sedentary_minutes_alt"), 0),
        "SLD012": as_float(input_features.get("sleep_hours"), 7),
        "SLD013": as_float(input_features.get("sleep_hours_weekend"), as_float(input_features.get("sleep_hours"), 7)),
        "DIQ010": diabetic_nhanes_code(input_features.get("diabetic")),
        "BPQ020": yes_no_flag(input_features.get("high_bp")),
        "BPQ080": yes_no_flag(input_features.get("high_chol")),
        "BPQ101D": yes_no_flag(input_features.get("bp_med")),
        "RXQ033": yes_no_flag(input_features.get("chol_med")),
        "SMQ020": yes_no_flag(input_features.get("smoker")),
    }


def create_nhanes_features(df: Any) -> Any:
    if pd is None or np is None:
        return df
    df = df.copy()

    def _num(column: str) -> Any:
        return pd.to_numeric(df[column], errors="coerce") if column in df.columns else None

    sbp = _num("BPXOSY1")
    dbp = _num("BPXODI1")
    bmi = _num("BMXBMI")
    age = _num("RIDAGEYR")
    waist = _num("BMXWAIST")
    tc = _num("LBXTC")
    hdl = _num("LBDHDD")
    hba1c = _num("LBXGH")
    crp = _num("LBXHSCRP")
    sleep_wd = _num("SLD012")
    sleep_we = _num("SLD013")

    if sbp is not None and dbp is not None:
        df["pulse_pressure"] = sbp - dbp
    if tc is not None and hdl is not None:
        hdl_nonzero = hdl.replace(0, np.nan)
        df["tc_hdl_ratio"] = tc / hdl_nonzero
    if bmi is not None and age is not None:
        df["bmi_age"] = (bmi * age) / 100
    if waist is not None and bmi is not None:
        bmi_nonzero = bmi.replace(0, np.nan)
        df["waist_bmi"] = waist / bmi_nonzero
    if sleep_wd is not None and sleep_we is not None:
        df["sleep_diff"] = (sleep_wd - sleep_we).abs()
    if hba1c is not None and age is not None:
        df["hba1c_age"] = (hba1c * age) / 100
    if sbp is not None and age is not None:
        df["sbp_age"] = (sbp * age) / 1000
    if crp is not None:
        df["log_crp"] = np.log1p(crp.clip(lower=0))

    return df


def build_features(payload: RiskAssessmentRequest, feature_defaults: Dict[str, Any], patient_sex: Optional[str]) -> Dict[str, Any]:
    sbp_input = payload.sbp if payload.sbp is not None else payload.systolicBp
    dbp_input = payload.dbp if payload.dbp is not None else payload.diastolicBp
    chol_input = payload.total_cholesterol if payload.total_cholesterol is not None else payload.totalCholesterol
    waist_input = payload.waist if payload.waist is not None else payload.waistCm
    hba1c_input = payload.hba1c if payload.hba1c is not None else payload.hba1cPercent
    crp_input = payload.crp if payload.crp is not None else payload.hsCrp
    sleep_weekday_input = payload.sleep_hours if payload.sleep_hours is not None else payload.sleepHoursWeekday

    def first_default(*keys: str) -> Any:
        for key in keys:
            value = feature_defaults.get(key)
            if value not in (None, ""):
                return value
        return None

    return {
        "age": as_float(payload.age, as_float(first_default("age", "RIDAGEYR"), 50)),
        "sex": 1 if str(patient_sex or "").lower() == "male" else 0,
        "race": as_float(payload.race, as_float(first_default("race", "RIDRETH3"), 3)),
        "education": as_float(payload.education, as_float(first_default("education", "DMDEDUC2"), 3)),
        "income_ratio": as_float(payload.incomeRatio, as_float(first_default("income_ratio", "incomeRatio", "INDFMPIR"), 1.0)),
        "bmi": as_float(payload.bmi, as_float(first_default("bmi", "BMXBMI"), 25)),
        "sbp": as_float(sbp_input, as_float(first_default("sbp", "systolicBp", "BPXOSY1"), 120)),
        "dbp": as_float(dbp_input, as_float(first_default("dbp", "diastolicBp", "BPXODI1"), 80)),
        "total_cholesterol": as_float(chol_input, as_float(first_default("total_cholesterol", "totalCholesterol", "LBXTC"), 200)),
        "hdl": as_float(payload.hdl, as_float(first_default("hdl", "LBDHDD"), 50)),
        "ldl": as_float(payload.ldl, as_float(first_default("ldl"), 100)),
        "triglycerides": as_float(payload.triglycerides, as_float(first_default("triglycerides"), 150)),
        "fasting_glucose": as_float(payload.fasting_glucose, as_float(first_default("fasting_glucose"), 100)),
        "hba1c": as_float(hba1c_input, as_float(first_default("hba1c", "hba1cPercent", "LBXGH"), 5.5)),
        "smoker": 1 if str(payload.smoker or first_default("smoker", "SMQ020") or "no").lower() == "yes" else 0,
        "diabetic": diabetic_feature_value(payload.diabetic or first_default("diabetic", "DIQ010")),
        "high_bp": 1 if str(payload.highBp or first_default("high_bp", "highBp", "BPQ020") or "no").lower() == "yes" else 0,
        "high_chol": 1 if str(payload.highChol or first_default("high_chol", "highChol", "BPQ080") or "no").lower() == "yes" else 0,
        "bp_med": 1 if str(payload.bpMed or first_default("bp_med", "bpMed", "BPQ101D") or "no").lower() == "yes" else 0,
        "chol_med": 1 if str(payload.cholMed or first_default("chol_med", "cholMed", "RXQ033") or "no").lower() == "yes" else 0,
        "drink_count": as_float(payload.drink_count, as_float(first_default("drink_count"), 0)),
        "physically_active": 1 if str(payload.physically_active or first_default("physically_active") or "yes").lower() == "yes" else 0,
        "sleep_hours": as_float(sleep_weekday_input, as_float(first_default("sleep_hours", "sleepHoursWeekday", "SLD012"), 7)),
        "sleep_hours_weekend": as_float(payload.sleepHoursWeekend, as_float(first_default("sleep_hours_weekend", "sleepHoursWeekend", "SLD013"), 7)),
        "waist": as_float(waist_input, as_float(first_default("waist", "waistCm", "BMXWAIST"), 90)),
        "crp": as_float(crp_input, as_float(first_default("crp", "hsCrp", "LBXHSCRP"), 1)),
        "sodium": as_float(payload.sodium, as_float(first_default("sodium", "LBXSNASI"), 0)),
        "wbc": as_float(payload.wbc, as_float(first_default("wbc", "LBXWBCSI"), 0)),
        "hgb": as_float(payload.hemoglobin, as_float(first_default("hemoglobin", "hgb", "LBXHGB"), 0)),
        "platelets": as_float(payload.platelets, as_float(first_default("platelets", "LBXPLTSI"), 0)),
        "rdw": as_float(payload.rdw, as_float(first_default("rdw", "LBXRDW"), 0)),
        "vigorous_activity": as_float(payload.vigorousActivityMinutes, as_float(first_default("vigorous_activity", "vigorousActivityMinutes", "PAD810Q"), 0)),
        "moderate_activity": as_float(payload.moderateActivityMinutes, as_float(first_default("moderate_activity", "moderateActivityMinutes", "PAD790Q"), 0)),
        "moderate_activity_units": as_float(payload.moderateActivityUnit, as_float(first_default("moderate_activity_units", "moderateActivityUnit", "PAD790U"), 1)),
        "sedentary_minutes": as_float(payload.sedentaryMinutes, as_float(first_default("sedentary_minutes", "sedentaryMinutes", "PAD800"), 0)),
        "sedentary_minutes_alt": as_float(payload.sedentaryMinutesAlt, as_float(first_default("sedentary_minutes_alt", "sedentaryMinutesAlt", "PAD680"), 0)),
    }


@app.post("/api/auth/login")
def login(payload: LoginRequest, request: Request, db: Any = Depends(get_db)) -> Dict[str, Any]:
    with db.cursor() as cursor:
        cursor.execute(
            "SELECT id, username, email, role, password_hash FROM users WHERE username = %s AND is_active = TRUE",
            (payload.username,),
        )
        user = cursor.fetchone()
        if not user or not password_matches(payload.password, user["password_hash"]):
            log_audit_event(
                db,
                action_type="login",
                resource_type="session",
                endpoint=str(request.url.path),
                method=request.method,
                outcome="failure",
                ip_address=request.client.host if request.client else None,
            )
            db.commit()
            raise HTTPException(status_code=401, detail="Invalid credentials")

        token = secrets.token_urlsafe(48)
        token_hash = hash_session_token(token)
        expires_at = datetime.utcnow() + timedelta(minutes=SESSION_TTL_MINUTES)
        if password_hash_needs_upgrade(user["password_hash"]):
            cursor.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (hash_password(payload.password), user["id"]),
            )
        cursor.execute(
            "INSERT INTO sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
            (user["id"], token_hash, expires_at),
        )
        cursor.execute("UPDATE users SET last_login = NOW() WHERE id = %s", (user["id"],))
        log_audit_event(
            db,
            action_type="login",
            resource_type="session",
            resource_id=user["id"],
            endpoint=str(request.url.path),
            method=request.method,
            outcome="success",
            ip_address=request.client.host if request.client else None,
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
    }


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
        cursor.execute("SELECT user_id FROM sessions WHERE token = %s OR token = %s LIMIT 1", (token_hash, token))
        session_row = cursor.fetchone()
        user_id = int(session_row["user_id"]) if session_row else None
        cursor.execute("DELETE FROM sessions WHERE token = %s OR token = %s", (token_hash, token))
        log_audit_event(
            db,
            action_type="logout",
            resource_type="session",
            resource_id=user_id,
            endpoint=str(request.url.path),
            method=request.method,
            ip_address=request.client.host if request.client else None,
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
    }


@app.get("/api/patients")
def get_patients(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> List[Dict[str, Any]]:
    authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT p.id AS patient_id, p.external_patient_code, p.sex, p.created_at,
                   psd.first_name, psd.last_name, psd.date_of_birth, psd.phone, psd.email
            FROM patients p
            LEFT JOIN patient_sensitive_data psd ON psd.patient_id = p.id
            WHERE p.is_active = TRUE
            ORDER BY p.created_at DESC
            """
        )
        patients = cursor.fetchall()
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
    authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT p.id AS patient_id, p.external_patient_code, p.sex, p.created_at,
                   psd.first_name, psd.last_name, psd.date_of_birth, psd.phone, psd.email
            FROM patients p
            LEFT JOIN patient_sensitive_data psd ON psd.patient_id = p.id
            WHERE p.id = %s AND p.is_active = TRUE
            """,
            (patient_id,),
        )
        patient = cursor.fetchone()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
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
    authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    with db.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO patients (external_patient_code, sex)
            VALUES (%s, %s)
            RETURNING id AS patient_id, external_patient_code, sex, created_at
            """,
            (payload.externalPatientCode, payload.sex),
        )
        patient = cursor.fetchone()
        cursor.execute(
            """
            INSERT INTO patient_sensitive_data (patient_id, first_name, last_name, date_of_birth, phone, email)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                patient["patient_id"],
                payload.firstName,
                payload.lastName,
                payload.dateOfBirth,
                payload.phone,
                payload.email,
            ),
        )
    db.commit()
    return {
        "patient_id": patient["patient_id"],
        "external_patient_code": patient["external_patient_code"] or "",
        "sex": patient["sex"],
        "first_name": payload.firstName,
        "last_name": payload.lastName,
        "date_of_birth": payload.dateOfBirth,
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
    authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    with db.cursor() as cursor:
        cursor.execute(
            """
            UPDATE patients
            SET external_patient_code = COALESCE(%s, external_patient_code),
                sex = COALESCE(%s, sex)
            WHERE id = %s AND is_active = TRUE
            RETURNING id AS patient_id, external_patient_code, sex, created_at
            """,
            (payload.externalPatientCode, payload.sex, patient_id),
        )
        patient = cursor.fetchone()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        cursor.execute(
            """
            UPDATE patient_sensitive_data
            SET first_name = COALESCE(%s, first_name),
                last_name = COALESCE(%s, last_name),
                date_of_birth = COALESCE(%s, date_of_birth),
                phone = COALESCE(%s, phone),
                email = COALESCE(%s, email)
            WHERE patient_id = %s
            RETURNING first_name, last_name, date_of_birth, phone, email
            """,
            (
                payload.firstName,
                payload.lastName,
                payload.dateOfBirth,
                payload.phone,
                payload.email,
                patient_id,
            ),
        )
        sensitive = cursor.fetchone()

    db.commit()

    return {
        "patient_id": patient["patient_id"],
        "external_patient_code": patient["external_patient_code"] or "",
        "sex": patient["sex"],
        "first_name": sensitive["first_name"] if sensitive else payload.firstName or "",
        "last_name": sensitive["last_name"] if sensitive else payload.lastName or "",
        "date_of_birth": to_iso(sensitive["date_of_birth"]) if sensitive else payload.dateOfBirth,
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
    authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    with db.cursor() as cursor:
        cursor.execute(
            """
            UPDATE patients
            SET is_active = FALSE
            WHERE id = %s AND is_active = TRUE
            RETURNING id
            """,
            (patient_id,),
        )
        updated = cursor.fetchone()
        if not updated:
            raise HTTPException(status_code=404, detail="Patient not found")
    db.commit()
    return {"success": True}


@app.get("/api/patients/{patient_id}/encounters")
def get_patient_encounters(
    patient_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> List[Dict[str, Any]]:
    authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT id AS encounter_id, patient_id, encounter_date, notes, created_at
            FROM encounters
            WHERE patient_id = %s
            ORDER BY encounter_date DESC
            """,
            (patient_id,),
        )
        encounters = cursor.fetchall()

        result: List[Dict[str, Any]] = []
        for encounter in encounters:
            cursor.execute(
                """
                SELECT id AS feature_id, encounter_id, feature_name, feature_value, value_type
                FROM encounter_features
                WHERE encounter_id = %s
                ORDER BY id
                """,
                (encounter["encounter_id"],),
            )
            features = cursor.fetchall()
            result.append(
                {
                    "encounter_id": encounter["encounter_id"],
                    "patient_id": encounter["patient_id"],
                    "encounter_date": to_iso(encounter["encounter_date"]),
                    "notes": encounter["notes"] or "",
                    "created_at": to_iso(encounter["created_at"]),
                    "features": [
                        {
                            "feature_id": feature["feature_id"],
                            "encounter_id": feature["encounter_id"],
                            "feature_code": feature["feature_name"],
                            "feature_value": feature["feature_value"] or "",
                            "value_type": feature["value_type"],
                        }
                        for feature in features
                    ],
                }
            )
    return result


@app.post("/api/encounters", status_code=201)
def create_encounter(
    payload: CreateEncounterRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
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
    db: Any = Depends(get_db),
) -> List[Dict[str, Any]]:
    authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician", "auditor"}, request=request)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT ra.id AS assessment_id, ra.patient_id, ra.encounter_id, ra.model_id,
                   ra.probability AS probability_cvd, ra.risk_level, ra.assessment_status, ra.review_status,
                   ra.recommendation AS recommendation_text, ra.notes, ra.created_at,
                   p.external_patient_code, m.name AS model_name, m.version AS model_version
            FROM risk_assessments ra
            JOIN patients p ON p.id = ra.patient_id
            LEFT JOIN model_registry m ON m.id = ra.model_id
            ORDER BY ra.created_at DESC
            LIMIT 100
            """
        )
        assessments = cursor.fetchall()

    return [
        {
            "assessment_id": assessment["assessment_id"],
            "encounter_id": assessment["encounter_id"],
            "patient_id": assessment["patient_id"],
            "patient_name": assessment["external_patient_code"] or f"Patient {assessment['patient_id']}",
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
    authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician", "auditor"}, request=request)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT ra.id AS assessment_id, ra.patient_id, ra.encounter_id, ra.model_id,
                   ra.probability AS probability_cvd, ra.risk_level, ra.assessment_status, ra.review_status,
                   ra.recommendation AS recommendation_text, ra.notes, ra.created_at,
                   p.external_patient_code, m.name AS model_name, m.version AS model_version
            FROM risk_assessments ra
            JOIN patients p ON p.id = ra.patient_id
            LEFT JOIN model_registry m ON m.id = ra.model_id
            WHERE ra.id = %s
            LIMIT 1
            """,
            (assessment_id,),
        )
        assessment = cursor.fetchone()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    return {
        "assessment_id": assessment["assessment_id"],
        "encounter_id": assessment["encounter_id"],
        "patient_id": assessment["patient_id"],
        "patient_name": assessment["external_patient_code"] or f"Patient {assessment['patient_id']}",
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
    }


@app.get("/api/patients/{patient_id}/risk-assessments")
def get_patient_risk_assessments(
    patient_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> List[Dict[str, Any]]:
    authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT ra.id AS assessment_id, ra.patient_id, ra.encounter_id, ra.model_id,
                   ra.probability AS probability_cvd, ra.risk_level, ra.assessment_status, ra.review_status,
                   ra.recommendation AS recommendation_text, ra.notes, ra.created_at,
                   m.name AS model_name, m.version AS model_version
            FROM risk_assessments ra
            LEFT JOIN model_registry m ON m.id = ra.model_id
            WHERE ra.patient_id = %s
            ORDER BY ra.created_at DESC
            """,
            (patient_id,),
        )
        assessments = cursor.fetchall()

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
        }
        for assessment in assessments
    ]


def _predict_and_store(payload: RiskAssessmentRequest, db: Any) -> Dict[str, Any]:
    ensure_active_model_registry_entry(db)
    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT p.id, p.sex, psd.date_of_birth
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
        derived_age = calculate_age_years(patient.get("date_of_birth"))
        if derived_age is None:
            raise HTTPException(
                status_code=400,
                detail="Patient date of birth is required to derive age for risk assessment",
            )
        payload.age = float(derived_age)

    feature_defaults = latest_feature_map(db, payload.patientId)
    input_features = build_features(payload, feature_defaults, patient.get("sex"))

    feature_cols = [
        "age",
        "sex",
        "race",
        "bmi",
        "sbp",
        "dbp",
        "total_cholesterol",
        "hdl",
        "ldl",
        "triglycerides",
        "fasting_glucose",
        "hba1c",
        "smoker",
        "drink_count",
        "physically_active",
        "sleep_hours",
        "waist",
        "crp",
        "pulse_pressure",
        "tc_hdl_ratio",
        "bmi_age",
        "waist_bmi",
        "sleep_diff",
        "log_crp",
        "hba1c_age",
        "sbp_age",
        "log_triglycerides",
        "log_fasting_glucose",
    ]

    algorithm = str(model_info.get("algorithm") or "").lower()
    probability: float

    if algorithm == "meta_learner":
        try:
            bundle = load_meta_bundle()
        except RuntimeError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error
        nhanes_row = build_nhanes_row(input_features)
        df = pd.DataFrame([nhanes_row])
        df = create_nhanes_features(df)
        expected_cols = getattr(bundle["preprocessor"], "feature_names_in_", None)
        if expected_cols is not None:
            for col in expected_cols:
                if col not in df.columns:
                    df[col] = np.nan
            df = df[list(expected_cols)]
        base_input = bundle["preprocessor"].transform(df)
        base_probs = [
            bundle["base_models"][name].predict_proba(base_input)[:, 1]
            for name in ("xgb", "lgbm", "rf", "lr")
        ]
        meta_input = np.column_stack(base_probs)
        probability = float(bundle["meta"].predict_proba(meta_input)[0][1])
    else:
        model = load_ml_model()
        if model is None or pd is None or np is None:
            raise HTTPException(status_code=500, detail="ML model is not available")
        df = create_cvd_features(pd.DataFrame([input_features]))
        df = preprocess_for_model(df, feature_cols)
        probability = float(model.predict_proba(df[feature_cols])[0][1])

    with db.cursor() as cursor:
        cursor.execute(
            """
            SELECT risk_level, recommendation
            FROM cds_rules
            WHERE active = TRUE
              AND min_probability <= %s
              AND max_probability >= %s
            ORDER BY priority DESC
            LIMIT 1
            """,
            (probability, probability),
        )
        cds_rule = cursor.fetchone()

        risk_level = cds_rule["risk_level"] if cds_rule else "medium"
        recommendation = (
            cds_rule["recommendation"]
            if cds_rule
            else "Recommend clinician follow-up for cardiovascular risk review."
        )

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
            INSERT INTO risk_assessments (patient_id, model_id, encounter_id, probability, risk_level, recommendation, notes, assessment_status, review_status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
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
            ),
        )
        assessment = cursor.fetchone()

        for key, value in input_features.items():
            value_type = "number" if isinstance(value, (int, float)) else "string"
            cursor.execute(
                """
                INSERT INTO assessment_feature_values (assessment_id, feature_name, feature_value, value_type)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (assessment_id, feature_name)
                DO UPDATE SET feature_value = EXCLUDED.feature_value, value_type = EXCLUDED.value_type
                """,
                (assessment["assessment_id"], key, str(value), value_type),
            )

    db.commit()
    return {
        "assessmentId": assessment["assessment_id"],
        "probability": round(probability, 4),
        "riskLevel": risk_level,
        "recommendation": recommendation,
        "createdAt": to_iso(assessment["created_at"]),
    }


@app.post("/api/risk-assessments")
def create_risk_assessment(
    payload: RiskAssessmentRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    result = _predict_and_store(payload, db)
    log_audit_event(
        db,
        action_type="create",
        resource_type="risk_assessment",
        resource_id=int(result["assessmentId"]),
        patient_id=payload.patientId,
        endpoint=str(request.url.path),
        method=request.method,
        ip_address=request.client.host if request.client else None,
        user_id=optional_session_user_id(db, authorization),
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
    authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    return _predict_and_store(payload, db)


@app.patch("/api/risk-assessments/{assessment_id}/review")
def review_assessment(
    assessment_id: int,
    payload: ReviewStatusRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, Any]:
    authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician"}, request=request)
    status = payload.reviewStatus.strip().lower()
    if status not in {"pending", "reviewed"}:
        raise HTTPException(status_code=400, detail="Invalid review status")

    with db.cursor() as cursor:
        cursor.execute(
            """
            UPDATE risk_assessments
            SET review_status = %s
            WHERE id = %s
            RETURNING id AS assessment_id, review_status, assessment_status
            """,
            (status, assessment_id),
        )
        updated = cursor.fetchone()
        if not updated:
            raise HTTPException(status_code=404, detail="Assessment not found")

    log_audit_event(
        db,
        action_type="update",
        resource_type="risk_assessment",
        resource_id=assessment_id,
        endpoint=str(request.url.path),
        method=request.method,
        ip_address=request.client.host if request.client else None,
        user_id=optional_session_user_id(db, authorization),
    )
    db.commit()
    return {
        "assessment_id": updated["assessment_id"],
        "review_status": updated["review_status"],
        "assessment_status": updated["assessment_status"],
    }


@app.delete("/api/risk-assessments/{assessment_id}")
def delete_risk_assessment(
    assessment_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Any = Depends(get_db),
) -> Dict[str, bool]:
    authorize_user(db, authorization, allowed_roles={"admin", "doctor"}, request=request)
    with db.cursor() as cursor:
        cursor.execute(
            """
            DELETE FROM risk_assessments
            WHERE id = %s
            RETURNING id, patient_id
            """,
            (assessment_id,),
        )
        removed = cursor.fetchone()
        if not removed:
            raise HTTPException(status_code=404, detail="Assessment not found")

    log_audit_event(
        db,
        action_type="delete",
        resource_type="risk_assessment",
        resource_id=assessment_id,
        patient_id=removed["patient_id"],
        endpoint=str(request.url.path),
        method=request.method,
        ip_address=request.client.host if request.client else None,
        user_id=optional_session_user_id(db, authorization),
    )
    db.commit()
    return {"success": True}


@app.get("/api/audit-log")
def get_audit_log(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
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
            ORDER BY al.created_at DESC
            LIMIT %s OFFSET %s
            """,
            (limit, offset),
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
            SELECT id AS user_id, username, email, role, is_active, last_login, created_at
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
    authorize_user(db, authorization, allowed_roles={"admin"}, request=request)
    role = payload.role.strip().lower()
    if role not in VALID_USER_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if not payload.username.strip():
        raise HTTPException(status_code=400, detail="Username is required")
    if not payload.email.strip():
        raise HTTPException(status_code=400, detail="Email is required")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

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
            RETURNING id AS user_id, username, email, role, is_active, last_login, created_at
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
        ip_address=request.client.host if request.client else None,
        user_id=optional_session_user_id(db, authorization),
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
            SELECT id AS user_id, username, email, role, is_active, last_login, created_at
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
    authorize_user(db, authorization, allowed_roles={"admin"}, request=request)
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
    if password is not None and len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    actor_user_id = optional_session_user_id(db, authorization)
    if actor_user_id == user_id and payload.isActive is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")

    with db.cursor() as cursor:
        cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

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
            RETURNING id AS user_id, username, email, role, is_active, last_login, created_at
            """,
            tuple(values),
        )
        updated_user = cursor.fetchone()

    log_audit_event(
        db,
        action_type="update",
        resource_type="user",
        resource_id=user_id,
        endpoint=str(request.url.path),
        method=request.method,
        ip_address=request.client.host if request.client else None,
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
    authorize_user(db, authorization, allowed_roles={"admin"}, request=request)
    actor_user_id = optional_session_user_id(db, authorization)
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
        ip_address=request.client.host if request.client else None,
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
    authorize_user(db, authorization, allowed_roles={"admin", "doctor", "clinician", "auditor"}, request=request)
    ensure_active_model_registry_entry(db)
    with db.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) AS count FROM patients")
        total_patients = int(cursor.fetchone()["count"])

        cursor.execute("SELECT COUNT(*) AS count FROM risk_assessments")
        total_assessments = int(cursor.fetchone()["count"])

        cursor.execute(
            """
            SELECT risk_level, COUNT(*) AS count
            FROM risk_assessments
            GROUP BY risk_level
            """
        )
        distribution = {row["risk_level"]: int(row["count"]) for row in cursor.fetchall()}

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
            """
            SELECT ra.id AS assessment_id, ra.patient_id, ra.probability AS probability_cvd,
                   ra.risk_level, ra.created_at, p.external_patient_code
            FROM risk_assessments ra
            JOIN patients p ON p.id = ra.patient_id
            ORDER BY ra.created_at DESC
            LIMIT 10
            """
        )
        recent_rows = cursor.fetchall()

    recent = [
        {
            "id": row["assessment_id"],
            "patient_id": row["patient_id"],
            "probability_cvd": float(row["probability_cvd"] or 0),
            "risk_level": row["risk_level"],
            "created_at": to_iso(row["created_at"]),
            "external_patient_code": row["external_patient_code"] or "",
        }
        for row in recent_rows
    ]

    return {
        "totalPatients": total_patients,
        "totalAssessments": total_assessments,
        "riskDistribution": distribution,
        "activeModelAccuracy": float((active_model_row or {}).get("accuracy") or 0),
        "recentAssessments": recent,
    }


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


if __name__ == "__main__":
    import importlib

    host = os.getenv("APP_HOST", "0.0.0.0")
    port = int(os.getenv("APP_PORT", "8000"))
    reload_enabled = os.getenv("APP_RELOAD", "false").lower() == "true"
    try:
        uvicorn = importlib.import_module("uvicorn")
    except ModuleNotFoundError as error:
        raise RuntimeError(
            "uvicorn is not installed. Run `pip install -r Back-End/requirements.txt` first."
        ) from error
    uvicorn.run(app, host=host, port=port, reload=reload_enabled)
