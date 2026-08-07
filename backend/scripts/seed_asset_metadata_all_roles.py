"""Seed asset metadata for all roles that don't have data yet."""
from database import SessionLocal
from models import (
    User, AssetMetadataCategory, AssetMetadataSubCategory,
    AssetMetadataClassification, AssetMetadataStatus,
)
from datetime import datetime, timezone

CATEGORIES = [
    ('hardware', 'Physical servers, laptops, network devices', 1),
    ('software', 'OS licenses, applications, utilities', 2),
    ('users', 'Team members, FTP users, samba users', 3),
    ('virtual-infrastructure', 'VMs, containers, cloud instances', 4),
    ('information', 'Databases, documents, records, archives', 5),
]

SUB_CATEGORIES = {
    'users': [
        ('team_member', 'Internal team members', 1),
        ('ftp_user', 'FTP/SFTP user accounts', 2),
        ('samba_192', 'Samba 192 shared accounts', 3),
        ('samba_sequis', 'Samba Sequis shared accounts', 4),
        ('sig_member', 'SIG group members', 5),
    ],
    'hardware': [
        ('server_rack', 'Rack-mounted servers', 1),
        ('server_tower', 'Tower servers', 2),
        ('kvm', 'KVM switches', 3),
        ('laptop', 'Laptops and notebooks', 4),
        ('disk_sas', 'SAS disk drives', 5),
        ('tape_cassette', 'Tape cassettes', 6),
    ],
    'software': [
        ('os_license', 'Operating system licenses', 1),
        ('application', 'Business applications', 2),
        ('utility', 'Utility software', 3),
        ('freeware', 'Freeware and open-source', 4),
    ],
    'virtual-infrastructure': [
        ('virtual_machine', 'Virtual machines', 1),
        ('container', 'Docker containers', 2),
        ('cloud_instance', 'Cloud instances (AWS/GCP/Azure)', 3),
    ],
    'information': [
        ('database', 'Database systems', 1),
        ('document', 'Documents and files', 2),
        ('record', 'Business records', 3),
        ('archive', 'Archived data', 4),
    ],
}

CLASSIFICATIONS = [
    ('public', '#22C55E', 1),
    ('internal', '#3B82F6', 2),
    ('confidential', '#EF4444', 3),
]

STATUSES = [
    ('active', '#22C55E', 1),
    ('in-maintenance', '#F59E0B', 2),
    ('retired', '#6B7280', 3),
    ('lost', '#EF4444', 4),
]


def seed_role(db, role: str):
    existing_cats = db.query(AssetMetadataCategory).filter(
        AssetMetadataCategory.owner_role == role
    ).count()
    if existing_cats > 0:
        print(f"  [{role}] Already has {existing_cats} categories, skipping")
        return

    now = datetime.now(timezone.utc)
    cat_map = {}

    for name, desc, sort_order in CATEGORIES:
        cat = AssetMetadataCategory(
            name=name, description=desc, owner_role=role,
            sort_order=sort_order, created_at=now,
        )
        db.add(cat)
        cat_map[name] = cat

    db.flush()

    for cat_name, subs in SUB_CATEGORIES.items():
        parent = cat_map.get(cat_name)
        if not parent:
            continue
        for sub_name, sub_desc, sub_sort in subs:
            sub = AssetMetadataSubCategory(
                category_id=parent.id, name=sub_name,
                description=sub_desc, owner_role=role,
                sort_order=sub_sort, created_at=now,
            )
            db.add(sub)

    for name, color, sort_order in CLASSIFICATIONS:
        cls = AssetMetadataClassification(
            name=name, color=color, owner_role=role,
            sort_order=sort_order, created_at=now,
        )
        db.add(cls)

    for name, color, sort_order in STATUSES:
        status = AssetMetadataStatus(
            name=name, color=color, owner_role=role,
            sort_order=sort_order, created_at=now,
        )
        db.add(status)

    db.commit()
    print(f"  [{role}] Seeded: {len(CATEGORIES)} categories, "
          f"{sum(len(v) for v in SUB_CATEGORIES.values())} sub-categories, "
          f"{len(CLASSIFICATIONS)} classifications, {len(STATUSES)} statuses")


def main():
    db = SessionLocal()
    roles = [r[0] for r in db.query(User.role).distinct().all()]
    print(f"Found roles: {roles}")

    for role in roles:
        seed_role(db, role)

    db.close()
    print("Done.")


if __name__ == "__main__":
    main()
