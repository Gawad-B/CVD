"""Apply database/schema.sql, then database/migrations/*.sql in name order.

Usage: DATABASE_URL=postgresql://... python scripts/migrate.py
All files must be idempotent, so re-running is safe.
"""
import sys
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from db_url import script_database_url  # noqa: E402

DATABASE_DIR = Path(__file__).resolve().parent.parent / "database"


def apply_all(conn) -> list[str]:
    """Apply schema.sql and every migration; return the applied filenames."""
    files = [DATABASE_DIR / "schema.sql"]
    files += sorted((DATABASE_DIR / "migrations").glob("*.sql"), key=lambda p: p.name)
    applied: list[str] = []
    for path in files:
        with conn.cursor() as cursor:
            cursor.execute(path.read_text(encoding="utf-8"))
        conn.commit()
        applied.append(path.name)
    return applied


def main() -> int:
    url = script_database_url()
    if not url:
        print("No database URL (DATABASE_URL_UNPOOLED / DATABASE_URL / PG*) is set", file=sys.stderr)
        return 1
    conn = psycopg2.connect(url)
    try:
        for name in apply_all(conn):
            print(f"applied {name}")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
