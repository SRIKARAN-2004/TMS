from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date

from app.db.session import get_db
from app.dependencies.auth import require_roles
from app.core.roles import Roles
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectOut, TaskCreate, TaskUpdate, TaskOut, AssignUsersRequest
from app.schemas.time_log import TimeLogOut, TimeLogReject, TimeLogCreateFor, TimeLogUpdate
from app.schemas.user import UserOut
from app.controllers import project_service, time_log_service, user_service

router = APIRouter(prefix="/manager", tags=["Manager"], dependencies=[Depends(require_roles(Roles.MANAGER, Roles.ADMIN))])


@router.get("/team", response_model=list[UserOut])
def my_team(current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)), db: Session = Depends(get_db)):
    return user_service.team_members_for_manager(db, current_user.id)


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)), db: Session = Depends(get_db)):
    """Scoped to projects this manager is actually assigned to - previously
    this called the unscoped admin listing, which meant every manager saw
    every project in the org regardless of their real assignments."""
    return project_service.list_projects_for_user(db, current_user.id)


@router.post("/projects", response_model=ProjectOut)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    return project_service.create_project(db, payload)


@router.put("/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    project_service.get_project_for_user(db, project_id, current_user.id)  # 403s if not their project
    return project_service.update_project(db, project_id, payload)


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    return project_service.get_project_for_user(db, project_id, current_user.id)


@router.get("/available-employees", response_model=list[UserOut])
def available_employees(db: Session = Depends(get_db)):
    """Same 'not currently on any project' pool Admin's picker uses -
    availability isn't manager-scoped, it's org-wide, since an employee
    can only ever be on one project regardless of who's looking."""
    return user_service.list_available_employees(db)


@router.post("/projects/{project_id}/assign-many")
def assign_employees_to_project(
    project_id: int,
    payload: AssignUsersRequest,
    current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    """Lets a manager assign one or more free employees to their own
    project - the same multi-select flow Admin's 'Assign Employee' picker
    uses, just scoped to a project the manager actually owns and
    restricted to employees only (see assign_employees_as_manager)."""
    return project_service.assign_employees_as_manager(db, project_id, current_user.id, payload.user_ids)


@router.delete("/projects/{project_id}/assign/{user_id}", response_model=ProjectOut)
def unassign_employee_from_project(
    project_id: int,
    user_id: int,
    current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    return project_service.unassign_employee_as_manager(db, project_id, current_user.id, user_id)


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(
    project_id: int | None = None,
    search: str | None = None,
    is_alive: bool | None = None,
    current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    return project_service.list_tasks_for_user_projects(db, current_user.id, project_id, search, is_alive)


@router.post("/tasks", response_model=TaskOut)
def create_task(
    payload: TaskCreate,
    current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    project_service.get_project_for_user(db, payload.project_id, current_user.id)  # 403s if not their project
    return project_service.create_task(db, payload)


@router.put("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    project_service.verify_manager_owns_task(db, task_id, current_user.id)
    return project_service.update_task(db, task_id, payload)


@router.delete("/tasks/{task_id}")
def delete_task(
    task_id: int,
    current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    project_service.verify_manager_owns_task(db, task_id, current_user.id)
    return project_service.delete_task(db, task_id)


@router.get("/time-logs", response_model=list[TimeLogOut])
def team_time_logs(
    project_id: int | None = None,
    user_id: int | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    """Time logs for everyone this manager directly manages (Manager_Assignments)."""
    return time_log_service.list_logs_for_manager_team(
        db, current_user.id, project_id, user_id, status, date_from, date_to
    )


@router.post("/time-logs", response_model=TimeLogOut)
def log_time_for_team_member(
    payload: TimeLogCreateFor,
    current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    """Lets a manager log time on behalf of a member of their own team -
    previously the 'Log Time' action on this page always logged as the
    manager themselves regardless of which employee the UI implied it was
    for."""
    return time_log_service.create_log_on_behalf(db, current_user.id, payload)


@router.put("/time-logs/{log_id}", response_model=TimeLogOut)
def update_team_time_log(
    log_id: int,
    payload: TimeLogUpdate,
    current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    """Lets a manager edit any time log within their team oversight (direct
    reports, or anyone who logged against one of the manager's projects) -
    previously there was no manager-scoped edit endpoint at all, so this
    page could only ever edit the manager's own entries via the employee
    route."""
    return time_log_service.manager_update_log(db, log_id, current_user.id, payload)


@router.delete("/time-logs/{log_id}")
def delete_team_time_log(
    log_id: int,
    current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    """Same team-oversight scope as update_team_time_log above, for delete."""
    return time_log_service.manager_delete_log(db, log_id, current_user.id)


@router.put("/time-logs/{log_id}/approve", response_model=TimeLogOut)
def approve_time_log(
    log_id: int,
    current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    return time_log_service.approve_log(db, log_id, current_user.id)


@router.put("/time-logs/{log_id}/reject", response_model=TimeLogOut)
def reject_time_log(
    log_id: int,
    payload: TimeLogReject,
    current_user: User = Depends(require_roles(Roles.MANAGER, Roles.ADMIN)),
    db: Session = Depends(get_db),
):
    return time_log_service.reject_log(db, log_id, current_user.id, payload.reason)
