"""Create the initial admin user (idempotent).

Usage:
  DATABASE_URL=postgresql://... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
      python scripts/seed_admin.py
Optional: ADMIN_USERNAME (default "admin"). Password must be >= 12 characters.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db_url import script_database_url  # noqa: E402
import psycopg2  # noqa: E402

MIN_PASSWORD_LENGTH = 12


def main() -> int:
    url = script_database_url()
    if not url:
        print("No database URL (DATABASE_URL_UNPOOLED / DATABASE_URL / PG*) is set", file=sys.stderr)
        return 1
    username = os.environ.get("ADMIN_USERNAME", "admin").strip() or "admin"
    email = os.environ.get("ADMIN_EMAIL", "").strip()
    password = os.environ.get("ADMIN_PASSWORD", "")
    if not email:
        print("ADMIN_EMAIL is required", file=sys.stderr)
        return 1
    if len(password) < MIN_PASSWORD_LENGTH:
        print(f"ADMIN_PASSWORD must be at least {MIN_PASSWORD_LENGTH} characters", file=sys.stderr)
        return 1

    from app import hash_password

    conn = psycopg2.connect(url)
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (username, email, role, password_hash, is_active)
                VALUES (%s, %s, 'admin', %s, TRUE)
                ON CONFLICT (username) DO NOTHING
                """,
                (username, email, hash_password(password)),
            )
            created = cursor.rowcount == 1
        conn.commit()
    finally:
        conn.close()
    print(f"Admin user '{username}' created" if created else f"Admin user '{username}' already exists")
    return 0


if __name__ == "__main__":
    sys.exit(main())
