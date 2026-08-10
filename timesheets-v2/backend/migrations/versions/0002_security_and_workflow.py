"""approval workflow, audit log, token revocation

Revision ID: 0002_security_and_workflow
Revises: 0001_baseline
Create Date: 2026-08-08

Covers every schema change made across this session and the approval-
workflow session before it, none of which had a migration at the time:

- Time_Logs.status / rejection_reason  (approval workflow)
- Time_Logs.created_at / updated_at    (audit trail groundwork)
- Projects.created_at / updated_at     (audit trail groundwork)
- Revoked_Tokens table                 (JWT logout revocation)
- Audit_Log table                      (delete trail for time logs/projects)

Run with:  cd backend && alembic upgrade head
(after `alembic stamp 0001_baseline` if this is an existing database -
see the note at the top of 0001_baseline.py)
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_security_and_workflow"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "Time_Logs",
        sa.Column(
            "status",
            sa.Enum("pending", "approved", "rejected", name="time_log_status_enum"),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column("Time_Logs", sa.Column("rejection_reason", sa.String(300), nullable=True))
    op.add_column(
        "Time_Logs",
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.add_column(
        "Time_Logs",
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    op.add_column(
        "Projects",
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.add_column(
        "Projects",
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "Revoked_Tokens",
        sa.Column("jti", sa.String(32), primary_key=True),
        sa.Column("expires_at", sa.DateTime, nullable=False),
    )

    op.create_table(
        "Audit_Log",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Integer, nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("performed_by", sa.Integer, nullable=True),
        sa.Column("snapshot", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("Audit_Log")
    op.drop_table("Revoked_Tokens")
    op.drop_column("Projects", "updated_at")
    op.drop_column("Projects", "created_at")
    op.drop_column("Time_Logs", "updated_at")
    op.drop_column("Time_Logs", "created_at")
    op.drop_column("Time_Logs", "rejection_reason")
    op.drop_column("Time_Logs", "status")
