from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List, Literal

# Must match the MySQL `project_status_enum` column exactly
# (backend/app/models/project.py). Validating against this Literal at the
# API boundary means a bad value gets a clean 422 here instead of reaching
# the DB layer, where it would fail as an unhandled 500 at commit time.
ProjectStatus = Literal["created", "in_progress", "completed", "archived"]


class ProjectBase(BaseModel):
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: ProjectStatus = "created"


class ProjectCreate(ProjectBase):
    member_ids: List[int] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[ProjectStatus] = None
    member_ids: Optional[List[int]] = None


class AssigneeOut(BaseModel):
    id: int
    name: str


class ProjectOut(ProjectBase):
    id: int
    code: Optional[str] = None
    members: List[str] = []
    manager_name: Optional[str] = None
    manager_id: Optional[int] = None
    managers: List[AssigneeOut] = []
    employees: List[AssigneeOut] = []
    team_count: int = 0
    task_count: int = 0

    class Config:
        from_attributes = True


class AssignUserRequest(BaseModel):
    user_id: int


class AssignUsersRequest(BaseModel):
    """Bulk version for the multi-select 'Assign Employee' picker."""
    user_ids: List[int]


class TaskBase(BaseModel):
    project_id: int
    name: str
    description: Optional[str] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    isAlive: Optional[bool] = None


class TaskOut(TaskBase):
    id: int
    isAlive: bool
    project_name: Optional[str] = None
    manager_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
