"""Transaction-safe versioned migration system"""
import logging
from sqlalchemy import text
from database import engine

logger = logging.getLogger(__name__)


def _run_migration(conn, name: str, sqls: list[str]):
    for sql in sqls:
        conn.execute(text(sql))
    logger.info(f"[MIGRATE] Applied: {name}")


def _is_migration_applied(conn, name: str) -> bool:
    try:
        result = conn.execute(text("SELECT 1 FROM migration_history WHERE name = :name"), {"name": name})
        return result.fetchone() is not None
    except Exception:
        return False


def _mark_migration_applied(conn, name: str):
    conn.execute(text("INSERT INTO migration_history (name, applied_at) VALUES (:name, datetime('now'))"), {"name": name})


def _ensure_migration_table(conn):
    conn.execute(text("""CREATE TABLE IF NOT EXISTS migration_history (
        id INTEGER PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at DATETIME DEFAULT (datetime('now'))
    )"""))


MIGRATIONS = [
    ("001_document_library_columns", [
        "ALTER TABLE document_library ADD COLUMN status TEXT DEFAULT 'draft'",
        "ALTER TABLE document_library ADD COLUMN download_count INTEGER DEFAULT 0",
        "ALTER TABLE document_library ADD COLUMN view_count INTEGER DEFAULT 0",
        "ALTER TABLE document_library ADD COLUMN approved_by INTEGER DEFAULT NULL",
        "ALTER TABLE document_library ADD COLUMN approved_at DATETIME DEFAULT NULL",
    ]),
    ("002_asset_config_category", [
        "ALTER TABLE asset_configurations ADD COLUMN category_id INTEGER DEFAULT NULL",
    ]),
    ("003_config_change_history", [
        "ALTER TABLE config_change_history ADD COLUMN asset_id INTEGER DEFAULT NULL",
        "ALTER TABLE config_change_history ADD COLUMN parameter VARCHAR(200) DEFAULT NULL",
    ]),
    ("004_penilaian_risiko_columns", [
        "ALTER TABLE penilaian_risiko ADD COLUMN frekuensi_sebelum_desc TEXT",
        "ALTER TABLE penilaian_risiko ADD COLUMN dampak_sebelum_desc TEXT",
        "ALTER TABLE penilaian_risiko ADD COLUMN dampak_sebelum_finansial TEXT",
        "ALTER TABLE penilaian_risiko ADD COLUMN frekuensi_sesudah_desc TEXT",
        "ALTER TABLE penilaian_risiko ADD COLUMN dampak_sesudah_desc TEXT",
        "ALTER TABLE penilaian_risiko ADD COLUMN dampak_sesudah_finansial TEXT",
        "ALTER TABLE penilaian_risiko ADD COLUMN frekuensi_target_desc TEXT",
        "ALTER TABLE penilaian_risiko ADD COLUMN dampak_target_desc TEXT",
        "ALTER TABLE penilaian_risiko ADD COLUMN dampak_target_finansial TEXT",
    ]),
    ("005_peluang_columns", [
        "ALTER TABLE peluang ADD COLUMN manfaat_diharapkan_value INTEGER",
        "ALTER TABLE peluang ADD COLUMN manfaat_diharapkan_desc TEXT",
        "ALTER TABLE peluang ADD COLUMN manfaat_saat_ini_value INTEGER",
        "ALTER TABLE peluang ADD COLUMN manfaat_saat_ini_desc TEXT",
        "ALTER TABLE peluang ADD COLUMN sumber_daya_value INTEGER",
        "ALTER TABLE peluang ADD COLUMN sumber_daya_desc TEXT",
        "ALTER TABLE peluang ADD COLUMN opportunity_grade VARCHAR(20)",
        "ALTER TABLE peluang ADD COLUMN opportunity_grade_label VARCHAR(50)",
    ]),
    ("006_user_security_columns", [
        "ALTER TABLE users ADD COLUMN login_attempts INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN locked_until DATETIME DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN last_failed_login DATETIME DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN reset_token TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN reset_token_expires DATETIME DEFAULT NULL",
    ]),
    ("007_password_changed_at", [
        "ALTER TABLE users ADD COLUMN password_changed_at DATETIME DEFAULT NULL",
    ]),
    ("008_user_sessions_table", [
        """CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            token_jti VARCHAR NOT NULL,
            ip_address VARCHAR,
            user_agent VARCHAR,
            created_at DATETIME,
            expires_at DATETIME,
            is_active BOOLEAN DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )""",
    ]),
    ("009_user_last_login", [
        "ALTER TABLE users ADD COLUMN last_login DATETIME DEFAULT NULL",
    ]),
    ("010_user_status", [
        "ALTER TABLE users ADD COLUMN status VARCHAR DEFAULT 'active'",
    ]),
    ("011_worklog_checklist", [
        """CREATE TABLE IF NOT EXISTS worklog_checklist (
            id INTEGER PRIMARY KEY,
            worklog_id INTEGER NOT NULL,
            name VARCHAR(255) NOT NULL,
            notes TEXT,
            is_completed BOOLEAN DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME,
            FOREIGN KEY (worklog_id) REFERENCES work_logs(id)
        )""",
    ]),
    ("012_role_settings_tabs", [
        "ALTER TABLE roles ADD COLUMN settings_tabs TEXT DEFAULT '[\"general\", \"sessions\"]'",
    ]),
    ("013_irmc_folders", [
        """CREATE TABLE IF NOT EXISTS irmc_folders (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            color TEXT DEFAULT 'blue',
            created_by INTEGER,
            created_at DATETIME DEFAULT (datetime('now')),
            FOREIGN KEY (created_by) REFERENCES users(id)
        )""",
        "ALTER TABLE irmc_check ADD COLUMN folder_id INTEGER DEFAULT NULL",
    ]),
    ("014_email_otp", [
        "ALTER TABLE users ADD COLUMN otp_enabled BOOLEAN DEFAULT 0",
    ]),
    ("015_db_health_orphan_cleanup", [
        "DELETE FROM asset_audit_logs WHERE asset_id NOT IN (SELECT id FROM asset_common)",
    ]),
    ("016_role_data_isolation", []),
    ("017_soft_delete", []),
    ("018_task_indexes", []),
    ("019_worklog_photos", []),
    ("020_worklog_progress", []),
    ("021_task_notes", [
        "ALTER TABLE project_tasks ADD COLUMN photo_urls TEXT DEFAULT '[]'",
        """CREATE TABLE IF NOT EXISTS task_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            photo_urls TEXT DEFAULT '[]',
            hours TEXT,
            created_at DATETIME DEFAULT (datetime('now')),
            created_by INTEGER,
            FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON task_notes(task_id)",
        "CREATE INDEX IF NOT EXISTS idx_task_notes_created_at ON task_notes(created_at)",
    ]),
    ("022_form_folders", [
        """CREATE TABLE IF NOT EXISTS form_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(100) NOT NULL,
            description VARCHAR(500),
            parent_id INTEGER,
            owner_role VARCHAR(50) NOT NULL,
            created_by INTEGER,
            created_at DATETIME DEFAULT (datetime('now')),
            updated_at DATETIME DEFAULT (datetime('now')),
            version INTEGER DEFAULT 0,
            FOREIGN KEY (parent_id) REFERENCES form_folders(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_form_folders_owner_role ON form_folders(owner_role)",
        "CREATE INDEX IF NOT EXISTS idx_form_folders_parent_id ON form_folders(parent_id)",
        "ALTER TABLE form_uploads ADD COLUMN folder_id INTEGER REFERENCES form_folders(id)",
        "CREATE INDEX IF NOT EXISTS idx_form_uploads_folder_id ON form_uploads(folder_id)",
    ]),
    ("023_form_types", [
        """CREATE TABLE IF NOT EXISTS form_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(100) NOT NULL UNIQUE,
            description VARCHAR(500),
            color VARCHAR(20) DEFAULT 'blue',
            icon VARCHAR(20) DEFAULT '\U0001f4c4',
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            owner_role VARCHAR(50) NOT NULL,
            created_by INTEGER,
            created_at DATETIME DEFAULT (datetime('now')),
            updated_at DATETIME DEFAULT (datetime('now')),
            version INTEGER DEFAULT 0,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_form_types_owner_role ON form_types(owner_role)",
        "CREATE INDEX IF NOT EXISTS idx_form_types_name ON form_types(name)",
    ]),
    ("024_backup_owner_role", [
        "ALTER TABLE backup_history ADD COLUMN owner_role VARCHAR(50)",
        "CREATE INDEX IF NOT EXISTS idx_backup_history_owner_role ON backup_history(owner_role)",
    ]),
    ("025_backup_backfill_owner_role", [
        "UPDATE backup_history SET owner_role = 'Sysadmin' WHERE owner_role IS NULL",
    ]),
    ("026_asset_metadata_tables", [
        """CREATE TABLE IF NOT EXISTS asset_metadata_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            owner_role VARCHAR(50) NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now'))
        )""",
        "CREATE INDEX IF NOT EXISTS idx_asset_meta_cat_role ON asset_metadata_categories(owner_role)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_meta_cat_name_role ON asset_metadata_categories(name, owner_role)",
        """CREATE TABLE IF NOT EXISTS asset_metadata_sub_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            owner_role VARCHAR(50) NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now')),
            FOREIGN KEY (category_id) REFERENCES asset_metadata_categories(id) ON DELETE CASCADE
        )""",
        "CREATE INDEX IF NOT EXISTS idx_asset_meta_subcat_cat ON asset_metadata_sub_categories(category_id)",
        "CREATE INDEX IF NOT EXISTS idx_asset_meta_subcat_role ON asset_metadata_sub_categories(owner_role)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_meta_subcat_name_cat ON asset_metadata_sub_categories(name, category_id)",
        """CREATE TABLE IF NOT EXISTS asset_metadata_classifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(100) NOT NULL,
            color VARCHAR(20) DEFAULT '#6B7280',
            owner_role VARCHAR(50) NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now'))
        )""",
        "CREATE INDEX IF NOT EXISTS idx_asset_meta_class_role ON asset_metadata_classifications(owner_role)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_meta_class_name_role ON asset_metadata_classifications(name, owner_role)",
        """CREATE TABLE IF NOT EXISTS asset_metadata_statuses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(100) NOT NULL,
            color VARCHAR(20) DEFAULT '#6B7280',
            owner_role VARCHAR(50) NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now'))
        )""",
        "CREATE INDEX IF NOT EXISTS idx_asset_meta_status_role ON asset_metadata_statuses(owner_role)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_meta_status_name_role ON asset_metadata_statuses(name, owner_role)",
        """INSERT OR IGNORE INTO asset_metadata_categories (name, description, owner_role, sort_order)
           VALUES ('hardware', 'Physical servers, laptops, network devices', 'superadmin', 1)""",
        """INSERT OR IGNORE INTO asset_metadata_categories (name, description, owner_role, sort_order)
           VALUES ('software', 'OS licenses, applications, utilities', 'superadmin', 2)""",
        """INSERT OR IGNORE INTO asset_metadata_categories (name, description, owner_role, sort_order)
           VALUES ('users', 'Team members, FTP users, samba users', 'superadmin', 3)""",
        """INSERT OR IGNORE INTO asset_metadata_categories (name, description, owner_role, sort_order)
           VALUES ('virtual-infrastructure', 'VMs, containers, cloud instances', 'superadmin', 4)""",
        """INSERT OR IGNORE INTO asset_metadata_categories (name, description, owner_role, sort_order)
           VALUES ('information', 'Databases, documents, records, archives', 'superadmin', 5)""",
        """INSERT OR IGNORE INTO asset_metadata_classifications (name, color, owner_role, sort_order)
           VALUES ('public', '#22C55E', 'superadmin', 1)""",
        """INSERT OR IGNORE INTO asset_metadata_classifications (name, color, owner_role, sort_order)
           VALUES ('internal', '#3B82F6', 'superadmin', 2)""",
        """INSERT OR IGNORE INTO asset_metadata_classifications (name, color, owner_role, sort_order)
           VALUES ('confidential', '#EF4444', 'superadmin', 3)""",
        """INSERT OR IGNORE INTO asset_metadata_statuses (name, color, owner_role, sort_order)
           VALUES ('active', '#22C55E', 'superadmin', 1)""",
        """INSERT OR IGNORE INTO asset_metadata_statuses (name, color, owner_role, sort_order)
           VALUES ('in-maintenance', '#F59E0B', 'superadmin', 2)""",
        """INSERT OR IGNORE INTO asset_metadata_statuses (name, color, owner_role, sort_order)
           VALUES ('retired', '#6B7280', 'superadmin', 3)""",
        """INSERT OR IGNORE INTO asset_metadata_statuses (name, color, owner_role, sort_order)
           VALUES ('lost', '#EF4444', 'superadmin', 4)""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'team_member', 'Internal team members', owner_role, 1
           FROM asset_metadata_categories WHERE name = 'users' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'ftp_user', 'FTP/SFTP user accounts', owner_role, 2
           FROM asset_metadata_categories WHERE name = 'users' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'samba_192', 'Samba 192 shared accounts', owner_role, 3
           FROM asset_metadata_categories WHERE name = 'users' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'samba_sequis', 'Samba Sequis shared accounts', owner_role, 4
           FROM asset_metadata_categories WHERE name = 'users' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'sig_member', 'SIG group members', owner_role, 5
           FROM asset_metadata_categories WHERE name = 'users' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'server_rack', 'Rack-mounted servers', owner_role, 1
           FROM asset_metadata_categories WHERE name = 'hardware' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'server_tower', 'Tower servers', owner_role, 2
           FROM asset_metadata_categories WHERE name = 'hardware' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'kvm', 'KVM switches', owner_role, 3
           FROM asset_metadata_categories WHERE name = 'hardware' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'laptop', 'Laptops and notebooks', owner_role, 4
           FROM asset_metadata_categories WHERE name = 'hardware' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'disk_sas', 'SAS disk drives', owner_role, 5
           FROM asset_metadata_categories WHERE name = 'hardware' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'tape_cassette', 'Tape cassettes', owner_role, 6
           FROM asset_metadata_categories WHERE name = 'hardware' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'os_license', 'Operating system licenses', owner_role, 1
           FROM asset_metadata_categories WHERE name = 'software' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'application', 'Business applications', owner_role, 2
           FROM asset_metadata_categories WHERE name = 'software' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'utility', 'Utility software', owner_role, 3
           FROM asset_metadata_categories WHERE name = 'software' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'freeware', 'Freeware and open-source', owner_role, 4
           FROM asset_metadata_categories WHERE name = 'software' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'virtual_machine', 'Virtual machines', owner_role, 1
           FROM asset_metadata_categories WHERE name = 'virtual-infrastructure' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'container', 'Docker containers', owner_role, 2
           FROM asset_metadata_categories WHERE name = 'virtual-infrastructure' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'cloud_instance', 'Cloud instances (AWS/GCP/Azure)', owner_role, 3
           FROM asset_metadata_categories WHERE name = 'virtual-infrastructure' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'database', 'Database systems', owner_role, 1
           FROM asset_metadata_categories WHERE name = 'information' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'document', 'Documents and files', owner_role, 2
           FROM asset_metadata_categories WHERE name = 'information' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
           SELECT id, 'record', 'Business records', owner_role, 3
           FROM asset_metadata_categories WHERE name = 'information' AND owner_role = 'superadmin'""",
        """INSERT OR IGNORE INTO asset_metadata_sub_categories (category_id, name, description, owner_role, sort_order)
            SELECT id, 'archive', 'Archived data', owner_role, 4
            FROM asset_metadata_categories WHERE name = 'information' AND owner_role = 'superadmin'""",
    ]),
    ("027_worklog_status_timestamps", [
        "ALTER TABLE work_logs ADD COLUMN completed_at DATETIME DEFAULT NULL",
        "ALTER TABLE work_logs ADD COLUMN cancelled_at DATETIME DEFAULT NULL",
    ]),
    ("028_risk_target_waktu_string", [
        "ALTER TABLE penilaian_risiko RENAME COLUMN target_waktu TO target_waktu_old",
        "ALTER TABLE penilaian_risiko ADD COLUMN target_waktu VARCHAR(50) DEFAULT NULL",
        "UPDATE penilaian_risiko SET target_waktu = CAST(target_waktu_old AS TEXT) WHERE target_waktu_old IS NOT NULL",
    ]),
    ("029_interested_party_owner_role", [
        "ALTER TABLE interested_parties ADD COLUMN owner_role VARCHAR(50) DEFAULT NULL",
    ]),
    ("030_penilaian_isu_matrix_id", [
        "ALTER TABLE penilaian_risiko ADD COLUMN isu_matrix_id INTEGER DEFAULT NULL",
    ]),
    ("031_ssh_login_unique_constraint_with_duration", [
        """CREATE TABLE IF NOT EXISTS ssh_login_logs_new (
            id INTEGER PRIMARY KEY,
            hostname VARCHAR NOT NULL,
            ip_address VARCHAR,
            login_timestamp DATETIME NOT NULL,
            username VARCHAR NOT NULL,
            source_ip VARCHAR NOT NULL,
            auth_method VARCHAR DEFAULT 'unknown',
            status VARCHAR NOT NULL,
            duration VARCHAR,
            severity VARCHAR DEFAULT 'LOW',
            scan_date DATE NOT NULL,
            raw_line TEXT,
            created_at DATETIME,
            created_by VARCHAR
        )""",
        """CREATE UNIQUE INDEX IF NOT EXISTS uq_ssh_login_unique ON ssh_login_logs_new(hostname, login_timestamp, username, source_ip, duration, status)""",
        """INSERT OR IGNORE INTO ssh_login_logs_new SELECT id, hostname, ip_address, login_timestamp, username, source_ip, auth_method, status, duration, severity, scan_date, raw_line, created_at, created_by FROM ssh_login_logs""",
        "DROP TABLE IF EXISTS ssh_login_logs",
        "ALTER TABLE ssh_login_logs_new RENAME TO ssh_login_logs",
    ]),
    ("033_capacity_disk_usr_local_syb", [
        "ALTER TABLE capacity_metrics ADD COLUMN disk_usr_local_syb_pct INTEGER DEFAULT NULL",
        "ALTER TABLE capacity_metrics ADD COLUMN disk_usr_local_syb_label TEXT DEFAULT '/usr/local/syb'",
    ]),
    ("032_ssh_login_no_unique_constraint", [
        """CREATE TABLE IF NOT EXISTS ssh_login_logs_v2 (
            id INTEGER PRIMARY KEY,
            hostname VARCHAR NOT NULL,
            ip_address VARCHAR,
            login_timestamp DATETIME NOT NULL,
            username VARCHAR NOT NULL,
            source_ip VARCHAR NOT NULL,
            auth_method VARCHAR DEFAULT 'unknown',
            status VARCHAR NOT NULL,
            duration VARCHAR,
            severity VARCHAR DEFAULT 'LOW',
            scan_date DATE NOT NULL,
            raw_line TEXT,
            created_at DATETIME,
            created_by VARCHAR
        )""",
        """INSERT INTO ssh_login_logs_v2 SELECT id, hostname, ip_address, login_timestamp, username, source_ip, auth_method, status, duration, severity, scan_date, raw_line, created_at, created_by FROM ssh_login_logs""",
        "DROP TABLE IF EXISTS ssh_login_logs",
        "ALTER TABLE ssh_login_logs_v2 RENAME TO ssh_login_logs",
    ]),
    ("034_error_logs", [
        """CREATE TABLE IF NOT EXISTS error_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            level VARCHAR(20) NOT NULL DEFAULT 'ERROR',
            message TEXT NOT NULL,
            traceback TEXT,
            source VARCHAR(20) DEFAULT 'backend',
            request_method VARCHAR(10),
            request_path VARCHAR(500),
            request_id VARCHAR(100),
            user_id INTEGER,
            created_at DATETIME DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs(level)",
    ]),
    ("035_quality_objectives_v2", [
        """CREATE TABLE IF NOT EXISTS quality_objectives_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR NOT NULL,
            category VARCHAR NOT NULL,
            description TEXT,
            tracking_type VARCHAR NOT NULL,
            period VARCHAR DEFAULT 'monthly',
            target_value REAL,
            target_unit VARCHAR,
            evidence_types VARCHAR DEFAULT 'text',
            checklist_items TEXT,
            is_active INTEGER DEFAULT 1,
            owner_role VARCHAR(50),
            created_at DATETIME DEFAULT (datetime('now')),
            created_by INTEGER,
            version INTEGER DEFAULT 0,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_quality_objectives_v2_category ON quality_objectives_v2(category)",
        "CREATE INDEX IF NOT EXISTS idx_quality_objectives_v2_owner_role ON quality_objectives_v2(owner_role)",
        """CREATE TABLE IF NOT EXISTS quality_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            objective_id INTEGER NOT NULL,
            entry_date DATE NOT NULL,
            entry_period VARCHAR NOT NULL,
            value REAL,
            status VARCHAR,
            checklist_result TEXT,
            description TEXT,
            evidence_text TEXT,
            evidence_file VARCHAR,
            evidence_url VARCHAR,
            checked_by INTEGER,
            created_at DATETIME DEFAULT (datetime('now')),
            version INTEGER DEFAULT 0,
            FOREIGN KEY (objective_id) REFERENCES quality_objectives_v2(id),
            FOREIGN KEY (checked_by) REFERENCES users(id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_quality_entries_objective_id ON quality_entries(objective_id)",
        "CREATE INDEX IF NOT EXISTS idx_quality_entries_entry_date ON quality_entries(entry_date)",
        "CREATE INDEX IF NOT EXISTS idx_quality_entries_entry_period ON quality_entries(entry_period)",
    ]),
    ("036_user_sessions_refresh_jti", [
        "ALTER TABLE user_sessions ADD COLUMN refresh_jti VARCHAR",
    ]),
    ("037_user_otp_attempts", [
        "ALTER TABLE user_otp ADD COLUMN attempt_count INTEGER DEFAULT 0",
        "ALTER TABLE user_otp ADD COLUMN locked_until DATETIME",
    ]),
]


def run_migrations():
    """Run all pending migrations with per-step transaction safety."""
    try:
        with engine.begin() as conn:
            _ensure_migration_table(conn)
        for name, sqls in MIGRATIONS:
            with engine.begin() as conn:
                if _is_migration_applied(conn, name):
                    logger.info(f"[MIGRATE] Skipped (already applied): {name}")
                    continue
            try:
                with engine.begin() as conn:
                    _run_migration(conn, name, sqls)
                    _mark_migration_applied(conn, name)
            except Exception as e:
                error_str = str(e).lower()
                if "duplicate column" in error_str or "duplicate column name" in error_str:
                    logger.info(f"[MIGRATE] Column already exists (marking applied): {name}")
                    with engine.begin() as conn:
                        _mark_migration_applied(conn, name)
                else:
                    logger.warning(f"[MIGRATE] FAILED: {name} — {e}")
        logger.info("[MIGRATE] Database schema up to date")
    except Exception as e:
        logger.warning(f"[MIGRATE] Migration error: {e}")
