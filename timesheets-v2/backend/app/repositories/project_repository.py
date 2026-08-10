"""
Project repository - the only place that runs raw SQLAlchemy queries
against Projects and Project_Assignments. No business rules or
exceptions here - that lives in app/controllers/project_service.py.
"""
from sqlalchemy.orm import Session

from app.models.project import Project, ProjectAssignment


def get_by_id(db: Session, project_id: int) -> Project | None:
    return db.query(Project).filter(Project.id == project_id).first()


def get_by_ids(db: Session, project_ids: list[int]) -> list[Project]:
    if not project_ids:
        return []
    return db.query(Project).filter(Project.id.in_(project_ids)).all()


def get_all(db: Session) -> list[Project]:
    return db.query(Project).all()


def create(db: Session, *, name: str, start_date, end_date, status: str) -> Project:
    project = Project(name=name, start_date=start_date, end_date=end_date, status=status)
    db.add(project)
    db.flush()
    return project


def delete(db: Session, project: Project) -> None:
    db.delete(project)


def save(db: Session) -> None:
    db.commit()


# --- Project_Assignments ---

def get_assignments_for_project(db: Session, project_id: int) -> list[ProjectAssignment]:
    return db.query(ProjectAssignment).filter(ProjectAssignment.project_id == project_id).all()


def get_assignments_for_user(db: Session, user_id: int) -> list[ProjectAssignment]:
    return db.query(ProjectAssignment).filter(ProjectAssignment.user_id == user_id).all()


def get_assignments_for_projects(db: Session, project_ids: list[int]) -> list[ProjectAssignment]:
    if not project_ids:
        return []
    return db.query(ProjectAssignment).filter(ProjectAssignment.project_id.in_(project_ids)).all()


def get_all_assignments(db: Session) -> list[ProjectAssignment]:
    """Every Project_Assignments row, org-wide - used by
    user_service.list_available_employees/list_available_managers to find
    who is currently assigned to ANY project (as opposed to a specific
    one)."""
    return db.query(ProjectAssignment).all()


def get_assignment(db: Session, project_id: int, user_id: int) -> ProjectAssignment | None:
    return (
        db.query(ProjectAssignment)
        .filter(ProjectAssignment.project_id == project_id, ProjectAssignment.user_id == user_id)
        .first()
    )


def add_assignment(db: Session, project_id: int, user_id: int) -> None:
    db.add(ProjectAssignment(user_id=user_id, project_id=project_id))


def remove_assignment(db: Session, project_id: int, user_id: int) -> None:
    db.query(ProjectAssignment).filter(
        ProjectAssignment.project_id == project_id, ProjectAssignment.user_id == user_id
    ).delete()


def clear_assignments_for_project(db: Session, project_id: int) -> None:
    db.query(ProjectAssignment).filter(ProjectAssignment.project_id == project_id).delete()
