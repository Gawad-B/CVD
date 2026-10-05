"""Delete demo accounts that expired more than 30 days ago, with their sandbox data.

Usage:
  DATABASE_URL=postgresql://... python scripts/purge_expired_demos.py          # dry run (default)
  DATABASE_URL=postgresql://... python scripts/purge_expired_demos.py --apply  # delete
  Optional: --grace-days N (default 30)

Per purged demo user, in one transaction:
  1. their patients' risk assessments are deleted (assessment_feature_values cascade;
     risk_assessments.patient_id has no cascade by design, so real data stays protected);
  2. the user row is deleted: sessions, patients, patient_sensitive_data and encounters cascade.
Each applied run also writes one audit_log row (resource_type 'demo_purge', counts in metadata).
Audit history is KEPT: migration 004 made audit_log.user_id (and the reviewed/deleted/overridden
user references on risk_assessments) ON DELETE SET NULL, and audit_log.patient_id is already
ON DELETE SET NULL, so audit rows survive with those references cleared.
"""
import argparse
import sys
from pathlib import Path
from typing import List, Optional

import psycopg2
from psycopg2.extras import Json

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from db_url import script_database_url  # noqa: E402

DEFAULT_GRACE_DAYS = 30


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="actually delete (default is a dry run)")
    parser.add_argument("--grace-days", type=int, default=DEFAULT_GRACE_DAYS)
    parser.add_argument("--force", action="store_true", help="allow --grace-days below the 30-day minimum")
    args = parser.parse_args(argv)
    if args.grace_days < DEFAULT_GRACE_DAYS and not args.force:
        print(f"--grace-days must be >= {DEFAULT_GRACE_DAYS} (pass --force to override)", file=sys.stderr)
        return 2

    url = script_database_url()
    if not url:
        print("No database URL (DATABASE_URL_UNPOOLED / DATABASE_URL / PG*) is set", file=sys.stderr)
        return 1

    conn = psycopg2.connect(url)
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id FROM users
                WHERE is_demo AND demo_expires_at < NOW() - make_interval(days => %s)
                ORDER BY id
                """,
                (args.grace_days,),
            )
            user_ids = [row[0] for row in cursor.fetchall()]
            cursor.execute(
                "SELECT COUNT(*) FROM patients WHERE owner_user_id = ANY(%s)", (user_ids,)
            )
            patients = cursor.fetchone()[0]
            cursor.execute(
                """
                SELECT COUNT(*) FROM risk_assessments ra JOIN patients p ON p.id = ra.patient_id
                WHERE p.owner_user_id = ANY(%s)
                """,
                (user_ids,),
            )
            assessments = cursor.fetchone()[0]

            if not args.apply:
                conn.rollback()
                print(
                    f"[dry run] would delete {len(user_ids)} demo user(s), {patients} patient(s), "
                    f"{assessments} assessment(s) (expired > {args.grace_days} days). Use --apply to delete."
                )
                return 0

            cursor.execute(
                """
                DELETE FROM risk_assessments
                WHERE patient_id IN (SELECT id FROM patients WHERE owner_user_id = ANY(%s))
                """,
                (user_ids,),
            )
            cursor.execute("DELETE FROM users WHERE id = ANY(%s) AND is_demo", (user_ids,))
            # One audit row per applied run, even when nothing was purged (no user: it is a system job).
            cursor.execute(
                """
                INSERT INTO audit_log (user_id, action_type, resource_type, endpoint, outcome, metadata)
                VALUES (NULL, 'delete', 'demo_purge', 'scripts/purge_expired_demos.py', 'success', %s)
                """,
                (
                    Json(
                        {
                            "users": len(user_ids),
                            "patients": patients,
                            "assessments": assessments,
                            "grace_days": args.grace_days,
                        }
                    ),
                ),
            )
        conn.commit()
        print(f"deleted {len(user_ids)} demo user(s), {patients} patient(s), {assessments} assessment(s)")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
