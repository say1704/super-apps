"""Database models for Super Apps - IT Management System"""
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, Boolean, Float, create_engine, JSON, UniqueConstraint, Index
from sqlalchemy.orm import relationship, declarative_base, sessionmaker, backref
from datetime import datetime, timezone
from utils.timezone import to_iso
import bcrypt

Base = declarative_base()

# ==================== AUTHENTICATION ====================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    role = Column(String, default="superadmin")  # superadmin, auditor, manager, viewer
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True)
    login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)
    last_failed_login = Column(DateTime, nullable=True)
    reset_token = Column(String, nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)
    otp_enabled = Column(Boolean, default=False)
    password_changed_at = Column(DateTime, nullable=True)
    last_login = Column(DateTime, nullable=True)
    status = Column(String, default="active")  # pending_approval, active, rejected
    version = Column(Integer, default=0)

    def verify_password(self, password):
        return bcrypt.checkpw(password.encode('utf-8'), self.hashed_password.encode('utf-8'))

    @staticmethod
    def hash_password(password):
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

class UserModuleAccess(Base):
    __tablename__ = "user_module_access"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    module = Column(String, nullable=False, index=True)
    can_access = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=0)

    __table_args__ = (
        UniqueConstraint('user_id', 'module', name='uq_user_module'),
    )

    user = relationship("User")

class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_jti = Column(String, nullable=False, index=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)

    user = relationship("User")


class UserOTP(Base):
    """One-time password codes for email verification"""
    __tablename__ = "user_otp"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    code = Column(String(6), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)

    user = relationship("User")


# ==================== MODULE 1: LOG & MAINTENANCE ====================
class LogMaintenance(Base):
    __tablename__ = "log_maintenance"
    
    id = Column(Integer, primary_key=True, index=True)
    server = Column(String, nullable=False)
    path = Column(String)
    script_execution = Column(Text)
    execution_date = Column(Date)
    size = Column(String)
    notes = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    owner_role = Column(String(50), nullable=True, index=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    version = Column(Integer, default=0)

class IrmcFolder(Base):
    __tablename__ = "irmc_folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    color = Column(String, default="blue")
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    checks = relationship("IRMCCheck", back_populates="folder")


class IRMCCheck(Base):
    __tablename__ = "irmc_check"

    id = Column(Integer, primary_key=True, index=True)
    server_name = Column(String, nullable=False)
    check_date = Column(Date, nullable=False)
    screenshot_path = Column(String)
    notes = Column(Text)
    status = Column(String(20), default="pending")
    folder_id = Column(Integer, ForeignKey("irmc_folders.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))

    folder = relationship("IrmcFolder", back_populates="checks")

# ==================== MODULE 2: MONTHLY SERVER CHECK ====================
class MonthlyServerCheck(Base):
    __tablename__ = "monthly_server_check"
    
    id = Column(Integer, primary_key=True, index=True)
    ip_server = Column(String, nullable=False)
    month = Column(String, nullable=False)
    check_date = Column(Date, nullable=False)
    status = Column(String)  # OK, Warning, Critical
    notes = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    version = Column(Integer, default=0)

# ==================== MODULE 3: VULNERABILITY REPORT ====================
class VulnerabilityReport(Base):
    __tablename__ = "vulnerability_report"
    
    id = Column(Integer, primary_key=True, index=True)
    server_ip = Column(String, nullable=False)
    scan_date = Column(Date, nullable=False)
    tools = Column(String)  # Nessus, OpenVAS, etc.
    high_count = Column(Integer, default=0)
    medium_count = Column(Integer, default=0)
    low_count = Column(Integer, default=0)
    file_path = Column(String)
    notes = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    owner_role = Column(String(50), nullable=True, index=True)

# ==================== MODULE 4: INCIDENT REPORT ====================
class IncidentReport(Base):
    __tablename__ = "incident_report"
    
    id = Column(Integer, primary_key=True, index=True)
    incident_date = Column(Date, nullable=False)
    server_name = Column(String, nullable=False)
    incident_type = Column(String)  # Security, System, Network, etc.
    description = Column(Text, nullable=False)
    status = Column(String, default="Open")  # Open, In Progress, Resolved, Closed
    action_taken = Column(Text)
    file_path = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    owner_role = Column(String(50), nullable=True, index=True)
    version = Column(Integer, default=0)

# ==================== MODULE 5: DOCUMENTATION & KNOWLEDGE BASE ====================
class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, nullable=False)  # Instruksi Kerja, Tutorial, SOP, etc.
    title = Column(String, nullable=False)
    version = Column(String, default="1.0")
    author = Column(String)
    file_path = Column(String)
    description = Column(Text)
    tags = Column(String)  # Comma-separated tags
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))

# ==================== MODULE 6: ASSET REGISTER (SHARED + EXTENSION) ====================
# Pattern: Shared common table + category-specific extension tables
# Benefits: Type-safe columns, fast queries, easy to maintain, clean web display

class AssetCommon(Base):
    """Shared asset fields - all assets have these"""
    __tablename__ = "asset_common"
    
    id = Column(Integer, primary_key=True, index=True)
    asset_code = Column(String, unique=True, nullable=False, index=True)  # AST-2026-001
    name = Column(String, nullable=False)
    category = Column(String, nullable=False, index=True)  # users/hardware/software/virtual-infrastructure/information
    sub_category = Column(String, index=True)
    classification = Column(String, default="internal", index=True)  # public/internal/confidential
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
    
    # Relationships to extension tables
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
    
    # FTP User fields
    username = Column(String)
    password_encrypted = Column(Text)
    server_ip = Column(String)
    port = Column(String)
    protocol = Column(String)
    home_directory = Column(String)
    category = Column(String)  # FTP user category
    requester = Column(String)
    
    # Samba fields
    group_name = Column(String)
    permission_level = Column(String)
    account_status = Column(String)
    email = Column(String)
    comments = Column(Text)
    
    # Team member fields
    employee_id = Column(String)
    department = Column(String)
    position = Column(String)
    phone = Column(String)
    
    # SIG member fields
    interest_type = Column(Text)
    responsible_party = Column(String)
    communication_mechanism = Column(String)
    shared_data = Column(Text)
    contact_detail = Column(String)
    
    # Common user fields
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
    
    # Compute resources
    cpu = Column(String)
    ram = Column(String)
    storage = Column(String)
    
    # Server-specific
    virtualization = Column(String)
    hypervisor = Column(String)
    rack_units = Column(String)
    rack_position = Column(String)
    
    # Network device
    device_type = Column(String)
    firmware_version = Column(String)
    port_count = Column(String)
    
    # Printer
    printer_type = Column(String)
    color_support = Column(String)
    
    # KVM
    kvm_type = Column(String)
    
    # Storage (disk/tape)
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
    
    # Common resources
    cpu = Column(String)
    ram = Column(String)
    storage = Column(String)
    
    # VM fields
    host_server = Column(String)
    hypervisor = Column(String)
    os = Column(String)
    ip_address = Column(String)
    
    # Container fields
    platform = Column(String)
    image_name = Column(String)
    host = Column(String)
    namespace = Column(String)
    
    # Cloud fields
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
    
    # Database fields
    db_type = Column(String)
    dbms = Column(String)
    version = Column(String)
    size = Column(String)
    host_server = Column(String)
    port = Column(String)
    description = Column(Text)
    
    # Document fields
    doc_type = Column(String)
    format = Column(String)
    doc_number = Column(String)
    revision = Column(String)
    effective_date = Column(Date)
    review_date = Column(Date)
    storage_location = Column(String)
    
    # Record fields
    record_type = Column(String)
    retention_period = Column(String)
    created_date = Column(Date)
    disposal_date = Column(Date)
    
    # Archive fields
    archive_type = Column(String)
    archive_date = Column(Date)
    
    keterangan = Column(Text)
    
    asset = relationship("AssetCommon", back_populates="information")


# ==================== MODULE 2: CONFIGURATION CATALOG ====================
class AssetConfiguration(Base):
    __tablename__ = "asset_configurations"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("asset_common.id"), nullable=False, index=True)

    # Configuration details
    parameter = Column(String, nullable=False)  # e.g., "SSH Port", "Firewall Status"
    value = Column(Text, nullable=False)  # Current value

    # Category (text label for backward compat)
    category = Column(String, default="operational")

    # Category reference (FK to config_categories)
    category_id = Column(Integer, ForeignKey("config_categories.id"), nullable=True, index=True)

    # Notes for documentation
    notes = Column(Text)  # Additional context or documentation

    # Timestamps
    last_checked = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(String)
    updated_by = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=0)

    # Relationship
    asset = relationship("AssetCommon", back_populates="configurations")
    category_rel = relationship("ConfigCategory", foreign_keys=[category_id])


# ==================== CONFIGURATION CATEGORIES ====================
class ConfigCategory(Base):
    __tablename__ = "config_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)  # e.g., "Security", "Performance"
    color = Column(String, default="blue")  # Tailwind color class for badge
    sort_order = Column(Integer, default=0)
    description = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationship
    configurations = relationship("AssetConfiguration", back_populates="category_rel")


class ConfigChangeHistory(Base):
    __tablename__ = "config_change_history"

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("asset_configurations.id"), nullable=True, index=True)
    asset_id = Column(Integer, ForeignKey("asset_common.id"), nullable=True, index=True)
    parameter = Column(String(200), nullable=True)

    # Change details
    old_value = Column(Text, nullable=False)
    new_value = Column(Text, nullable=False)
    change_reason = Column(Text)
    change_request_id = Column(String)  # Link to change request

    # Audit
    changed_by = Column(String)
    changed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationship
    configuration = relationship("AssetConfiguration", back_populates="change_history")

# Add relationship to AssetCommon model
AssetCommon.configurations = relationship("AssetConfiguration", back_populates="asset", cascade="all, delete-orphan")
AssetConfiguration.change_history = relationship("ConfigChangeHistory", back_populates="configuration")


# ==================== MODULE: CAPACITY PLANNING ====================
class CapacityMetrics(Base):
    """SAR-based capacity metrics for servers"""
    __tablename__ = "capacity_metrics"

    id = Column(Integer, primary_key=True, index=True)
    
    # Identification
    tanggal = Column(Date, nullable=False, index=True)  # YYYY-MM-DD
    hostname = Column(String, nullable=False, index=True)  # server-01
    ip_address = Column(String, nullable=True)
    source = Column(String, default='sar_ssh')  # sar_ssh | manual | script
    
    # CPU Metrics (%)
    cpu_user_avg = Column(Float, default=0)
    cpu_system_avg = Column(Float, default=0)
    cpu_iowait_avg = Column(Float, default=0)
    cpu_idle_avg = Column(Float, default=0)
    cpu_peak = Column(Float, default=0)
    cpu_peak_time = Column(String, nullable=True)
    cpu_peak_max = Column(Float, nullable=True)
    
    # RAM Metrics (%)
    ram_avg = Column(Float, default=0)
    ram_peak = Column(Float, default=0)
    ram_peak_time = Column(String, nullable=True)
    ram_peak_max = Column(Float, nullable=True)
    kbmemfree_avg = Column(Float, default=0)
    kbcommit_avg = Column(Float, default=0)
    
    # Disk Metrics (%)
    disk_root_pct = Column(Integer, default=0)
    disk_data_pct = Column(Integer, default=0)
    disk_data_label = Column(String, default='/Backup')

    # Network Metrics (Mbps)
    net_rx_peak = Column(Float, default=0)
    net_tx_peak = Column(Float, default=0)
    net_conn = Column(Integer, default=0)
    
    # Status & Alert
    status = Column(String, default='ok')  # ok | warning | critical
    alert_reason = Column(Text, nullable=True)
    peak_description = Column(Text, nullable=True)
    
    # Metadata
    parsed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    log_file = Column(String, nullable=True)
    created_by = Column(String, nullable=True)
    
    # Constraint: no duplicate data for same server on same date
    __table_args__ = (
        # Unique constraint for tanggal + hostname
        __import__('sqlalchemy').UniqueConstraint('tanggal', 'hostname', name='uq_tanggal_hostname'),
    )


# ==================== DISK PARTITIONS (Dynamic) ====================
class DiskPartition(Base):
    """Individual disk partitions - stores ALL partitions from SAR logs"""
    __tablename__ = "disk_partitions"

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String, nullable=False, index=True)
    tanggal = Column(Date, nullable=False, index=True)
    mount_point = Column(String, nullable=False, index=True)
    filesystem = Column(String, nullable=True)
    size = Column(String, nullable=True)
    used = Column(String, nullable=True)
    avail = Column(String, nullable=True)
    use_pct = Column(Integer, nullable=True)
    source = Column(String, default='sar_ssh')
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint('tanggal', 'hostname', 'mount_point', name='uq_disk_part_date_host_mount'),
    )


# ==================== MODULE 7: RISK ASSESSMENT ====================
class PenilaianRisiko(Base):
    __tablename__ = "penilaian_risiko"
    
    id = Column(Integer, primary_key=True, index=True)
    nama_isu = Column(String)
    proses_bisnis = Column(String)
    nama_asset = Column(String)
    kerentanan = Column(Text)
    ancaman = Column(Text)
    risiko = Column(Text)
    akibat_dampak = Column(Text)
    frekuensi_sebelum = Column(Integer)
    frekuensi_sebelum_desc = Column(Text)
    dampak_sebelum = Column(Integer)
    dampak_sebelum_desc = Column(Text)
    dampak_sebelum_finansial = Column(Text)
    nilai_risiko_dasar = Column(Integer)
    pengendalian_yang_ada = Column(Text)
    pemilihan_kontrol = Column(Text)
    frekuensi_sesudah = Column(Integer)
    frekuensi_sesudah_desc = Column(Text)
    dampak_sesudah = Column(Integer)
    dampak_sesudah_desc = Column(Text)
    dampak_sesudah_finansial = Column(Text)
    nilai_risiko_sisa = Column(Integer)
    pengendalian_tambahan = Column(Text)
    kebutuhan_sumber_daya = Column(Text)
    penanggung_jawab = Column(String)
    target_waktu = Column(String, nullable=True)
    isu_matrix_id = Column(Integer, nullable=True)
    frekuensi_target = Column(Integer)
    frekuensi_target_desc = Column(Text)
    dampak_target = Column(Integer)
    dampak_target_desc = Column(Text)
    dampak_target_finansial = Column(Text)
    nilai_risiko_target = Column(Integer)
    tanggal_peninjauan = Column(Date)
    status_pelaksanaan = Column(String, default="Belum Dimulai")
    owner_role = Column(String(50), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime, nullable=True)  # PATCH: Soft delete support
    version = Column(Integer, default=0)

class InterestedParty(Base):
    __tablename__ = "interested_parties"
    
    id = Column(Integer, primary_key=True, index=True)
    interested_party = Column(String)
    needs = Column(Text)
    expectations = Column(Text)
    risk = Column(String)
    opportunity = Column(String)
    owner_role = Column(String(50), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime, nullable=True)
    version = Column(Integer, default=0)

class Peluang(Base):
    __tablename__ = "peluang"
    
    id = Column(Integer, primary_key=True, index=True)
    opportunities = Column(Text)
    manfaat_diharapkan = Column(Text)
    manfaat_diharapkan_value = Column(Integer)
    manfaat_diharapkan_desc = Column(Text)
    manfaat_saat_ini = Column(Text)
    manfaat_saat_ini_value = Column(Integer)
    manfaat_saat_ini_desc = Column(Text)
    kebutuhan_sumber_daya = Column(Text)
    sumber_daya_value = Column(Integer)
    sumber_daya_desc = Column(Text)
    opportunity_grade = Column(String)
    opportunity_grade_label = Column(String)
    action_plan_what = Column(Text)
    action_plan_resources = Column(Text)
    action_plan_who = Column(String)
    action_plan_when = Column(String)
    action_plan_how = Column(Text)
    keterangan = Column(Text)
    owner_role = Column(String(50), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime, nullable=True)  # PATCH: Soft delete support
    version = Column(Integer, default=0)

class IsuMatrix(Base):
    __tablename__ = "isu_matrix"
    
    id = Column(Integer, primary_key=True, index=True)
    kategori = Column(String)
    issues = Column(Text)
    risks = Column(Text)
    opportunities = Column(Text)
    owner_role = Column(String(50), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime, nullable=True)  # PATCH: Soft delete support
    version = Column(Integer, default=0)

class RiskAssessmentForm(Base):
    __tablename__ = "risk_assessment_forms"
    
    id = Column(Integer, primary_key=True, index=True)
    document_number = Column(String)
    version = Column(String, default="1.0")
    date = Column(Date)
    created_by = Column(String)
    reviewed_by = Column(String)
    approved_by = Column(String)
    classification = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class RiskAssessmentLog(Base):
    __tablename__ = "risk_assessment_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("risk_assessment_forms.id"))
    date = Column(Date)
    prepared_by = Column(String)
    verified_by = Column(String)
    change_description = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class RiskAssessmentItem(Base):
    __tablename__ = "risk_assessment_items"
    
    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("risk_assessment_forms.id"))
    interested_party = Column(String)
    needs = Column(Text)
    expectations = Column(Text)
    risk = Column(Text)
    opportunity = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class OpportunityItem(Base):
    __tablename__ = "opportunity_items"
    
    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("risk_assessment_forms.id"))
    opportunity = Column(Text)
    benefits = Column(Text)
    current_state = Column(Text)
    resources = Column(Text)
    action_plan = Column(Text)
    evaluation_result = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class IssueItem(Base):
    __tablename__ = "issue_items"
    
    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("risk_assessment_forms.id"))
    issue = Column(Text)
    risk = Column(Text)
    opportunities = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class ISMSNotes(Base):
    __tablename__ = "isms_notes"
    
    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("risk_assessment_forms.id"))
    notes = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

# ==================== MODULE 8: QUALITY OBJECTIVES ====================
class QualityObjective(Base):
    __tablename__ = "quality_objectives"
    
    id = Column(Integer, primary_key=True, index=True)
    work_unit = Column(String, nullable=False)
    objective = Column(Text, nullable=False)
    sla = Column(Text, nullable=True)
    what = Column(Text)
    resources = Column(Text)
    who = Column(String)
    when = Column(String)
    how_evaluated = Column(Text)
    attachment = Column(String)
    monthly_data = Column(Text)  # JSON string: array of {metric_name, target, tools, months: {2025-01: ..., 2025-02: ...}, summary}
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    owner_role = Column(String(50), nullable=True, index=True)
    version = Column(Integer, default=0)

class QualityEvidence(Base):
    __tablename__ = "quality_evidence"
    
    id = Column(Integer, primary_key=True, index=True)
    objective_id = Column(Integer, ForeignKey("quality_objectives.id"))
    file_path = Column(String)
    description = Column(Text)
    custom_table = Column(Text)  # JSON for custom tables
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))

# ==================== MODULE 9: CONFIGURATION MANAGEMENT ====================
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

# ==================== MODULE 10: FORM UPLOADS ====================
class FormType(Base):
    __tablename__ = "form_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(String(500), nullable=True)
    color = Column(String(20), default="blue")
    icon = Column(String(20), default="📄")
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    owner_role = Column(String(50), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=0)

    uploads = relationship("FormUpload", back_populates="form_type_rel", foreign_keys="FormUpload.form_type", primaryjoin="FormType.name==foreign(FormUpload.form_type)")


class FormFolder(Base):
    __tablename__ = "form_folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    parent_id = Column(Integer, ForeignKey("form_folders.id"), nullable=True, index=True)
    owner_role = Column(String(50), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=0)

    parent = relationship("FormFolder", remote_side=[id], backref="children")
    uploads = relationship("FormUpload", back_populates="folder", cascade="all, delete-orphan")


class FormUpload(Base):
    __tablename__ = "form_uploads"

    id = Column(Integer, primary_key=True, index=True)
    form_type = Column(String, nullable=False)  # References FormType.name
    file_name = Column(String, nullable=False)
    upload_date = Column(Date, nullable=False)
    pic = Column(String)
    notes = Column(Text)
    file_path = Column(String)
    folder_id = Column(Integer, ForeignKey("form_folders.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    owner_role = Column(String(50), nullable=True, index=True)

    folder = relationship("FormFolder", back_populates="uploads")
    form_type_rel = relationship("FormType", back_populates="uploads", foreign_keys=[form_type], primaryjoin="FormType.name==FormUpload.form_type")

# ==================== ACTIVITY TRACKER ====================
class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String, nullable=False)  # CREATE, UPDATE, DELETE, VIEW, EXPORT, etc.
    module = Column(String, nullable=False)  # assets, configurations, worklog, etc.
    description = Column(Text)
    asset_id = Column(Integer, nullable=True)  # For asset-related activities
    asset_code = Column(String, nullable=True)  # For asset reference
    details = Column(Text, nullable=True)  # JSON details
    ip_address = Column(String, nullable=True)  # User IP address
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

# ==================== WORKLOG ====================
class WorkLog(Base):
    __tablename__ = "work_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(Date, nullable=False)
    time = Column(String)  # Store time as string "HH:MM"
    description = Column(Text, nullable=False)
    status = Column(String, default="in_progress")  # in_progress, done
    tags = Column(String)  # Comma-separated tags
    category = Column(String, default="General")  # Meeting, Development, Maintenance, etc.
    estimated_time = Column(String)  # e.g., "2h" or "120 minutes"
    actual_time = Column(String)
    notes = Column(Text)  # Additional notes/comments
    task_id = Column(Integer, ForeignKey("project_tasks.id"), nullable=True)  # Link to project task
    photo_urls = Column(Text, default="[]")  # JSON array of photo file paths
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    version = Column(Integer, default=0)
    
    # Relationship
    task = relationship("ProjectTask", back_populates="worklogs")
    checklist_items = relationship("WorklogChecklist", back_populates="worklog", cascade="all, delete-orphan", order_by="WorklogChecklist.sort_order")

class WorklogChecklist(Base):
    __tablename__ = "worklog_checklist"

    id = Column(Integer, primary_key=True, index=True)
    worklog_id = Column(Integer, ForeignKey("work_logs.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    notes = Column(Text, nullable=True)
    is_completed = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=0)

    worklog = relationship("WorkLog", back_populates="checklist_items")

class WorklogProgress(Base):
    __tablename__ = "worklog_progress"

    id = Column(Integer, primary_key=True, index=True)
    worklog_id = Column(Integer, ForeignKey("work_logs.id"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    photo_urls = Column(Text, default="[]")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    worklog = relationship("WorkLog", backref=backref("progress_entries", cascade="all, delete-orphan"))

# ==================== LOG COMPRESSION ====================
class LogCompression(Base):
    __tablename__ = "log_compression"

    id = Column(Integer, primary_key=True, index=True)
    server = Column(String(255), nullable=False, index=True)
    archive_info = Column(String(500), nullable=False)
    execution_date = Column(Date, nullable=False, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    owner_role = Column(String(50), nullable=True, index=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    version = Column(Integer, default=0)

    # Relationship
    creator = relationship("User", foreign_keys=[created_by])

# ==================== PROJECT TASKS (SCRUM) ====================
class ProjectTask(Base):
    __tablename__ = "project_tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    status = Column(String, default="todo")  # todo, doing, done
    assignee = Column(String)
    priority = Column(String, default="medium")  # low, medium, high
    due_date = Column(Date)
    tags = Column(String, default="")  # Comma-separated tags
    estimated_hours = Column(String, nullable=True)  # Estimated hours for task
    actual_hours = Column(String, nullable=True)  # Sum of worklog actual time
    photo_urls = Column(Text, default="[]")  # JSON array of photo file paths
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    completed_at = Column(DateTime, nullable=True)
    version = Column(Integer, default=0)
    
    # Relationship
    worklogs = relationship("WorkLog", back_populates="task", cascade="all, delete-orphan")
    notes = relationship("TaskNote", back_populates="task", cascade="all, delete-orphan", order_by="TaskNote.created_at.asc()")

class TaskNote(Base):
    __tablename__ = "task_notes"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("project_tasks.id"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    photo_urls = Column(Text, default="[]")  # JSON array of photo file paths
    hours = Column(String, nullable=True)  # Optional logged hours
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))

    task = relationship("ProjectTask", back_populates="notes")

# ==================== SPRINT MANAGEMENT ====================
class Sprint(Base):
    __tablename__ = "sprints"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    start_date = Column(Date)
    end_date = Column(Date)
    status = Column(String, default="planned")  # planned, active, completed
    goal = Column(Text)
    task_ids = Column(String, default="")  # Comma-separated task IDs
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    version = Column(Integer, default=0)

# ==================== MODULE: BACKUP CHECK (NEW) ====================
class BackupHistory(Base):
    """TimescaleDB-compatible backup history for analytics"""
    __tablename__ = "backup_history"
    __table_args__ = (
        Index("ix_backup_history_server_date", "server_name", "backup_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    server_name = Column(String, nullable=False, index=True)  # IP address
    backup_date = Column(Date, nullable=False, index=True)  # Date of backup
    jumlah_files = Column(Integer, default=0)  # Number of files
    total_size_bytes = Column(Integer, default=0)  # Size in bytes
    total_size_kb = Column(Float, default=0)  # Size in KB
    total_size_mb = Column(Float, default=0)  # Size in MB
    total_size_gb = Column(Float, default=0)  # Size in GB
    status = Column(String, default="OK")  # OK, Warning, Critical
    filename = Column(String)  # Original log filename
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)  # When recorded
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # User who ran the check
    owner_role = Column(String, nullable=True, index=True)  # Role group for RBAC filtering

    def to_dict(self):
        return {
            "id": self.id,
            "server_name": self.server_name,
            "backup_date": self.backup_date.isoformat() if self.backup_date else None,
            "jumlah_files": self.jumlah_files,
            "total_size_bytes": self.total_size_bytes,
            "total_size_kb": self.total_size_kb,
            "total_size_mb": self.total_size_mb,
            "total_size_gb": self.total_size_gb,
            "total_size_formatted": self.format_size(self.total_size_bytes),
            "status": self.status,
            "filename": self.filename,
            "created_at": to_iso(self.created_at),
        }

    @staticmethod
    def format_size(size_bytes: int) -> str:
        """Format bytes to human readable size"""
        if size_bytes == 0:
            return "0 B"
        units = ['B', 'KB', 'MB', 'GB', 'TB']
        unit_index = 0
        size = float(size_bytes)
        while size >= 1024 and unit_index < len(units) - 1:
            size /= 1024
            unit_index += 1
        if unit_index == 0:
            return f"{int(size)} {units[unit_index]}"
        else:
            return f"{size:.2f} {units[unit_index]}"


# ==================== ASSET AUDIT LOGS ====================
class AssetAuditLog(Base):
    __tablename__ = "asset_audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey('asset_common.id'), nullable=False)
    asset_code = Column(String, nullable=False)
    asset_name = Column(String, nullable=False)
    sub_category = Column(String, nullable=False)
    action_type = Column(String, nullable=False)  # view_password, view_password_failed, edit, delete, create, export
    user_id = Column(Integer, ForeignKey('users.id'))
    username = Column(String)
    ip_address = Column(String)
    details = Column(JSON, default={})
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    
    # Relationships
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


# ==================== MODULE: DOCUMENT LIBRARY (SOP, Reports, Instructions) ====================
class DocumentLibrary(Base):
    """Store SOP, work instructions, maintenance reports, and other documents"""
    __tablename__ = "document_library"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    category = Column(String(100), nullable=False, index=True)  # SOP, Work Instruction, Maintenance Report, Other
    doc_type = Column(String(50), default="text")  # text, markdown, uploaded (file)
    file_path = Column(String(500), nullable=True)  # Path to uploaded file (PDF/DOCX/TXT)
    content_html = Column(Text, nullable=True)  # Rich-text content (for text type)
    summary = Column(Text, nullable=True)  # Brief description/summary
    tags = Column(String(500), nullable=True)  # Comma-separated tags
    version = Column(Integer, default=1)
    status = Column(String(30), default="draft", index=True)  # draft, pending_approval, approved, rejected, archived
    download_count = Column(Integer, default=0)
    view_count = Column(Integer, default=0)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))


class DocumentCategory(Base):
    """Categories for organizing documents (user-managed CRUD)"""
    __tablename__ = "document_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(String(500), nullable=True)
    icon = Column(String(20), default="📁")  # Emoji icon for UI
    color = Column(String(7), default="#6b7280")  # Hex color for badges
    sort_order = Column(Integer, default=0)
    is_active = Column(Integer, default=1)  # 1 = active, 0 = hidden
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    version = Column(Integer, default=0)


class DocumentVersion(Base):
    """Track version history of documents"""
    __tablename__ = "document_versions"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("document_library.id"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    content_html = Column(Text, nullable=True)
    file_path = Column(String(500), nullable=True)
    summary = Column(Text, nullable=True)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    change_note = Column(Text, nullable=True)  # Why was this version changed
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class SMTPSettings(Base):
    """SMTP configuration for email notifications"""
    __tablename__ = "smtp_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=0)

class AppSettings(Base):
    """Unified application settings (key-value store)"""
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, nullable=False, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=0)

class BackupSchedule(Base):
    """Automated database backup schedule configuration"""
    __tablename__ = "backup_schedule"

    id = Column(Integer, primary_key=True, index=True)
    frequency = Column(String, nullable=False, default="daily")  # hourly, daily, weekly, monthly
    time = Column(String, default="02:00")  # HH:MM format
    day_of_week = Column(Integer, nullable=True)  # 0=Monday to 6=Sunday (for weekly)
    day_of_month = Column(Integer, nullable=True)  # 1-28 (for monthly)
    enabled = Column(Boolean, default=True)
    retention_days = Column(Integer, default=30)  # Auto-delete backups older than N days
    max_backups = Column(Integer, default=10)  # Keep max N backups
    last_run = Column(DateTime, nullable=True)
    next_run = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Notification(Base):
    """In-app notification for users"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, index=True)
    link = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    user = relationship("User")

class Role(Base):
    """Role definition with module access mapping"""
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    description = Column(String, default="")
    modules = Column(Text, default="[]")
    settings_tabs = Column(Text, default='["general", "sessions"]')
    is_system = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=0)


# ==================== ASSET METADATA (Role-Based CRUD) ====================

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


# ==================== MODULE: SSH REPORT ====================
class SSHLoginLog(Base):
    """SSH login audit logs parsed from SSH report files"""
    __tablename__ = "ssh_login_logs"

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String, nullable=False, index=True)
    ip_address = Column(String, nullable=True)
    login_timestamp = Column(DateTime, nullable=False, index=True)
    username = Column(String, nullable=False, index=True)
    source_ip = Column(String, nullable=False, index=True)
    auth_method = Column(String, default='unknown')
    status = Column(String, nullable=False, index=True)
    duration = Column(String, nullable=True)
    severity = Column(String, default='LOW')
    scan_date = Column(Date, nullable=False, index=True)
    raw_line = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)

    __table_args__ = ()
