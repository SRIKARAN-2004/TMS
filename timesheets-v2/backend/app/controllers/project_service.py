"""
Project/Task business logic. Rules and exceptions live here; raw
SQLAlchemy queries against Projects/Project_Assignments/Tasks/Users go
through app/repositories/*.py instead of being written inline here -
those repository modules previously existed but were never imported by
any controller (dead code), and that's structurally why the
update_project one-project-rule bypass could happen in the first place:
with the rule's own enforcement (assign_user) and the raw
delete-then-recreate assignment logic living in two completely separate
places that never called each other, nothing forced update_project to
go through the one function that actually checks the rule.

The exception is composite, cross-domain read queries used purely to
shape API responses (e.g. "which of this project's assignees are
managers" - joining Project_Assignments to Roles via Users). Those don't
belong to a single table's repository, so they stay here as the layer
that composes repository calls together; the repositories themselves
remain single-table/simple-lookup only, per their own docstrings.
"""
from collections import defaultdict
from datetime import datetime, timezone
import json

from sqlalchemy.orm import Session
from app.core.exceptions import NotFoundError, PermissionDeniedError, ConflictError
from app.core.roles import Roles

from app.models.project import Project, ProjectAssignment, Task
from app.models.role import Role, RoleAssignment
from app.models.audit_log import AuditLog
from app.schemas.project import ProjectCreate, ProjectUpdate, TaskCreate, TaskUpdate
from app.repositories import project_repository, task_repository, user_repository


def _roles_for_user(db: Session, user_id: int) -> list[str]:
    rows = (
        db.query(Role.role)
        .join(RoleAssignment, RoleAssignment.role_id == Role.id)
        .filter(RoleAssignment.user_id == user_id)
        .all()
    )
    return [r[0] for r in rows]


def _roles_for_users(db: Session, user_ids: list[int]) -> dict[int, list[str]]:
    """Batched form of _roles_for_user for a whole set of users in one
    query, instead of one query per user."""
    if not user_ids:
        return {}
    rows = (
        db.query(RoleAssignment.user_id, Role.role)
        .join(Role, RoleAssignment.role_id == Role.id)
        .filter(RoleAssignment.user_id.in_(user_ids))
        .all()
    )
    out: dict[int, list[str]] = defaultdict(list)
    for user_id, role in rows:
        out[user_id].append(role)
    return out


def _serialize_projects_batch(db: Session, projects: list[Project]) -> list[dict]:
    """Serializes a whole list of projects in a fixed small number of
    queries, regardless of how many projects or assignees there are.

    Previously _serialize_project ran one query for a project's
    assignments, then one more query per assignee to load that User, then
    one more per assignee to load their roles - for a list of N projects
    with M assignees each, that's roughly N*M*2 extra queries on top of the
    original list query. This batches each of those lookups into a single
    IN(...) query up front (via the repository layer) and assembles
    everything from in-memory dicts.
    """
    if not projects:
        return []

    project_ids = [p.id for p in projects]

    assignments = project_repository.get_assignments_for_projects(db, project_ids)
    assignments_by_project: dict[int, list[ProjectAssignment]] = defaultdict(list)
    all_user_ids: set[int] = set()
    for a in assignments:
        assignments_by_project[a.project_id].append(a)
        all_user_ids.add(a.user_id)

    users_by_id = {u.id: u for u in user_repository.get_by_ids(db, list(all_user_ids))}
    roles_by_user = _roles_for_users(db, list(all_user_ids))
    task_counts = task_repository.get_active_counts_for_projects(db, project_ids)

    results = []
    for project in projects:
        managers = []
        employees = []
        for a in assignments_by_project.get(project.id, []):
            u = users_by_id.get(a.user_id)
            if not u:
                continue
            roles = roles_by_user.get(u.id, [])
            entry = {"id": u.id, "name": u.name}
            if Roles.MANAGER in roles or Roles.ADMIN in roles:
                managers.append(entry)
            else:
                employees.append(entry)

        results.append({
            "id": project.id,
            "code": f"P{project.id:03d}",
            "name": project.name,
            "start_date": project.start_date,
            "end_date": project.end_date,
            "status": project.status,
            "manager_name": managers[0]["name"] if managers else None,
            "manager_id": managers[0]["id"] if managers else None,
            "managers": managers,
            "employees": employees,
            "members": [e["name"] for e in managers + employees],
            "team_count": len(managers) + len(employees),
            "task_count": task_counts.get(project.id, 0),
        })
    return results


def _serialize_project(db: Session, project: Project) -> dict:
    return _serialize_projects_batch(db, [project])[0]


def list_projects(db: Session) -> list[dict]:
    return _serialize_projects_batch(db, project_repository.get_all(db))


def list_projects_for_user(db: Session, user_id: int) -> list[dict]:
    ids = [a.project_id for a in project_repository.get_assignments_for_user(db, user_id)]
    projects = project_repository.get_by_ids(db, ids)
    return _serialize_projects_batch(db, projects)


def create_project(db: Session, payload: ProjectCreate) -> dict:
    project = project_repository.create(
        db,
        name=payload.name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status,
    )
    project_repository.save(db)

    # Routed through assign_user (rather than inserting ProjectAssignment
    # rows directly, as before) so the one-project-per-user rule actually
    # applies at creation time too - this was the other half of the bypass
    # described on update_project below.
    skipped = []
    for uid in payload.member_ids:
        try:
            assign_user(db, project.id, uid)
        except (NotFoundError, ConflictError) as exc:
            skipped.append({"user_id": uid, "reason": str(exc.detail)})

    result = get_project(db, project.id)
    if skipped:
        result["skipped_members"] = skipped
    return result


def update_project(db: Session, project_id: int, payload: ProjectUpdate) -> dict:
    project = project_repository.get_by_id(db, project_id)
    if not project:
        raise NotFoundError("Project")

    for field in ("name", "start_date", "end_date", "status"):
        value = getattr(payload, field)
        if value is not None:
            setattr(project, field, value)
    project_repository.save(db)

    skipped = []
    if payload.member_ids is not None:
        # Previously this did a raw delete-then-recreate of every
        # ProjectAssignment row for the project, which completely bypassed
        # the one-project-per-user rule assign_user enforces - a manager
        # could set member_ids to include someone already assigned
        # elsewhere and they'd be silently moved, with no check and no
        # error. Now only the actual diff is applied, and every added user
        # goes through assign_user so the same rule (and its row lock,
        # closing the TOCTOU race - see assign_user) applies here too.
        current_ids = {a.user_id for a in project_repository.get_assignments_for_project(db, project_id)}
        target_ids = set(payload.member_ids)

        for uid in target_ids - current_ids:
            try:
                assign_user(db, project_id, uid)
            except (NotFoundError, ConflictError) as exc:
                skipped.append({"user_id": uid, "reason": str(exc.detail)})

        for uid in current_ids - target_ids:
            unassign_user(db, project_id, uid)

    result = get_project(db, project_id)
    if skipped:
        result["skipped_members"] = skipped
    return result


def _sync_manager_assignments_for_project(db: Session, project_id: int) -> None:
    """Keeps Manager_Assignments in sync with project membership.

    There's no standalone "assign a manager to an employee" UI - the only
    place a manager/employee relationship is ever established is by both
    of them being assigned to the same project. This derives that
    relationship automatically instead of leaving Manager_Assignments
    permanently empty: whoever holds the MANAGER role on this project (if
    any) becomes the direct manager of every non-manager, non-admin
    member. Runs after every assign/unassign so it stays correct
    regardless of ordering - manager added before or after employees,
    manager swapped for another, etc.

    This powers /manager/team (team_members_for_manager) and is a second,
    independent path (alongside the ProjectAssignment check already in
    time_log_service) for the manager-oversight checks on time logs.
    """
    assignments = project_repository.get_assignments_for_project(db, project_id)
    user_ids = [a.user_id for a in assignments]
    roles_by_user = _roles_for_users(db, user_ids)

    manager_id = next(
        (uid for uid in user_ids if Roles.MANAGER in roles_by_user.get(uid, [])), None
    )

    for uid in user_ids:
        roles = roles_by_user.get(uid, [])
        if Roles.MANAGER in roles or Roles.ADMIN in roles:
            continue  # managers/admins aren't "managed" by this sync
        user_repository.clear_manager_assignment(db, uid)
        if manager_id is not None:
            user_repository.set_manager(db, uid, manager_id)


def assign_user(db: Session, project_id: int, user_id: int) -> dict:
    """Used by both 'Assign Mgr' and 'Assign Emp' actions - which bucket the
    user lands in is decided purely by their existing role, so this is a
    single operation under the hood.

    Rules:
    - Employees can only be assigned to ONE project at a time. Trying to
      assign one already on a different project is rejected outright
      rather than silently moving them, since a silent move could make
      their existing logged time quietly disappear from whoever was
      managing that other project.
    - Managers are NOT capped at one project - a single manager can be
      assigned to (and oversee) several projects at once. Instead, the
      restriction sits on the project's side: a project can only have ONE
      manager assigned to it at a time. Assigning a second, different
      manager to an already-managed project is rejected the same way, so
      the "who does this project's Manager_Assignments-derived team
      report to" question (see _sync_manager_assignments_for_project)
      always has exactly one unambiguous answer.
    - Admins are exempt from both restrictions.
    """
    project = project_repository.get_by_id(db, project_id)
    if not project:
        raise NotFoundError("Project")

    # Row-level lock on the target user for the rest of this transaction.
    # Without this, two concurrent assign_user calls for the same user
    # (e.g. two managers both racing to add them to their own project)
    # could both run the "already assigned elsewhere?" check before either
    # had inserted its row, both see no conflict, and both succeed -
    # leaving the user on two projects despite the one-project rule. The
    # lock forces the second transaction to wait for the first to commit
    # (or roll back) before it can even read the row, so it sees the
    # first transaction's assignment when it re-checks.
    user = user_repository.get_by_ids_locked(db, user_id)
    if not user:
        raise NotFoundError("User")

    roles = _roles_for_user(db, user_id)
    is_admin = Roles.ADMIN in roles
    is_manager = Roles.MANAGER in roles and not is_admin

    if not is_admin and not is_manager:
        # Employee: capped at one project at a time.
        other_assignment = next(
            (a for a in project_repository.get_assignments_for_user(db, user_id) if a.project_id != project_id),
            None,
        )
        if other_assignment:
            other_project = project_repository.get_by_id(db, other_assignment.project_id)
            raise ConflictError(
                f"{user.name} is already assigned to '{other_project.name if other_project else 'another project'}'. "
                "Unassign them there first before adding them here."
            )

    if is_manager:
        # Project-side cap: only one manager per project. A manager can
        # freely be assigned to other projects elsewhere, but not to a
        # second manager slot on this same one.
        existing_assignments = [
            a for a in project_repository.get_assignments_for_project(db, project_id) if a.user_id != user_id
        ]
        if existing_assignments:
            existing_roles = _roles_for_users(db, [a.user_id for a in existing_assignments])
            existing_manager_id = next(
                (uid for uid, r in existing_roles.items() if Roles.MANAGER in r and Roles.ADMIN not in r), None
            )
            if existing_manager_id is not None:
                existing_manager = user_repository.get_by_id(db, existing_manager_id)
                raise ConflictError(
                    f"'{project.name}' already has a manager assigned "
                    f"({existing_manager.name if existing_manager else 'someone'}). "
                    "Unassign them first before assigning a new manager."
                )

    existing = project_repository.get_assignment(db, project_id, user_id)
    if not existing:
        project_repository.add_assignment(db, project_id, user_id)
    _sync_manager_assignments_for_project(db, project_id)
    project_repository.save(db)  # commits either way, releasing the row lock even when nothing new was inserted

    return _serialize_project(db, project)


def assign_many_users(db: Session, project_id: int, user_ids: list[int]) -> dict:
    """Bulk version of assign_user, for the multi-select 'Assign Employee'
    picker - assigns each user one at a time, collecting which ones
    succeeded and which were rejected (e.g. already on another project)
    rather than failing the whole batch on the first conflict."""
    assigned = []
    skipped = []
    for user_id in user_ids:
        try:
            assign_user(db, project_id, user_id)
            assigned.append(user_id)
        except (NotFoundError, ConflictError) as exc:
            skipped.append({"user_id": user_id, "reason": str(exc.detail)})

    project = project_repository.get_by_id(db, project_id)
    result = _serialize_project(db, project)
    result["assigned_count"] = len(assigned)
    result["skipped"] = skipped
    return result


def assign_employees_as_manager(db: Session, project_id: int, manager_id: int, user_ids: list[int]) -> dict:
    """Manager-facing equivalent of assign_many_users.

    Managers can add employees to their own project (mirrors what Admin's
    'Assign Employee' picker does), but with two extra restrictions Admin
    isn't subject to:
    - The project has to actually be theirs (get_project_for_user 403s
      otherwise, same guard every other manager project route uses).
    - Only EMPLOYEE-role users can be assigned this way - a manager
      shouldn't be able to add another manager or an admin to their
      project through this endpoint, so anyone else in the id list is
      rejected up front and reported back the same way assign_many_users
      already reports "already on another project" rejections, rather
      than silently dropped.
    """
    get_project_for_user(db, project_id, manager_id)  # 403s if not their project

    employee_ids = []
    skipped = []
    for user_id in user_ids:
        roles = _roles_for_user(db, user_id)
        if Roles.EMPLOYEE in roles and Roles.MANAGER not in roles and Roles.ADMIN not in roles:
            employee_ids.append(user_id)
        else:
            skipped.append({"user_id": user_id, "reason": "Only employees can be assigned to a project by a manager."})

    result = assign_many_users(db, project_id, employee_ids)
    result["skipped"] = skipped + result["skipped"]
    return result


def unassign_employee_as_manager(db: Session, project_id: int, manager_id: int, user_id: int) -> dict:
    """Manager-facing equivalent of unassign_user - same "has to be your
    own project" guard as assign_employees_as_manager, plus it refuses to
    let a manager unassign anyone who isn't an employee (so a manager
    can't use this to remove themselves, or another manager/admin who
    happens to be on the same project, from Manager's UI)."""
    get_project_for_user(db, project_id, manager_id)  # 403s if not their project

    roles = _roles_for_user(db, user_id)
    if Roles.EMPLOYEE not in roles or Roles.MANAGER in roles or Roles.ADMIN in roles:
        raise PermissionDeniedError("Only employees can be unassigned from a project by a manager.")

    return unassign_user(db, project_id, user_id)


def unassign_user(db: Session, project_id: int, user_id: int) -> dict:
    project = project_repository.get_by_id(db, project_id)
    if not project:
        raise NotFoundError("Project")

    project_repository.remove_assignment(db, project_id, user_id)
    # Clear this user's own manager assignment outright - _sync below only
    # re-derives it for users still on the project, so the removed user
    # (whether they were the employee or the manager) needs handling here.
    user_repository.clear_manager_assignment(db, user_id)
    _sync_manager_assignments_for_project(db, project_id)
    project_repository.save(db)
    return _serialize_project(db, project)


def get_project(db: Session, project_id: int) -> dict:
    project = project_repository.get_by_id(db, project_id)
    if not project:
        raise NotFoundError("Project")
    return _serialize_project(db, project)


def get_project_for_user(db: Session, project_id: int, user_id: int) -> dict:
    is_member = project_repository.get_assignment(db, project_id, user_id) is not None
    if not is_member:
        raise PermissionDeniedError("You are not assigned to this project")
    return get_project(db, project_id)


def delete_project(db: Session, project_id: int, performed_by: int | None = None):
    project = project_repository.get_by_id(db, project_id)
    if not project:
        raise NotFoundError("Project")

    # Snapshot before anything is removed - see AuditLog. A project delete
    # cascades to its assignments and tasks below, all of which vanish with
    # no other record once committed.
    member_ids = [a.user_id for a in project_repository.get_assignments_for_project(db, project_id)]
    task_ids = [t.id for t in task_repository.get_all(db, project_id=project_id)]
    snapshot = {
        "id": project.id,
        "name": project.name,
        "start_date": str(project.start_date) if project.start_date else None,
        "end_date": str(project.end_date) if project.end_date else None,
        "status": project.status,
        "member_ids": member_ids,
        "task_ids": task_ids,
    }
    db.add(AuditLog(
        entity_type="project",
        entity_id=project_id,
        action="deleted",
        performed_by=performed_by,
        snapshot=json.dumps(snapshot),
    ))

    for uid in member_ids:
        user_repository.clear_manager_assignment(db, uid)
    project_repository.clear_assignments_for_project(db, project_id)
    task_repository.delete(db, project_id)
    project_repository.delete(db, project)
    project_repository.save(db)
    return {"deleted": True}


# --- Tasks ---

def _manager_names_for_projects(db: Session, project_ids: list[int]) -> dict[int, str | None]:
    """Batched replacement for calling the full _serialize_project() (which
    itself issued several queries) once per task just to read off a single
    manager_name field. One query for assignments in these projects, one
    for the assignees' roles, done."""
    if not project_ids:
        return {}
    assignments = project_repository.get_assignments_for_projects(db, project_ids)
    user_ids = list({a.user_id for a in assignments})
    users_by_id = {u.id: u for u in user_repository.get_by_ids(db, user_ids)}
    roles_by_user = _roles_for_users(db, user_ids)

    manager_name_by_project: dict[int, str | None] = {}
    for a in assignments:
        if a.project_id in manager_name_by_project:
            continue
        roles = roles_by_user.get(a.user_id, [])
        if Roles.MANAGER in roles or Roles.ADMIN in roles:
            u = users_by_id.get(a.user_id)
            if u:
                manager_name_by_project[a.project_id] = u.name
    return manager_name_by_project


def _task_created_at_utc(dt: datetime | None) -> datetime | None:
    """Same naive-datetime fix as time_log_service._as_utc - MySQL hands
    DateTime columns back with no tzinfo via PyMySQL even though the
    server default is UTC, and a timestamp with no 'Z'/offset suffix gets
    silently misread as local time by `new Date(...)` on the frontend."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _serialize_tasks_batch(db: Session, tasks: list[Task]) -> list[dict]:
    if not tasks:
        return []
    project_ids = list({t.project_id for t in tasks})
    projects_by_id = {p.id: p for p in project_repository.get_by_ids(db, project_ids)}
    manager_names = _manager_names_for_projects(db, project_ids)

    results = []
    for task in tasks:
        project = projects_by_id.get(task.project_id)
        results.append({
            "id": task.id,
            "project_id": task.project_id,
            "project_name": project.name if project else None,
            "name": task.name,
            "description": task.description,
            "isAlive": task.isAlive,
            "manager_name": manager_names.get(task.project_id),
            "created_at": _task_created_at_utc(task.created_at),
        })
    return results


def _serialize_task(db: Session, task: Task) -> dict:
    return _serialize_tasks_batch(db, [task])[0]


def list_tasks(
    db: Session, project_id: int | None = None, search: str | None = None, is_alive: bool | None = None
) -> list[dict]:
    tasks = task_repository.get_all(db, project_id=project_id, search=search, is_alive=is_alive)
    return _serialize_tasks_batch(db, tasks)


def list_tasks_for_user_projects(
    db: Session,
    user_id: int,
    project_id: int | None = None,
    search: str | None = None,
    is_alive: bool | None = None,
) -> list[dict]:
    """Scoped task list for managers/employees - only tasks belonging to
    projects that user_id is actually assigned to (via Project_Assignments),
    not every task in the database. This is what fixes every manager
    otherwise seeing the exact same global task list regardless of their
    real assignments."""
    project_ids = [a.project_id for a in project_repository.get_assignments_for_user(db, user_id)]
    if project_id is not None:
        if project_id not in project_ids:
            return []
        project_ids = [project_id]
    if not project_ids:
        return []
    tasks = task_repository.get_all(db, project_ids=project_ids, search=search, is_alive=is_alive)
    return _serialize_tasks_batch(db, tasks)


def verify_manager_owns_task(db: Session, task_id: int, manager_id: int) -> None:
    """Raises NotFoundError if the task doesn't exist, or PermissionDeniedError
    if it belongs to a project this manager isn't assigned to. Used to stop
    one manager editing/deleting tasks that belong to another manager's
    project."""
    task = task_repository.get_by_id(db, task_id)
    if not task:
        raise NotFoundError("Task")
    get_project_for_user(db, task.project_id, manager_id)  # raises PermissionDeniedError if not a member


def create_task(db: Session, payload: TaskCreate) -> dict:
    task = task_repository.create(
        db, project_id=payload.project_id, name=payload.name, description=payload.description
    )
    task_repository.save(db)
    return _serialize_task(db, task)


def update_task(db: Session, task_id: int, payload: TaskUpdate) -> dict:
    task = task_repository.get_by_id(db, task_id)
    if not task:
        raise NotFoundError("Task")
    for field in ("name", "description", "isAlive"):
        value = getattr(payload, field)
        if value is not None:
            setattr(task, field, value)
    task_repository.save(db)
    return _serialize_task(db, task)


def delete_task(db: Session, task_id: int):
    task = task_repository.get_by_id(db, task_id)
    if not task:
        raise NotFoundError("Task")
    task.isAlive = False
    task_repository.save(db)
    return {"deleted": True}
