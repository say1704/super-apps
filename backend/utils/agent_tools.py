"""Tools READ-ONLY untuk agent LangGraph. Semua menegakkan RBAC & tak pernah menulis data.

Dibuat per-permintaan lewat make_tools(user_ctx) agar konteks (role, accessible_modules) menutup
tiap tool; tiap tool membuka SessionLocal sendiri (aman lintas-thread ToolNode).
"""
from __future__ import annotations

import json
import logging
from typing import Callable, List

from langchain_core.tools import tool

logger = logging.getLogger(__name__)


def make_tools(user_ctx: dict) -> List[Callable]:
    role = user_ctx.get("role", "user")
    user_id = user_ctx.get("user_id", 0)
    accessible = user_ctx.get("accessible_modules") or []

    @tool
    def search_knowledge(query: str) -> str:
        """Cari pengetahuan/dokumentasi super-apps (arsitektur, modul, cara kerja fitur, SOP).
        Gunakan untuk pertanyaan 'apa itu / bagaimana / kenapa'."""
        from database import SessionLocal
        from utils.rag_retrieve import search, build_context_block
        db = SessionLocal()
        try:
            chunks = search(db, query, role=role, accessible_modules=accessible)
            return build_context_block(chunks) or "Tidak ada dokumen relevan."
        finally:
            db.close()

    @tool
    def query_module(module: str, count_only: bool = False) -> str:
        """Ambil data satu modul super-apps (hormati RBAC). module contoh: incident, vulnerability,
        backup, capacity, asset, risk, task, worklog, inventory. count_only=true untuk jumlah saja."""
        from database import SessionLocal
        from utils.ai_bridge import fetch_data, _serialize_data_for_prompt
        db = SessionLocal()
        try:
            intent = {"modul": module, "action": "SELECT_COUNT" if count_only else "SELECT_ALL",
                      "filters": {}, "limit": 10}
            res = fetch_data(intent, db, user_id, role, accessible)
            if count_only:
                return f"Jumlah {module}: {res.get('count', 0)}"
            return _serialize_data_for_prompt(res) or f"Tidak ada data {module}."
        except Exception as e:
            return f"Gagal ambil data {module}: {e}"
        finally:
            db.close()

    @tool
    def get_anomalies(module: str = "") -> str:
        """Ambil temuan anomali AI Insights yang masih terbuka (opsional filter per module)."""
        from database import SessionLocal
        from sqlalchemy import or_
        from models import AnomalyFinding
        db = SessionLocal()
        try:
            q = db.query(AnomalyFinding).filter(AnomalyFinding.status == "open")
            if role != "superadmin":
                q = q.filter(or_(AnomalyFinding.owner_role == role, AnomalyFinding.owner_role.is_(None)))
            if module:
                q = q.filter(AnomalyFinding.module == module)
            rows = q.order_by(AnomalyFinding.detected_at.desc()).limit(15).all()
            if not rows:
                return "Tidak ada anomali terbuka."
            return json.dumps([{"module": r.module, "entity": r.entity, "severity": r.severity,
                                "pesan": r.message} for r in rows], ensure_ascii=False)
        finally:
            db.close()

    @tool
    def list_modules() -> str:
        """Daftar menu/modul yang tersedia di super-apps."""
        from database import SessionLocal
        from utils.rag_index import _src_modules
        try:
            items = _src_modules()
            return items[0]["text"] if items else "Manifest modul tidak tersedia."
        except Exception as e:
            return f"Gagal ambil daftar modul: {e}"

    return [search_knowledge, query_module, get_anomalies, list_modules]
