"""Encrypt (AES-256-GCM, in Python; the key never reaches the DB) legacy plaintext patient identifiers in patient_sensitive_data.

Usage:
  DATABASE_URL=postgresql://... PATIENT_DATA_KEY=... \
      python scripts/encrypt_patient_data.py [--dry-run | --apply]

Default is a dry run (counts only). --apply encrypts every row that still has
plaintext in one transaction and NULLs the plaintext columns. If any row is
already encrypted, the key must decrypt every encrypted value first; otherwise the script
exits 2 without changing anything.
"""
import argparse
import os
import sys
from datetime import date
from pathlib import Path

import psycopg2
from psycopg2 import Binary
from psycopg2.extras import RealDictCursor

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from db_url import script_database_url  # noqa: E402
from phi_crypto import MIN_KEY_LENGTH, PhiDecryptionError, decrypt_text, encrypt_text, phi_aad  # noqa: E402

FIELDS = ("first_name", "last_name", "date_of_birth", "phone", "email")
ANY_PLAINTEXT = " OR ".join(f"{f} IS NOT NULL" for f in FIELDS)
ANY_ENCRYPTED = " OR ".join(f"{f}_enc IS NOT NULL" for f in FIELDS)
ALL_COLUMNS = ", ".join(["patient_id"] + list(FIELDS) + [f"{f}_enc" for f in FIELDS])


def _verify_key(rows, key: str) -> bool:
    """True only if the key decrypts EVERY existing *_enc value."""
    try:
        for row in rows:
            for field in FIELDS:
                if row[f"{field}_enc"] is not None:
                    decrypt_text(row[f"{field}_enc"], key, aad=phi_aad(row["patient_id"], field))
    except PhiDecryptionError:
        return False
    return True


def _encrypt_field(patient_id, field: str, value, key: str):
    if value is None:
        return None
    text = value.isoformat() if isinstance(value, date) else str(value)
    return Binary(encrypt_text(text, key, aad=phi_aad(patient_id, field)))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="print counts only (default)")
    mode.add_argument("--apply", action="store_true", help="encrypt and NULL plaintext")
    args = parser.parse_args(argv)

    url = script_database_url()
    key = os.environ.get("PATIENT_DATA_KEY", "")
    if not url:
        print("No database URL (DATABASE_URL_UNPOOLED / DATABASE_URL / PG*) is set", file=sys.stderr)
        return 1
    if len(key) < MIN_KEY_LENGTH:
        print("PATIENT_DATA_KEY must be set (min 16 chars)", file=sys.stderr)
        return 1

    conn = psycopg2.connect(url, cursor_factory=RealDictCursor)
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"SELECT {ALL_COLUMNS} FROM patient_sensitive_data ORDER BY patient_id FOR UPDATE")
            rows = cursor.fetchall()
            pending = [r for r in rows if any(r[f] is not None for f in FIELDS)]
            encrypted = [r for r in rows if any(r[f"{f}_enc"] is not None for f in FIELDS)]
            print(f"rows with plaintext to encrypt: {len(pending)}")
            print(f"rows already encrypted: {len(encrypted)}")
            if not args.apply:
                print("dry run: no changes made (use --apply)")
                conn.rollback()
                return 0
            if not _verify_key(encrypted, key):
                print("PATIENT_DATA_KEY cannot decrypt existing encrypted data; no changes made", file=sys.stderr)
                conn.rollback()
                return 2
            for row in pending:
                # Keep any existing *_enc value; only encrypt where it is missing.
                values = [
                    Binary(bytes(row[f"{f}_enc"])) if row[f"{f}_enc"] is not None else _encrypt_field(row["patient_id"], f, row[f], key)
                    for f in FIELDS
                ]
                assignments = ", ".join(f"{f}_enc = %s, {f} = NULL" for f in FIELDS)
                cursor.execute(
                    f"UPDATE patient_sensitive_data SET {assignments} WHERE patient_id = %s",
                    (*values, row["patient_id"]),
                )
            print(f"encrypted rows: {len(pending)}")
        conn.commit()
        return 0
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
