from .base import Base
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone


class AssetConfiguration(Base):
    __tablename__ = "asset_configurations"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("asset_common.id"), nullable=False, index=True)

    parameter = Column(String, nullable=False)
    value = Column(Text, nullable=False)

    category = Column(String, default="operational")

    category_id = Column(Integer, ForeignKey("config_categories.id"), nullable=True, index=True)

    notes = Column(Text)

    last_checked = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(String)
    updated_by = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=0)

    asset = relationship("AssetCommon", back_populates="configurations")
    category_rel = relationship("ConfigCategory", foreign_keys=[category_id])


class ConfigCategory(Base):
    __tablename__ = "config_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    color = Column(String, default="blue")
    sort_order = Column(Integer, default=0)
    description = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    configurations = relationship("AssetConfiguration", back_populates="category_rel")


class ConfigChangeHistory(Base):
    __tablename__ = "config_change_history"

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("asset_configurations.id"), nullable=True, index=True)
    asset_id = Column(Integer, ForeignKey("asset_common.id"), nullable=True, index=True)
    parameter = Column(String(200), nullable=True)

    old_value = Column(Text, nullable=False)
    new_value = Column(Text, nullable=False)
    change_reason = Column(Text)
    change_request_id = Column(String)

    changed_by = Column(String)
    changed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    configuration = relationship("AssetConfiguration", back_populates="change_history")


class ConfigurationItem(Base):
    __tablename__ = "configuration_items"

    id = Column(Integer, primary_key=True, index=True)
    ci_name = Column(String, nullable=False)
    ci_description = Column(Text)
    ci_owner = Column(String)
    category = Column(String)
    ci_type = Column(String)
    type_description = Column(Text)
    modification_history = Column(Text)
    current_status = Column(String, default="Active")
    ci_relationships = Column(Text)
    related_cis = Column(Text)
    operational_docs = Column(Text)
    emergency_docs = Column(Text)
    other_docs = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))

from .assets import AssetCommon
AssetCommon.configurations = relationship("AssetConfiguration", back_populates="asset", cascade="all, delete-orphan")
AssetConfiguration.change_history = relationship("ConfigChangeHistory", back_populates="configuration")
