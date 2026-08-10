from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Literal

TimeLogStatus = Literal["pending", "approved", "rejected"]


class TimeLogBase(BaseModel):
    project_id: int
    task_id: int
    start_time: datetime
    end_time: datetime
    type: str = "standard"
    comments: Optional[str] = None


class TimeLogCreate(TimeLogBase):
    pass


class TimeLogCreateFor(TimeLogBase):
    """Used by manager/admin 'Log Time' flows to record time on behalf of
    someone else - the target is explicit in the payload rather than
    always being the caller, which is what TimeLogCreate assumes."""
    user_id: int


class TimeLogUpdate(BaseModel):
    project_id: Optional[int] = None
    task_id: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    type: Optional[str] = None
    comments: Optional[str] = None


class TimeLogReject(BaseModel):
    reason: str


class TimeLogOut(TimeLogBase):
    id: int
    user_id: int
    user_name: Optional[str] = None
    manager_id: Optional[int] = None
    manager_name: Optional[str] = None
    project_name: Optional[str] = None
    task_name: Optional[str] = None
    status: TimeLogStatus = "pending"
    rejection_reason: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
