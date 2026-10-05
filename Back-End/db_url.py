"""Database URL resolution shared by the API and the ops scripts."""
import os
from typing import Optional


def app_database_url() -> Optional[str]:
    """URL for the running API: DATABASE_URL (pooled on Neon), else PG* variables."""
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


def script_database_url() -> Optional[str]:
    """URL for migrations/seed/maintenance: direct (unpooled) connection when provided."""
    return os.getenv("DATABASE_URL_UNPOOLED") or app_database_url()
