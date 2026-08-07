"""
AI Wordlist — Template-based query generator for all modules.
Output: ROUTE_EXAMPLES dict (~100+ queries/module) + test suite.

Patterns covered:
  · count / list / date / yang / owner / temporal / column / mixed
  · Module-specific fields & values
  · Natural Indonesian + English variations
  · Prefixes: tolong, bisa, mohon, saya ingin, boleh
"""
from typing import Dict, List
from itertools import product

_MODULE_FIELDS: Dict[str, Dict[str, List[str]]] = {
    "asset_common": {
        "status": ["active", "aktif", "in-maintenance", "retired", "lost", "nonaktif"],
        "category": ["hardware", "software", "users", "virtual", "information"],
        "klasifikasi": ["public", "internal", "confidential"],
        "lokasi": ["jakarta", "bandung", "surabaya", "dc utama", "dc2"],
        "owner": ["budi", "ani", "tim it", "admin"],
        "sub_kategori": ["server", "desktop", "laptop", "aplikasi"],
    },
    "incident_report": {
        "status": ["open", "in_progress", "resolved", "closed", "dibuka", "selesai"],
        "tipe": ["down", "error", "security", "performance", "network", "hardware"],
        "severitas": ["critical", "high", "medium", "low"],
        "server": ["web", "db", "app", "prod", "staging"],
    },
    "project_tasks": {
        "status": ["todo", "in_progress", "done", "selesai", "dikerjakan"],
        "priority": ["high", "medium", "low", "urgent", "tinggi", "rendah"],
        "assignee": ["admin", "budi", "ani", "tim", "saya"],
    },
    "work_log": {
        "status": ["pending", "in_progress", "completed", "selesai"],
        "category": ["meeting", "development", "maintenance", "general"],
        "user": ["saya", "admin", "budi", "ani"],
    },
    "log_maintenance": {
        "server": ["db-server", "app-server", "web", "prod"],
        "path": ["var/log", "var/log/nginx", "var/log/postgresql"],
    },
    "log_compression": {
        "server": ["app-server", "db-server", "log-server"],
    },
    "documents": {
        "category": ["sop", "laporan", "notulensi", "manual", "dokumentasi"],
        "author": ["tim it", "budi", "admin"],
    },
    "document_library": {
        "status": ["draft", "approved", "archived", "disetujui"],
        "tipe": ["sop", "work instruction", "manual", "panduan"],
    },
    "sprints": {
        "status": ["planned", "active", "completed", "berjalan", "selesai"],
    },
    "isu_matrix": {
        "kategori": ["infrastruktur", "security", "aplikasi", "network", "sdm"],
    },
    "penilaian_risiko": {
        "status": ["open", "in_progress", "done", "dinilai", "selesai"],
        "asset": ["server", "database", "aplikasi", "network"],
    },
    "peluang": {
        "grade": ["1", "2", "3", "4", "5", "tinggi", "rendah", "sedang"],
    },
    "quality_objectives": {
        "unit": ["it operations", "it security", "development", "infrastructure"],
    },
    "risk_assessment_forms": {
        "status": ["draft", "submitted", "reviewed", "approved", "diajukan"],
    },
    "configuration_items": {
        "status": ["active", "inactive", "retired"],
        "kategori": ["software", "hardware", "network", "dokumentasi"],
        "tipe": ["server", "aplikasi", "database", "network device"],
    },
    "irmc_check": {
        "status": ["ok", "warning", "critical", "pending"],
        "server": ["prod-01", "prod-02", "staging", "db-server"],
    },
    "monthly_server_check": {
        "status": ["ok", "warning", "critical"],
        "bulan": ["januari", "februari", "maret", "juli", "2026-07"],
    },
    "backup_history": {
        "status": ["success", "sukses", "failed", "gagal", "partial", "completed"],
        "tipe": ["full", "incremental", "differential", "log"],
        "server": ["db-server", "app-server", "file-server"],
        "waktu": ["hari ini", "kemarin", "minggu lalu", "bulan lalu", "semalam"],
    },
}


TEMPLATES: Dict[str, dict] = {
    "asset_common": {
        "label": "Asset Register",
        "keywords": ["asset", "aset", "barang", "inventaris", "register"],
        "abbr": ["ast", "aset"],
        "fields": _MODULE_FIELDS["asset_common"],
    },
    "incident_report": {
        "label": "Incident Report",
        "keywords": ["incident", "insiden", "laporan", "gangguan", "kejadian"],
        "abbr": ["inc", "ins"],
        "fields": _MODULE_FIELDS["incident_report"],
    },
    "project_tasks": {
        "label": "Project Tasks",
        "keywords": ["task", "tugas", "proyek", "pekerjaan"],
        "abbr": ["tsk"],
        "fields": _MODULE_FIELDS["project_tasks"],
    },
    "work_log": {
        "label": "Work Log",
        "keywords": ["worklog", "log kerja", "timesheet", "log pekerjaan", "log"],
        "abbr": ["wl", "log"],
        "fields": _MODULE_FIELDS["work_log"],
    },
    "log_maintenance": {
        "label": "Log Maintenance",
        "keywords": ["log maintenance", "maintenance log", "deletion log", "hapus log"],
        "abbr": [],
        "fields": _MODULE_FIELDS["log_maintenance"],
    },
    "log_compression": {
        "label": "Log Compression",
        "keywords": ["log compression", "kompresi log", "compress log"],
        "abbr": [],
        "fields": _MODULE_FIELDS["log_compression"],
    },
    "documents": {
        "label": "Documents",
        "keywords": ["dokumen", "document"],
        "abbr": ["doc"],
        "fields": _MODULE_FIELDS["documents"],
    },
    "document_library": {
        "label": "Document Library",
        "keywords": ["sop", "library", "instruksi", "dokumen library", "document library"],
        "abbr": [],
        "fields": _MODULE_FIELDS["document_library"],
    },
    "sprints": {
        "label": "Sprints",
        "keywords": ["sprint"],
        "abbr": [],
        "fields": _MODULE_FIELDS["sprints"],
    },
    "isu_matrix": {
        "label": "Isu Matrix",
        "keywords": ["isu", "risk matrix", "matrix isu"],
        "abbr": [],
        "fields": _MODULE_FIELDS["isu_matrix"],
    },
    "penilaian_risiko": {
        "label": "Penilaian Risiko",
        "keywords": ["penilaian", "scoring", "penilaian risiko"],
        "abbr": [],
        "fields": _MODULE_FIELDS["penilaian_risiko"],
    },
    "peluang": {
        "label": "Peluang",
        "keywords": ["peluang", "opportunity"],
        "abbr": ["opp"],
        "fields": _MODULE_FIELDS["peluang"],
    },
    "quality_objectives": {
        "label": "Quality Objectives",
        "keywords": ["sasaran mutu", "quality", "sasaran", "quality objective"],
        "abbr": [],
        "fields": _MODULE_FIELDS["quality_objectives"],
    },
    "risk_assessment_forms": {
        "label": "Risk Assessment Forms",
        "keywords": ["risk assessment", "assessment risiko"],
        "abbr": [],
        "fields": _MODULE_FIELDS["risk_assessment_forms"],
    },
    "configuration_items": {
        "label": "Configuration Items",
        "keywords": ["configuration item", "ci", "konfigurasi item", "config item"],
        "abbr": ["ci"],
        "fields": _MODULE_FIELDS["configuration_items"],
    },
    "irmc_check": {
        "label": "IRMC Check",
        "keywords": ["irmc", "cek irmc", "irmc check", "pengecekan irmc"],
        "abbr": [],
        "fields": _MODULE_FIELDS["irmc_check"],
    },
    "monthly_server_check": {
        "label": "Monthly Server Check",
        "keywords": ["monthly check", "cek bulanan", "monthly server check", "server check"],
        "abbr": [],
        "fields": _MODULE_FIELDS["monthly_server_check"],
    },
    "backup_history": {
        "label": "Backup History",
        "keywords": ["backup", "cadangan", "riwayat backup", "backup history"],
        "abbr": ["bkp"],
        "fields": _MODULE_FIELDS["backup_history"],
    },
}


# ═══════════════════════════════════════════════════════════════
# Generator
# ═══════════════════════════════════════════════════════════════

_PREFIXES = [
    "", "tolong ", "bisa ", "mohon ", "saya ingin ", "boleh ", "minta ",
]

_LIST_VERBS = [
    "tampilkan {kw}", "daftar {kw}", "lihat {kw}", "cari {kw}",
    "sebutkan {kw}", "list {kw}", "show {kw}", "data {kw}",
    "semua {kw}", "perlihatkan {kw}", "tunjukin {kw}",
]
_COUNT_VERBS = [
    "total {kw}", "ada berapa {kw}", "jumlah {kw}",
    "berapa banyak {kw}", "hitung {kw}",
    "berapa jumlah {kw}", "banyaknya {kw}",
]
_DATE_VERBS = [
    "tanggal berapa {kw} terakhir", "kapan {kw} terakhir",
    "hari apa {kw} terakhir", "jam berapa {kw} terakhir",
    "terakhir {kw} tanggal berapa", "{kw} terakhir tanggal berapa",
    "tanggal berapa {kw} paling baru", "kapan {kw} terbaru",
    "kapan {kw} dibuat", "kapan {kw} pertama",
    "tanggal kapan {kw} terakhir",
]

_YANG_PATTERNS = [
    "{kw} yang {value}",
    "yang {value} {kw}",
    "{kw} {value}",
    "cari {kw} yang {value}",
    "mana {kw} yang {value}",
]

_OWNER_PATTERNS = [
    "{kw} milik {value}",
    "{kw} punya {value}",
    "{kw} {value}",
    "{kw} dari {value}",
]

_TEMPORAL_WORDS = [
    "hari ini", "kemarin", "kemarin dulu",
    "bulan ini", "bulan lalu", "bulan kemarin",
    "minggu ini", "minggu lalu", "tahun ini",
    "hari senin", "hari rabu", "hari jumat",
    "semalam", "tadi pagi", "tadi siang",
    "sekarang", "saat ini",
]

_FIELD_QUERY_VERBS = [
    "apa saja {field} {kw}",
    "apa aja {field} {kw}",
    "list {field} {kw}",
    "{field} apa saja {kw}",
    "{field} apa aja {kw}",
    "cari {kw} berdasarkan {field}",
]

_MIXED_DATE_FILTER = [
    "tanggal berapa {kw} {status} terakhir",
    "kapan {kw} {status} terakhir",
    "terakhir {kw} {status} tanggal berapa",
]


def _generate(templates: dict) -> List[str]:
    """Generate all query variants from a module's templates."""
    seen = set()
    results = []

    def add(q: str):
        q = q.strip().lower()
        if len(q) > 2 and q not in seen:
            seen.add(q)
            results.append(q)

    fields: dict = templates.get("fields", {})
    keywords: list = templates.get("keywords", [])
    abbr: list = templates.get("abbr", [])

    # ── 1. COUNT queries ─────────────────────────────
    for kw in keywords:
        for prefix in _PREFIXES:
            for verb in _COUNT_VERBS:
                add(f"{prefix}{verb}".format(kw=kw))

    # ── 2. LIST queries ──────────────────────────────
    for kw in keywords:
        for prefix in _PREFIXES:
            for verb in _LIST_VERBS:
                add(f"{prefix}{verb}".format(kw=kw))

    # Some abbreviations
    for a in abbr:
        for verb in _LIST_VERBS:
            add(verb.format(kw=a))
        for verb in _COUNT_VERBS:
            add(verb.format(kw=a))

    # ── 3. DATE queries ──────────────────────────────
    for kw in keywords:
        for verb in _DATE_VERBS:
            add(verb.format(kw=kw))

    # ── 4. YANG / STATUS filter queries ──────────────
    if "status" in fields:
        for kw in keywords:
            for val in fields["status"]:
                for pat in _YANG_PATTERNS:
                    add(pat.format(kw=kw, value=val))

    # ── 5. Other field filters ───────────────────────
    for field_name, values in fields.items():
        if field_name in ("status", "waktu"):
            continue  # covered above / temporal
        for kw in keywords:
            for val in values:
                add(f"{kw} {field_name} {val}".format(kw=kw))
                add(f"{kw} dengan {field_name} {val}".format(kw=kw))

    # ── 6. OWNER / ASSIGNEE queries ──────────────────
    if "owner" in fields:
        for kw in keywords:
            for val in fields["owner"]:
                for pat in _OWNER_PATTERNS:
                    add(pat.format(kw=kw, value=val))
    if "assignee" in fields:
        for kw in keywords:
            for val in fields["assignee"]:
                for pat in _OWNER_PATTERNS:
                    add(pat.format(kw=kw, value=val))
    if "user" in fields:
        for kw in keywords:
            for val in fields["user"]:
                add(f"{kw} {val}")
                add(f"{kw} milik {val}")
    if "server" in fields:
        for kw in keywords:
            for val in fields["server"]:
                add(f"{kw} di {val}")
                add(f"{kw} server {val}")

    # ── 7. TEMPORAL (hari ini, kemarin, etc) ─────────
    for kw in keywords:
        for t in _TEMPORAL_WORDS:
            add(f"{kw} {t}")
            add(f"data {kw} {t}")
            add(f"cari {kw} {t}")

    # ── 8. MIXED date + filter ──────────────────────
    if "status" in fields:
        for kw in keywords:
            for status_val in fields["status"]:
                for m in _MIXED_DATE_FILTER:
                    add(m.format(kw=kw, status=status_val))

    if "waktu" in fields:
        for kw in keywords:
            for t in fields["waktu"]:
                for verb in _DATE_VERBS:
                    add(verb.format(kw=kw) + " " + t)

    # ── 9. FIELD queries (apa saja status asset) ─────
    for field_name in fields:
        if field_name in ("waktu",):
            continue
        for kw in keywords:
            for fqv in _FIELD_QUERY_VERBS:
                add(fqv.format(kw=kw, field=field_name))

    # ── 10. NEGATIVE / EXCEPTION queries ─────────────
    for kw in keywords:
        add(f"{kw} yang tidak {list(fields.keys())[0] if fields else 'active'}")
        add(f"{kw} selain itu")
        add(f"semua {kw} kecuali")

    # ── 11. NATURAL VARIATIONS ──────────────────────
    for kw in keywords:
        add(f"ada {kw} apa saja")
        add(f"{kw} ada berapa")
        add(f"info {kw}")
        add(f"data-data {kw}")
        add(f"seluruh {kw}")
        add(f"keseluruhan {kw}")
        add(f"{kw} apa yang ada")
        add(f"{kw} mana saja yang ada")
        add(f"bantu cari {kw}")
        add(f"bisa tolong carikan {kw}")
        add(f"apakah ada {kw} baru")
        add(f"tolong infokan {kw}")
        add(f"mohon info {kw}")
        add(f"keterangan {kw}")
        add(f"rincian {kw}")
        add(f"detail {kw}")

    return results


def generate_all() -> Dict[str, List[str]]:
    """Generate ROUTE_EXAMPLES for all modules."""
    return {
        modul: _generate(templates)
        for modul, templates in sorted(TEMPLATES.items())
    }


GENERATED_EXAMPLES: Dict[str, List[str]] = generate_all()


if __name__ == "__main__":
    examples = generate_all()
    total = sum(len(v) for v in examples.values())
    print(f"Generated {total} queries across {len(examples)} modules:\n")
    for modul, queries in sorted(examples.items()):
        print(f"  {modul:35s} {len(queries):4d} queries")
        for q in queries[:4]:
            print(f"    · {q}")
        if len(queries) > 4:
            print(f"    · ... and {len(queries) - 4} more")
    print()
    print(f"\nPre-generated: {sum(len(v) for v in GENERATED_EXAMPLES.values())} queries ready.")
