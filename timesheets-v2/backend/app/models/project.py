from sqlalchemy import Column, Integer, String, Date, Enum, ForeignKey, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.session import Base


class Project(Base):
    __tablename__ = "Projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50))
    start_date = Column(Date)
    end_date = Column(Date)
    status = Column(Enum("created", "in_progress", "completed", "archived", name="project_status_enum"))
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    assignments = relationship("ProjectAssignment", back_populates="project")
    tasks = relationship("Task", back_populates="project")


class ProjectAssignment(Base):
    __tablename__ = "Project_Assignments"

    user_id = Column(Integer, ForeignKey("Users.id"), primary_key=True)
    project_id = Column(Integer, ForeignKey("Projects.id"), primary_key=True)

    user = relationship("User", back_populates="project_assignments")
    project = relationship("Project", back_populates="assignments")


class Task(Base):
    __tablename__ = "Tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("Projects.id"))
    name = Column(String(100))
    description = Column(String(300))
    isAlive = Column(Boolean, default=True)
    # When a task was created/assigned - surfaced to employees on their
    # "Tasks" screen so a newly-assigned task shows exactly when their
    # manager put it on their plate, not just that it exists.
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    project = relationship("Project", back_populates="tasks")
    time_logs = relationship("TimeLog", back_populates="task")
