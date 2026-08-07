"""Migration 026: Asset metadata tables for role-based CRUD.
Enables each role to manage its own categories, sub-categories, classifications, and statuses.
"""

MIGRATION_SQL = [
    # Asset Categories - role-based
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

    # Asset Sub-Categories - linked to parent category, role-based
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

    # Asset Classifications - role-based
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

    # Asset Statuses - role-based
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

    # Seed default data for existing roles (superadmin can manage, others see their role's data)
    # Built-in categories (visible to all via hardcoded fallback)
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

    # Built-in classifications
    """INSERT OR IGNORE INTO asset_metadata_classifications (name, color, owner_role, sort_order)
       VALUES ('public', '#22C55E', 'superadmin', 1)""",
    """INSERT OR IGNORE INTO asset_metadata_classifications (name, color, owner_role, sort_order)
       VALUES ('internal', '#3B82F6', 'superadmin', 2)""",
    """INSERT OR IGNORE INTO asset_metadata_classifications (name, color, owner_role, sort_order)
       VALUES ('confidential', '#EF4444', 'superadmin', 3)""",

    # Built-in statuses
    """INSERT OR IGNORE INTO asset_metadata_statuses (name, color, owner_role, sort_order)
       VALUES ('active', '#22C55E', 'superadmin', 1)""",
    """INSERT OR IGNORE INTO asset_metadata_statuses (name, color, owner_role, sort_order)
       VALUES ('in-maintenance', '#F59E0B', 'superadmin', 2)""",
    """INSERT OR IGNORE INTO asset_metadata_statuses (name, color, owner_role, sort_order)
       VALUES ('retired', '#6B7280', 'superadmin', 3)""",
    """INSERT OR IGNORE INTO asset_metadata_statuses (name, color, owner_role, sort_order)
       VALUES ('lost', '#EF4444', 'superadmin', 4)""",
]
