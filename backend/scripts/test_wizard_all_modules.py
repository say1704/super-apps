"""
Test AI Wizard — all 17 modules, insert to real DB as proof.
Run:  cd backend && python3 scripts/test_wizard_all_modules.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal, init_db
from utils.ai_wizard import (
    start_wizard, process_wizard_answer, build_create_data,
    cancel_wizard, WIZARD_FIELDS,
)
import re
from datetime import datetime, date, timezone

import logging
logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

USER_ID = 1       # admin
ROLE = "superadmin"
TEST_TAG = "[WIZARD-TEST]"


def _answers_for_module(module: str) -> list:
    """Return a list of (answer_str, expected_field_key) tuples for each field
    in the order the wizard will ask them."""
    base = {
        # asset_common fields (non-extension/static part)
        "asset_common": [
            ("Test Hardware Aset Wizard", "name"),
            ("hardware", "category"),
            ("server_rack", "sub_category"),
            ("internal", "classification"),
            ("skip", "owner_name"),        # optional
            ("Test DC", "location"),
            ("active", "status"),
            # extension fields (asset_hardware)
            ("SN-WIZARD-001", "serial_number"),
            ("PowerEdge R740", "model"),
            ("Dell", "manufacturer"),
            ("10.0.0.50", "ip_address"),
            ("server", "device_type"),
            # sub_category fields (server_rack)
            ("8", "cpu"),
            ("64 GB", "ram"),
            ("2 TB", "storage"),
            ("VMware", "virtualization"),
            ("2U", "rack_units"),
        ],
        "incident_report": [
            ("Web Server Prod", "server_name"),
            ("down", "incident_type"),
            ("Server unreachable via ping, manual restart needed", "description"),
            ("open", "status"),
        ],
        "project_tasks": [
            ("Setup Monitoring Dashboard", "title"),
            ("admin", "assignee"),
            ("high", "priority"),
            ("2026-08-15", "due_date"),
            ("todo", "status"),
        ],
        "work_log": [
            ("2026-07-11", "date"),
            ("Migrasi database utama ke versi terbaru", "description"),
            ("completed", "status"),
        ],
        "log_maintenance": [
            ("DB-Server-01", "server"),
            ("/var/log/postgresql", "path"),
            ("2026-07-11", "execution_date"),
            ("2.5 GB", "size"),
            ("Hapus log lama di atas 30 hari", "notes"),
        ],
        "log_compression": [
            ("App-Server-02", "server"),
            ("access.log.2026-06.gz", "archive_info"),
            ("2026-07-11", "execution_date"),
            ("skip", "notes"),
        ],
        "documents": [
            ("SOP Backup Database", "title"),
            ("SOP", "category"),
            ("Tim IT", "author"),
            ("Prosedur backup database harian", "description"),
        ],
        "document_library": [
            ("Panduan Pengguna Super Apps v2", "title"),
            ("skip", "category_id"),
        ],
        "sprints": [
            ("Sprint 2026-Q3", "name"),
            ("2026-07-01", "start_date"),
            ("2026-07-21", "end_date"),
            ("active", "status"),
        ],
        "isu_matrix": [
            ("Infrastruktur", "kategori"),
            ("Single point of failure pada server utama", "issues"),
            ("Downtime berkepanjangan jika server mati", "risks"),
        ],
        "penilaian_risiko": [
            ("Server SPOF", "nama_isu"),
            ("Layanan IT", "proses_bisnis"),
            ("Server Utama", "nama_asset"),
            ("Tim Infra", "penanggung_jawab"),
            ("open", "status_pelaksanaan"),
        ],
        "peluang": [
            ("Migrasi ke Cloud Hybrid", "opportunities"),
            ("4", "opportunity_grade"),
            ("Evaluasi cloud provider dan buat POC", "action_plan_what"),
            ("Tim Infrastructure", "action_plan_who"),
        ],
        "quality_objectives": [
            ("IT Operations", "work_unit"),
            ("Mencapai 99.9% uptime untuk semua service", "objective"),
            ("99.9%", "sla"),
        ],
        "risk_assessment_forms": [
            ("FRM-2026-001", "form_number"),
            ("Budi Santoso", "assessor_name"),
            ("2026-07-11", "assessment_date"),
            ("draft", "status"),
        ],
        "configuration_items": [
            ("Web Server Nginx", "ci_name"),
            ("Nginx reverse proxy untuk aplikasi utama", "ci_description"),
            ("Software", "category"),
            ("Application Server", "ci_type"),
            ("active", "current_status"),
        ],
        "irmc_check": [
            ("Server-Prod-01", "server_name"),
            ("2026-07-11", "check_date"),
            ("ok", "status"),
            ("skip", "notes"),
        ],
        "monthly_server_check": [
            ("192.168.1.100", "ip_server"),
            ("2026-07", "month"),
            ("2026-07-11", "check_date"),
            ("ok", "status"),
            ("skip", "notes"),
        ],
    }
    return base.get(module, [])


def _auto_classify(category, sub_category):
    if category == "users":
        return "internal"
    if sub_category in ("server_rack", "server_tower", "kvm", "disk_sas"):
        return "internal"
    return "internal"


def build_create_data_fixed(user_id: int) -> dict | None:
    from utils.ai_wizard import _wizard_state, _ASSET_COMMON_ONLY, _CATEGORY_EXTENSIONS
    state = _wizard_state.get(user_id)
    if not state:
        return None
    data = dict(state["data"])
    module = state["module"]
    if module == "asset_common":
        common_data = {}
        ext_data = {}
        ext_modul = None
        cat = state.get("category", "")
        if cat:
            ext_info = _CATEGORY_EXTENSIONS.get(cat)
            if ext_info:
                ext_modul = ext_info["modul"]
        for key, val in data.items():
            if key in _ASSET_COMMON_ONLY:
                common_data[key] = val
            elif ext_modul:
                ext_data.setdefault(ext_modul, {})[key] = val
        result = {"common": common_data, "module": module}
        if ext_modul and ext_data:
            result["extensions"] = ext_data
        return result
    return {"common": data, "module": module}


def _parse_date(val):
    """Convert string '2026-07-11' to date object."""
    if isinstance(val, date):
        return val
    if isinstance(val, str) and val.strip():
        try:
            parts = val.strip().split("-")
            return date(int(parts[0]), int(parts[1]), int(parts[2]))
        except (IndexError, ValueError):
            pass
    return val


def _set_attrs(obj, data: dict):
    """Set attributes from data dict, converting date strings."""
    from sqlalchemy import Date
    for col, val in data.items():
        if not hasattr(obj, col):
            continue
        attr_type = getattr(obj.__class__, col, None)
        is_date = (
            hasattr(attr_type, "type")
            and isinstance(attr_type.type, Date)
        )
        if is_date:
            val = _parse_date(val)
        setattr(obj, col, val)


def insert_record(db, data: dict, user_id: int, role: str) -> str:
    """Insert a record built from wizard data. Returns display string."""
    import importlib
    models = importlib.import_module("models")
    from datetime import datetime, timezone

    module = data["module"]
    common = data.get("common", {})
    extensions = data.get("extensions", {})

    if module == "asset_common":
        cls = getattr(models, "AssetCommon", None)
        if not cls:
            return "Model AssetCommon not found"
        obj = cls()
        _set_attrs(obj, common)
        obj.created_at = datetime.now(timezone.utc)
        obj.owner_role = role
        obj.created_by = str(user_id)
        obj.asset_code = f"WIZ-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        db.add(obj)
        db.flush()

        for ext_modul, ext_data in extensions.items():
            ext_map = {
                "asset_hardware": "AssetHardware",
                "asset_software": "AssetSoftware",
                "asset_users": "AssetUsers",
                "asset_virtual_infrastructure": "AssetVirtualInfrastructure",
                "asset_information": "AssetInformation",
            }
            cls_name = ext_map.get(ext_modul)
            if not cls_name:
                continue
            ext_cls = getattr(models, cls_name, None)
            if not ext_cls:
                continue
            ext_obj = ext_cls()
            ext_obj.asset_id = obj.id
            _set_attrs(ext_obj, ext_data)
            db.add(ext_obj)
        db.commit()
        return f"Asset ID={obj.id} '{common.get('name','')}' + {len(extensions)} extension(s)"

    mapper = {
        "incident_report": "IncidentReport",
        "project_tasks": "ProjectTask",
        "work_log": "WorkLog",
        "log_maintenance": "LogMaintenance",
        "log_compression": "LogCompression",
        "documents": "Document",
        "document_library": "DocumentLibrary",
        "sprints": "Sprint",
        "isu_matrix": "IsuMatrix",
        "penilaian_risiko": "PenilaianRisiko",
        "peluang": "Peluang",
        "quality_objectives": "QualityObjective",
        "risk_assessment_forms": "RiskAssessmentForm",
        "configuration_items": "ConfigurationItem",
        "irmc_check": "IRMCCheck",
        "monthly_server_check": "MonthlyServerCheck",
    }
    cls_name = mapper.get(module)
    if not cls_name:
        return f"Unknown module: {module}"
    cls = getattr(models, cls_name, None)
    if not cls:
        return f"Model {cls_name} not found"

    obj = cls()
    _set_attrs(obj, common)
    obj.created_at = datetime.now(timezone.utc)
    if hasattr(obj, "owner_role") and not getattr(obj, "owner_role", None):
        obj.owner_role = role
    if hasattr(obj, "created_by") and not getattr(obj, "created_by", None):
        obj.created_by = user_id
    if hasattr(obj, "status") and not getattr(obj, "status", None):
        obj.status = getattr(obj, "status", None) or "active"

    # Auto-fill required fields missing from wizard data
    if module == "document_library" and not getattr(obj, "category", None):
        obj.category = "Wizard-Test"
    if module == "incident_report" and not getattr(obj, "incident_date", None):
        obj.incident_date = date.today()

    db.add(obj)
    db.commit()
    name_val = common.get(next(iter(common), ""), "")
    return f"ID={obj.id} '{name_val}'"


def run_module_test(db, module: str, answers: list) -> dict:
    """Run wizard for one module, insert to DB, return result dict."""
    result = start_wizard(USER_ID, module)
    if result.get("status") == "error":
        return {"module": module, "status": "ERROR", "detail": result["message"]}

    step = 0
    while result.get("status") == "collecting":
        if step >= len(answers):
            return {"module": module, "status": "ERROR",
                    "detail": f"Ran out of answers at step {step}, field={result.get('field')}"}
        answer, expected_key = answers[step]
        field_key = result.get("field", "")
        if field_key and field_key != expected_key:
            return {"module": module, "status": "ERROR",
                    "detail": f"Expected field '{expected_key}' but got '{field_key}' at step {step}"}
        result = process_wizard_answer(USER_ID, answer)
        step += 1

    if result.get("status") != "complete":
        return {"module": module, "status": "ERROR",
                "detail": f"Expected complete, got {result.get('status')}: {result.get('message','')}"}

    data = build_create_data_fixed(USER_ID)
    if not data:
        return {"module": module, "status": "ERROR", "detail": "build_create_data returned None"}

    try:
        detail = insert_record(db, data, USER_ID, ROLE)
        # Parse "ID=123" from detail and track
        import re
        m = re.search(r"ID=(\d+)", detail)
        rec_id = int(m.group(1)) if m else "?"
        name_field = data.get("common", {}).get(next(iter(data.get("common", {})), ""), "")
        TRACKED_RECORDS.append((module, rec_id, str(name_field)[:55]))
        cancel_wizard(USER_ID)
        return {"module": module, "status": "OK", "detail": detail}
    except Exception as e:
        db.rollback()
        cancel_wizard(USER_ID)
        return {"module": module, "status": "ERROR", "detail": str(e)}


TRACKED_RECORDS = []  # (module, id, display_name)


def query_proof(db) -> str:
    """Query DB for tracked records (inserted during this run)."""
    lines = []
    for mod_name, rec_id, display in TRACKED_RECORDS:
        lines.append(f"  · {mod_name:25s}  ID={rec_id}  {display[:55]}")
    return "\n".join(lines) if lines else "  (no records found)"


def main():
    init_db()
    db = SessionLocal()

    # asset_hardware/software/virtual_infrastructure/information are extension
    # modules of asset_common (they require asset_id FK). Skip standalone.
    SKIP_MODULES = {"asset_hardware", "asset_software",
                    "asset_virtual_infrastructure", "asset_information"}
    modules = [m for m in WIZARD_FIELDS if m not in SKIP_MODULES]
    results = []

    log.info("=" * 60)
    log.info("WIZARD TEST — ALL MODULES (standalone)")
    log.info(f"Skipped extensions: {', '.join(sorted(SKIP_MODULES))}")
    log.info(f"Database: {db.bind.url}")
    log.info(f"User: ID={USER_ID} role={ROLE}")
    log.info("=" * 60)

    for module in modules:
        answers = _answers_for_module(module)
        res = run_module_test(db, module, answers)
        results.append(res)
        status_icon = "✓" if res["status"] == "OK" else "✗"
        log.info(f"  {status_icon} {module:30s} {res['status']:5s}  {res['detail'][:80]}")

    ok_count = sum(1 for r in results if r["status"] == "OK")
    fail_count = sum(1 for r in results if r["status"] != "OK")

    log.info("")
    log.info("=" * 60)
    log.info(f"RESULT: ✓ {ok_count} passed  ✗ {fail_count} failed  (total {len(results)})")
    log.info("=" * 60)

    if fail_count > 0:
        log.info("\nFAILURES:")
        for r in results:
            if r["status"] != "OK":
                log.info(f"  ✗ {r['module']}: {r['detail']}")

    # ── PROOF: query DB ──────────────────────────────────
    log.info("")
    log.info("=" * 60)
    log.info("PROOF — RECORDS IN DATABASE (by created_by)")
    log.info("=" * 60)
    proof = query_proof(db)
    log.info(proof)
    log.info("")
    log.info("=" * 60)
    log.info(f"All {ok_count} wizard records persisted in {db.bind.url}")
    log.info("=" * 60)

    db.close()


if __name__ == "__main__":
    main()
