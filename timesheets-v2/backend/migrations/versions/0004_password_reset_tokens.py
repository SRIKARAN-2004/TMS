"""password reset tokens (forgot password)

Revision ID: 0004_password_reset_tokens
Revises: 0003_password_rotation
Create Date: 2026-08-08

Adds the PasswordResetTokens table backing the self-service "forgot
password" flow (request a reset link by email, then set a new password +
confirmation from that link) for all roles. Only a hash of the token is
stored - see app/models/user.py:PasswordResetToken for the rationale.
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_password_reset_tokens"
down_revision = "0003_password_rotation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "PasswordResetTokens",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("Users.id"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("used", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index(
        "ix_password_reset_tokens_user_id", "PasswordResetTokens", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_password_reset_tokens_user_id", table_name="PasswordResetTokens")
    op.drop_table("PasswordResetTokens")
