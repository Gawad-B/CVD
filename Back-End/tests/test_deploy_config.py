import json
from pathlib import Path
from types import SimpleNamespace

import pytest

import app as app_module
import db_url

pytestmark = pytest.mark.nodb

PREVIEW_REGEX = r"^https://cvd-web-[a-z0-9]{9}-myteam\.vercel\.app$"
PREVIEW_ORIGIN = "https://cvd-web-abc123xyz-myteam.vercel.app"

BACKEND_DIR = Path(__file__).resolve().parent.parent
PG_VARS = ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"]


@pytest.fixture
def clean_env(monkeypatch):
    for name in ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "TRUST_PROXY_HEADERS", "CORS_ORIGIN_REGEX", "CORS_ORIGINS", "VERCEL", *PG_VARS]:
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def test_app_database_url_prefers_database_url(clean_env):
    clean_env.setenv("DATABASE_URL", "postgresql://pooled")
    clean_env.setenv("PGHOST", "h")
    assert db_url.app_database_url() == "postgresql://pooled"


def test_app_database_url_composes_pg_vars(clean_env):
    for k, v in zip(PG_VARS, ["h", "5432", "d", "u", "p"]):
        clean_env.setenv(k, v)
    assert db_url.app_database_url() == "postgresql://u:p@h:5432/d"


def test_app_database_url_none_when_unset(clean_env):
    assert db_url.app_database_url() is None


def test_script_database_url_prefers_unpooled(clean_env):
    clean_env.setenv("DATABASE_URL", "postgresql://pooled")
    clean_env.setenv("DATABASE_URL_UNPOOLED", "postgresql://direct")
    assert db_url.script_database_url() == "postgresql://direct"


def test_script_database_url_falls_back(clean_env):
    clean_env.setenv("DATABASE_URL", "postgresql://pooled")
    assert db_url.script_database_url() == "postgresql://pooled"
    clean_env.delenv("DATABASE_URL")
    assert db_url.script_database_url() is None


def req(host, xff=None):
    headers = {"x-forwarded-for": xff} if xff is not None else {}
    return SimpleNamespace(client=SimpleNamespace(host=host), headers=headers)


def test_client_ip_ignores_xff_by_default(clean_env):
    assert app_module.client_ip(req("10.0.0.1", "203.0.113.5")) == "10.0.0.1"


@pytest.mark.parametrize("flag", ["true", "1", "YES", "True"])
def test_client_ip_trusts_xff_first_entry(clean_env, flag):
    clean_env.setenv("TRUST_PROXY_HEADERS", flag)
    assert app_module.client_ip(req("10.0.0.1", "203.0.113.5, 10.1.1.1")) == "203.0.113.5"


def test_client_ip_invalid_xff_falls_back(clean_env):
    clean_env.setenv("TRUST_PROXY_HEADERS", "true")
    assert app_module.client_ip(req("10.0.0.1", "not-an-ip")) == "10.0.0.1"
    assert app_module.client_ip(req("testclient", "not-an-ip")) is None


def test_client_ip_flag_false_values(clean_env):
    clean_env.setenv("TRUST_PROXY_HEADERS", "false")
    assert app_module.client_ip(req("10.0.0.1", "203.0.113.5")) == "10.0.0.1"


def test_cors_regex_unset_is_none(clean_env):
    assert app_module.cors_settings()["allow_origin_regex"] is None


def test_cors_regex_allows_preview_origin(clean_env):
    import re

    clean_env.setenv("CORS_ORIGIN_REGEX", PREVIEW_REGEX)
    regex = app_module.cors_settings()["allow_origin_regex"]
    assert re.fullmatch(regex, PREVIEW_ORIGIN)
    assert not re.fullmatch(regex, "https://cvd-web-x-myteam.vercel.app")
    assert not re.fullmatch(regex, "https://evil.example.com")


def test_cors_regex_integration(clean_env):
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.testclient import TestClient

    clean_env.setenv("CORS_ORIGIN_REGEX", PREVIEW_REGEX)
    mini = FastAPI()
    mini.add_middleware(CORSMiddleware, **app_module.cors_settings())

    @mini.get("/")
    def root():
        return {}

    c = TestClient(mini)
    ok = c.get("/", headers={"Origin": PREVIEW_ORIGIN})
    assert ok.headers["access-control-allow-origin"] == PREVIEW_ORIGIN
    assert "access-control-allow-credentials" not in ok.headers
    for origin in ("https://evil.example.com", "https://cvd-web-x-myteam.vercel.app"):
        bad = c.get("/", headers={"Origin": origin})
        assert "access-control-allow-origin" not in bad.headers


def test_cors_origins_default_is_empty(clean_env):
    assert app_module.cors_settings()["allow_origins"] == []


def test_cors_origins_parsed_from_env(clean_env):
    clean_env.setenv("CORS_ORIGINS", "https://a.example, https://b.example ,")
    assert app_module.cors_settings()["allow_origins"] == ["https://a.example", "https://b.example"]


def test_cors_credentials_disabled(clean_env):
    assert app_module.cors_settings()["allow_credentials"] is False


def test_live_endpoint_does_not_touch_db(clean_env):
    from fastapi.testclient import TestClient

    clean_env.setenv("DATABASE_URL", "postgresql://u:p@127.0.0.1:1/none")
    resp = TestClient(app_module.app).get("/api/live")
    assert resp.status_code == 200
    assert resp.json() == {"status": "alive"}


def test_health_db_error_is_generic(clean_env):
    from fastapi.testclient import TestClient

    clean_env.setattr(app_module, "DATABASE_URL", "postgresql://u:p@127.0.0.1:1/none")
    resp = TestClient(app_module.app).get("/api/health")
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert detail == "Database unavailable"
    assert "DATABASE_URL" not in detail and "PGHOST" not in detail


def test_docs_enabled_locally(clean_env):
    built = app_module.build_app()
    assert built.docs_url == "/docs" and built.openapi_url == "/openapi.json"


def test_docs_disabled_on_vercel(clean_env):
    from fastapi.testclient import TestClient

    clean_env.setenv("VERCEL", "1")
    built = app_module.build_app()
    assert built.docs_url is None and built.redoc_url is None and built.openapi_url is None
    c = TestClient(built)
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert c.get(path).status_code == 404


def test_requirements_pin_xgboost_cpu():
    lines = [l.strip() for l in (BACKEND_DIR / "requirements.txt").read_text().splitlines()]
    xgb = [l for l in lines if l.lower().startswith("xgboost")]
    assert sorted(xgb) == [
        'xgboost-cpu==2.1.4; sys_platform == "linux"',
        'xgboost==2.1.4; sys_platform != "linux"',
    ]
    assert not any(l.lower().startswith("gunicorn") for l in lines)
    assert not any("[standard]" in l for l in lines)


def test_vercel_json_excludes_tests():
    cfg = json.loads((BACKEND_DIR / "vercel.json").read_text())
    assert "tests/**" in cfg["functions"]["app.py"]["excludeFiles"]


def test_python_version_file():
    assert (BACKEND_DIR / ".python-version").read_text().strip() == "3.12"
