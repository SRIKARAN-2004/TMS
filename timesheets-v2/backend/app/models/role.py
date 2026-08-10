from sqlalchemy import Column, Integer, ForeignKey, Enum
from sqlalchemy.orm import relationship

from app.db.session import Base
from app.core.roles import Roles


class Role(Base):
    __tablename__ = "Roles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    role = Column(Enum(Roles.ADMIN, Roles.MANAGER, Roles.EMPLOYEE, name="role_enum"))

    role_assignments = relationship("RoleAssignment", back_populates="role")


class RoleAssignment(Base):
    __tablename__ = "Role_Assignments"

    user_id = Column(Integer, ForeignKey("Users.id"), primary_key=True)
    role_id = Column(Integer, ForeignKey("Roles.id"), primary_key=True)

    user = relationship("User", back_populates="role_assignments")
    role = relationship("Role", back_populates="role_assignments")


class ManagerAssignment(Base):
    __tablename__ = "Manager_Assignments"

    user_id = Column(Integer, ForeignKey("Users.id"), primary_key=True)
    manager_id = Column(Integer, ForeignKey("Users.id"), primary_key=True)

    user = relationship("User", foreign_keys=[user_id], back_populates="manager_assignments")
    manager = relationship("User", foreign_keys=[manager_id])
