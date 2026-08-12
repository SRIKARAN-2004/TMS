from datetime import datetime, timezone, date, timedelta
import json

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, PermissionDeniedError, BadRequestError
from app.models.time_log import TimeLog
from app.models.user import User
from app.models.project import Project, Task, ProjectAssignment
from app.models.role import ManagerAssignment, Role, RoleAssignment
from app.models.audit_log import AuditLog
from app.schemas.time_log import TimeLogCreate, TimeLogCreateFor, TimeLogUpdate
from app.core.roles import Roles


# These are physical validation limits only.
# There is NO 8-hour overtime rule here.

FUTURE_START_GRACE_MINUTES = 60
PRIVILEGED_FUTURE_START_GRACE_DAYS = 365


def _as_utc(dt: datetime | None) -> datetime | None:
    """Return a datetime normalized to timezone-aware UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _roles_for_users(db: Session, user_ids) -> dict[int, list[str]]:
    """Batched role lookup."""
    if not user_ids:
        return {}

    rows = (
        db.query(RoleAssignment.user_id, Role.role)
        .join(Role, RoleAssignment.role_id == Role.id)
        .filter(RoleAssignment.user_id.in_(user_ids))
        .all()
    )

    out: dict[int, list[str]] = {}
    for user_id, role in rows:
        out.setdefault(user_id, []).append(role)
    return out


def _project_managers(db: Session, project_ids) -> dict[int, tuple[int, str]]:
    """Find the current manager for each project."""
    if not project_ids:
        return {}

    assignments = (
        db.query(ProjectAssignment)
        .filter(ProjectAssignment.project_id.in_(project_ids))
        .all()
    )

    member_ids = {a.user_id for a in assignments}
    roles_by_user = _roles_for_users(db, member_ids)

    users_by_id = (
        {
            u.id: u
            for u in db.query(User).filter(User.id.in_(member_ids)).all()
        }
        if member_ids
        else {}
    )

    out: dict[int, tuple[int, str]] = {}

    for assignment in assignments:
        if assignment.project_id in out:
            continue

        roles = roles_by_user.get(assignment.user_id, [])

        if Roles.MANAGER in roles and Roles.ADMIN not in roles:
            user = users_by_id.get(assignment.user_id)
            if user:
                out[assignment.project_id] = (user.id, user.name)

    return out


def _serialize_logs_batch(db: Session, logs: list[TimeLog]) -> list[dict]:
    """Serialize a list of time logs using batched related-object lookups."""
    if not logs:
        return []

    user_ids = {log.user_id for log in logs if log.user_id is not None}
    project_ids = {log.project_id for log in logs if log.project_id is not None}
    task_ids = {log.task_id for log in logs if log.task_id is not None}

    users_by_id = (
        {
            user.id: user
            for user in db.query(User).filter(User.id.in_(user_ids)).all()
        }
        if user_ids
        else {}
    )

    projects_by_id = (
        {
            project.id: project
            for project in db.query(Project)
            .filter(Project.id.in_(project_ids))
            .all()
        }
        if project_ids
        else {}
    )

    tasks_by_id = (
        {
            task.id: task
            for task in db.query(Task).filter(Task.id.in_(task_ids)).all()
        }
        if task_ids
        else {}
    )

    manager_assignments = (
        {
            ma.user_id: ma.manager_id
            for ma in db.query(ManagerAssignment)
            .filter(ManagerAssignment.user_id.in_(user_ids))
            .all()
        }
        if user_ids
        else {}
    )

    manager_ids = {
        manager_id
        for manager_id in manager_assignments.values()
        if manager_id is not None
    }

    managers_by_id = (
        {
            user.id: user
            for user in db.query(User)
            .filter(User.id.in_(manager_ids))
            .all()
        }
        if manager_ids
        else {}
    )

    owner_roles = _roles_for_users(db, user_ids)
    project_managers = _project_managers(db, project_ids)

    results = []

    for log in logs:
        user = users_by_id.get(log.user_id)
        project = projects_by_id.get(log.project_id)
        task = tasks_by_id.get(log.task_id)

        roles = owner_roles.get(log.user_id, [])
        is_management = Roles.MANAGER in roles or Roles.ADMIN in roles

        if is_management:
            manager_id = None
            manager_name = "Admin"
        else:
            manager_id = manager_assignments.get(log.user_id)
            manager_name = (
                managers_by_id.get(manager_id).name
                if manager_id is not None and managers_by_id.get(manager_id)
                else None
            )

            if manager_name is None:
                fallback = project_managers.get(log.project_id)
                if fallback:
                    manager_id, manager_name = fallback

            if manager_name is None:
                manager_id = None
                manager_name = "Admin"

        results.append(
            {
                "id": log.id,
                "user_id": log.user_id,
                "user_name": user.name if user else None,
                "manager_id": manager_id,
                "manager_name": manager_name,
                "project_id": log.project_id,
                "project_name": project.name if project else None,
                "task_id": log.task_id,
                "task_name": task.name if task else None,
                "start_time": _as_utc(log.start_time),
                "end_time": _as_utc(log.end_time),
                "type": log.type,
                "comments": log.comments,
                "status": log.status or "pending",
                "rejection_reason": log.rejection_reason,
                "created_at": _as_utc(log.created_at),
            }
        )

    return results


def _serialize(db: Session, log: TimeLog) -> dict:
    return _serialize_logs_batch(db, [log])[0]


def _validate_type(payload_type: str | None) -> str:
    """Validate the manually selected time-log type."""
    if payload_type not in {"standard", "overtime"}:
        raise BadRequestError("Type must be either 'standard' or 'overtime'")
    return payload_type


def _validate_assignment(
    db: Session,
    user_id: int,
    project_id: int,
    task_id: int,
    is_privileged: bool,
) -> None:
    """Validate that the task belongs to the selected project."""
    task = db.query(Task).filter(Task.id == task_id).first()

    if not task:
        raise NotFoundError("Task")

    if task.project_id != project_id:
        raise BadRequestError(
            "That task does not belong to the selected project"
        )

    if is_privileged:
        return

    is_assigned = (
        db.query(ProjectAssignment)
        .filter(
            ProjectAssignment.user_id == user_id,
            ProjectAssignment.project_id == project_id,
        )
        .first()
        is not None
    )

    if not is_assigned:
        raise PermissionDeniedError(
            "You can only log time against a project you're assigned to"
        )


def _validate_duration_and_overlap(
    db: Session,
    user_id: int,
    start_time: datetime,
    end_time: datetime,
    exclude_log_id: int | None = None,
) -> None:
    """
    Validate time-log boundaries and prevent overlapping entries.

    There is intentionally NO maximum duration restriction. A single time
    log may span more than 24 hours.

    This function contains NO overtime/8-hour policy.
    """
    start_time = _as_utc(start_time)
    end_time = _as_utc(end_time)


    existing_q = (
        db.query(TimeLog)
        .filter(
            TimeLog.user_id == user_id,
            TimeLog.is_deleted == False,  # noqa: E712
        )
    )

    if exclude_log_id is not None:
        existing_q = existing_q.filter(TimeLog.id != exclude_log_id)

    existing_logs = existing_q.all()

    for other in existing_logs:
        other_start = _as_utc(other.start_time)
        other_end = _as_utc(other.end_time)

        if other_start is None or other_end is None:
            continue

        if start_time < other_end and end_time > other_start:
            raise BadRequestError(
                "This entry overlaps with another time log you already have"
            )



def _manager_can_access_log(
    db: Session,
    manager_id: int,
    log: TimeLog,
) -> bool:
    """Check whether a manager can access a time log."""
    is_direct_report = (
        db.query(ManagerAssignment)
        .filter(
            ManagerAssignment.manager_id == manager_id,
            ManagerAssignment.user_id == log.user_id,
        )
        .first()
        is not None
    )

    if is_direct_report:
        return True

    return (
        db.query(ProjectAssignment)
        .filter(
            ProjectAssignment.user_id == manager_id,
            ProjectAssignment.project_id == log.project_id,
        )
        .first()
        is not None
    )


def _apply_time_log_filters(
    q,
    project_id: int | None,
    status: str | None,
    date_from: date | None,
    date_to: date | None,
):
    """Apply shared SQL filters."""
    if project_id is not None:
        q = q.filter(TimeLog.project_id == project_id)

    if status is not None:
        q = q.filter(TimeLog.status == status)

    if date_from is not None:
        q = q.filter(
            TimeLog.start_time
            >= datetime.combine(date_from, datetime.min.time())
        )

    if date_to is not None:
        q = q.filter(
            TimeLog.start_time
            < datetime.combine(date_to, datetime.min.time())
            + timedelta(days=1)
        )

    return q


def list_logs_for_user(
    db: Session,
    user_id: int,
    project_id: int | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict]:
    q = db.query(TimeLog).filter(
        TimeLog.user_id == user_id,
        TimeLog.is_deleted == False,  # noqa: E712
    )

    q = _apply_time_log_filters(
        q,
        project_id,
        status,
        date_from,
        date_to,
    )

    return _serialize_logs_batch(
        db,
        q.order_by(TimeLog.start_time.desc()).all(),
    )


def list_all_logs(
    db: Session,
    project_id: int | None = None,
    user_id: int | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict]:
    q = db.query(TimeLog).filter(
        TimeLog.is_deleted == False  # noqa: E712
    )

    if user_id is not None:
        q = q.filter(TimeLog.user_id == user_id)

    q = _apply_time_log_filters(
        q,
        project_id,
        status,
        date_from,
        date_to,
    )

    return _serialize_logs_batch(
        db,
        q.order_by(TimeLog.start_time.desc()).all(),
    )


def list_logs_for_manager_team(
    db: Session,
    manager_id: int,
    project_id: int | None = None,
    user_id: int | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict]:
    """
    Manager visibility:
    1. Direct reports.
    2. Users who logged against a project assigned to this manager.
    """
    direct_report_ids = {
        a.user_id
        for a in db.query(ManagerAssignment)
        .filter(ManagerAssignment.manager_id == manager_id)
        .all()
    }

    my_project_ids = [
        a.project_id
        for a in db.query(ProjectAssignment)
        .filter(ProjectAssignment.user_id == manager_id)
        .all()
    ]

    query_filters = []

    if direct_report_ids:
        query_filters.append(TimeLog.user_id.in_(direct_report_ids))

    if my_project_ids:
        query_filters.append(TimeLog.project_id.in_(my_project_ids))

    if not query_filters:
        return []

    logs = (
        db.query(TimeLog)
        .filter(
            or_(*query_filters),
            TimeLog.is_deleted == False,  # noqa: E712
        )
    )

    if user_id is not None:
        logs = logs.filter(TimeLog.user_id == user_id)

    logs = _apply_time_log_filters(
        logs,
        project_id,
        status,
        date_from,
        date_to,
    )

    return _serialize_logs_batch(
        db,
        logs.order_by(TimeLog.start_time.desc()).all(),
    )


def _manager_has_oversight(
    db: Session,
    manager_id: int,
    target_user_id: int,
    project_id: int,
) -> bool:
    """Check whether a manager can log on behalf of a user."""
    is_direct_report = (
        db.query(ManagerAssignment)
        .filter(
            ManagerAssignment.manager_id == manager_id,
            ManagerAssignment.user_id == target_user_id,
        )
        .first()
        is not None
    )

    if is_direct_report:
        return True

    return (
        db.query(ProjectAssignment)
        .filter(
            ProjectAssignment.user_id == manager_id,
            ProjectAssignment.project_id == project_id,
        )
        .first()
        is not None
    )


def create_log(
    db: Session,
    user_id: int,
    payload: TimeLogCreate,
    is_privileged: bool = False,
) -> dict:
    """Create a time log.

    IMPORTANT:
    payload.type is now respected directly.
    There is no 8-hour overtime calculation.
    """
    if payload.end_time <= payload.start_time:
        raise BadRequestError("end_time must be after start_time")

    grace = (
        timedelta(days=PRIVILEGED_FUTURE_START_GRACE_DAYS)
        if is_privileged
        else timedelta(minutes=FUTURE_START_GRACE_MINUTES)
    )

    if _as_utc(payload.start_time) > datetime.now(timezone.utc) + grace:
        raise BadRequestError("Time logs can't be dated in the future")

    time_log_type = _validate_type(payload.type)

    _validate_assignment(
        db,
        user_id,
        payload.project_id,
        payload.task_id,
        is_privileged,
    )

    _validate_duration_and_overlap(
        db,
        user_id,
        payload.start_time,
        payload.end_time,
    )

    log = TimeLog(
        user_id=user_id,
        project_id=payload.project_id,
        task_id=payload.task_id,
        start_time=payload.start_time,
        end_time=payload.end_time,
        type=time_log_type,
        comments=payload.comments,
        status="pending",
    )

    db.add(log)
    db.commit()
    db.refresh(log)

    return _serialize(db, log)


def create_log_on_behalf(
    db: Session,
    actor_id: int,
    payload: TimeLogCreateFor,
    is_privileged: bool = False,
) -> dict:
    """Manager/admin creation on behalf of another user."""
    if not is_privileged and not _manager_has_oversight(
        db,
        actor_id,
        payload.user_id,
        payload.project_id,
    ):
        raise PermissionDeniedError(
            "You can only log time for members of your own team"
        )

    base_payload = TimeLogCreate(
        **payload.model_dump(exclude={"user_id"})
    )

    return create_log(
        db,
        payload.user_id,
        base_payload,
        is_privileged=is_privileged,
    )


def update_log(
    db: Session,
    log_id: int,
    user_id: int,
    payload: TimeLogUpdate,
    is_privileged: bool = False,
) -> dict:
    log = (
        db.query(TimeLog)
        .filter(TimeLog.id == log_id)
        .first()
    )

    if not log:
        raise NotFoundError("Time log")

    if not is_privileged and log.user_id != user_id:
        raise PermissionDeniedError(
            "You can only edit your own time logs"
        )

    if not is_privileged and log.status != "pending":
        raise PermissionDeniedError(
            "This time log has already been reviewed and can no longer be edited"
        )

    original_date = (
        _as_utc(log.start_time).date()
        if log.start_time
        else None
    )

    for field in (
        "project_id",
        "task_id",
        "start_time",
        "end_time",
        "comments",
    ):
        value = getattr(payload, field)

        if value is not None:
            setattr(log, field, value)

    norm_start = _as_utc(log.start_time)
    norm_end = _as_utc(log.end_time)

    if norm_end <= norm_start:
        raise BadRequestError("end_time must be after start_time")

    grace = (
        timedelta(days=PRIVILEGED_FUTURE_START_GRACE_DAYS)
        if is_privileged
        else timedelta(minutes=FUTURE_START_GRACE_MINUTES)
    )

    if norm_start > datetime.now(timezone.utc) + grace:
        raise BadRequestError("Time logs can't be dated in the future")

    _validate_assignment(
        db,
        log.user_id,
        log.project_id,
        log.task_id,
        is_privileged,
    )

    _validate_duration_and_overlap(
        db,
        log.user_id,
        norm_start,
        norm_end,
        exclude_log_id=log.id,
    )

    # Manual Standard / Overtime selection.
    if payload.type is not None:
        log.type = _validate_type(payload.type)

    # If type is omitted during an update, preserve the existing type.
    new_date = norm_start.date()

    db.commit()
    db.refresh(log)

    return _serialize(db, log)


def delete_log(
    db: Session,
    log_id: int,
    user_id: int,
    is_privileged: bool = False,
):
    log = (
        db.query(TimeLog)
        .filter(TimeLog.id == log_id)
        .first()
    )

    if not log:
        raise NotFoundError("Time log")

    if not is_privileged and log.user_id != user_id:
        raise PermissionDeniedError(
            "You can only delete your own time logs"
        )

    if not is_privileged and log.status != "pending":
        raise PermissionDeniedError(
            "This time log has already been reviewed and can no longer be deleted"
        )

    snapshot = {
        "id": log.id,
        "user_id": log.user_id,
        "project_id": log.project_id,
        "task_id": log.task_id,
        "start_time": (
            log.start_time.isoformat()
            if log.start_time
            else None
        ),
        "end_time": (
            log.end_time.isoformat()
            if log.end_time
            else None
        ),
        "type": log.type,
        "status": log.status,
        "comments": log.comments,
    }

    if is_privileged:
        db.add(
            AuditLog(
                entity_type="time_log",
                entity_id=log.id,
                action="deleted",
                performed_by=user_id,
                snapshot=json.dumps(snapshot),
            )
        )
        db.delete(log)
    else:
        db.add(
            AuditLog(
                entity_type="time_log",
                entity_id=log.id,
                action="soft_deleted",
                performed_by=user_id,
                snapshot=json.dumps(snapshot),
            )
        )
        log.is_deleted = True

    db.commit()

    return {"deleted": True}


def manager_update_log(
    db: Session,
    log_id: int,
    manager_id: int,
    payload: TimeLogUpdate,
) -> dict:
    """Manager can edit a time log within their oversight."""
    log = (
        db.query(TimeLog)
        .filter(TimeLog.id == log_id)
        .first()
    )

    if not log:
        raise NotFoundError("Time log")

    if not _manager_can_access_log(db, manager_id, log):
        raise PermissionDeniedError(
            "You can only edit time logs from your own team"
        )

    return update_log(
        db,
        log_id,
        log.user_id,
        payload,
        is_privileged=True,
    )


def manager_delete_log(
    db: Session,
    log_id: int,
    manager_id: int,
) -> dict:
    """Manager can delete a time log within their oversight."""
    log = (
        db.query(TimeLog)
        .filter(TimeLog.id == log_id)
        .first()
    )

    if not log:
        raise NotFoundError("Time log")

    if not _manager_can_access_log(db, manager_id, log):
        raise PermissionDeniedError(
            "You can only delete time logs from your own team"
        )

    return delete_log(
        db,
        log_id,
        manager_id,
        is_privileged=True,
    )


def approve_log(
    db: Session,
    log_id: int,
    manager_id: int,
    is_privileged: bool = False,
) -> dict:
    log = (
        db.query(TimeLog)
        .filter(TimeLog.id == log_id)
        .first()
    )

    if not log:
        raise NotFoundError("Time log")

    if not is_privileged and not _manager_can_access_log(
        db,
        manager_id,
        log,
    ):
        raise PermissionDeniedError(
            "You can only review time logs from your own team"
        )

    if log.status != "pending":
        raise BadRequestError(
            "Only pending time logs can be approved"
        )

    log.status = "approved"
    log.rejection_reason = None

    db.commit()
    db.refresh(log)

    return _serialize(db, log)


def reject_log(
    db: Session,
    log_id: int,
    manager_id: int,
    reason: str,
    is_privileged: bool = False,
) -> dict:
    log = (
        db.query(TimeLog)
        .filter(TimeLog.id == log_id)
        .first()
    )

    if not log:
        raise NotFoundError("Time log")

    if not is_privileged and not _manager_can_access_log(
        db,
        manager_id,
        log,
    ):
        raise PermissionDeniedError(
            "You can only review time logs from your own team"
        )

    if log.status != "pending":
        raise BadRequestError(
            "Only pending time logs can be rejected"
        )

    if not reason or not reason.strip():
        raise BadRequestError(
            "A reason is required to reject a time log"
        )

    log.status = "rejected"
    log.rejection_reason = reason.strip()

    db.commit()
    db.refresh(log)

    return _serialize(db, log)