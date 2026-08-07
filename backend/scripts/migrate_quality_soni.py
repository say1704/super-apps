"""Migrate soni's quality objective from old table to v2."""
import json
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from datetime import datetime, timezone, date
from sqlalchemy import text
from database import SessionLocal
from models import QualityObjective, QualityEntry, User

MONTH_NAMES = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
]

def migrate():
    db = SessionLocal()
    try:
        soni = db.query(User).filter(User.username == "soni").first()
        if not soni:
            print("User soni not found")
            return

        old = db.execute(
            text("SELECT * FROM quality_objectives WHERE created_by = :uid"),
            {"uid": soni.id}
        ).fetchone()
        if not old:
            print("No old quality objective found for soni")
            return

        old_dict = dict(old._mapping)
        print(f"Found: {old_dict['objective']}")

        # Build description from old fields
        desc_parts = []
        if old_dict.get("what"):
            desc_parts.append(f"What: {old_dict['what']}")
        if old_dict.get("sla"):
            desc_parts.append(f"SLA: {old_dict['sla']}")
        if old_dict.get("resources"):
            desc_parts.append(f"Resources: {old_dict['resources']}")
        if old_dict.get("who"):
            desc_parts.append(f"Who: {old_dict['who']}")
        if old_dict.get("how_evaluated"):
            desc_parts.append(f"How Evaluated: {old_dict['how_evaluated']}")
        description = " | ".join(desc_parts) if desc_parts else None

        created_at = old_dict.get("created_at")
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)

        # Determine category
        category = "service"

        # Parse monthly_data
        target_value = None
        target_unit = None
        monthly_data = None
        if old_dict.get("monthly_data"):
            try:
                monthly_data = json.loads(old_dict["monthly_data"])
                if monthly_data and len(monthly_data) > 0:
                    rows = monthly_data[0].get("rows", [])
                    if rows and len(rows) > 0:
                        total_val = rows[0].get("12")
                        if total_val is not None:
                            target_value = float(total_val)
                        summary = rows[0].get("13", "")
                        if summary and description and summary not in description:
                            description = description + " | " + summary
            except (json.JSONDecodeError, KeyError, IndexError):
                pass
            target_unit = "requests" if target_value else None

        # Create v2 objective
        obj = QualityObjective(
            name=old_dict["objective"],
            category=category,
            description=description,
            tracking_type="counter",
            period="monthly",
            target_value=target_value,
            target_unit=target_unit,
            evidence_types="text",
            is_active=True,
            owner_role=old_dict.get("owner_role") or soni.role,
            created_at=created_at or datetime.now(timezone.utc),
            created_by=soni.id,
        )
        db.add(obj)
        db.flush()
        print(f"Created v2 objective id={obj.id}: {old_dict['objective']}")

        # Migrate monthly entries
        if monthly_data:
            columns = monthly_data[0].get("columns", [])
            rows_inner = monthly_data[0].get("rows", [])
            if rows_inner:
                row = rows_inner[0]
                year = 2025
                for col_name in columns:
                    for mn in MONTH_NAMES:
                        if mn in col_name:
                            year_str = col_name.replace(mn, "").strip()
                            if year_str.isdigit():
                                year = int(year_str)
                            break

                for i in range(min(12, len(columns))):
                    val_str = row.get(str(i))
                    if val_str is None:
                        continue
                    val = float(val_str) if val_str else 0
                    month_num = i + 1
                    entry_date_obj = date(year, month_num, 1)
                    entry_period = f"{year}-{month_num:02d}"

                    entry = QualityEntry(
                        objective_id=obj.id,
                        entry_date=entry_date_obj,
                        entry_period=entry_period,
                        value=val,
                        status="pass" if val > 0 else "fail",
                        description=f"{columns[i]}: {val_str}",
                        checked_by=soni.id,
                        created_at=datetime.now(timezone.utc),
                    )
                    db.add(entry)
                    print(f"  Entry {columns[i]}: {val_str}")

        db.commit()
        print(f"\nDone! 1 objective + {min(12, len(columns)) if monthly_data else 0} entries migrated.")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
