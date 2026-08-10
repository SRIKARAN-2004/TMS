"""forced password rotation flag

Revision ID: 0003_password_rotation
Revises: 0002_security_and_workflow
Create Date: 2026-08-08

Adds Passwords.must_change_password (default false). The seeded admin
account previously had a fixed, hardcoded password ("Admin@123") with no
mechanism forcing it to ever be changed - this column, combined with
seed_db.py now generating a random password and setting this flag to
true for that account, closes that gap. Existing rows default to false
(no forced rotation) so this doesn't lock anyone out on upgrade; set it
manually for any account you want to force a rotation on:

    UPDATE Passwords SET must_change_password = TRUE WHERE user_id = <id>;
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_password_rotation"
down_revision = "0002_security_and_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "Passwords",
        sa.Column("must_change_password", sa.Boolean, nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("Passwords", "must_change_password")
