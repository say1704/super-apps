from .base import Base
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, Boolean, Float, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from utils.timezone import to_iso


class AssetCommon(Base):
    """Shared asset fields - all assets have these"""
    __tablename__ = "asset_common"

    id = Column(Integer, primary_key=True, index=True)
    asset_code = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False, index=True)
    sub_category = Column(String, index=True)
    classification = Column(String, default="internal", index=True)
    owner_name = Column(String)
    assigned_to = Column(String)
    location = Column(String)
    status = Column(String, default="active", index=True)
    purchase_date = Column(Date)
    warranty_until = Column(Date)
    disposal_date = Column(Date)
    price = Column(Float)
    acceptable_use_policy = Column(Text)
    created_by = Column(String)
    updated_by = Column(String)
    owner_role = Column(String(50), nullable=True, index=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=0)

    users = relationship("AssetUsers", back_populates="asset", uselist=False, cascade="all, delete-orphan")
    hardware = relationship("AssetHardware", back_populates="asset", uselist=False, cascade="all, delete-orphan")
    software = relationship("AssetSoftware", back_populates="asset", uselist=False, cascade="all, delete-orphan")
    virtual_infrastructure = relationship("AssetVirtualInfrastructure", back_populates="asset", uselist=False, cascade="all, delete-orphan")
    information = relationship("AssetInformation", back_populates="asset", uselist=False, cascade="all, delete-orphan")
    configurations = relationship("AssetConfiguration", back_populates="asset", cascade="all, delete-orphan")
    audit_logs = relationship("AssetAuditLog", back_populates="asset", cascade="all, delete-orphan")


class AssetUsers(Base):
    """Extension table for users category assets"""
    __tablename__ = "asset_users"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("asset_common.id"), nullable=False, unique=True, index=True)

    username = Column(String)
    password_encrypted = Column(Text)
    server_ip = Column(String)
    port = Column(String)
    protocol = Column(String)
    home_directory = Column(String)
    category = Column(String)
    requester = Column(String)

    group_name = Column(String)
    permission_level = Column(String)
    account_status = Column(String)
    email = Column(String)
    comments = Column(Text)

    employee_id = Column(String)
    department = Column(String)
    position = Column(String)
    phone = Column(String)

    interest_type = Column(Text)
    responsible_party = Column(String)
    communication_mechanism = Column(String)
    shared_data = Column(Text)
    contact_detail = Column(String)

    created_date = Column(Date)
    notes = Column(Text)

    asset = relationship("AssetCommon", back_populates="users")


class AssetHardware(Base):
    """Extension table for hardware category assets"""
    __tablename__ = "asset_hardware"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("asset_common.id"), nullable=False, unique=True, index=True)

    serial_number = Column(String)
    model = Column(String)
    manufacturer = Column(String)
    ip_address = Column(String)

    cpu = Column(String)
    ram = Column(String)
    storage = Column(String)

    virtualization = Column(String)
    hypervisor = Column(String)
    rack_units = Column(String)
    rack_position = Column(String)

    device_type = Column(String)
    firmware_version = Column(String)
    port_count = Column(String)

    printer_type = Column(String)
    color_support = Column(String)

    kvm_type = Column(String)

    capacity = Column(String)
    rpm = Column(String)
    interface = Column(String)
    storage_location = Column(String)
    tape_type = Column(String)
    tape_label = Column(String)
    generation = Column(String)
    first_used_date = Column(Date)
    retention_period = Column(String)

    keterangan = Column(Text)

    asset = relationship("AssetCommon", back_populates="hardware")


class AssetSoftware(Base):
    """Extension table for software category assets"""
    __tablename__ = "asset_software"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("asset_common.id"), nullable=False, unique=True, index=True)

    version = Column(String)
    license = Column(String)
    main_function = Column(Text)
    department = Column(String)
    vendor = Column(String)
    license_key = Column(String)
    license_count = Column(Integer)
    os_name = Column(String)
    utility_type = Column(String)
    download_url = Column(String)
    notes = Column(Text)

    asset = relationship("AssetCommon", back_populates="software")


class AssetVirtualInfrastructure(Base):
    """Extension table for virtual infrastructure category assets"""
    __tablename__ = "asset_virtual_infrastructure"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("asset_common.id"), nullable=False, unique=True, index=True)

    cpu = Column(String)
    ram = Column(String)
    storage = Column(String)

    host_server = Column(String)
    hypervisor = Column(String)
    os = Column(String)
    ip_address = Column(String)

    platform = Column(String)
    image_name = Column(String)
    host = Column(String)
    namespace = Column(String)

    cloud_provider = Column(String)
    instance_type = Column(String)
    region = Column(String)
    instance_id = Column(String)

    keterangan = Column(Text)

    asset = relationship("AssetCommon", back_populates="virtual_infrastructure")


class AssetInformation(Base):
    """Extension table for information category assets"""
    __tablename__ = "asset_information"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("asset_common.id"), nullable=False, unique=True, index=True)

    db_type = Column(String)
    dbms = Column(String)
    version = Column(String)
    size = Column(String)
    host_server = Column(String)
    port = Column(String)
    description = Column(Text)

    doc_type = Column(String)
    format = Column(String)
    doc_number = Column(String)
    revision = Column(String)
    effective_date = Column(Date)
    review_date = Column(Date)
    storage_location = Column(String)

    record_type = Column(String)
    retention_period = Column(String)
    created_date = Column(Date)
    disposal_date = Column(Date)

    archive_type = Column(String)
    archive_date = Column(Date)

    keterangan = Column(Text)

    asset = relationship("AssetCommon", back_populates="information")


class AssetAuditLog(Base):
    __tablename__ = "asset_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey('asset_common.id'), nullable=False)
    asset_code = Column(String, nullable=False)
    asset_name = Column(String, nullable=False)
    sub_category = Column(String, nullable=False)
    action_type = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'))
    username = Column(String)
    ip_address = Column(String)
    details = Column(JSON, default={})
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    asset = relationship("AssetCommon")
    user = relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "asset_id": self.asset_id,
            "asset_code": self.asset_code,
            "asset_name": self.asset_name,
            "sub_category": self.sub_category,
            "action_type": self.action_type,
            "user_id": self.user_id,
            "username": self.username,
            "ip_address": self.ip_address,
            "details": self.details,
            "timestamp": to_iso(self.timestamp)
        }


class AssetMetadataCategory(Base):
    """Asset categories managed per-role"""
    __tablename__ = "asset_metadata_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    owner_role = Column(String(50), nullable=False, index=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint('name', 'owner_role', name='uq_cat_name_role'),
    )

    sub_categories = relationship("AssetMetadataSubCategory", back_populates="category", cascade="all, delete-orphan")


class AssetMetadataSubCategory(Base):
    """Asset sub-categories linked to parent category, managed per-role"""
    __tablename__ = "asset_metadata_sub_categories"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("asset_metadata_categories.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    owner_role = Column(String(50), nullable=False, index=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint('name', 'category_id', name='uq_subcat_name_cat'),
    )

    category = relationship("AssetMetadataCategory", back_populates="sub_categories")


class AssetMetadataClassification(Base):
    """Asset classification levels managed per-role"""
    __tablename__ = "asset_metadata_classifications"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    color = Column(String(20), default="#6B7280")
    owner_role = Column(String(50), nullable=False, index=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint('name', 'owner_role', name='uq_class_name_role'),
    )


class AssetMetadataStatus(Base):
    """Asset statuses managed per-role"""
    __tablename__ = "asset_metadata_statuses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    color = Column(String(20), default="#6B7280")
    owner_role = Column(String(50), nullable=False, index=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint('name', 'owner_role', name='uq_status_name_role'),
    )
