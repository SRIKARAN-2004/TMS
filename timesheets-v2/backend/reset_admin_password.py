"""
One-off helper: resets the existing admin account's password to a known
value, for when the original one-time generated password (printed by
seed_db.py) has been lost.

Usage (from backend/ folder, with venv active):
    python reset_admin_password.py

Delete this file once you're logged in - it's not meant to stay in the
project long-term.
"""
from app.db.session import SessionLocal
from app.models.user import User, Password
from app.models.role import Role, RoleAssignment
from app.core.security import hash_password
from app.core.roles import Roles

NEW_PASSWORD = "Reset@1234"  # change this if you like before running

db = SessionLocal()

try:
    admin_role = db.query(Role).filter(Role.role == Roles.ADMIN).first()
    if not admin_role:
        print("No 'admin' role found in the Roles table - has seed_db.py been run?")
        raise SystemExit(1)

    admin_user = (
        db.query(User)
        .join(RoleAssignment, RoleAssignment.user_id == User.id)
        .filter(RoleAssignment.role_id == admin_role.id)
        .first()
    )
    if not admin_user:
        print("No admin user found - run seed_db.py first.")
        raise SystemExit(1)

    pw_row = db.query(Password).filter(Password.user_id == admin_user.id).first()
    if not pw_row:
        print("Admin user has no password row - something is inconsistent, contact support.")
        raise SystemExit(1)

    pw_row.password = hash_password(NEW_PASSWORD)
    pw_row.must_change_password = True
    db.commit()

    print("=" * 60)
    print("Admin password reset.")
    print(f"  username: {pw_row.username}")
    print(f"  password: {NEW_PASSWORD}")
    print("You will be required to change it on first login.")
    print("=" * 60)
finally:
    db.close()
