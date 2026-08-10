"""soft-delete flag for time logs + task assigned timestamp

Revision ID: 0005_soft_delete_task_ts
Revises: 0004_password_reset_tokens
Create Date: 2026-08-08

Adds:
  - Time_Logs.is_deleted (default false) - lets an employee "delete" their
    own pending entry as a soft delete (hidden everywhere, row kept for
    audit) instead of the hard delete admin/manager still use.
  - Tasks.created_at (default now) - so the employee-facing Tasks screen
    can show exactly when a task was assigned, not just that it exists.
    Existing rows default to the migration run time since the real
    creation time was never previously recorded.
"""
from alembic import op
import sqlalchemy as sa

# Kept to 32 chars or under on purpose - Alembic's own alembic_version.version_num
# tracking column defaults to VARCHAR(32), and the original longer name here
# ("0005_soft_delete_and_task_timestamps", 36 chars) overflowed it, breaking
# `alembic upgrade head` on every fresh install at the very last step (after
# the real ALTER TABLEs had already run and committed).
revision = "0005_soft_delete_task_ts"
down_revision = "0004_password_reset_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "Time_Logs",
        sa.Column("is_deleted", sa.Boolean, nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "Tasks",
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_column("Tasks", "created_at")
    op.drop_column("Time_Logs", "is_deleted")
