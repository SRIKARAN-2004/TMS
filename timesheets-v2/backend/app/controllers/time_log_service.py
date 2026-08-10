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

# A log is "standard" up to 8 hours; anything longer is "overtime". This is
# the single source of truth for that rule - the client can request whatever
# it wants in payload.type, but it's ignored. The type is always derived
# here from the actual start/end times, not trusted from the request body,
# since a client-supplied value could be wrong (by mistake) or manipulated
# (on purpose) and there's no way to validate a value we didn't compute.
STANDARD_HOURS_THRESHOLD = 8.0

# A single entry can't span more than a full day, and a user can't log more
# than 24 hours total against any one calendar date (by start_time). Both
# are hard physical limits, not policy knobs - previously nothing enforced
# either, so a 100-hour single entry or two entries double-booking the same
# hour were both accepted silently.
MAX_SINGLE_ENTRY_HOURS = 24.0
MAX_DAILY_HOURS = 24.0

# How far past the actual current time a start_time is still allowed to be
# before it's rejected as "in the future". This exists to catch real
# mistakes (a typo'd year, a client clock that's badly wrong) - it's not
# meant to stop someone from logging a shift that starts in a few minutes,
# entering the log slightly ahead of the clock, or working across a slow/
# high-latency connection. 5 minutes was too tight for normal use (e.g.
# it's 5:50 and the shift - and the log - starts at 6:00, a completely
# normal 10-minute-ahead entry that shouldn't be blocked); 60 minutes still
# catches the actual mistakes this check exists for.
#
# This only applies to an employee logging their own time. A manager or
# admin creating/editing a log on someone else's behalf (is_privileged, see
# create_log/update_log below) is deliberately allowed much further into
# the future - e.g. pre-scheduling a shift or planned task days/weeks
# ahead - since that entry is being made and vouched for by the person
# with oversight, not self-reported after the fact the way an employee's
# own entry is.
FUTURE_START_GRACE_MINUTES = 60
PRIVILEGED_FUTURE_START_GRACE_DAYS = 365


def _compute_type(start_time: datetime, end_time: datetime) -> str:
    hours = (end_time - start_time).total_seconds() / 3600
    return "overtime" if hours > STANDARD_HOURS_THRESHOLD else "standard"


def _recompute_daily_overtime(db: Session, user_id: int, target_date: date) -> None:
    """Recomputes standard/overtime for every PENDING log a user has on one
    calendar date, based on their cumulative hours for that day rather than
    each entry's own duration in isolation. Previously _compute_type only
    looked at a single entry - two separate 5-hour entries on the same day
    (10 hours total, well past a standard day) both stayed "standard"
    individually, so real daily overtime was never actually detected or
    surfaced anywhere.

    Entries are processed in start_time order; once the running total for
    the day crosses STANDARD_HOURS_THRESHOLD, that entry and every later
    entry that day are marked overtime. Already-reviewed (approved/
    rejected) logs are deliberately left untouched - they're locked by
    business rule elsewhere (see update_log) and shouldn't silently change
    type after being signed off. Caller is responsible for the commit.
    """
    day_start = datetime.combine(target_date, datetime.min.time())
    day_end = day_start + timedelta(days=1)
    logs = (
        db.query(TimeLog)
        .filter(
            TimeLog.user_id == user_id,
            TimeLog.start_time >= day_start,
            TimeLog.start_time < day_end,
            TimeLog.status == "pending",
            TimeLog.is_deleted == False,  # noqa: E712
        )
        .order_by(TimeLog.start_time.asc())
        .all()
    )
    running_hours = 0.0
    for log in logs:
        entry_hours = (log.end_time - log.start_time).total_seconds() / 3600
        running_hours += entry_hours
        new_type = "overtime" if running_hours > STANDARD_HOURS_THRESHOLD else "standard"
        if log.type != new_type:
            log.type = new_type


def _as_utc(dt: datetime | None) -> datetime | None:
    """MySQL's TIMESTAMP column type hands back naive datetimes (no
    timezone attached) via PyMySQL, even though every value we ever write
    is UTC (the frontend always sends ISO strings ending in 'Z'). If a
    naive datetime is serialized to JSON as-is, it comes out with no 'Z'
    or offset suffix - and JavaScript's `new Date(...)` treats a string
    with no timezone marker as LOCAL time, not UTC. That mismatch is what
    caused times to visibly shift by the browser's UTC offset. Explicitly
    re-attaching UTC tzinfo here before serialization means the JSON
    response always has an unambiguous 'Z'/'+00:00' suffix, so every
    client parses it correctly regardless of its own local timezone."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _roles_for_users(db: Session, user_ids) -> dict[int, list[str]]:
    """Batched role lookup, same shape as project_service._roles_for_users.
    Needed here (not just imported from there) because who counts as
    "has no manager because they ARE management" (see
    _serialize_logs_batch below) depends on role, not on anything
    Manager_Assignments tracks."""
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
    """For each project, who (if anyone) holds the MANAGER role among its
    current ProjectAssignment members - the same source of truth
    project_service._manager_names_for_projects uses for Tasks/Projects
    pages. Used below as a fallback for time logs whose owner has no row
    in Manager_Assignments yet (e.g. an admin used 'Log Time' to log an
    entry for someone directly, which - unlike the 'Assign Emp' picker -
    doesn't add them to the project roster, so the Manager_Assignments
    sync that roster changes trigger never ran for them)."""
    if not project_ids:
        return {}
    assignments = (
        db.query(ProjectAssignment)
        .filter(ProjectAssignment.project_id.in_(project_ids))
        .all()
    )
    member_ids = {a.user_id for a in assignments}
    roles_by_user = _roles_for_users(db, member_ids)
    users_by_id = {u.id: u for u in db.query(User).filter(User.id.in_(member_ids)).all()} if member_ids else {}

    out: dict[int, tuple[int, str]] = {}
    for a in assignments:
        if a.project_id in out:
            continue
        roles = roles_by_user.get(a.user_id, [])
        if Roles.MANAGER in roles and Roles.ADMIN not in roles:
            u = users_by_id.get(a.user_id)
            if u:
                out[a.project_id] = (u.id, u.name)
    return out


def _serialize_logs_batch(db: Session, logs: list[TimeLog]) -> list[dict]:
    """Batched replacement for calling _serialize() once per log. Every
    time-log list endpoint (list_logs_for_user, list_all_logs,
    list_logs_for_manager_team) previously ran this per row: one query for
    the log's User, one for its Project, one for its Task - so a list of N
    logs cost roughly 3N extra round-trips on top of the initial list
    query. This collects the distinct user/project/task ids across the
    whole batch up front and does exactly one IN(...) query for each,
    regardless of how many logs are being serialized."""
    if not logs:
        return []

    user_ids = {l.user_id for l in logs if l.user_id is not None}
    project_ids = {l.project_id for l in logs if l.project_id is not None}
    task_ids = {l.task_id for l in logs if l.task_id is not None}

    users_by_id = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    projects_by_id = (
        {p.id: p for p in db.query(Project).filter(Project.id.in_(project_ids)).all()} if project_ids else {}
    )
    tasks_by_id = {t.id: t for t in db.query(Task).filter(Task.id.in_(task_ids)).all()} if task_ids else {}

    # Each log's user has (at most) one current manager, via
    # Manager_Assignments - the same relationship the Users page and
    # Reports pages already surface as manager_name. Batched the same way
    # as users/projects/tasks above: one IN(...) query for every log
    # owner's manager assignment, then one more for those managers' own
    # User rows, regardless of how many logs are being serialized.
    manager_assignments = (
        {
            ma.user_id: ma.manager_id
            for ma in db.query(ManagerAssignment).filter(ManagerAssignment.user_id.in_(user_ids)).all()
        }
        if user_ids
        else {}
    )
    manager_ids = {mid for mid in manager_assignments.values() if mid is not None}
    managers_by_id = (
        {u.id: u for u in db.query(User).filter(User.id.in_(manager_ids)).all()} if manager_ids else {}
    )

    # Manager_Assignments only gets (re)synced when a project's roster
    # changes (see project_service._sync_manager_assignments_for_project).
    # A log created via the privileged 'Log Time' path (admin logging an
    # entry directly for someone - see create_log_on_behalf) never adds
    # that person to the project's roster, so it never triggers that
    # sync - the log exists, but Manager_Assignments has no row for its
    # owner. Falling back to the project's current manager (same lookup
    # Tasks/Projects pages already use) means the log still shows the
    # right manager instead of "Unassigned" in that case.
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
            # A manager/admin doesn't report to another manager in this
            # org chart - they report to Admin. Showing "Unassigned" here
            # read as a bug (their own team's members clearly have a
            # manager); showing "Admin" reflects who they actually answer
            # to instead of implying no one does.
            manager_id = None
            manager_name = "Admin"
        else:
            manager_id = manager_assignments.get(log.user_id)
            manager_name = managers_by_id.get(manager_id).name if manager_id is not None else None
            if manager_name is None:
                fallback = project_managers.get(log.project_id)
                if fallback:
                    manager_id, manager_name = fallback
            if manager_name is None:
                # No direct manager on record AND no manager assigned to
                # the project this log is against (e.g. kaustubh's
                # resume-Analayzer entry). Rather than a bare "Unassigned"
                # - which reads as a data problem every time it's seen -
                # fall all the way back to Admin, who is the de facto
                # owner of any log nobody else has oversight of. This is
                # the last resort only: the two lookups above already
                # cover every case where a real manager exists.
                manager_id = None
                manager_name = "Admin"

        results.append({
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
        })
    return results


def _serialize(db: Session, log: TimeLog) -> dict:
    return _serialize_logs_batch(db, [log])[0]


def _validate_assignment(db: Session, user_id: int, project_id: int, task_id: int, is_privileged: bool) -> None:
    """A non-privileged user (employee or manager logging their own time)
    may only log against a project they're actually assigned to, and the
    task must belong to that project. Previously neither was checked at
    all: any project_id/task_id the client sent was accepted as-is, so a
    fabricated entry against a project the user isn't on would silently
    leak into that project's manager's team report."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise NotFoundError("Task")
    if task.project_id != project_id:
        raise BadRequestError("That task does not belong to the selected project")

    if is_privileged:
        return

    is_assigned = (
        db.query(ProjectAssignment)
        .filter(ProjectAssignment.user_id == user_id, ProjectAssignment.project_id == project_id)
        .first()
        is not None
    )
    if not is_assigned:
        raise PermissionDeniedError("You can only log time against a project you're assigned to")


def _validate_duration_and_overlap(
    db: Session, user_id: int, start_time: datetime, end_time: datetime, exclude_log_id: int | None = None
) -> None:
    """Enforces the physical limits that were previously missing entirely:
    a single entry can't exceed MAX_SINGLE_ENTRY_HOURS, a user's entries for
    one calendar date can't sum past MAX_DAILY_HOURS, and two of a user's
    entries can't overlap in time (double-logging the same hour twice)."""
    # Normalize to timezone-aware UTC up front. The caller may pass a fresh,
    # already-aware value (straight from a payload) or a value pulled from
    # a TimeLog row (naive, per _as_utc's docstring), so this function can't
    # assume either - every comparison below needs both sides aware.
    start_time = _as_utc(start_time)
    end_time = _as_utc(end_time)

    hours = (end_time - start_time).total_seconds() / 3600
    if hours > MAX_SINGLE_ENTRY_HOURS:
        raise BadRequestError(f"A single time log can't exceed {MAX_SINGLE_ENTRY_HOURS:.0f} hours")

    existing_q = db.query(TimeLog).filter(TimeLog.user_id == user_id, TimeLog.is_deleted == False)  # noqa: E712
    if exclude_log_id is not None:
        existing_q = existing_q.filter(TimeLog.id != exclude_log_id)
    existing_logs = existing_q.all()

    # Overlap check: two intervals overlap unless one ends at/before the
    # other starts.
    for other in existing_logs:
        other_start = _as_utc(other.start_time)
        other_end = _as_utc(other.end_time)
        if other_start is None or other_end is None:
            continue
        if start_time < other_end and end_time > other_start:
            raise BadRequestError("This entry overlaps with another time log you already have")

    # Daily cap: sum this entry plus every other entry that starts on the
    # same calendar date (in UTC, matching how start_time is stored/read).
    same_day_hours = hours
    target_date = start_time.date()
    for other in existing_logs:
        other_start = _as_utc(other.start_time)
        other_end = _as_utc(other.end_time)
        if other_start is None or other_end is None:
            continue
        if other_start.date() == target_date:
            same_day_hours += (other_end - other_start).total_seconds() / 3600
    if same_day_hours > MAX_DAILY_HOURS:
        raise BadRequestError(f"Total logged hours for {target_date.isoformat()} can't exceed {MAX_DAILY_HOURS:.0f}")


def _manager_can_access_log(db: Session, manager_id: int, log: TimeLog) -> bool:
    """Same visibility rule as list_logs_for_manager_team: direct reports,
    plus anyone who logged time against a project this manager is/was
    assigned to."""
    is_direct_report = (
        db.query(ManagerAssignment)
        .filter(ManagerAssignment.manager_id == manager_id, ManagerAssignment.user_id == log.user_id)
        .first()
        is not None
    )
    if is_direct_report:
        return True
    return (
        db.query(ProjectAssignment)
        .filter(ProjectAssignment.user_id == manager_id, ProjectAssignment.project_id == log.project_id)
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
    """Shared filter logic for every time-log list endpoint. Previously
    none of list_logs_for_user / list_all_logs / list_logs_for_manager_team
    accepted any filter at all - not even project_id - so narrowing down a
    report meant fetching the entire list (every log a user/team/org ever
    made) and filtering it client-side in the browser. All four dimensions
    below are applied as real SQL WHERE clauses."""
    if project_id is not None:
        q = q.filter(TimeLog.project_id == project_id)
    if status is not None:
        q = q.filter(TimeLog.status == status)
    if date_from is not None:
        q = q.filter(TimeLog.start_time >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        q = q.filter(TimeLog.start_time < datetime.combine(date_to, datetime.min.time()) + timedelta(days=1))
    return q


def list_logs_for_user(
    db: Session,
    user_id: int,
    project_id: int | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict]:
    q = db.query(TimeLog).filter(TimeLog.user_id == user_id, TimeLog.is_deleted == False)  # noqa: E712
    q = _apply_time_log_filters(q, project_id, status, date_from, date_to)
    return _serialize_logs_batch(db, q.order_by(TimeLog.start_time.desc()).all())


def list_all_logs(
    db: Session,
    project_id: int | None = None,
    user_id: int | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict]:
    q = db.query(TimeLog).filter(TimeLog.is_deleted == False)  # noqa: E712
    if user_id is not None:
        q = q.filter(TimeLog.user_id == user_id)
    q = _apply_time_log_filters(q, project_id, status, date_from, date_to)
    return _serialize_logs_batch(db, q.order_by(TimeLog.start_time.desc()).all())


def list_logs_for_manager_team(
    db: Session,
    manager_id: int,
    project_id: int | None = None,
    user_id: int | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict]:
    """A manager should see time logs from two overlapping groups:
    1. Direct reports (Manager_Assignments) - every log they've ever made,
       regardless of current project assignment.
    2. Anyone who logged time against a project this manager is/was
       assigned to - matched by the log's own project_id, NOT by whether
       that person is still currently on the project today.

    Group 2 deliberately does NOT filter by "is this person currently
    assigned to my project" - that would make a log disappear from the
    manager's view the moment an employee gets reassigned or removed from
    the project, even though the log itself is unchanged and was made
    legitimately while they were on it. Keying off the log's own
    project_id instead makes visibility permanent for logs that already
    happened, which is the correct behavior for a historical record.
    """
    direct_report_ids = {
        a.user_id for a in db.query(ManagerAssignment).filter(ManagerAssignment.manager_id == manager_id).all()
    }

    my_project_ids = [
        a.project_id for a in db.query(ProjectAssignment).filter(ProjectAssignment.user_id == manager_id).all()
    ]

    query_filters = []
    if direct_report_ids:
        query_filters.append(TimeLog.user_id.in_(direct_report_ids))
    if my_project_ids:
        query_filters.append(TimeLog.project_id.in_(my_project_ids))

    if not query_filters:
        return []

    logs = db.query(TimeLog).filter(or_(*query_filters), TimeLog.is_deleted == False)  # noqa: E712
    if user_id is not None:
        logs = logs.filter(TimeLog.user_id == user_id)
    logs = _apply_time_log_filters(logs, project_id, status, date_from, date_to)
    return _serialize_logs_batch(db, logs.order_by(TimeLog.start_time.desc()).all())


def _manager_has_oversight(db: Session, manager_id: int, target_user_id: int, project_id: int) -> bool:
    """Whether a manager may log time on behalf of target_user_id against
    project_id: either the target is their direct report, or the manager
    is themselves assigned to that project. This is deliberately narrower
    than what a log's *visibility* requires (_manager_can_access_log) -
    creating a fabricated entry for someone is a stronger action than just
    viewing an entry they already made, so it's checked explicitly at the
    point of creation rather than only relying on create_log's normal
    assignment check (which only verifies the *target* user is on the
    project, not that *this manager* has any standing over them there)."""
    is_direct_report = (
        db.query(ManagerAssignment)
        .filter(ManagerAssignment.manager_id == manager_id, ManagerAssignment.user_id == target_user_id)
        .first()
        is not None
    )
    if is_direct_report:
        return True
    return (
        db.query(ProjectAssignment)
        .filter(ProjectAssignment.user_id == manager_id, ProjectAssignment.project_id == project_id)
        .first()
        is not None
    )


def create_log(db: Session, user_id: int, payload: TimeLogCreate, is_privileged: bool = False) -> dict:
    if payload.end_time <= payload.start_time:
        raise BadRequestError("end_time must be after start_time")
    # No entry can start in the future - previously unvalidated, so a
    # typo'd year or a client clock skew could log hours for a date that
    # hasn't happened yet with no error. A small grace window (rather than
    # a strict "> utcnow()") avoids rejecting a log submitted right as an
    # in-progress shift crosses into "now" due to normal request latency
    # or minor clock drift between client and server. A manager/admin
    # entering the log on someone else's behalf gets a far wider window
    # (see PRIVILEGED_FUTURE_START_GRACE_DAYS above) so they can schedule
    # ahead, since it's an entry they've reviewed/approved, not a raw
    # self-report.
    grace = (
        timedelta(days=PRIVILEGED_FUTURE_START_GRACE_DAYS)
        if is_privileged
        else timedelta(minutes=FUTURE_START_GRACE_MINUTES)
    )
    if _as_utc(payload.start_time) > datetime.now(timezone.utc) + grace:
        raise BadRequestError("Time logs can't be dated in the future")
    _validate_assignment(db, user_id, payload.project_id, payload.task_id, is_privileged)
    _validate_duration_and_overlap(db, user_id, payload.start_time, payload.end_time)
    log = TimeLog(
        user_id=user_id,
        project_id=payload.project_id,
        task_id=payload.task_id,
        start_time=payload.start_time,
        end_time=payload.end_time,
        type=_compute_type(payload.start_time, payload.end_time),
        comments=payload.comments,
        status="pending",
    )
    db.add(log)
    db.flush()  # so the new log has an id and is included in the recompute query below
    _recompute_daily_overtime(db, user_id, payload.start_time.date())
    db.commit()
    db.refresh(log)
    return _serialize(db, log)


def create_log_on_behalf(db: Session, actor_id: int, payload: TimeLogCreateFor, is_privileged: bool = False) -> dict:
    """Manager/admin 'Log Time' for a specific team member. Previously the
    only creation path always logged as the caller, so the admin/manager
    time-log pages could only ever create an entry for themselves despite
    presenting an (always-disabled) Employee field that implied org/team-
    wide scope. is_privileged=True (admin) skips the oversight check below,
    consistent with admin's unrestricted access elsewhere; a manager must
    actually have standing over the target user (see
    _manager_has_oversight)."""
    if not is_privileged and not _manager_has_oversight(db, actor_id, payload.user_id, payload.project_id):
        raise PermissionDeniedError("You can only log time for members of your own team")
    base_payload = TimeLogCreate(**payload.model_dump(exclude={"user_id"}))
    return create_log(db, payload.user_id, base_payload, is_privileged=is_privileged)


def update_log(db: Session, log_id: int, user_id: int, payload: TimeLogUpdate, is_privileged: bool = False) -> dict:
    log = db.query(TimeLog).filter(TimeLog.id == log_id).first()
    if not log:
        raise NotFoundError("Time log")
    if not is_privileged and log.user_id != user_id:
        raise PermissionDeniedError("You can only edit your own time logs")
    if not is_privileged and log.status != "pending":
        raise PermissionDeniedError("This time log has already been reviewed and can no longer be edited")

    original_date = log.start_time.date() if log.start_time else None

    # "type" and "status" are deliberately excluded here - type is never
    # taken from the client, only recomputed below from whatever the final
    # start/end times turn out to be; status only changes via approve/reject.
    for field in ("project_id", "task_id", "start_time", "end_time", "comments"):
        value = getattr(payload, field)
        if value is not None:
            setattr(log, field, value)

    # log.start_time/end_time may now be a mix of naive (untouched, straight
    # from MySQL) and aware (just set from the payload above) - normalize
    # both to aware UTC before any comparison or arithmetic, or a partial
    # update (only one of start_time/end_time changed) can crash exactly
    # like the create_log case did.
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

    _validate_assignment(db, log.user_id, log.project_id, log.task_id, is_privileged)
    _validate_duration_and_overlap(db, log.user_id, norm_start, norm_end, exclude_log_id=log.id)

    log.type = _compute_type(norm_start, norm_end)

    # Recompute the day this entry now belongs to. If it moved to a
    # different calendar date, also recompute the day it left - both that
    # day's remaining entries and this one's new day need their running
    # totals re-derived, since a moved entry changes both.
    new_date = norm_start.date()
    if original_date and original_date != new_date:
        _recompute_daily_overtime(db, log.user_id, original_date)
    _recompute_daily_overtime(db, log.user_id, new_date)

    db.commit()
    db.refresh(log)
    return _serialize(db, log)


def delete_log(db: Session, log_id: int, user_id: int, is_privileged: bool = False):
    log = db.query(TimeLog).filter(TimeLog.id == log_id).first()
    if not log:
        raise NotFoundError("Time log")
    if not is_privileged and log.user_id != user_id:
        raise PermissionDeniedError("You can only delete your own time logs")
    if not is_privileged and log.status != "pending":
        raise PermissionDeniedError("This time log has already been reviewed and can no longer be deleted")

    # Snapshot before removal - see AuditLog. A user's logged hours were
    # previously erasable with zero trace (no created_at either, so there
    # wasn't even a "when was this logged" to fall back on).
    snapshot = {
        "id": log.id,
        "user_id": log.user_id,
        "project_id": log.project_id,
        "task_id": log.task_id,
        "start_time": log.start_time.isoformat() if log.start_time else None,
        "end_time": log.end_time.isoformat() if log.end_time else None,
        "type": log.type,
        "status": log.status,
        "comments": log.comments,
    }

    deleted_user_id = log.user_id
    deleted_date = log.start_time.date() if log.start_time else None

    if is_privileged:
        # Admin/manager removal stays a hard delete - they're correcting
        # or discarding an entry outright, with the audit row as the only
        # remaining trace.
        db.add(AuditLog(
            entity_type="time_log",
            entity_id=log.id,
            action="deleted",
            performed_by=user_id,
            snapshot=json.dumps(snapshot),
        ))
        db.delete(log)
    else:
        # An employee removing their own (still-pending) entry is a soft
        # delete: the row itself is kept - recoverable and fully
        # auditable - but is_deleted hides it from every list endpoint and
        # excludes it from overlap/daily-hours checks from this point on.
        db.add(AuditLog(
            entity_type="time_log",
            entity_id=log.id,
            action="soft_deleted",
            performed_by=user_id,
            snapshot=json.dumps(snapshot),
        ))
        log.is_deleted = True

    if deleted_date:
        db.flush()
        _recompute_daily_overtime(db, deleted_user_id, deleted_date)
    db.commit()
    return {"deleted": True}


def manager_update_log(db: Session, log_id: int, manager_id: int, payload: TimeLogUpdate) -> dict:
    """Lets a manager edit any time log within their oversight (see
    _manager_can_access_log) - not just entries they logged themselves.
    Once oversight is confirmed, the actual field update reuses update_log
    with is_privileged=True (same as Admin) so a manager isn't limited to
    only-pending entries the way a regular employee editing their own log
    would be."""
    log = db.query(TimeLog).filter(TimeLog.id == log_id).first()
    if not log:
        raise NotFoundError("Time log")
    if not _manager_can_access_log(db, manager_id, log):
        raise PermissionDeniedError("You can only edit time logs from your own team")
    return update_log(db, log_id, log.user_id, payload, is_privileged=True)


def manager_delete_log(db: Session, log_id: int, manager_id: int) -> dict:
    """Lets a manager delete any time log within their oversight - see
    manager_update_log above for the same reasoning."""
    log = db.query(TimeLog).filter(TimeLog.id == log_id).first()
    if not log:
        raise NotFoundError("Time log")
    if not _manager_can_access_log(db, manager_id, log):
        raise PermissionDeniedError("You can only delete time logs from your own team")
    return delete_log(db, log_id, manager_id, is_privileged=True)


def approve_log(db: Session, log_id: int, manager_id: int, is_privileged: bool = False) -> dict:
    log = db.query(TimeLog).filter(TimeLog.id == log_id).first()
    if not log:
        raise NotFoundError("Time log")
    if not is_privileged and not _manager_can_access_log(db, manager_id, log):
        raise PermissionDeniedError("You can only review time logs from your own team")
    if log.status != "pending":
        raise BadRequestError("Only pending time logs can be approved")
    log.status = "approved"
    log.rejection_reason = None
    db.commit()
    db.refresh(log)
    return _serialize(db, log)


def reject_log(db: Session, log_id: int, manager_id: int, reason: str, is_privileged: bool = False) -> dict:
    log = db.query(TimeLog).filter(TimeLog.id == log_id).first()
    if not log:
        raise NotFoundError("Time log")
    if not is_privileged and not _manager_can_access_log(db, manager_id, log):
        raise PermissionDeniedError("You can only review time logs from your own team")
    if log.status != "pending":
        raise BadRequestError("Only pending time logs can be rejected")
    if not reason or not reason.strip():
        raise BadRequestError("A reason is required to reject a time log")
    log.status = "rejected"
    log.rejection_reason = reason.strip()
    db.commit()
    db.refresh(log)
    return _serialize(db, log)