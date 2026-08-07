"""
AI Intent Router — Hybrid keyword + LLM fallback intent detection.
Output: {"modul": str, "action": "SELECT_COUNT|SELECT_ALL|UNKNOWN", "filters": dict, "limit": int}
"""
import asyncio
import difflib
import json
import logging
import re
import string
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

KNOWLEDGE_BASE_PATH = Path(__file__).parent.parent / "data" / "ai" / "app_knowledge.md"

# ── Keyword routes ────────────────────────────────────────────────────
# Each route: (keyword_set, modul, action, filters)
ROUTES = [
    ({"asset", "aset"},
     "asset_common", "SELECT_ALL", {}),
    ({"asset", "aset", "list", "daftar", "tampilkan", "semua", "show", "data",
      "register", "sebutkan", "terdaftar", "registered"},
     "asset_common", "SELECT_ALL", {}),
    ({"software", "aplikasi", "apps"},
     "asset_software", "SELECT_ALL", {}),
    ({"hardware", "server", "desktop", "laptop"},
     "asset_hardware", "SELECT_ALL", {}),
    ({"incident", "insiden", "laporan", "gangguan"},
     "incident_report", "SELECT_ALL", {}),
    ({"vulnerability", "vuln", "scan", "kerentanan"},
     "vulnerability_report", "SELECT_ALL", {}),
    ({"user", "pengguna", "akun"},
     "users", "SELECT_ALL", {}),
    ({"isu", "risk", "risiko", "matrix"},
     "isu_matrix", "SELECT_ALL", {}),
    ({"penilaian", "scoring", "nilai"},
     "penilaian_risiko", "SELECT_ALL", {}),
    ({"peluang", "opportunity"},
     "peluang", "SELECT_ALL", {}),
    ({"mutu", "quality", "sasaran"},
     "quality_objectives", "SELECT_ALL", {}),
    ({"backup"},
     "backup_history", "SELECT_ALL", {}),
    ({"capacity", "kapasitas"},
     "capacity_metrics", "SELECT_ALL", {}),
    ({"project", "task", "tugas", "proyek"},
     "project_tasks", "SELECT_ALL", {}),
    ({"work", "log", "timesheet"},
     "work_log", "SELECT_ALL", {}),
    ({"activity", "aktivitas", "riwayat"},
     "activity_log", "SELECT_ALL", {}),
    ({"ssh", "login", "masuk"},
     "ssh_login_logs", "SELECT_ALL", {}),
    ({"document", "dokumen", "dokumentasi"},
     "documents", "SELECT_ALL", {}),
    ({"maintenance", "maintain"},
     "log_maintenance", "SELECT_ALL", {}),
    ({"notification", "notif", "notifikasi"},
     "notifications", "SELECT_ALL", {}),
    ({"irmc", "check"},
     "irmc_check", "SELECT_ALL", {}),
    ({"monthly", "bulanan"},
     "monthly_server_check", "SELECT_ALL", {}),
    ({"folder", "folders"},
     "irmc_folders", "SELECT_ALL", {}),
    ({"form", "form upload"},
     "form_uploads", "SELECT_ALL", {}),
    ({"tipe form"},
     "form_types", "SELECT_ALL", {}),
    ({"kompresi", "compression"},
     "log_compression", "SELECT_ALL", {}),
    ({"partisi", "disk"},
     "disk_partitions", "SELECT_ALL", {}),
    ({"sprint"},
     "sprints", "SELECT_ALL", {}),
    ({"ci", "konfigurasi item", "configuration item"},
     "configuration_items", "SELECT_ALL", {}),
    ({"sop", "library", "instruksi"},
     "document_library", "SELECT_ALL", {}),
    ({"kategori dokumen"},
     "document_categories", "SELECT_ALL", {}),
    ({"risk assessment", "assessment risiko"},
     "risk_assessment_forms", "SELECT_ALL", {}),
]

# Follow-up markers (short, ambiguous phrases)
FOLLOW_UP_PATTERNS = [
    r"^detail(nya)?$",
    r"^tampilkan (detail|isi|data) nya$",
    r"^yang (itu|tadi|terakhir|pertama|kedua)",
    r"^lihat (lagi|kembali|saja)$",
    r"^siapa (yang|punya|pinjam|buat)",
    r"^kapan (itu|dibuat|terjadi)",
    r".*terakhir",
    r"^apa (itu|saja|lagi)",
    r"^saya mau lihat",
    r"^coba lihat",
    r"^selanjutnya$",
    r"^lebih (detail|lengkap|banyak)",
    r"^(ya|oke|ok|lanjut|iya)$",
]

MIN_CONFIDENCE = 0.5
EMBED_CONFIDENCE = 0.65
_FUZZY_THRESHOLD = 0.8
_fuzzy_cache: dict = {}


def _preprocess_message(msg: str) -> tuple:
    """Strip punctuation, return (clean_str, word_set) for matching."""
    msg = msg.lower().strip()
    clean = msg.translate(str.maketrans('', '', string.punctuation))
    words = set(clean.split())
    return clean, words


_GUARDRAIL_PATTERNS = {
    "pii_email": r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
    "pii_password": r"(password|passwd|pwd|secret|credentials?)\s*[:=]\s*\S+",
    "pii_token": r"(token|api[_-]?key|apikey|bearer)\s*[:=]\s*\S+",
    "sql_injection": r"(\bunion\b.*\bselect\b|\bdrop\b.*\btable\b|\bdelete\b.*\bfrom\b|\binsert\b.*\binto\b)",
    "prompt_injection": r"(ignore.*prompt|forget.*previous|system.*instruction|abov(e|e).*instruction)",
}
MAX_INPUT_LENGTH = 1000


def _check_guardrails(user_message: str) -> Optional[str]:
    """Check message against guardrails. Returns blocked reason string or None."""
    if len(user_message) > MAX_INPUT_LENGTH:
        return f"GUARDRAIL: Input terlalu panjang ({len(user_message)} karakter, max {MAX_INPUT_LENGTH})."
    msg_lower = user_message.lower()
    for name, pattern in _GUARDRAIL_PATTERNS.items():
        if re.search(pattern, msg_lower):
            logger.warning("Guardrail triggered: %s in message", name)
            return f"GUARDRAIL: Pesan mengandung pola {name.replace('_', ' ')}."
    return None


_FILTER_MAP: Dict[str, Dict[str, str]] = {
    # status filters (asset_common, incident, etc)
    "aktif": {"status": "ready"},
    "active": {"status": "ready"},
    "ready": {"status": "ready"},
    "terpakai": {"status": "used"},
    "dipakai": {"status": "used"},
    "used": {"status": "used"},
    "perbaikan": {"status": "maintenance"},
    "rusak": {"status": "maintenance"},
    "retired": {"status": "retired"},
    "pensiun": {"status": "retired"},
    "disposal": {"status": "disposal"},
    "nonaktif": {"status": "disposal"},
    # sub_category filters (asset_hardware)
    "server": {"sub_category": "server"},
    "desktop": {"sub_category": "desktop"},
    "pc": {"sub_category": "desktop"},
    "laptop": {"sub_category": "laptop"},
    "notebook": {"sub_category": "laptop"},
}


def _extract_filters(words: set) -> dict:
    """Parse status/sub_category filter values from user words."""
    filters = {}
    for word in words:
        mapping = _FILTER_MAP.get(word)
        if mapping:
            filters.update(mapping)
    return filters


async def route(user_message: str, history: Optional[List[Dict]] = None) -> dict:
    """Determine intent from user message. Returns intent dict."""
    # ── 0. Guardrails ─────────────────────────────────────────────
    blocked = _check_guardrails(user_message)
    if blocked:
        return {"modul": "GUARDRAIL_BLOCKED", "action": "GUARDRAIL_BLOCKED",
                "filters": {}, "limit": 0, "reason": blocked, "tier": "guardrail"}

    msg_lower, words = _preprocess_message(user_message)
    count_keywords = {"berapa", "total", "banyak", "jumlah", "count", "sum"}
    date_query_words = {"tanggal", "hari", "jam", "pukul", "tahun", "bulan"}
    is_date_question = any(f"{dw} berapa" in msg_lower for dw in date_query_words)

    # ── 1. Keyword routes ─────────────────────────────────────────
    # Score = matched_keywords - total_keywords_penalty * 0.3
    # Multi-word keywords are matched via substring (not set membership).
    best_match = None
    best_score = -1
    for keywords, modul, action, filters in ROUTES:
        matched = []
        for kw in keywords:
            kw_s = kw.strip().lower()
            if ' ' in kw_s:
                if kw_s in msg_lower:
                    matched.append(kw)
            else:
                if kw_s in words:
                    matched.append(kw)
        if not matched:
            continue
        score = len(matched) - len(keywords) * 0.3
        if score > best_score:
            best_score = score
            best_match = (modul, action, filters)

    if best_match and best_score >= MIN_CONFIDENCE:
        modul, action, filters = best_match
        logger.debug("Intent route: %s/%s (score=%.1f)", modul, action, best_score)
        user_filters = _extract_filters(words)
        combined = {**filters, **user_filters}
        rule_conf = min(0.5 + best_score * 0.3, 0.95)

        if action == "SELECT_ALL" and count_keywords & words and not is_date_question:
            return _make_intent(modul, "SELECT_COUNT", combined, tier="rule",
                                confidence=rule_conf)
        return _make_intent(modul, action, combined, tier="rule",
                            confidence=rule_conf)

    # ── 2. Follow-up ──────────────────────────────────────────────
    if history:
        for pattern in FOLLOW_UP_PATTERNS:
            if re.search(pattern, msg_lower):
                last_modul = _extract_last_module(history)
                if last_modul:
                    logger.debug("Follow-up routed to %s", last_modul)
                    return _make_intent(last_modul, "SELECT_ALL", {},
                                        tier="followup", confidence=0.80)
                break

    # ── 3. Embedding match (Hybrid Classification) ────────────────
    emb_modul, emb_score = _embedding_match(msg_lower)
    if emb_modul and emb_score >= EMBED_CONFIDENCE:
        logger.debug("Embedding route: %s (score=%.2f)", emb_modul, emb_score)
        emb_action = "SELECT_COUNT" if count_keywords & words and not is_date_question else "SELECT_ALL"
        return _make_intent(emb_modul, emb_action, {}, tier="embedding",
                            confidence=emb_score)

    # ── 4. Fuzzy typo fallback ────────────────────────────────────
    fuzzy_match = _fuzzy_keyword_fallback(words)
    if fuzzy_match:
        modul, action, filters, fuzzy_score = fuzzy_match
        if action == "SELECT_ALL" and count_keywords & words and not is_date_question:
            action = "SELECT_COUNT"
        return _make_intent(modul, action, filters, tier="fuzzy",
                            confidence=fuzzy_score)

    # ── 5. Active clarification ──────────────────────────────────
    candidates = []
    if emb_modul and emb_score >= 0.4:
        candidates.append((emb_modul, emb_score))
    if history:
        last_modul = _extract_last_module(history)
        if last_modul and last_modul not in [c[0] for c in candidates]:
            candidates.append((last_modul, 0.6))
    if candidates:
        candidates.sort(key=lambda x: x[1], reverse=True)
        modul_names = [c[0] for c in candidates[:3]]
        logger.debug("Clarify: top candidates %s", modul_names)
        return _make_intent("CLARIFY", "CLARIFY",
                            {"candidates": modul_names},
                            tier="clarify", confidence=0.3)

    # ── 6. LLM fallback ──────────────────────────────────────────
    return await _llm_fallback(user_message, msg_lower, words)


def _make_intent(modul: str, action: str, filters: dict = None,
                 limit: int = 10, tier: str = "llm",
                 confidence: float = 0.5) -> dict:
    return {
        "modul": modul,
        "action": action,
        "filters": filters or {},
        "limit": limit if action == "SELECT_ALL" else 0,
        "tier": tier,
        "confidence": confidence,
    }


def _fuzzy_keyword_fallback(user_words: set) -> tuple | None:
    """Fuzzy-match user words against single-word ROUTE keywords (difflib, threshold 0.8).
    Returns (modul, action, filters, score) or None."""
    best_score = 0.0
    best_route = None
    for keywords, modul, action, filters in ROUTES:
        for kw in keywords:
            kw_s = kw.strip().lower()
            if ' ' in kw_s:
                continue
            if len(kw_s) < 3:
                continue
            for uw in user_words:
                if len(uw) < 3:
                    continue
                cache_key = f"{kw_s}|{uw}"
                if cache_key in _fuzzy_cache:
                    ratio = _fuzzy_cache[cache_key]
                else:
                    ratio = difflib.SequenceMatcher(None, kw_s, uw).ratio()
                    _fuzzy_cache[cache_key] = ratio
                if ratio >= best_score:
                    best_score = ratio
                    best_route = (modul, action, filters)
    if best_score >= _FUZZY_THRESHOLD and best_route:
        logger.debug("Fuzzy match: %s (score=%.2f)", best_route[0], best_score)
        return (*best_route, best_score)
    return None


def _embedding_match(query: str) -> Tuple[Optional[str], float]:
    """Match via embedding similarity. Graceful if embedder unavailable."""
    try:
        from utils.ai_embedder import load_embedder, match as emb_match
        load_embedder()
        return emb_match(query)
    except ImportError:
        return None, 0.0
    except Exception as e:
        logger.debug("Embedding match skipped: %s", e)
        return None, 0.0


def _extract_last_module(history: List[Dict]) -> Optional[str]:
    """Scan history backwards for the last known modul."""
    if not history:
        return None
    # Try in-memory meta first (set by ai_bridge after each response)
    try:
        from utils.ai_bridge import _last_response_meta
        meta = _last_response_meta()
        if meta and meta.get("modul"):
            return meta["modul"]
    except ImportError:
        pass
    return None


async def _llm_fallback(user_message: str, msg_lower: str,
                  words: set) -> dict:
    """Use LLM to classify intent when no keyword matches."""
    from utils.ai_engine import query_llm
    kb_text = _load_knowledge_base_text()

    prompt = f"""Anda adalah komponen "Intent Router" terlatih untuk sistem backend kami.
Tugas Anda adalah menganalisis pesan pengguna lalu menentukan modul aplikasi
yang dimaksud beserta parameternya dalam format JSON kaku.

[DOKUMEN KNOWLEDGE BASE]
{kb_text}

[ATURAN OUTPUT]
1. Output WAJIB berupa JSON valid, tanpa teks pengantar, tanpa backticks.
2. Jika modul tidak ditemukan, set "modul" menjadi "UNKNOWN".
3. Pilih SELECT_COUNT jika pengguna menanyakan jumlah/total/banyak.
4. Pilih SELECT_ALL jika pengguna ingin melihat daftar/detail.

[FORMAT JSON]
{{"modul":"nama_modul","action":"SELECT_COUNT|SELECT_ALL|UNKNOWN","filters":{{"status":"nilai"}},"limit":10}}

Pesan Pengguna: {user_message}
Output JSON:"""

    messages = [{"role": "user", "content": prompt}]
    try:
        raw = await query_llm(messages, max_tokens=150, temperature=0.1)
    except RuntimeError:
        return _make_intent("UNKNOWN", "UNKNOWN", {}, confidence=0.1)
    except Exception as e:
        logger.error("LLM intent fallback failed: %s", e)
        return _make_intent("UNKNOWN", "UNKNOWN", {}, confidence=0.1)

    return _parse_llm_intent(raw)


def _parse_llm_intent(raw: str) -> dict:
    """Parse LLM JSON output safely."""
    raw = raw.strip()
    brace_start = raw.find("{")
    brace_end = raw.rfind("}")
    if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
        raw = raw[brace_start:brace_end + 1]
    try:
        parsed = json.loads(raw)
        modul = parsed.get("modul", "UNKNOWN")
        action = parsed.get("action", "UNKNOWN")
        if action not in ("SELECT_COUNT", "SELECT_ALL", "UNKNOWN"):
            action = "UNKNOWN"
        filters = parsed.get("filters", {})
        if not isinstance(filters, dict):
            filters = {}
        limit = parsed.get("limit", 10)
        if not isinstance(limit, int) or limit < 1:
            limit = 10
        return _make_intent(modul, action, filters, limit, confidence=0.4)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Failed to parse LLM intent: %s", raw[:200])
        return _make_intent("UNKNOWN", "UNKNOWN", {}, confidence=0.1)


def _load_knowledge_base_text(max_chars: int = 1500) -> str:
    """Load trimmed KB text for LLM context."""
    try:
        text = KNOWLEDGE_BASE_PATH.read_text(encoding="utf-8")
        if len(text) > max_chars:
            lines = text.split("\n")
            selected = []
            count = 0
            for line in lines:
                if count + len(line) > max_chars:
                    break
                selected.append(line)
                count += len(line) + 1
            return "\n".join(selected)
        return text
    except FileNotFoundError:
        logger.warning("Knowledge Base not found at %s", KNOWLEDGE_BASE_PATH)
        return ""
