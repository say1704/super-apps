from .base import Base
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone


class ProjectTask(Base):
    __tablename__ = "project_tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    status = Column(String, default="todo")
    assignee = Column(String)
    priority = Column(String, default="medium")
    due_date = Column(Date)
    tags = Column(String, default="")
    estimated_hours = Column(String, nullable=True)
    actual_hours = Column(String, nullable=True)
    photo_urls = Column(Text, default="[]")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    completed_at = Column(DateTime, nullable=True)
    version = Column(Integer, default=0)

    worklogs = relationship("WorkLog", back_populates="task", cascade="all, delete-orphan")
    notes = relationship("TaskNote", back_populates="task", cascade="all, delete-orphan", order_by="TaskNote.created_at.asc()")

class TaskNote(Base):
    __tablename__ = "task_notes"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("project_tasks.id"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    photo_urls = Column(Text, default="[]")
    hours = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))

    task = relationship("ProjectTask", back_populates="notes")


class Sprint(Base):
    __tablename__ = "sprints"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    start_date = Column(Date)
    end_date = Column(Date)
    status = Column(String, default="planned")
    goal = Column(Text)
    task_ids = Column(String, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    version = Column(Integer, default=0)
