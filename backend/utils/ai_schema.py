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
            "login_attempts": "int — percobaan login gagal",
            "locked_until": "datetime — terkunci sampai",
            "version": "int",
        },
    },
    "roles": {
        "description": "Definisi role dan modul yang bisa diakses",
        "columns": {
            "id": "int",
            "name": "string — nama role",
            "description": "string — deskripsi role",
            "modules": "text — daftar modul JSON",
            "settings_tabs": "text — tab settings",
            "is_system": "bool — role system?",
            "created_at": "datetime",
            "version": "int",
        },
    },
    "asset_common": {
        "description": "Semua aset IT: hardware, software, virtual, informasi, user",
        "columns": {
            "id": "int",
            "asset_code": "string — kode unik, contoh AST-2026-001",
            "name": "string — nama aset",
            "category": "string — hardware / software / virtual-infrastructure / information / users",
            "sub_category": "string — server / desktop / laptop / team_member / ftp_user / dll",
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
            "created_by": "string — pembuat",
            "updated_by": "string — pengubah",
            "owner_role": "string — role pemilik",
            "created_at": "datetime",
            "updated_at": "datetime",
            "deleted_at": "datetime — soft delete",
            "version": "int",
        },
    },
    "asset_hardware": {
        "description": "Detail khusus aset hardware: server, desktop, laptop, dll",
        "columns": {
            "id": "int",
            "asset_id": "int — FK ke asset_common",
            "serial_number": "string — nomor seri",
            "model": "string — tipe/model",
            "manufacturer": "string — pabrikan, contoh Fujitsu, HP, Dell",
            "ip_address": "string — alamat IP",
            "cpu": "string — processor",
            "ram": "string — RAM",
            "storage": "string — penyimpanan",
            "virtualization": "string — tipe virtualisasi",
            "hypervisor": "string — hypervisor",
            "rack_units": "string — unit rack",
            "rack_position": "string — posisi rack",
            "device_type": "string — server / network / storage / printer / kvm / tape",
            "firmware_version": "string — versi firmware",
            "port_count": "string — jumlah port",
            "printer_type": "string — laser / inkjet / dot matrix",
            "color_support": "string — warna / B/W",
            "kvm_type": "string — local / IP",
            "capacity": "string — kapasitas",
            "rpm": "string — RPM untuk HDD",
            "interface": "string — interface, contoh SATA / SAS / USB",
            "storage_location": "string — lokasi penyimpanan",
            "tape_type": "string — LTO-5 / LTO-6 / LTO-7",
            "tape_label": "string — label tape",
            "generation": "string — generasi",
            "first_used_date": "date — tanggal mulai pakai",
            "retention_period": "string — periode retensi",
            "keterangan": "text — catatan tambahan",
        },
    },
    "asset_software": {
        "description": "Detail khusus aset software: lisensi, aplikasi, dll",
        "columns": {
            "id": "int",
            "asset_id": "int — FK ke asset_common",
            "version": "string — versi software",
            "license": "string — tipe lisensi",
            "main_function": "string — fungsi utama aplikasi",
            "department": "string — departemen pengguna",
            "vendor": "string — vendor software",
            "license_count": "int — jumlah lisensi",
            "os_name": "string — sistem operasi target",
            "utility_type": "string — tipe utility",
            "download_url": "string — URL download",
            "notes": "text",
        },
    },
    "incident_report": {
        "description": "Laporan insiden IT: security, system, network, dll",
        "columns": {
            "id": "int",
            "incident_date": "date — tanggal kejadian",
            "server_name": "string — server terkait",
            "incident_type": "string — Security / System / Network / Application / Other",
            "description": "text — deskripsi insiden",
            "status": "string — Open / In Progress / Resolved / Closed",
            "action_taken": "text — tindakan yang dilakukan",
            "file_path": "string — lampiran",
            "created_at": "datetime",
            "created_by": "int — FK user pelapor",
            "owner_role": "string",
            "version": "int",
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
            "created_by": "int",
            "owner_role": "string",
        },
    },
    "isu_matrix": {
        "description": "Isu Matrix — Risk Assessment: daftar isu/risiko",
        "columns": {
            "id": "int",
            "kategori": "string — kategori isu",
            "issues": "text — daftar isu",
            "risks": "text — risiko terkait",
            "opportunities": "text — peluang terkait",
            "created_at": "datetime",
            "owner_role": "string",
            "deleted_at": "datetime — soft delete",
            "version": "int",
        },
    },
    "penilaian_risiko": {
        "description": "Penilaian Risiko — risk assessment dengan scoring 1-5",
        "columns": {
            "id": "int",
            "isu_matrix_id": "int — FK ke isu_matrix",
            "nama_isu": "string — nama isu",
            "proses_bisnis": "string — proses bisnis terkait",
            "nama_asset": "string — aset terkait",
            "kerentanan": "text — kerentanan",
            "ancaman": "text — ancaman",
            "risiko": "text — risiko",
            "akibat_dampak": "text — akibat/dampak",
            "frekuensi_sebelum": "int — 1-5",
            "dampak_sebelum": "int — 1-5",
            "nilai_risiko_dasar": "int — frekuensi * dampak",
            "pengendalian_yang_ada": "text",
            "pemilihan_kontrol": "text",
            "frekuensi_sesudah": "int — 1-5",
            "dampak_sesudah": "int — 1-5",
            "nilai_risiko_sisa": "int",
            "pengendalian_tambahan": "text",
            "kebutuhan_sumber_daya": "text",
            "penanggung_jawab": "string",
            "target_waktu": "string — target, contoh Q.1 2026",
            "frekuensi_target": "int — 1-5",
            "dampak_target": "int — 1-5",
            "nilai_risiko_target": "int",
            "tanggal_peninjauan": "date",
            "status_pelaksanaan": "string",
            "created_at": "datetime",
            "updated_at": "datetime",
            "owner_role": "string",
            "deleted_at": "datetime — soft delete",
            "version": "int",
        },
    },
    "interested_parties": {
        "description": "Interested Parties — pihak terkait risk assessment",
        "columns": {
            "id": "int",
            "interested_party": "string — nama pihak",
            "needs": "text — kebutuhan",
            "expectations": "text — ekspektasi",
            "risk": "string — risiko",
            "opportunity": "string — peluang",
            "created_at": "datetime",
            "owner_role": "string",
            "deleted_at": "datetime — soft delete",
            "version": "int",
        },
    },
    "peluang": {
        "description": "Peluang — Opportunities untuk improvement",
        "columns": {
            "id": "int",
            "opportunities": "text — nama/detail peluang",
            "manfaat_diharapkan": "text",
            "manfaat_diharapkan_value": "int — 0-5",
            "manfaat_saat_ini": "text",
            "manfaat_saat_ini_value": "int — 0-5",
            "kebutuhan_sumber_daya": "text",
            "sumber_daya_value": "int — 0-5",
            "opportunity_grade": "string — LOW / MEDIUM / HIGH",
            "action_plan_what": "text — rencana aksi",
            "action_plan_resources": "text — sumber daya",
            "action_plan_who": "string — penanggung jawab",
            "action_plan_when": "string — jadwal",
            "action_plan_how": "text — cara",
            "keterangan": "text",
            "created_at": "datetime",
            "owner_role": "string",
            "deleted_at": "datetime — soft delete",
            "version": "int",
        },
    },
    "quality_objectives": {
        "description": "Sasaran Mutu — Quality Objectives",
        "columns": {
            "id": "int",
            "work_unit": "string — unit kerja",
            "objective": "text — sasaran mutu",
            "sla": "text — target/SLA",
            "what": "text — apa yang dilakukan",
            "resources": "text — sumber daya",
            "who": "string — penanggung jawab",
            "when": "string — jadwal",
            "how_evaluated": "text — cara evaluasi",
            "attachment": "string — lampiran",
            "monthly_data": "text — data bulanan JSON",
            "created_at": "datetime",
            "created_by": "int",
            "owner_role": "string",
            "version": "int",
        },
    },
    "irmc_check": {
        "description": "IRMC Check — pengecekan server rutin via iRMC",
        "columns": {
            "id": "int",
            "server_name": "string — nama server",
            "check_date": "date — tanggal cek",
            "status": "string — pass / warning / fail / pending",
            "screenshot_path": "string — path screenshot",
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
            "created_by": "int",
            "version": "int",
        },
    },
    "capacity_metrics": {
        "description": "Capacity Metrics — monitoring kapasitas server (SAR data harian)",
        "columns": {
            "id": "int",
            "tanggal": "date — tanggal record",
            "hostname": "string — nama server",
            "ip_address": "string — IP server",
            "source": "string — sumber data",
            "cpu_user_avg": "float — rata-rata CPU user %",
            "cpu_system_avg": "float — rata-rata CPU system %",
            "cpu_iowait_avg": "float — rata-rata I/O wait %",
            "cpu_idle_avg": "float — rata-rata idle %",
            "cpu_peak": "float — puncak CPU %",
            "cpu_peak_time": "string — waktu puncak CPU",
            "cpu_peak_max": "float — max CPU %",
            "ram_avg": "float — rata-rata RAM %",
            "ram_peak": "float — puncak RAM %",
            "ram_peak_time": "string — waktu puncak RAM",
            "ram_peak_max": "float — max RAM %",
            "kbmemfree_avg": "float — rata-rata memori bebas",
            "kbcommit_avg": "float — rata-rata commit",
            "disk_root_pct": "int — penggunaan disk root %",
            "disk_data_pct": "int — penggunaan disk data %",
            "disk_data_label": "string — label disk data",
            "net_rx_peak": "float — puncak RX network",
            "net_tx_peak": "float — puncak TX network",
            "net_conn": "int — koneksi network",
            "status": "string — OK / Warning / Critical",
            "alert_reason": "text — alasan alert",
            "peak_description": "text — deskripsi puncak",
            "parsed_at": "datetime",
            "log_file": "string — file log",
            "created_by": "string",
        },
    },
    "project_tasks": {
        "description": "Task/pekerjaan yang perlu diselesaikan",
        "columns": {
            "id": "int",
            "title": "string — judul task",
            "description": "text — deskripsi",
            "status": "string — todo / doing / done / cancelled",
            "assignee": "string — ditugaskan ke",
            "priority": "string — low / medium / high / urgent",
            "due_date": "date — deadline",
            "tags": "string — tag, comma-separated",
            "estimated_hours": "string — estimasi jam",
            "actual_hours": "string — realisasi jam",
            "photo_urls": "text — foto-foto",
            "created_at": "datetime",
            "updated_at": "datetime",
            "created_by": "int",
            "completed_at": "datetime",
            "version": "int",
        },
    },
    "work_log": {
        "description": "Work log / timesheet — catatan jam kerja harian",
        "columns": {
            "id": "int",
            "user_id": "int — FK user",
            "date": "date — tanggal kerja",
            "time": "string — jam, contoh 08:00-16:00",
            "description": "text — deskripsi pekerjaan",
            "status": "string — todo / in_progress / done",
            "tags": "string — tag, comma-separated",
            "category": "string — kategori",
            "estimated_time": "string — estimasi",
            "actual_time": "string — realisasi",
            "notes": "text — catatan",
            "task_id": "int — FK task",
            "photo_urls": "text",
            "created_at": "datetime",
            "completed_at": "datetime",
            "cancelled_at": "datetime",
            "version": "int",
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
            "asset_id": "int",
            "asset_code": "string",
            "details": "text — detail JSON",
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
            "duration": "string — durasi sesi",
            "severity": "string — LOW / MEDIUM / HIGH / CRITICAL",
            "scan_date": "date",
            "created_at": "datetime",
            "created_by": "string",
        },
    },
    "backup_history": {
        "description": "Backup history — riwayat backup server",
        "columns": {
            "id": "int",
            "server_name": "string — nama server",
            "backup_date": "date — tanggal backup",
            "status": "string — Success / Failed / Warning",
            "jumlah_files": "int — jumlah file",
            "total_size_bytes": "int — ukuran bytes",
            "total_size_kb": "float — ukuran KB",
            "total_size_mb": "float — ukuran MB",
            "total_size_gb": "float — ukuran GB",
            "filename": "string — nama file",
            "created_at": "datetime",
            "created_by": "int",
            "owner_role": "string",
        },
    },
    "notifications": {
        "description": "Notifikasi untuk user",
        "columns": {
            "id": "int",
            "user_id": "int — FK user tujuan",
            "type": "string — task_assign / incident / backup_fail / task_due",
            "title": "string — judul notifikasi",
            "message": "text — isi notifikasi",
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
            "created_by": "int",
            "owner_role": "string",
            "deleted_at": "datetime — soft delete",
            "version": "int",
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
            "file_path": "string — path file",
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
            "version": "int",
        },
    },
    "irmc_folders": {
        "description": "Folder/kategori untuk IRMC Check",
        "columns": {
            "id": "int",
            "name": "string — nama folder (biasanya IP/hostname server)",
            "description": "text — deskripsi folder",
            "color": "string — warna label",
        },
    },
    "form_uploads": {
        "description": "Upload form/dokumen",
        "columns": {
            "id": "int",
            "name": "string — nama form",
            "form_type_id": "int — tipe form",
            "folder_id": "int — folder",
            "created_at": "datetime",
            "created_by": "int",
        },
    },
    "form_types": {
        "description": "Tipe-tipe form upload",
        "columns": {
            "id": "int",
            "name": "string — nama tipe",
            "description": "text",
            "color": "string",
            "icon": "string",
        },
    },
    "form_folders": {
        "description": "Folder untuk form upload",
        "columns": {
            "id": "int",
            "name": "string — nama folder",
            "description": "text",
            "parent_id": "int — folder induk (nullable)",
        },
    },
    "log_compression": {
        "description": "Riwayat kompresi file log",
        "columns": {
            "id": "int",
            "filename": "string — nama file",
            "original_size": "int — ukuran asli (bytes)",
            "compressed_size": "int — ukuran setelah kompresi",
            "compressed_at": "datetime",
        },
    },
    "disk_partitions": {
        "description": "Partisi disk dari pengecekan server bulanan",
        "columns": {
            "id": "int",
            "check_id": "int — FK ke monthly_server_check",
            "mount_point": "string — mount point",
            "total_gb": "float — kapasitas total",
            "used_gb": "float — terpakai",
            "avail_gb": "float — tersedia",
            "use_pct": "float — persen pemakaian",
        },
    },
    "task_notes": {
        "description": "Catatan pada project task",
        "columns": {
            "id": "int",
            "task_id": "int — FK ke project_tasks",
            "content": "text — isi catatan",
            "created_by": "int",
            "created_at": "datetime",
        },
    },
    "sprints": {
        "description": "Sprint perencanaan task",
        "columns": {
            "id": "int",
            "name": "string — nama sprint",
            "start_date": "date",
            "end_date": "date",
            "status": "string — active / completed / cancelled",
        },
    },
    "worklog_checklist": {
        "description": "Checklist item pada work log",
        "columns": {
            "id": "int",
            "worklog_id": "int — FK ke work_logs",
            "item": "string — nama item",
            "is_done": "boolean — status selesai",
        },
    },
    "worklog_progress": {
        "description": "Progress update pada work log",
        "columns": {
            "id": "int",
            "worklog_id": "int — FK ke work_logs",
            "progress_pct": "int — persen progress",
            "note": "text — catatan",
            "created_at": "datetime",
        },
    },
    "quality_evidence": {
        "description": "Evidence/bukti untuk quality objective",
        "columns": {
            "id": "int",
            "objective_id": "int — FK ke quality_objectives",
            "file_name": "string — nama file",
            "description": "text",
            "uploaded_at": "datetime",
        },
    },
    "asset_configurations": {
        "description": "Konfigurasi parameter pada asset",
        "columns": {
            "id": "int",
            "asset_id": "int — FK ke asset_common",
            "parameter": "string — nama parameter",
            "value": "text — nilai parameter",
            "category": "string — kategori",
            "last_checked": "datetime",
        },
    },
    "config_categories": {
        "description": "Kategori konfigurasi asset",
        "columns": {
            "id": "int",
            "name": "string",
            "description": "text",
        },
    },
    "config_change_history": {
        "description": "Riwayat perubahan konfigurasi asset",
        "columns": {
            "id": "int",
            "config_id": "int",
            "old_value": "text — nilai lama",
            "new_value": "text — nilai baru",
            "changed_at": "datetime",
            "changed_by": "int — pengubah",
        },
    },
    "configuration_items": {
        "description": "Item konfigurasi (CI) management",
        "columns": {
            "id": "int",
            "ci_name": "string — nama CI",
            "ci_description": "text — deskripsi",
            "category": "string — kategori",
            "ci_type": "string — tipe",
            "current_status": "string — Active / Inactive / Archived",
            "created_at": "datetime",
        },
    },
    "asset_metadata_categories": {
        "description": "Kategori asset (role-managed)",
        "columns": {
            "id": "int",
            "name": "string — nama kategori",
        },
    },
    "asset_metadata_sub_categories": {
        "description": "Sub kategori asset (role-managed)",
        "columns": {
            "id": "int",
            "category_id": "int — FK ke parent kategori",
            "name": "string — nama sub kategori",
        },
    },
    "asset_metadata_classifications": {
        "description": "Klasifikasi asset (role-managed)",
        "columns": {
            "id": "int",
            "name": "string — nama klasifikasi",
        },
    },
    "asset_metadata_statuses": {
        "description": "Status asset (role-managed)",
        "columns": {
            "id": "int",
            "name": "string — nama status",
        },
    },
    "document_categories": {
        "description": "Kategori dokumen untuk document library",
        "columns": {
            "id": "int",
            "name": "string — nama kategori",
            "description": "text",
        },
    },
    "document_versions": {
        "description": "Riwayat versi dokumen",
        "columns": {
            "id": "int",
            "document_id": "int — FK ke document_library",
            "version": "string — nomor versi",
            "uploaded_at": "datetime",
        },
    },
    "risk_assessment_forms": {
        "description": "Formulir assessment risiko",
        "columns": {
            "id": "int",
            "form_number": "string — nomor form",
            "assessor_name": "string — penilai",
            "assessment_date": "date — tanggal penilaian",
            "status": "string — draft / completed / approved",
        },
    },
    "risk_assessment_logs": {
        "description": "Log perubahan risk assessment form",
        "columns": {
            "id": "int",
            "form_id": "int — FK ke risk_assessment_forms",
            "action": "string — aksi",
            "changed_by": "string — pengubah",
            "created_at": "datetime",
        },
    },
    "risk_assessment_items": {
        "description": "Item penilaian dalam risk assessment form",
        "columns": {
            "id": "int",
            "form_id": "int — FK ke risk_assessment_forms",
            "description": "text",
            "risk_level": "string — Low / Medium / High / Critical",
            "action_plan": "text — rencana tindakan",
        },
    },
    "opportunity_items": {
        "description": "Item peluang dalam risk assessment form",
        "columns": {
            "id": "int",
            "form_id": "int — FK ke risk_assessment_forms",
            "description": "text",
            "target_date": "date",
            "status": "string — open / in_progress / completed",
        },
    },
    "issue_items": {
        "description": "Item isu dalam risk assessment form",
        "columns": {
            "id": "int",
            "form_id": "int — FK ke risk_assessment_forms",
            "description": "text",
            "severity": "string — Low / Medium / High",
            "status": "string — open / mitigated / closed",
        },
    },
    "isms_notes": {
        "description": "Catatan ISMS pada risk assessment form",
        "columns": {
            "id": "int",
            "form_id": "int — FK ke risk_assessment_forms",
            "content": "text",
            "created_by": "int",
            "created_at": "datetime",
        },
    },
    "asset_users": {
        "description": "Detail asset tipe user (FTP, Samba, team, SIG)",
        "columns": {
            "id": "int",
            "asset_id": "int — FK ke asset_common",
            "user_type": "string — FTP / Samba / Team / SIG / Other",
            "username": "string — username",
        },
    },
    "asset_virtual_infrastructure": {
        "description": "Detail asset virtual (VM, container, cloud)",
        "columns": {
            "id": "int",
            "asset_id": "int — FK ke asset_common",
            "vm_type": "string — VM / Container / Cloud",
            "host": "string — hostname server",
            "vcpu": "int — jumlah vCPU",
            "ram_gb": "int — RAM (GB)",
            "storage_gb": "int — storage (GB)",
        },
    },
    "asset_information": {
        "description": "Detail asset tipe informasi (database, dokumen, record)",
        "columns": {
            "id": "int",
            "asset_id": "int — FK ke asset_common",
            "info_type": "string — Database / Document / Record",
            "database_type": "string — MySQL / PostgreSQL / MongoDB / etc",
            "schema_name": "string — nama schema / database",
        },
    },
    "document_library": {
        "description": "Library dokumen SOP/instruksi",
        "columns": {
            "id": "int",
            "title": "string — judul dokumen",
            "category_id": "int — FK ke document_categories",
            "created_at": "datetime",
            "created_by": "int",
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
    "project_tasks", "work_log",
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
