from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date

from app.db.session import get_db
from app.dependencies.auth import require_roles
from app.core.roles import Roles
from app.models.user import User
from app.schemas.project import ProjectOut, TaskOut
from app.schemas.time_log import TimeLogOut, TimeLogCreate, TimeLogUpdate
from app.schemas.user import UserOut, UserUpdate
from app.schemas.auth import ChangePasswordRequest
from app.controllers import project_service, time_log_service, user_service, auth_service

router = APIRouter(
    prefix="/employee",
    tags=["Employee"],
    dependencies=[Depends(require_roles(Roles.EMPLOYEE, Roles.MANAGER, Roles.ADMIN))],
)


@router.put("/change-password")
def change_my_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(require_roles(Roles.EMPLOYEE, Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    """Self-service, works identically for admin/manager/employee - requires
    the current password, unlike the admin-only reset on /admin/users/{id}/reset-password."""
    return auth_service.change_password(db, current_user.id, payload.current_password, payload.new_password)


@router.get("/profile", response_model=UserOut)
def my_profile(current_user: User = Depends(require_roles(Roles.EMPLOYEE, Roles.MANAGER, Roles.ADMIN)), db: Session = Depends(get_db)):
    return user_service.get_user(db, current_user.id)


@router.put("/profile", response_model=UserOut)
def update_my_profile(
    payload: UserUpdate,
    current_user: User = Depends(require_roles(Roles.EMPLOYEE, Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    # Employees may only touch their own contact info - not their role or
    # active status.
    safe_payload = UserUpdate(
        name=payload.name,
        company_mail=payload.company_mail,
        phone_number=payload.phone_number,
    )
    return user_service.update_user(db, current_user.id, safe_payload)


@router.get("/my-projects", response_model=list[ProjectOut])
def my_projects(current_user: User = Depends(require_roles(Roles.EMPLOYEE, Roles.MANAGER, Roles.ADMIN)), db: Session = Depends(get_db)):
    return project_service.list_projects_for_user(db, current_user.id)


@router.get("/my-projects/{project_id}", response_model=ProjectOut)
def my_project_detail(
    project_id: int,
    current_user: User = Depends(require_roles(Roles.EMPLOYEE, Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    """Scoped to the employee's own assignments - an employee can only view
    the details of a project they're actually on."""
    return project_service.get_project_for_user(db, project_id, current_user.id)


@router.get("/tasks", response_model=list[TaskOut])
def tasks_for_project(
    project_id: int | None = None,
    search: str | None = None,
    is_alive: bool | None = None,
    current_user: User = Depends(require_roles(Roles.EMPLOYEE, Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    """Scoped to the employee's own project assignments - previously this
    called the unscoped project_service.list_tasks(), the same function the
    admin router uses, letting any employee read tasks for an arbitrary
    project_id (or every task in the org if project_id was omitted).
    search/is_alive are optional filters on top of that scoping."""
    return project_service.list_tasks_for_user_projects(db, current_user.id, project_id, search, is_alive)


@router.get("/time-logs", response_model=list[TimeLogOut])
def my_time_logs(
    project_id: int | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    current_user: User = Depends(require_roles(Roles.EMPLOYEE, Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    return time_log_service.list_logs_for_user(db, current_user.id, project_id, status, date_from, date_to)


@router.post("/time-logs", response_model=TimeLogOut)
def log_time(
    payload: TimeLogCreate,
    current_user: User = Depends(require_roles(Roles.EMPLOYEE, Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    return time_log_service.create_log(db, current_user.id, payload)


@router.put("/time-logs/{log_id}", response_model=TimeLogOut)
def edit_my_time_log(
    log_id: int,
    payload: TimeLogUpdate,
    current_user: User = Depends(require_roles(Roles.EMPLOYEE, Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    return time_log_service.update_log(db, log_id, current_user.id, payload)


@router.delete("/time-logs/{log_id}")
def delete_my_time_log(
    log_id: int,
    current_user: User = Depends(require_roles(Roles.EMPLOYEE, Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    return time_log_service.delete_log(db, log_id, current_user.id)
