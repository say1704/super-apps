"""
AI Wizard — Conversational form untuk create data via AI.
User dituntun step-by-step, bukan tebak semua field sekali jalan.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_wizard_state: Dict[int, Dict[str, Any]] = {}
_wizard_lock = asyncio.Lock()

# ═══════════════════════════════════════════════════════════════
# Field type categories
# ═══════════════════════════════════════════════════════════════
_CATEGORY_EXTENSIONS = {
    "hardware": {"modul": "asset_hardware", "label": "Hardware"},
    "software": {"modul": "asset_software", "label": "Software"},
    "users": {"modul": "asset_users", "label": "Users"},
    "virtual-infrastructure": {"modul": "asset_virtual_infrastructure", "label": "Virtual Infrastructure"},
    "information": {"modul": "asset_information", "label": "Information"},
}


def _sub_category_options(category: str) -> list:
    """Dynamic sub_category options based on category."""
    MAP = {
        "hardware": ["server_rack", "server_tower", "desktop", "laptop", "kvm", "disk_sas", "tape_cassette"],
        "software": ["os_license", "utility", "application", "database_license", "freeware", "antivirus", "other"],
        "users": ["team_member", "ftp_user", "samba_192", "samba_sequis", "sig_member"],
        "virtual-infrastructure": ["virtual_machine", "container", "cloud_instance"],
        "information": ["database", "document", "record", "archive"],
    }
    return MAP.get(category, [])


def _sub_category_label(category: str) -> str:
    """Label untuk pertanyaan sub kategori."""
    options = _sub_category_options(category)
    if not options:
        return "Sub Kategori"
    return f"Sub Kategori ({', '.join(options[:5])}{', ...' if len(options)>5 else ''})"


# ═══════════════════════════════════════════════════════════════
# Field definitions per module
# ═══════════════════════════════════════════════════════════════

WIZARD_FIELDS: Dict[str, List[Dict]] = {
    "asset_common": [
        {"key": "name",          "label": "Nama Asset",                         "required": True,  "type": "text"},
        {"key": "category",      "label": "Kategori",                           "required": True,  "type": "select",
         "options": ["hardware", "software", "users", "virtual-infrastructure", "information"]},
        {"key": "sub_category",  "label": "Sub Kategori",                       "required": True,  "type": "dynamic_select",
         "depends_on": "category"},
        {"key": "classification","label": "Klasifikasi (public/internal/confidential)", "required": True, "type": "select",
         "options": ["public", "internal", "confidential"]},
        {"key": "owner_name",    "label": "Nama Pemilik / Owner",               "required": False, "type": "text"},
        {"key": "location",      "label": "Lokasi",                             "required": False, "type": "text"},
        {"key": "status",        "label": "Status",                             "required": False, "type": "select",
         "options": ["active", "in-maintenance", "retired", "lost"], "default": "active"},
    ],
    "asset_hardware": [
        {"key": "serial_number", "label": "Serial Number",      "required": False, "type": "text"},
        {"key": "model",         "label": "Model",              "required": False, "type": "text"},
        {"key": "manufacturer",  "label": "Manufacturer",       "required": False, "type": "text"},
        {"key": "ip_address",    "label": "IP Address",         "required": True,  "type": "text"},
        {"key": "device_type",   "label": "Device Type",        "required": False, "type": "select",
         "options": ["server", "network", "storage", "perangkat_lain"]},
    ],
    "asset_software": [
        {"key": "version",       "label": "Version",            "required": False, "type": "text"},
        {"key": "vendor",        "label": "Vendor / Publisher", "required": False, "type": "text"},
        {"key": "main_function", "label": "Fungsi Utama",       "required": False, "type": "textarea"},
        {"key": "department",    "label": "Department",         "required": False, "type": "text"},
        {"key": "license_count", "label": "Jumlah Lisensi",     "required": False, "type": "number"},
    ],
    "asset_virtual_infrastructure": [
        {"key": "cpu",           "label": "vCPU",               "required": False, "type": "number"},
        {"key": "ram",           "label": "RAM (GB)",           "required": False, "type": "number"},
        {"key": "storage",       "label": "Storage (GB)",       "required": False, "type": "number"},
        {"key": "vm_type",       "label": "Tipe VM",            "required": False, "type": "text"},
        {"key": "host",          "label": "Host Server",        "required": False, "type": "text"},
    ],
    "asset_information": [
        {"key": "info_type",     "label": "Tipe Informasi",     "required": False, "type": "text"},
        {"key": "database_type", "label": "Tipe Database",      "required": False, "type": "text"},
        {"key": "schema_name",   "label": "Schema Name",        "required": False, "type": "text"},
    ],
    "incident_report": [
        {"key": "server_name",   "label": "Nama Server",        "required": True,  "type": "text"},
        {"key": "incident_type", "label": "Tipe Insiden",       "required": True,  "type": "text"},
        {"key": "description",   "label": "Deskripsi",          "required": True,  "type": "textarea"},
        {"key": "status",        "label": "Status",             "required": False, "type": "select",
         "options": ["open", "in_progress", "resolved", "closed"], "default": "open"},
    ],
    "project_tasks": [
        {"key": "title",         "label": "Judul Task",         "required": True,  "type": "text"},
        {"key": "assignee",      "label": "Assignee",           "required": True,  "type": "text"},
        {"key": "priority",      "label": "Prioritas",          "required": True,  "type": "select",
         "options": ["low", "medium", "high", "urgent"]},
        {"key": "due_date",      "label": "Due Date (YYYY-MM-DD)", "required": False, "type": "date"},
        {"key": "status",        "label": "Status",             "required": False, "type": "select",
         "options": ["todo", "in_progress", "done"], "default": "todo"},
    ],
    "work_log": [
        {"key": "date",          "label": "Tanggal (YYYY-MM-DD)", "required": True,  "type": "date"},
        {"key": "description",   "label": "Deskripsi Pekerjaan",  "required": True,  "type": "textarea"},
        {"key": "status",        "label": "Status",              "required": False, "type": "select",
         "options": ["pending", "in_progress", "completed"], "default": "pending"},
    ],
    "log_maintenance": [
        {"key": "server",           "label": "Nama Server",               "required": True,  "type": "text"},
        {"key": "path",             "label": "Path Direktori",            "required": False, "type": "text"},
        {"key": "script_execution", "label": "Script Eksekusi",          "required": False, "type": "textarea"},
        {"key": "execution_date",   "label": "Tanggal Eksekusi",         "required": False, "type": "date"},
        {"key": "size",             "label": "Ukuran (e.g. 2.5 GB)",     "required": False, "type": "text"},
        {"key": "notes",            "label": "Catatan",                   "required": False, "type": "textarea"},
    ],
    "log_compression": [
        {"key": "server",        "label": "Nama Server",         "required": True,  "type": "text"},
        {"key": "archive_info",  "label": "Info Archive / File", "required": True,  "type": "text"},
        {"key": "execution_date","label": "Tanggal Eksekusi (YYYY-MM-DD)", "required": True,  "type": "date"},
        {"key": "notes",         "label": "Catatan",             "required": False, "type": "textarea"},
    ],
    "documents": [
        {"key": "title",         "label": "Judul Dokumen",       "required": True,  "type": "text"},
        {"key": "category",      "label": "Kategori",            "required": True,  "type": "text"},
        {"key": "author",        "label": "Author",              "required": False, "type": "text"},
        {"key": "description",   "label": "Deskripsi",           "required": False, "type": "textarea"},
    ],
    "document_library": [
        {"key": "title",         "label": "Judul",               "required": True,  "type": "text"},
        {"key": "category_id",   "label": "ID Kategori",         "required": False, "type": "number"},
    ],
    "sprints": [
        {"key": "name",          "label": "Nama Sprint",         "required": True,  "type": "text"},
        {"key": "start_date",    "label": "Tanggal Mulai (YYYY-MM-DD)", "required": True,  "type": "date"},
        {"key": "end_date",      "label": "Tanggal Selesai (YYYY-MM-DD)", "required": True,  "type": "date"},
        {"key": "status",        "label": "Status",              "required": False, "type": "select",
         "options": ["planned", "active", "completed"], "default": "planned"},
    ],
    "isu_matrix": [
        {"key": "kategori",      "label": "Kategori Isu",        "required": True,  "type": "text"},
        {"key": "issues",        "label": "Deskripsi Isu",       "required": False, "type": "textarea"},
        {"key": "risks",         "label": "Risiko Terkait",      "required": False, "type": "textarea"},
    ],
    "penilaian_risiko": [
        {"key": "nama_isu",      "label": "Nama Isu",            "required": True,  "type": "text"},
        {"key": "proses_bisnis", "label": "Proses Bisnis",       "required": False, "type": "text"},
        {"key": "nama_asset",    "label": "Nama Asset",          "required": False, "type": "text"},
        {"key": "penanggung_jawab", "label": "Penanggung Jawab", "required": False, "type": "text"},
        {"key": "status_pelaksanaan", "label": "Status",         "required": False, "type": "select",
         "options": ["open", "in_progress", "done"], "default": "open"},
    ],
    "peluang": [
        {"key": "opportunities",    "label": "Nama Peluang",     "required": True,  "type": "text"},
        {"key": "opportunity_grade","label": "Grade (1-5)",      "required": False, "type": "number"},
        {"key": "action_plan_what", "label": "Rencana Tindakan", "required": False, "type": "textarea"},
        {"key": "action_plan_who",  "label": "Penanggung Jawab", "required": False, "type": "text"},
    ],
    "quality_objectives": [
        {"key": "work_unit",     "label": "Unit Kerja",          "required": True,  "type": "text"},
        {"key": "objective",     "label": "Sasaran Mutu",        "required": True,  "type": "textarea"},
        {"key": "sla",           "label": "SLA / Target",        "required": False, "type": "text"},
    ],
    "risk_assessment_forms": [
        {"key": "form_number",   "label": "Nomor Form",          "required": True,  "type": "text"},
        {"key": "assessor_name", "label": "Nama Assessor",       "required": True,  "type": "text"},
        {"key": "assessment_date","label": "Tanggal (YYYY-MM-DD)","required": False, "type": "date"},
        {"key": "status",        "label": "Status",              "required": False, "type": "select",
         "options": ["draft", "submitted", "reviewed", "approved"], "default": "draft"},
    ],
    "configuration_items": [
        {"key": "ci_name",       "label": "Nama CI",             "required": True,  "type": "text"},
        {"key": "ci_description","label": "Deskripsi",           "required": False, "type": "textarea"},
        {"key": "category",      "label": "Kategori",            "required": False, "type": "text"},
        {"key": "ci_type",       "label": "Tipe CI",             "required": True,  "type": "text"},
        {"key": "current_status","label": "Status",              "required": False, "type": "select",
         "options": ["active", "inactive", "retired"], "default": "active"},
    ],
    "irmc_check": [
        {"key": "server_name",   "label": "Nama Server",         "required": True,  "type": "text"},
        {"key": "check_date",    "label": "Tanggal Cek (YYYY-MM-DD)", "required": True,  "type": "date"},
        {"key": "status",        "label": "Status",              "required": False, "type": "select",
         "options": ["ok", "warning", "critical", "pending"], "default": "pending"},
        {"key": "notes",         "label": "Catatan",             "required": False, "type": "textarea"},
    ],
    "monthly_server_check": [
        {"key": "ip_server",     "label": "IP Server",           "required": True,  "type": "text"},
        {"key": "month",         "label": "Bulan (e.g. 2026-07)", "required": True,  "type": "text"},
        {"key": "check_date",    "label": "Tanggal Cek (YYYY-MM-DD)", "required": True,  "type": "date"},
        {"key": "status",        "label": "Status",              "required": False, "type": "select",
         "options": ["ok", "warning", "critical"], "default": "ok"},
        {"key": "notes",         "label": "Catatan",             "required": False, "type": "textarea"},
    ],
}

# ═══════════════════════════════════════════════════════════════
# Sub_category fields mapping (ditanya SETELAH sub_category dipilih)
# ═══════════════════════════════════════════════════════════════

SUB_CATEGORY_FIELDS: Dict[str, List[str]] = {
    "team_member":  ["phone", "email", "department"],
    "ftp_user":     ["username", "password", "category", "requester", "notes"],
    "samba_192":    ["username", "group_name"],
    "samba_sequis": ["username", "group_name", "permission_level", "account_status", "email", "comments"],
    "sig_member":   ["group_name", "interest_type", "responsible_party", "communication_mechanism", "contact_detail"],
    "server_rack":  ["cpu", "ram", "storage", "virtualization", "rack_units"],
    "server_tower": ["cpu", "ram", "storage"],
    "desktop":      ["cpu", "ram", "storage"],
    "laptop":       ["cpu", "ram", "storage"],
    "kvm":          ["kvm_type", "port_count"],
    "disk_sas":     ["capacity", "rpm", "interface"],
    "tape_cassette":["tape_type", "capacity", "tape_label", "generation"],
    "virtual_machine": ["cpu", "ram", "storage", "host_server", "ip_address"],
    "container":    ["platform", "image_name", "host"],
    "cloud_instance": ["cloud_provider", "instance_type", "region"],
    "database":     ["db_type", "host_server", "port"],
    "document":     ["doc_type", "format"],
    "record":       ["record_type", "retention_period"],
    "archive":      ["archive_type", "format"],
}

# Fields that go into asset_common (the parent table)
_ASSET_COMMON_ONLY = {"name", "category", "sub_category", "classification",
                       "owner_name", "assigned_to", "location", "status",
                       "purchase_date", "warranty_until", "price",
                       "acceptable_use_policy"}


# ═══════════════════════════════════════════════════════════════
# Core wizard functions
# ═══════════════════════════════════════════════════════════════

async def get_active_wizard(user_id: int) -> Optional[Dict]:
    """Return active wizard state for user, or None."""
    async with _wizard_lock:
        return _wizard_state.get(user_id)


def _build_field_list(module: str, category: str = None,
                      sub_category: str = None) -> list:
    """Build ordered list of (field_def, is_extension) tuples for the wizard."""
    fields = []
    base = WIZARD_FIELDS.get(module, [])
    for f in base:
        if f.get("depends_on") == "category":
            field = dict(f)
            field["options"] = _sub_category_options(category or "")
            field["label"] = _sub_category_label(category or "")
            fields.append((field, False))
        else:
            fields.append((dict(f), False))

    # Category extension fields (asset_common only)
    if module == "asset_common" and category and sub_category:
        ext_key = _CATEGORY_EXTENSIONS.get(category, {}).get("modul")
        if ext_key:
            ext_fields = WIZARD_FIELDS.get(ext_key, [])
            for f in ext_fields:
                fields.append((dict(f), True))

        # Sub_category specific fields
        sub_fields = SUB_CATEGORY_FIELDS.get(sub_category, [])
        for key in sub_fields:
            if not any(f[0]["key"] == key for f in fields):
                fields.append(({"key": key, "label": key.replace("_", " ").title(),
                                "required": False, "type": "text"}, True))

    return fields


async def start_wizard(user_id: int, module: str) -> Dict[str, Any]:
    """Mulai wizard untuk module tertentu. Return field pertama."""
    if module not in WIZARD_FIELDS:
        return {"status": "error", "message": f"Module '{module}' tidak memiliki form."}

    all_fields = _build_field_list(module)
    async with _wizard_lock:
        _wizard_state[user_id] = {
            "module": module,
            "step": 0,
            "all_fields": all_fields,
            "data": {},
            "category": None,
            "sub_category": None,
            "phase": "base",  # base | extension | confirm
        }

    return await _next_question(user_id)


async def _next_question(user_id: int) -> Dict[str, Any]:
    """Return pertanyaan berikutnya atau complete."""
    async with _wizard_lock:
        state = _wizard_state.get(user_id)
        if not state:
            return {"status": "error", "message": "Wizard tidak aktif."}

        all_fields = state["all_fields"]
        step = state["step"]

        # Skip field yang sudah ada datanya atau kondisi tidak terpenuhi
        while step < len(all_fields):
            field_def, is_ext = all_fields[step]
            key = field_def["key"]
            data = state["data"]

            # Skip if already answered
            if key in data:
                step += 1
                continue

            # Dynamic options for sub_category
            if field_def.get("type") == "dynamic_select":
                cat = state.get("category")
                field_def["options"] = _sub_category_options(cat or "")
                field_def["label"] = _sub_category_label(cat or "")

            # Auto-fill classification
            if field_def.get("auto"):
                cls = _auto_classify(state.get("category", ""), state.get("sub_category", ""))
                if cls:
                    data[key] = cls
                    step += 1
                    continue

            state["step"] = step
            return {
                "status": "collecting",
                "field": key,
                "label": field_def["label"],
                "required": field_def.get("required", False),
                "type": field_def.get("type", "text"),
                "options": field_def.get("options"),
                "question": field_def["label"],
                "is_extension": is_ext,
            }

        # All fields collected
        state["step"] = step

    return await _complete_wizard(user_id)


def _auto_classify(category: str, sub_category: str) -> str:
    """Auto-set classification based on category/sub_category."""
    if category == "users":
        return "internal"
    if sub_category in ("server_rack", "server_tower", "kvm", "disk_sas"):
        return "internal"
    return "internal"


async def process_wizard_answer(user_id: int, answer: str) -> Dict[str, Any]:
    """Proses jawaban user. Return pertanyaan berikutnya."""
    # ── Read initial state ──
    async with _wizard_lock:
        state = _wizard_state.get(user_id)
        if not state:
            return {"status": "error", "message": "Wizard tidak aktif."}

        all_fields = state["all_fields"]
        step = state["step"]

        if step >= len(all_fields):
            return await _complete_wizard(user_id)

        field_def, is_ext = all_fields[step]
        key = field_def["key"]
        is_skip = answer.strip().lower() in ("skip", "nanti", "lewat")

        if is_skip:
            if field_def.get("required", False):
                return {
                    "status": "collecting",
                    "field": key,
                    "label": field_def["label"],
                    "required": True,
                    "type": field_def.get("type", "text"),
                    "options": field_def.get("options"),
                    "question": f"{field_def['label']} (wajib diisi)",
                    "is_extension": is_ext,
                }
            step += 1
            state["step"] = step

    # If skip was handled, ask next question (lock released)
    if answer.strip().lower() in ("skip", "nanti", "lewat"):
        return await _next_question(user_id)

    # ── Validation (no lock needed) ──
    clean = answer.strip()
    if not clean and field_def.get("required", False):
        return {
            "status": "collecting",
            "field": key,
            "label": field_def["label"],
            "required": True,
            "type": field_def.get("type", "text"),
            "options": field_def.get("options"),
            "question": f"{field_def['label']} (wajib diisi)",
            "is_extension": is_ext,
        }

    if field_def.get("type") in ("select", "dynamic_select"):
        options = field_def.get("options", [])
        if options and clean.lower() not in [o.lower() for o in options]:
            return {
                "status": "collecting",
                "field": key,
                "label": field_def["label"],
                "required": field_def.get("required", False),
                "type": field_def.get("type", "text"),
                "options": options,
                "question": f"Pilihan tidak valid. {field_def['label']}: {', '.join(options)}",
                "is_extension": is_ext,
            }

    # ── Persist answer ──
    async with _wizard_lock:
        state = _wizard_state.get(user_id)
        if not state:
            return {"status": "error", "message": "Wizard tidak aktif."}

        if clean:
            state["data"][key] = clean

        if key == "category":
            state["category"] = clean
            state["all_fields"] = _build_field_list(
                state["module"], category=clean,
                sub_category=state.get("sub_category"),
            )
        if key == "sub_category":
            state["sub_category"] = clean
            state["all_fields"] = _build_field_list(
                state["module"], category=state.get("category", ""),
                sub_category=clean,
            )

        step += 1
        state["step"] = step

    return await _next_question(user_id)


async def _complete_wizard(user_id: int) -> Dict[str, Any]:
    """Semua field terkumpul. Return summary."""
    async with _wizard_lock:
        state = _wizard_state.get(user_id)
        if not state:
            return {"status": "error", "message": "Wizard tidak aktif."}

        data = dict(state["data"])
        module = state["module"]
    module_label = module.replace("_", " ").title()

    lines = [f"Berikut data yang akan disimpan ke **{module_label}**:", ""]
    for key, val in data.items():
        label = key.replace("_", " ").title()
        lines.append(f"  • **{label}**: {val}")
    lines.append("")
    lines.append("Ketik **ya** untuk menyimpan, atau **tidak** untuk membatalkan.")

    return {
        "status": "complete",
        "data": data,
        "module": module,
        "summary": "\n".join(lines),
    }


async def cancel_wizard(user_id: int):
    """Hapus wizard state."""
    async with _wizard_lock:
        _wizard_state.pop(user_id, None)


async def build_create_data(user_id: int) -> Optional[Dict]:
    """Build data dict for DB insert. Return None jika tidak valid."""
    async with _wizard_lock:
        state = _wizard_state.get(user_id)
        if not state:
            return None

        data = dict(state["data"])
        module = state["module"]

    # Separate common vs extension fields (no lock needed — local copies)
    if module == "asset_common":
        common_data = {}
        ext_data = {}
        ext_modul = None
        cat = state.get("category", "")
        if cat:
            ext_info = _CATEGORY_EXTENSIONS.get(cat)
            if ext_info:
                ext_modul = ext_info["modul"]
        sub = state.get("sub_category", "")

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
