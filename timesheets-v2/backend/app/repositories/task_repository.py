"""
Task repository - the only place that runs raw SQLAlchemy queries against
Tasks. No business rules or exceptions here - that lives in
app/controllers/project_service.py.
"""
from collections import defaultdict

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.project import Task


def get_by_id(db: Session, task_id: int) -> Task | None:
    return db.query(Task).filter(Task.id == task_id).first()


def get_all(
    db: Session,
    project_id: int | None = None,
    project_ids: list[int] | None = None,
    search: str | None = None,
    is_alive: bool | None = None,
) -> list[Task]:
    """project_id and project_ids are mutually exclusive - project_id for a
    single-project filter (admin's "all tasks, optionally on one project"
    view), project_ids for a pre-scoped set (a manager/employee's own
    assigned projects). search/is_alive were previously not filterable at
    all here - narrowing a task list meant fetching everything and
    filtering client-side."""
    query = db.query(Task)
    if project_id is not None:
        query = query.filter(Task.project_id == project_id)
    elif project_ids is not None:
        if not project_ids:
            return []
        query = query.filter(Task.project_id.in_(project_ids))
    if search:
        query = query.filter(Task.name.ilike(f"%{search.strip()}%"))
    if is_alive is not None:
        query = query.filter(Task.isAlive == is_alive)
    return query.all()


def get_active_counts_for_projects(db: Session, project_ids: list[int]) -> dict[int, int]:
    """Batched per-project active-task count, used by
    project_service._serialize_projects_batch - one GROUP BY query for a
    whole set of projects instead of one COUNT(*) per project."""
    if not project_ids:
        return {}
    rows = (
        db.query(Task.project_id, func.count(Task.id))
        .filter(Task.project_id.in_(project_ids), Task.isAlive == True)  # noqa: E712
        .group_by(Task.project_id)
        .all()
    )
    return dict(rows)


def create(db: Session, *, project_id: int, name: str, description: str | None) -> Task:
    task = Task(project_id=project_id, name=name, description=description, isAlive=True)
    db.add(task)
    return task


def delete(db: Session, project_id: int) -> None:
    db.query(Task).filter(Task.project_id == project_id).delete()


def save(db: Session) -> None:
    db.commit()
