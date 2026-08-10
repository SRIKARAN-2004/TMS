from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session
from datetime import date

from app.db.session import get_db
from app.dependencies.auth import require_roles
from app.core.roles import Roles
from app.schemas.user import UserCreate, UserUpdate, UserOut, RoleOut, UserImportSummary
from app.schemas.auth import ResetPasswordRequest
from app.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectOut,
    TaskCreate,
    TaskUpdate,
    TaskOut,
    AssignUserRequest,
    AssignUsersRequest,
)
from app.schemas.time_log import TimeLogOut, TimeLogUpdate, TimeLogReject, TimeLogCreateFor
from app.models.user import User
from app.controllers import user_service, project_service, time_log_service

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_roles(Roles.ADMIN))])


# --- Users ---
@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    return user_service.list_users(db)


@router.post("/users", response_model=UserOut)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    return user_service.create_user(db, payload)


@router.post("/users/import", response_model=UserImportSummary)
async def import_users(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Bulk-create users from an uploaded .xlsx/.csv sheet whose header
    row uses (some spelling of) the same fields as the New User form:
    User ID, Full Name, Company Mail, Phone Number, Login Username,
    Password, Role. Each row is created independently - a bad row is
    reported in the response's `results` list rather than failing the
    whole file."""
    content = await file.read()
    rows = user_service.parse_import_file(file.filename or "", content)
    return user_service.import_users(db, rows)


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    return user_service.get_user(db, user_id)


@router.get("/available-employees", response_model=list[UserOut])
def available_employees(db: Session = Depends(get_db)):
    """Employees not currently assigned to any project - powers the
    'Assign Emp' picker, since an employee can only be on one project."""
    return user_service.list_available_employees(db)


@router.get("/managers", response_model=list[UserOut])
def managers(db: Session = Depends(get_db)):
    """Every user with the manager role, regardless of project assignment."""
    return user_service.list_managers(db)


@router.get("/available-managers", response_model=list[UserOut])
def available_managers(project_id: int | None = None, db: Session = Depends(get_db)):
    """Powers the 'Assign Mgr' picker. A manager can be assigned to
    multiple projects, so this returns every active manager except whoever
    is already the manager on `project_id` (if given) - the picker's job
    is just to avoid re-selecting the project's current manager, not to
    hide managers busy elsewhere."""
    return user_service.list_available_managers(db, project_id)


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)):
    return user_service.update_user(db, user_id, payload)


@router.delete("/users/{user_id}", response_model=UserOut)
def deactivate_user(user_id: int, db: Session = Depends(get_db)):
    return user_service.deactivate_user(db, user_id)


@router.put("/users/{user_id}/reset-password")
def reset_user_password(user_id: int, payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Admin sets a user's password directly - the stand-in for 'forgot
    password' here, since there's no email/SMTP setup for real reset links."""
    return user_service.reset_password(db, user_id, payload.new_password)


# --- Roles ---
@router.get("/roles", response_model=list[RoleOut])
def list_roles(db: Session = Depends(get_db)):
    return user_service.list_roles(db)


# --- Projects ---
@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return project_service.list_projects(db)


@router.post("/projects", response_model=ProjectOut)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    return project_service.create_project(db, payload)


@router.put("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)):
    return project_service.update_project(db, project_id, payload)


@router.delete("/projects/{project_id}")
def delete_project(
    project_id: int,
    current_user: User = Depends(require_roles(Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    return project_service.delete_project(db, project_id, performed_by=current_user.id)


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    return project_service.get_project(db, project_id)


@router.post("/projects/{project_id}/assign", response_model=ProjectOut)
def assign_to_project(project_id: int, payload: AssignUserRequest, db: Session = Depends(get_db)):
    """Used for both 'Assign Mgr' and 'Assign Emp' - the user's existing
    role decides which bucket they show up in on the frontend."""
    return project_service.assign_user(db, project_id, payload.user_id)


@router.post("/projects/{project_id}/assign-many")
def assign_many_to_project(project_id: int, payload: AssignUsersRequest, db: Session = Depends(get_db)):
    """Bulk version for the multi-select 'Assign Employee' picker - assigns
    each selected employee, skipping (and reporting) any that are already
    on another project rather than failing the whole batch."""
    return project_service.assign_many_users(db, project_id, payload.user_ids)


@router.delete("/projects/{project_id}/assign/{user_id}", response_model=ProjectOut)
def unassign_from_project(project_id: int, user_id: int, db: Session = Depends(get_db)):
    return project_service.unassign_user(db, project_id, user_id)


# --- Tasks ---
@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(project_id: int | None = None, search: str | None = None, is_alive: bool | None = None, db: Session = Depends(get_db)):
    return project_service.list_tasks(db, project_id, search, is_alive)


@router.post("/tasks", response_model=TaskOut)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)):
    return project_service.create_task(db, payload)


@router.put("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)):
    return project_service.update_task(db, task_id, payload)


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    return project_service.delete_task(db, task_id)


# --- Time logs (admin can view, and edit/delete ANY entry - is_privileged
# bypasses the "only your own logs" check that applies on the employee routes) ---
@router.get("/time-logs", response_model=list[TimeLogOut])
def all_time_logs(
    project_id: int | None = None,
    user_id: int | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    return time_log_service.list_all_logs(db, project_id, user_id, status, date_from, date_to)


@router.post("/time-logs", response_model=TimeLogOut)
def log_time_for_any_user(
    payload: TimeLogCreateFor,
    current_user: User = Depends(require_roles(Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    """Admin can log time on behalf of anyone in the org - previously the
    'Log Time' action on this page always logged as the admin themselves
    regardless of which employee the (always-disabled) Employee field
    implied it was for."""
    return time_log_service.create_log_on_behalf(db, current_user.id, payload, is_privileged=True)


@router.put("/time-logs/{log_id}", response_model=TimeLogOut)
def update_any_time_log(
    log_id: int,
    payload: TimeLogUpdate,
    current_user: User = Depends(require_roles(Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    return time_log_service.update_log(db, log_id, current_user.id, payload, is_privileged=True)


@router.delete("/time-logs/{log_id}")
def delete_any_time_log(
    log_id: int,
    current_user: User = Depends(require_roles(Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    return time_log_service.delete_log(db, log_id, current_user.id, is_privileged=True)


@router.put("/time-logs/{log_id}/approve", response_model=TimeLogOut)
def approve_any_time_log(
    log_id: int,
    current_user: User = Depends(require_roles(Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    return time_log_service.approve_log(db, log_id, current_user.id, is_privileged=True)


@router.put("/time-logs/{log_id}/reject", response_model=TimeLogOut)
def reject_any_time_log(
    log_id: int,
    payload: TimeLogReject,
    current_user: User = Depends(require_roles(Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    return time_log_service.reject_log(db, log_id, current_user.id, payload.reason, is_privileged=True)
