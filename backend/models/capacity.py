from .base import Base
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Float, UniqueConstraint, Index, JSON
from datetime import datetime, timezone


class CapacityMetrics(Base):
    """SAR-based capacity metrics for servers"""
    __tablename__ = "capacity_metrics"

    id = Column(Integer, primary_key=True, index=True)

    tanggal = Column(Date, nullable=False, index=True)
    hostname = Column(String, nullable=False, index=True)
    ip_address = Column(String, nullable=True)
    source = Column(String, default='sar_ssh')

    cpu_user_avg = Column(Float, default=0)
    cpu_system_avg = Column(Float, default=0)
    cpu_iowait_avg = Column(Float, default=0)
    cpu_idle_avg = Column(Float, default=0)
    cpu_peak = Column(Float, default=0)
    cpu_peak_time = Column(String, nullable=True)
    cpu_peak_max = Column(Float, nullable=True)

    ram_avg = Column(Float, default=0)
    ram_peak = Column(Float, default=0)
    ram_peak_time = Column(String, nullable=True)
    ram_peak_max = Column(Float, nullable=True)
    kbmemfree_avg = Column(Float, default=0)
    kbcommit_avg = Column(Float, default=0)

    disk_root_pct = Column(Integer, default=0)
    disk_data_pct = Column(Integer, nullable=True, default=None)
    disk_data_label = Column(String, default='/Backup')
    disk_usr_local_syb_pct = Column(Integer, nullable=True, default=None)
    disk_usr_local_syb_label = Column(String, default='/usr/local/syb')

    net_rx_peak = Column(Float, default=0)
    net_tx_peak = Column(Float, default=0)
    net_conn = Column(Integer, default=0)

    server_date = Column(String, nullable=True)
    local_ip = Column(String, nullable=True)
    public_ip = Column(String, nullable=True)
    ethernet_interfaces = Column(JSON, nullable=True)
    system_info = Column(JSON, nullable=True)

    status = Column(String, default='ok')
    alert_reason = Column(Text, nullable=True)
    peak_description = Column(Text, nullable=True)

    parsed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    log_file = Column(String, nullable=True)
    created_by = Column(String, nullable=True)

    __table_args__ = (
        __import__('sqlalchemy').UniqueConstraint('tanggal', 'hostname', name='uq_tanggal_hostname'),
    )


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


class NetworkInterface(Base):
    """Network interface metrics - stores multiple interfaces per server per day"""
    __tablename__ = "network_interfaces"

    id = Column(Integer, primary_key=True, index=True)
    capacity_metric_id = Column(Integer, nullable=True)
    hostname = Column(String, nullable=False, index=True)
    tanggal = Column(Date, nullable=False, index=True)
    interface_name = Column(String, nullable=False, index=True)
    speed = Column(String, nullable=True)
    total_rx = Column(String, nullable=True)
    total_tx = Column(String, nullable=True)
    total_rx_error = Column(Integer, default=0)
    total_tx_error = Column(Integer, default=0)
    total_packet_drop = Column(Integer, default=0)
    internet_status = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint('tanggal', 'hostname', 'interface_name', name='uq_net_intf_date_host_name'),
    )
