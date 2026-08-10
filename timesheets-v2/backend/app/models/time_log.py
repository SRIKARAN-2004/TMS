from sqlalchemy import Column, Integer, String, TIMESTAMP, Enum, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.session import Base


class TimeLog(Base):
    __tablename__ = "Time_Logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("Users.id"))
    project_id = Column(Integer, ForeignKey("Projects.id"))
    task_id = Column(Integer, ForeignKey("Tasks.id"))
    start_time = Column(TIMESTAMP)
    end_time = Column(TIMESTAMP)
    type = Column(Enum("standard", "overtime", name="log_type_enum"))
    comments = Column(String(300))
    # An employee removing their own (still-pending) entry is a soft
    # delete: the row stays for audit purposes but is excluded from every
    # list endpoint and from overlap/daily-hours math (see
    # time_log_service.delete_log). Admin/manager deletes remain hard
    # deletes, unaffected by this flag.
    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    # Approval workflow: every log starts "pending" and a manager/admin
    # moves it to "approved" or "rejected". This is the field that was
    # previously missing entirely - the frontend was faking a "pending"
    # count from the overtime flag because there was nothing real to read.
    status = Column(Enum("pending", "approved", "rejected", name="time_log_status_enum"), default="pending", server_default="pending", nullable=False)
    rejection_reason = Column(String(300), nullable=True)
    # There was previously no way to tell when a log was created or last
    # edited (relevant now that edits are locked once reviewed - see
    # time_log_service.update_log), and hard deletes left no row-level
    # trail at all; see AuditLog for the delete side of that.
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="time_logs")
    project = relationship("Project")
    task = relationship("Task", back_populates="time_logs")
