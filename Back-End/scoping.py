"""Sandbox scoping: which patients a user may see.

Demo users only ever see patients they own (`patients.owner_user_id = <their id>`);
every other user sees only real clinic data (`owner_user_id IS NULL`). Every query that
touches patients, encounters, assessments, assessment features or dashboard stats must
include this predicate so the two worlds never mix.
"""
from typing import Any, Dict, Tuple


def patient_scope_sql(user: Dict[str, Any], alias: str = "p") -> Tuple[str, tuple]:
    """Return (SQL predicate, params) restricting `alias` (a patients table/alias) to the user's world."""
    if user.get("is_demo"):
        return f"{alias}.owner_user_id = %s", (int(user["id"]),)
    return f"{alias}.owner_user_id IS NULL", ()
