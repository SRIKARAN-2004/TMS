from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from app.db.session import Base


class User(Base):
    __tablename__ = "Users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    userid = Column(String(10), unique=True)
    name = Column(String(80))
    company_mail = Column(String(50))
    phone_number = Column(String(20))
    isAlive = Column(Boolean, default=True)

    password = relationship("Password", back_populates="user", uselist=False)
    role_assignments = relationship("RoleAssignment", back_populates="user")
    manager_assignments = relationship(
        "ManagerAssignment", foreign_keys="ManagerAssignment.user_id", back_populates="user"
    )
    project_assignments = relationship("ProjectAssignment", back_populates="user")
    time_logs = relationship("TimeLog", back_populates="user")


class Password(Base):
    __tablename__ = "Passwords"

    user_id = Column(Integer, ForeignKey("Users.id"), primary_key=True)
    username = Column(String(10), unique=True)
    password = Column(String(60))
    # Forces a password change on next login - set True for the seeded
    # admin account (see seed_db.py), since that account previously had a
    # fixed, hardcoded password ("Admin@123") with nothing requiring it to
    # ever be rotated. Cleared automatically the moment the user
    # successfully changes their password (self-service or admin reset).
    must_change_password = Column(Boolean, default=False, server_default="0", nullable=False)

    user = relationship("User", back_populates="password")


class PasswordResetToken(Base):
    """Self-service 'forgot password' flow. Only a SHA-256 hash of the
    token is ever stored (mirrors how the actual password is stored, not
    kept in plaintext) - the raw token only exists in the email link and
    in-memory for the length of the request that issues/consumes it.
    Single-use (`used`) and time-limited (`expires_at`, see
    Settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES), and a new request
    doesn't need to invalidate older ones explicitly since consuming any
    one of them for a user is enough to complete the reset - they just
    become moot once the password itself changes.
    """

    __tablename__ = "PasswordResetTokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("Users.id"), nullable=False)
    token_hash = Column(String(64), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, nullable=False)

    user = relationship("User")
