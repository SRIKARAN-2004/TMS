"""
User repository - the only place in the codebase that runs raw SQLAlchemy
queries against Users, Passwords, Roles, Role_Assignments, and
Manager_Assignments. No business rules, no validation, no exceptions -
just "get me this row" / "save this row". Business logic (deciding
*whether* something is allowed, raising NotFoundError, etc.) belongs in
app/controllers/user_service.py, which calls these functions.
"""
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.user import User, Password, PasswordResetToken
from app.models.role import Role, RoleAssignment, ManagerAssignment


# --- Users ---

def get_by_id(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def get_by_ids(db: Session, user_ids: list[int]) -> list[User]:
    if not user_ids:
        return []
    return db.query(User).filter(User.id.in_(user_ids)).all()


def get_by_ids_locked(db: Session, user_id: int) -> User | None:
    """Row-level SELECT ... FOR UPDATE lock on a single user - used by
    project_service.assign_user to close a TOCTOU race between two
    concurrent assignment requests for the same person (see that
    function's docstring for the full explanation)."""
    return db.query(User).filter(User.id == user_id).with_for_update().first()


def get_by_userid(db: Session, userid: str) -> User | None:
    return db.query(User).filter(User.userid == userid).first()


def get_by_company_mail(db: Session, company_mail: str) -> User | None:
    return db.query(User).filter(User.company_mail == company_mail).first()


def get_all(db: Session) -> list[User]:
    return db.query(User).all()


def create(db: Session, *, userid: str, name: str, company_mail: str | None, phone_number: str | None) -> User:
    user = User(userid=userid, name=name, company_mail=company_mail, phone_number=phone_number, isAlive=True)
    db.add(user)
    db.flush()  # populates user.id without committing yet
    return user


def save(db: Session) -> None:
    db.commit()


# --- Passwords ---

def get_password_by_username(db: Session, username: str) -> Password | None:
    return db.query(Password).filter(Password.username == username).first()


def get_password_by_user_id(db: Session, user_id: int) -> Password | None:
    return db.query(Password).filter(Password.user_id == user_id).first()


def create_password(
    db: Session, *, user_id: int, username: str, hashed_password: str, must_change_password: bool = False
) -> Password:
    pw = Password(
        user_id=user_id,
        username=username,
        password=hashed_password,
        must_change_password=must_change_password,
    )
    db.add(pw)
    return pw


# --- Password reset tokens ("forgot password") ---

def create_reset_token(
    db: Session, *, user_id: int, token_hash: str, expires_at: datetime
) -> PasswordResetToken:
    row = PasswordResetToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
        used=False,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row


def get_reset_token_by_hash(db: Session, token_hash: str) -> PasswordResetToken | None:
    return (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == token_hash)
        .first()
    )


# --- Roles / Role_Assignments ---

def get_role_by_name(db: Session, role_name: str) -> Role | None:
    return db.query(Role).filter(Role.role == role_name).first()


def create_role(db: Session, role_name: str) -> Role:
    role = Role(role=role_name)
    db.add(role)
    db.flush()
    return role


def list_roles(db: Session) -> list[Role]:
    return db.query(Role).all()


def get_roles_for_user(db: Session, user_id: int) -> list[str]:
    rows = (
        db.query(Role.role)
        .join(RoleAssignment, RoleAssignment.role_id == Role.id)
        .filter(RoleAssignment.user_id == user_id)
        .all()
    )
    return [r[0] for r in rows]


def get_user_ids_with_role(db: Session, role_id: int) -> set[int]:
    return {ra.user_id for ra in db.query(RoleAssignment).filter(RoleAssignment.role_id == role_id).all()}


def assign_role(db: Session, user_id: int, role_id: int) -> None:
    db.add(RoleAssignment(user_id=user_id, role_id=role_id))


def clear_role_assignments(db: Session, user_id: int) -> None:
    db.query(RoleAssignment).filter(RoleAssignment.user_id == user_id).delete()


# --- Manager_Assignments ---

def get_manager_assignment(db: Session, user_id: int) -> ManagerAssignment | None:
    return db.query(ManagerAssignment).filter(ManagerAssignment.user_id == user_id).first()


def get_direct_reports(db: Session, manager_id: int) -> list[ManagerAssignment]:
    return db.query(ManagerAssignment).filter(ManagerAssignment.manager_id == manager_id).all()


def set_manager(db: Session, user_id: int, manager_id: int) -> None:
    db.add(ManagerAssignment(user_id=user_id, manager_id=manager_id))


def clear_manager_assignment(db: Session, user_id: int) -> None:
    db.query(ManagerAssignment).filter(ManagerAssignment.user_id == user_id).delete()
