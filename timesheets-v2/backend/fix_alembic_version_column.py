"""
One-off helper: confirms migration 0005's actual schema changes (Tasks.created_at,
Time_Logs.is_deleted, etc.) really did land in the database, widens the
alembic_version.version_num column (Alembic's default of 32 chars is too
short for this project's longer revision names), and then corrects the
recorded version so `alembic current` matches reality.

Usage (from backend/ folder, with venv active):
    python fix_alembic_version_column.py
"""
from sqlalchemy import text
from app.db.session import engine

with engine.connect() as conn:
    print("Checking whether 0005's columns actually exist...")

    tasks_cols = [row[0] for row in conn.execute(text("SHOW COLUMNS FROM Tasks"))]
    time_logs_cols = [row[0] for row in conn.execute(text("SHOW COLUMNS FROM Time_Logs"))]

    has_task_created_at = "created_at" in tasks_cols
    has_is_deleted = "is_deleted" in time_logs_cols

    print(f"  Tasks.created_at present:      {has_task_created_at}")
    print(f"  Time_Logs.is_deleted present:  {has_is_deleted}")

    if not (has_task_created_at and has_is_deleted):
        print()
        print("Not all of migration 0005's columns are present. Do NOT proceed blindly -")
        print("send this output back before doing anything else.")
        raise SystemExit(1)

    print()
    print("Both columns exist - the migration's real schema changes already applied.")
    print("Widening alembic_version.version_num and correcting the recorded version...")

    conn.execute(text("ALTER TABLE alembic_version MODIFY version_num VARCHAR(255) NOT NULL"))
    conn.execute(
        text(
            "UPDATE alembic_version SET version_num = '0005_soft_delete_task_ts' "
            "WHERE version_num = '0004_password_reset_tokens'"
        )
    )
    conn.commit()

    current = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
    print(f"alembic_version is now: {current}")
    print("Done.")
