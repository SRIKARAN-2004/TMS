"""
User/role/manager-assignment business logic. Rules and exceptions live
here; raw SQLAlchemy queries against Users/Passwords/Roles/
Role_Assignments/Manager_Assignments go through
app/repositories/user_repository.py instead of being written inline -
see the module docstring in project_service.py for the fuller rationale
(repository = single-table/simple-lookup queries; service = composite
reads and the rules for what's allowed).

ProjectAssignment is Project domain, not User domain, so those two
lookups (list_available_employees/list_available_managers need "who is
assigned to ANY project") go through project_repository instead.
"""
import csv
import io
import logging
import secrets

from openpyxl import load_workbook
from pydantic import ValidationError
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.exceptions import NotFoundError, ConflictError, BadRequestError
from app.core.mailer import send_welcome_email
from app.core.roles import Roles

from app.models.user import User
from app.core.security import hash_password
from app.schemas.user import UserCreate, UserUpdate, UserImportRow
from app.repositories import user_repository, project_repository

logger = logging.getLogger(__name__)


def _serialize_user(db: Session, user: User) -> dict:
    roles = user_repository.get_roles_for_user(db, user.id)

    mgr = user_repository.get_manager_assignment(db, user.id)
    manager_name = None
    manager_id = None
    if mgr:
        manager_id = mgr.manager_id
        manager = user_repository.get_by_id(db, mgr.manager_id)
        manager_name = manager.name if manager else None

    pw = user_repository.get_password_by_user_id(db, user.id)

    return {
        "id": user.id,
        "userid": user.userid,
        "name": user.name,
        "company_mail": user.company_mail,
        "phone_number": user.phone_number,
        "isAlive": user.isAlive,
        "roles": roles,
        "manager_id": manager_id,
        "manager_name": manager_name,
        "username": pw.username if pw else None,
    }


def list_users(db: Session) -> list[dict]:
    users = user_repository.get_all(db)
    return [_serialize_user(db, u) for u in users]


def get_user(db: Session, user_id: int) -> dict:
    user = user_repository.get_by_id(db, user_id)
    if not user:
        raise NotFoundError("User")
    return _serialize_user(db, user)


def _get_or_create_role(db: Session, role_name: str):
    role = user_repository.get_role_by_name(db, role_name)
    if not role:
        role = user_repository.create_role(db, role_name)
    return role


def _insert_user(
    db: Session,
    *,
    userid: str,
    name: str,
    company_mail: str | None,
    phone_number: str | None,
    username: str,
    password: str,
    role: str,
    must_change_password: bool = False,
) -> User:
    """Shared insert path behind both create_user (single, from the New
    User form) and import_users (bulk, from an uploaded spreadsheet) - so
    the two never drift on what a "user" record actually requires (a
    User row, a Password row, and exactly one RoleAssignment)."""
    if user_repository.get_by_userid(db, userid):
        raise ConflictError("userid already exists")
    if user_repository.get_password_by_username(db, username):
        raise ConflictError("username already exists")

    user = user_repository.create(
        db, userid=userid, name=name, company_mail=company_mail, phone_number=phone_number
    )

    user_repository.create_password(
        db,
        user_id=user.id,
        username=username,
        hashed_password=hash_password(password),
        must_change_password=must_change_password,
    )

    role_row = _get_or_create_role(db, role)
    user_repository.assign_role(db, user.id, role_row.id)
    return user


def _send_welcome_email_if_possible(*, company_mail: str | None, name: str, username: str, password: str) -> None:
    """Best-effort - a missing email on file or a failed send should never
    fail user creation itself; the admin can always see (and, if needed,
    re-share) the username/password from the Users page regardless."""
    if not company_mail:
        logger.info("No company mail on file for username=%s - skipping welcome email", username)
        return
    login_url = f"{settings.FRONTEND_ORIGIN}/login"
    send_welcome_email(to=company_mail, name=name, username=username, password=password, login_url=login_url)


def create_user(db: Session, payload: UserCreate) -> dict:
    """Admin user creation. Deliberately does NOT accept a manager_id -
    manager assignment now only happens through the Projects page's
    'Assign Mgr' / 'Assign Emp' flow, not at user-creation time. Each user
    gets exactly one role, not a list - the Users page presents role
    selection as a single choice (radio buttons), not a multi-select.

    Once the account is committed, the login username and password are
    emailed to the company/personal mail entered on the form (see
    app/core/mailer.send_welcome_email) - this is a best-effort side
    effect and never blocks or fails the user-creation response."""
    user = _insert_user(
        db,
        userid=payload.userid,
        name=payload.name,
        company_mail=payload.company_mail,
        phone_number=payload.phone_number,
        username=payload.username,
        password=payload.password,
        role=payload.role,
    )
    user_repository.save(db)
    _send_welcome_email_if_possible(
        company_mail=payload.company_mail,
        name=payload.name,
        username=payload.username,
        password=payload.password,
    )
    return _serialize_user(db, user)


# Header aliases accepted in an uploaded import sheet, keyed by the
# canonical field name. Matching is case/space/underscore-insensitive (see
# _normalize_header) so "User ID", "user_id", and "userid" all resolve to
# the same column - the same seven fields the New User modal collects,
# just via a spreadsheet instead of the form.
_IMPORT_HEADER_ALIASES: dict[str, str] = {
    "userid": "userid",
    "user id": "userid",
    "employee id": "userid",
    "emp id": "userid",
    "name": "name",
    "full name": "name",
    "employee name": "name",
    "company mail": "company_mail",
    "company email": "company_mail",
    "email": "company_mail",
    "mail": "company_mail",
    "phone number": "phone_number",
    "phone": "phone_number",
    "mobile": "phone_number",
    "mobile number": "phone_number",
    "username": "username",
    "login username": "username",
    "password": "password",
    "role": "role",
}


def _normalize_header(value) -> str:
    return " ".join(str(value or "").strip().lower().split())


def map_import_headers(header_row: list) -> dict[int, str]:
    """Returns {column_index: canonical_field_name} for every recognized
    column in the header row; unrecognized columns are simply ignored so
    an export from this same Users table (which has extra columns like
    Status) can be re-imported without complaint."""
    mapping: dict[int, str] = {}
    for idx, cell in enumerate(header_row):
        canonical = _IMPORT_HEADER_ALIASES.get(_normalize_header(cell))
        if canonical:
            mapping[idx] = canonical
    return mapping


def parse_import_file(filename: str, content: bytes) -> list[dict]:
    """Turns an uploaded .xlsx or .csv file into a list of canonical field
    dicts (userid/name/company_mail/phone_number/username/password/role),
    using map_import_headers so the sheet's own header row - in whatever
    order the person built it in - decides which column means what.
    Completely blank rows (e.g. trailing empty rows Excel sometimes keeps)
    are skipped rather than surfacing as row-2-is-missing-everything
    errors.
    """
    lower_name = (filename or "").lower()
    rows: list[dict] = []

    if lower_name.endswith(".csv"):
        text = content.decode("utf-8-sig")
        reader = csv.reader(io.StringIO(text))
        raw_rows = list(reader)
    elif lower_name.endswith(".xlsx"):
        try:
            wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        except Exception as exc:  # noqa: BLE001
            raise BadRequestError(f"Could not read spreadsheet: {exc}")
        ws = wb.active
        raw_rows = [list(r) for r in ws.iter_rows(values_only=True)]
    else:
        raise BadRequestError("Only .xlsx or .csv files are supported for import")

    if not raw_rows:
        return []

    header_map = map_import_headers(raw_rows[0])
    if not header_map:
        raise BadRequestError(
            "No recognized columns found. Expected headers like User ID, Full Name, "
            "Company Mail, Phone Number, Login Username, Password, Role."
        )

    for raw_row in raw_rows[1:]:
        if raw_row is None or all(cell is None or str(cell).strip() == "" for cell in raw_row):
            continue
        row: dict = {}
        for idx, field in header_map.items():
            value = raw_row[idx] if idx < len(raw_row) else None
            row[field] = str(value).strip() if value is not None else ""
        rows.append(row)

    return rows


def import_users(db: Session, rows: list[dict]) -> dict:
    """Bulk-creates users from parsed spreadsheet rows (already reduced to
    canonical field-name dicts by the route via map_import_headers). Each
    row is validated and inserted independently - one bad row (duplicate
    userid, invalid email, weak password, etc.) is reported and skipped
    rather than failing the whole batch, since the whole point of a bulk
    import is that the person isn't sitting there watching it row by row.
    A missing password gets a random one generated (matching the seeded
    admin account's pattern) with must_change_password set, since forcing
    every row in the sheet to carry a real password in plain text isn't
    something to encourage.
    """
    results = []
    created = 0
    for i, raw in enumerate(rows):
        row_number = i + 2  # +1 for 1-indexing, +1 for the header row
        userid_hint = str(raw.get("userid") or "").strip() or None
        try:
            generated_password = None
            if not str(raw.get("password") or "").strip():
                generated_password = secrets.token_urlsafe(12)
                raw = {**raw, "password": generated_password}

            payload = UserImportRow(**raw)

            user = _insert_user(
                db,
                userid=payload.userid,
                name=payload.name,
                company_mail=payload.company_mail,
                phone_number=payload.phone_number,
                username=payload.username,
                password=payload.password,
                role=payload.role,
                must_change_password=generated_password is not None,
            )
            user_repository.save(db)
            created += 1
            _send_welcome_email_if_possible(
                company_mail=payload.company_mail,
                name=payload.name,
                username=payload.username,
                password=payload.password,
            )
            message = "Created"
            if generated_password is not None:
                message += f" (generated password: {generated_password} — must be changed at next login)"
            results.append(
                {"row": row_number, "userid": payload.userid, "status": "created", "message": message}
            )
        except ValidationError as exc:
            db.rollback()
            first = exc.errors()[0]
            field = ".".join(str(p) for p in first["loc"])
            results.append(
                {
                    "row": row_number,
                    "userid": userid_hint,
                    "status": "error",
                    "message": f"{field}: {first['msg']}",
                }
            )
        except ConflictError as exc:
            db.rollback()
            results.append(
                {"row": row_number, "userid": userid_hint, "status": "error", "message": str(exc)}
            )
        except Exception as exc:  # noqa: BLE001 - a single bad row must never abort the batch
            db.rollback()
            results.append(
                {"row": row_number, "userid": userid_hint, "status": "error", "message": str(exc)}
            )

    return {"created": created, "failed": len(results) - created, "results": results}


def update_user(db: Session, user_id: int, payload: UserUpdate) -> dict:
    user = user_repository.get_by_id(db, user_id)
    if not user:
        raise NotFoundError("User")

    for field in ("name", "company_mail", "phone_number", "isAlive"):
        value = getattr(payload, field)
        if value is not None:
            setattr(user, field, value)

    if payload.role is not None:
        # Replaces the user's existing role entirely - a user has exactly
        # one role at a time, so this clears any prior assignment first
        # rather than adding to it.
        user_repository.clear_role_assignments(db, user.id)
        role = _get_or_create_role(db, payload.role)
        user_repository.assign_role(db, user.id, role.id)

    user_repository.save(db)
    return _serialize_user(db, user)


def deactivate_user(db: Session, user_id: int) -> dict:
    user = user_repository.get_by_id(db, user_id)
    if not user:
        raise NotFoundError("User")
    user.isAlive = False
    user_repository.save(db)
    return _serialize_user(db, user)


def list_roles(db: Session):
    return user_repository.list_roles(db)


def team_members_for_manager(db: Session, manager_id: int) -> list[dict]:
    assignments = user_repository.get_direct_reports(db, manager_id)
    users = user_repository.get_by_ids(db, [a.user_id for a in assignments])
    return [_serialize_user(db, u) for u in users]


def list_available_employees(db: Session) -> list[dict]:
    """Employees (role='employee', not manager/admin) who are not currently
    assigned to ANY project - used by the 'Assign Emp' picker on the
    Projects page, since an employee can only be on one project at a time.
    Managers are deliberately not restricted this way - they can be
    assigned to multiple projects, so this function is employee-only."""
    employee_role = user_repository.get_role_by_name(db, Roles.EMPLOYEE)
    if not employee_role:
        return []

    employee_user_ids = user_repository.get_user_ids_with_role(db, employee_role.id)
    already_assigned_ids = {a.user_id for a in project_repository.get_all_assignments(db)}
    available_ids = employee_user_ids - already_assigned_ids

    users = [u for u in user_repository.get_by_ids(db, list(available_ids)) if u.isAlive]
    return [_serialize_user(db, u) for u in users]


def list_managers(db: Session) -> list[dict]:
    """Every user with the manager role, regardless of current project
    assignment - kept for places that need the full manager list, but the
    'Assign Mgr' picker on the Projects page uses list_available_managers
    below instead."""
    manager_role = user_repository.get_role_by_name(db, Roles.MANAGER)
    if not manager_role:
        return []
    user_ids = user_repository.get_user_ids_with_role(db, manager_role.id)
    users = [u for u in user_repository.get_by_ids(db, list(user_ids)) if u.isAlive]
    return [_serialize_user(db, u) for u in users]


def reset_password(db: Session, user_id: int, new_password: str) -> dict:
    """Admin-only - sets a user's password directly, no old password
    needed. This is the practical stand-in for 'forgot password' here,
    since there's no email/SMTP setup to send a real reset link. Strength
    is enforced at the schema layer (ResetPasswordRequest), not here."""
    pw_row = user_repository.get_password_by_user_id(db, user_id)
    if not pw_row:
        raise NotFoundError("User")

    pw_row.password = hash_password(new_password)
    pw_row.must_change_password = False
    user_repository.save(db)
    return {"status": "password reset"}


def list_available_managers(db: Session, project_id: int | None = None) -> list[dict]:
    """Managers eligible for the 'Assign Mgr' picker.

    Unlike employees, a manager is NOT restricted to a single project - one
    manager can oversee several projects at once. The restriction instead
    lives on the project's side: a project can only have one manager
    assigned to it (enforced in project_service.assign_user). So this
    returns every active manager, only excluding whoever is already the
    manager on THIS project (project_id) - already selected, nothing to
    do by picking them again. Managers who are managing some OTHER project
    are still eligible and shown here."""
    manager_role = user_repository.get_role_by_name(db, Roles.MANAGER)
    if not manager_role:
        return []

    manager_user_ids = user_repository.get_user_ids_with_role(db, manager_role.id)
    if project_id is not None:
        already_on_this_project = {
            a.user_id for a in project_repository.get_assignments_for_project(db, project_id)
        }
        manager_user_ids = manager_user_ids - already_on_this_project

    users = [u for u in user_repository.get_by_ids(db, list(manager_user_ids)) if u.isAlive]
    return [_serialize_user(db, u) for u in users]
