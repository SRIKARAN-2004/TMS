"""
Run this once after creating the schema to seed the Roles table and
create a first admin login so you're not locked out of the app.

Usage (from backend/ folder, with venv active):
    python seed_db.py
"""
import secrets

from app.db.session import SessionLocal, Base, engine
from app.models.user import User, Password
from app.models.role import Role, RoleAssignment
from app.core.security import hash_password
from app.core.roles import Roles

Base.metadata.create_all(bind=engine)

db = SessionLocal()

try:
    # 1. Seed the three roles if they don't exist
    role_names = Roles.ALL
    role_map = {}
    for name in role_names:
        role = db.query(Role).filter(Role.role == name).first()
        if not role:
            role = Role(role=name)
            db.add(role)
            db.flush()
        role_map[name] = role

    # 2. Create a first admin user if none exists yet
    existing_admin = (
        db.query(User)
        .join(RoleAssignment, RoleAssignment.user_id == User.id)
        .filter(RoleAssignment.role_id == role_map[Roles.ADMIN].id)
        .first()
    )

    if not existing_admin:
        admin_user = User(
            userid="EMP0001",
            name="Srikaran (Admin)",
            company_mail="admin@timesheets.local",
            phone_number=None,
            isAlive=True,
        )
        db.add(admin_user)
        db.flush()

        # A fixed, hardcoded password ("Admin@123") here means every
        # deployment of this app starts with the exact same admin
        # credential, discoverable just by reading this file - effectively
        # a permanent, public backdoor unless someone remembers to change
        # it immediately after setup. Generating a random one per
        # deployment removes that shared-secret problem, and
        # must_change_password=True means even this generated password
        # can't be used for more than one login before it has to be
        # rotated - the account is unusable until a real password is set.
        generated_password = secrets.token_urlsafe(12)

        db.add(
            Password(
                user_id=admin_user.id,
                username="admin",
                password=hash_password(generated_password),
                must_change_password=True,
            )
        )
        db.add(RoleAssignment(user_id=admin_user.id, role_id=role_map[Roles.ADMIN].id))

        db.commit()
        print("=" * 60)
        print("Created admin user - SAVE THIS PASSWORD, it will not be shown again:")
        print(f"  username: admin")
        print(f"  password: {generated_password}")
        print("You will be required to change it on first login.")
        print("=" * 60)
    else:
        print("An admin user already exists, skipping admin creation.")

    db.commit()
    print("Roles seeded:", role_names)

finally:
    db.close()
