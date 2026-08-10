from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func

from app.db.session import Base


class AuditLog(Base):
    """delete_log/delete_project previously called db.delete() directly with
    no record of what was removed, by whom, or when - a user's logged hours
    (or an entire project) could be permanently erased with zero trace.
    This is an append-only log of destructive actions: every hard delete
    writes a row here first, capturing a snapshot of the row as it existed
    right before removal. It is not a substitute for soft-deletes (the
    underlying row is still gone), but it means "who deleted what and when"
    is always answerable afterward.
    """

    __tablename__ = "Audit_Log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity_type = Column(String(50), nullable=False)  # "time_log" | "project"
    entity_id = Column(Integer, nullable=False)
    action = Column(String(20), nullable=False)  # "deleted"
    performed_by = Column(Integer, nullable=True)  # user id, nullable in case the actor is later removed
    snapshot = Column(Text, nullable=True)  # JSON string of the row at delete time
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
