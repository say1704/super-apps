"""
AI Schema — filtered database schema for LLM context.
Excludes sensitive columns (passwords, tokens, hashes, secrets, keys).
"""
from typing import Dict, List

SENSITIVE_KEYWORDS = frozenset({
    "password", "token", "hash", "reset", "secret", "key", "encrypted",
})

TABLE_SCHEMAS: Dict[str, dict] = {
    "users": {
        "description": "User accounts dan akses aplikasi",
        "columns": {
            "id": "int",
            "username": "string — username login",
            "email": "string — email user",
            "full_name": "string — nama lengkap",
            "role": "string — superadmin / manager / viewer / auditor",
            "is_active": "bool — akun aktif atau tidak",
            "status": "string — active / pending_approval / rejected",
            "otp_enabled": "bool — 2FA aktif",
            "last_login": "datetime — terakhir login",
            "created_at": "datetime — dibuat",
            "password_changed_at": "datetime — terakhir ganti password",
        },
    },
    "roles": {
        "description": "Definisi role dan modul yang bisa diakses",
        "columns": {
            "id": "int",
            "name": "string — nama role",
            "modules": "text — daftar modul JSON",
            "created_at": "datetime",
        },
    },
    "asset_common": {
        "description": "Semua aset IT: hardware, software, virtual, informasi, user",
        "columns": {
            "id": "int",
            "asset_code": "string — kode unik, contoh HW-FUJITSU-001",
            "name": "string — nama aset",
            "category": "string — hardware / software / virtual-infrastructure / information / users",
            "sub_category": "string — server / desktop / laptop / fujitsu / cisco / dll",
            "classification": "string — public / internal / confidential / restricted",
            "owner_name": "string — pemilik aset",
            "assigned_to": "string — ditugaskan ke",
            "location": "string — lokasi fisik",
            "status": "string — ready / used / maintenance / retired / disposal",
            "purchase_date": "date — tanggal beli",
            "warranty_until": "date — garansi sampai",
            "disposal_date": "date — tanggal disposal",
            "price": "float — harga",
            "acceptable_use_policy": "text — kebijakan penggunaan",
            "owner_role": "string — role pemilik",
            "created_at": "datetime",
            "updated_at": "datetime",
            "deleted_at": "datetime — soft delete",
        },
    },
    "asset_hardware": {
        "description": "Detail khusus aset hardware: server, desktop, laptop, dll",
        "columns": {
            "id": "int",
            "asset_id": "int — FK ke asset_common",
            "manufacturer": "string — pabrikan, contoh Fujitsu, HP, Dell",
            "model": "string — tipe/model",
            "serial_number": "string — nomor seri",
            "ip_address": "string — alamat IP",
            "mac_address": "string — alamat MAC",
            "os": "string — sistem operasi",
            "cpu": "string — processor",
            "ram_gb": "int — RAM dalam GB",
            "storage_gb": "int — penyimpanan dalam GB",
            "storage_type": "string — SSD / HDD / NVMe",
            "location_rack": "string — posisi rack",
            "supplier": "string — vendor",
            "warranty_provider": "string — penyedia garansi",
            "notes": "text — catatan tambahan",
        },
    },
    "asset_software": {
        "description": "Detail khusus aset software: lisensi, aplikasi, dll",
        "columns": {
            "id": "int",
            "asset_id": "int — FK ke asset_common",
            "license_type": "string — OSS / Commercial / Trial",
            "license_key": "string — kunci lisensi (tidak sensitif)",
            "total_license": "int — jumlah lisensi",
            "used_license": "int — lisensi terpakai",
            "vendor": "string — vendor software",
            "version": "string — versi software",
            "subscription": "bool — berlangganan?",
            "renewal_date": "date — tanggal perpanjangan",
            "notes": "text",
        },
    },
    "incident_report": {
        "description": "Laporan insiden IT: security, system, network, dll",
        "columns": {
            "id": "int",
            "incident_date": "date — tanggal kejadian",
            "server_name": "string — server terkait",
            "incident_type": "string — tipe: Security / System / Network / Application / Other",
            "description": "text — deskripsi insiden",
            "status": "string — Open / In Progress / Resolved / Closed",
            "action_taken": "text — tindakan yang dilakukan",
            "file_path": "string — lampiran",
            "created_at": "datetime",
            "created_by": "int — FK user pelapor",
            "owner_role": "string",
        },
    },
    "vulnerability_report": {
        "description": "Hasil scan vulnerability di server",
        "columns": {
            "id": "int",
            "server_ip": "string — IP server",
            "scan_date": "date — tanggal scan",
            "tools": "string — tools: Nessus / OpenVAS / dll",
            "high_count": "int — jumlah vuln HIGH",
            "medium_count": "int — jumlah vuln MEDIUM",
            "low_count": "int — jumlah vuln LOW",
            "file_path": "string — file hasil scan",
            "notes": "text",
            "created_at": "datetime",
            "owner_role": "string",
        },
    },
    "isu_matrix": {
        "description": "Isu Matrix — Risk Assessment: daftar isu/risiko",
        "columns": {
            "id": "int",
            "nama_isu": "string — nama isu",
            "kategori": "string — kategori",
            "sumber_risiko": "string — sumber risiko",
            "proses_bisnis": "string — proses bisnis terkait",
            "asset": "string — aset terkait",
            "kerentanan": "text — kerentanan",
            "ancaman": "text — ancaman",
            "risiko": "text — risiko",
            "akibat_dampak": "text — akibat/dampak",
            "created_at": "datetime",
            "owner_role": "string",
            "version": "int",
        },
    },
    "penilaian_risiko": {
        "description": "Penilaian Risiko — risk assessment detail dengan scoring",
        "columns": {
            "id": "int",
            "isu_matrix_id": "int — FK ke isu_matrix",
            "nama_isu": "string",
            "frekuensi_dasar": "int — 1-5",
            "dampak_dasar": "int — 1-5",
            "nrd": "int — Nilai Risiko Dasar (frekuensi * dampak)",
            "pengendalian_yg_ada": "text",
            "pemilihan_kontrol": "text",
            "frekuensi_sesudah": "int — 1-5",
            "dampak_sesudah": "int — 1-5",
            "nrs": "int — Nilai Risiko Sisa",
            "pengendalian_tambahan": "text",
            "kebutuhan_sumber_daya": "text",
            "penanggung_jawab": "string",
            "target_waktu": "string — tanggal atau quarter Q.1 2026",
            "frekuensi_target": "int — 1-5",
            "dampak_target": "int — 1-5",
            "nt": "int — Nilai Target",
            "tgl_peninjauan": "date",
            "status_pelaksanaan": "string",
            "created_at": "datetime",
            "owner_role": "string",
        },
    },
    "interested_parties": {
        "description": "Interested Parties — pihak terkait dalam risk assessment",
        "columns": {
            "id": "int",
            "nama_pihak": "string",
            "kategori": "string",
            "konteks_ekspektasi": "text",
            "persyaratan": "text",
            "dampak": "string",
            "created_at": "datetime",
            "owner_role": "string",
        },
    },
    "peluang": {
        "description": "Peluang — Opportunities untuk improvement",
        "columns": {
            "id": "int",
            "nama_peluang": "string",
            "deskripsi": "text",
            "kategori": "string",
            "status": "string — Open / In Progress / Done / Cancelled",
            "priority": "string — low / medium / high",
            "target_date": "date",
            "manfaat": "text",
            "sumber_daya": "text",
            "created_at": "datetime",
            "owner_role": "string",
        },
    },
    "quality_objectives": {
        "description": "Sasaran Mutu — Quality Objectives bulanan",
        "columns": {
            "id": "int",
            "year": "int — tahun",
            "work_unit": "string — unit kerja",
            "objective": "text — sasaran mutu",
            "sla": "string — target/SLA",
            "month_01": "string — Jan",
            "month_02": "string — Feb",
            "month_03": "string — Mar",
            "month_04": "string — Apr",
            "month_05": "string — May",
            "month_06": "string — Jun",
            "month_07": "string — Jul",
            "month_08": "string — Aug",
            "month_09": "string — Sep",
            "month_10": "string — Oct",
            "month_11": "string — Nov",
            "month_12": "string — Dec",
            "summary": "text",
            "created_at": "datetime",
            "owner_role": "string",
        },
    },
    "irmc_check": {
        "description": "IRMC Check — pengecekan server rutin",
        "columns": {
            "id": "int",
            "server_name": "string — nama server",
            "check_date": "date — tanggal cek",
            "status": "string — pass / warning / fail / pending",
            "notes": "text — catatan",
            "folder_id": "int — folder/kategori",
            "created_at": "datetime",
            "created_by": "int — pelaksana",
        },
    },
    "monthly_server_check": {
        "description": "Monthly Server Check — pengecekan server bulanan",
        "columns": {
            "id": "int",
            "ip_server": "string — IP server",
            "month": "string — bulan, contoh 2026-05",
            "check_date": "date",
            "status": "string — OK / Warning / Critical",
            "notes": "text",
            "created_at": "datetime",
        },
    },
    "capacity_metrics": {
        "description": "Capacity Metrics — monitoring kapasitas server harian (SAR data)",
        "columns": {
            "id": "int",
            "server_name": "string — nama server",
            "record_date": "date — tanggal record",
            "cpu_percent": "float — penggunaan CPU %",
            "memory_percent": "float — penggunaan memory %",
            "disk_percent": "float — penggunaan disk %",
            "load_1m": "float — load average 1 menit",
            "load_5m": "float — load average 5 menit",
            "load_15m": "float — load average 15 menit",
            "scan_date": "date — tanggal scan",
            "created_at": "datetime",
        },
    },
    "project_tasks": {
        "description": "Task/pekerjaan yang perlu diselesaikan",
        "columns": {
            "id": "int",
            "title": "string — judul task",
            "description": "text — deskripsi",
            "priority": "string — low / medium / high / urgent",
            "status": "string — todo / doing / done / cancelled",
            "assigned_to": "string — ditugaskan ke",
            "due_date": "date — deadline",
            "estimated_hours": "float — estimasi jam",
            "sprint_id": "int — FK sprint",
            "completed_at": "datetime",
            "created_at": "datetime",
            "created_by": "int",
        },
    },
    "work_log": {
        "description": "Work log / timesheet — catatan jam kerja",
        "columns": {
            "id": "int",
            "task_id": "int — FK task",
            "user_id": "int — FK user",
            "log_date": "date — tanggal kerja",
            "start_time": "string — jam mulai",
            "end_time": "string — jam selesai",
            "estimated_hours": "string — estimasi, contoh 2h30m",
            "actual_hours": "string — realisasi, contoh 2h",
            "description": "text — deskripsi pekerjaan",
            "status": "string — planned / in_progress / done",
            "created_at": "datetime",
        },
    },
    "activity_log": {
        "description": "Activity log — catatan aktivitas user di aplikasi",
        "columns": {
            "id": "int",
            "user_id": "int — FK user",
            "action": "string — CREATE / UPDATE / DELETE / LOGIN / LOGOUT",
            "module": "string — modul terkait",
            "description": "text — detail aktivitas",
            "ip_address": "string",
            "created_at": "datetime",
        },
    },
    "ssh_login_logs": {
        "description": "SSH Login Report — log login SSH dari server",
        "columns": {
            "id": "int",
            "hostname": "string — hostname server",
            "ip_address": "string — IP server",
            "login_timestamp": "datetime — waktu login",
            "username": "string — user yang login",
            "source_ip": "string — IP sumber",
            "auth_method": "string — publickey / password / keyboard-interactive",
            "status": "string — success / failed",
            "severity": "string — LOW / MEDIUM / HIGH / CRITICAL",
            "scan_date": "date",
            "created_at": "datetime",
        },
    },
    "backup_history": {
        "description": "Backup history — riwayat backup server",
        "columns": {
            "id": "int",
            "server_name": "string",
            "backup_date": "datetime",
            "status": "string — Success / Failed / Warning",
            "size_gb": "float — ukuran backup",
            "type": "string — Full / Incremental / Differential",
            "path": "string — lokasi backup",
            "notes": "text",
            "created_at": "datetime",
        },
    },
    "notifications": {
        "description": "Notifikasi untuk user",
        "columns": {
            "id": "int",
            "user_id": "int — FK user tujuan",
            "title": "string — judul notifikasi",
            "message": "text — isi notifikasi",
            "type": "string — task_assign / incident / backup_fail / task_due",
            "is_read": "bool — sudah dibaca?",
            "link": "string — link terkait",
            "created_at": "datetime",
        },
    },
    "log_maintenance": {
        "description": "Log Maintenance — pencatatan maintenance/hapus log server",
        "columns": {
            "id": "int",
            "server": "string — nama server",
            "path": "string — path file log",
            "script_execution": "text — script yang dijalankan",
            "execution_date": "date — tanggal eksekusi",
            "size": "string — ukuran, contoh 21G / 850M",
            "notes": "text",
            "created_at": "datetime",
            "owner_role": "string",
        },
    },
    "documents": {
        "description": "Dokumentasi dan knowledge base",
        "columns": {
            "id": "int",
            "category": "string — Instruksi Kerja / Tutorial / SOP / Manual / Referensi",
            "title": "string — judul dokumen",
            "version": "string — versi",
            "author": "string — penulis",
            "description": "text — deskripsi",
            "tags": "string — tag, comma-separated",
            "created_at": "datetime",
            "created_by": "int",
        },
    },
    "app_settings": {
        "description": "Pengaturan aplikasi key-value",
        "columns": {
            "id": "int",
            "category": "string — general / security / notification / backup / ai",
            "key": "string — nama setting",
            "value": "text — nilai setting",
            "updated_at": "datetime",
        },
    },
}

# Tables that require owner_role filtering for non-superadmin
RBAC_TABLES = frozenset({
    "asset_common", "incident_report", "vulnerability_report",
    "isu_matrix", "penilaian_risiko", "interested_parties", "peluang",
    "quality_objectives", "log_maintenance",
})

# Tables that require created_by filtering for non-superadmin
CREATED_BY_TABLES = frozenset({
    "irmc_check", "monthly_server_check", "documents",
    "project_tasks", "work_log", "backup_history",
})


def is_sensitive_column(col_name: str) -> bool:
    for kw in SENSITIVE_KEYWORDS:
        if kw in col_name.lower():
            return True
    return False


def filter_sensitive_columns(columns: dict) -> dict:
    return {k: v for k, v in columns.items() if not is_sensitive_column(k)}


def get_schema_text(exclude_tables: frozenset = frozenset()) -> str:
    lines: List[str] = []
    for table_name, schema in TABLE_SCHEMAS.items():
        if table_name in exclude_tables:
            continue
        col_text = []
        for col_name, col_type in schema["columns"].items():
            if not is_sensitive_column(col_name):
                col_text.append(f"    - {col_name}: {col_type}")
        lines.append(f"## {table_name} ({schema['description']})")
        lines.append("Columns:")
        lines.extend(col_text)
        lines.append("")
    return "\n".join(lines)


def get_compact_schema_text(exclude_tables: frozenset = frozenset()) -> str:
    """Compact schema: table_desc: col1, col2, ... — ~5x smaller than get_schema_text."""
    lines: List[str] = []
    for table_name, schema in TABLE_SCHEMAS.items():
        if table_name in exclude_tables:
            continue
        cols = [cn for cn in schema["columns"] if not is_sensitive_column(cn)]
        desc = schema["description"]
        lines.append(f"{table_name} ({desc}): {', '.join(cols)}")
    return "\n".join(lines)


def get_columns(table_name: str) -> dict:
    schema = TABLE_SCHEMAS.get(table_name)
    if not schema:
        return {}
    return filter_sensitive_columns(schema["columns"])


def get_all_tables() -> list:
    return list(TABLE_SCHEMAS.keys())


def get_table_description(table_name: str) -> str:
    schema = TABLE_SCHEMAS.get(table_name)
    return schema["description"] if schema else ""
