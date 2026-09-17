"""Agent LangGraph — bounded reasoning graph (default) + deep autonomous (opsional).

BOUNDED (default, andal & ~1 panggilan LLM): StateGraph `retrieve` → `synthesize`.
  retrieve: RAG dokumen + data modul (via intent router yang ada) + anomali terbuka → konteks.
  synthesize: 1x LLM (grounded + anti-halu).
DEEP (opsional, agent_mode=deep): create_react_agent autonomous tool-calling (heavy, lambat di CPU).
Semua aman: fallback ke RAG Fase 1 bila gagal/timeout.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import List, Optional
from typing_extensions import TypedDict

logger = logging.getLogger(__name__)

AGENT_ENABLED = True
AGENT_MODE = "bounded"        # bounded | deep
AGENT_MAX_STEPS = 3
AGENT_TIMEOUT_S = 120
AGENT_MODEL = "heavy"          # model sintesis untuk bounded / reasoning untuk deep

try:
    import yaml
    _cfg = yaml.safe_load((Path(__file__).resolve().parents[1] / "config" / "ai.yaml").read_text()) or {}
    AGENT_ENABLED = bool(_cfg.get("agent_enabled", AGENT_ENABLED))
    AGENT_MODE = str(_cfg.get("agent_mode", AGENT_MODE))
    AGENT_MAX_STEPS = int(_cfg.get("agent_max_steps", AGENT_MAX_STEPS))
    AGENT_TIMEOUT_S = int(_cfg.get("agent_timeout_s", AGENT_TIMEOUT_S))
    AGENT_MODEL = str(_cfg.get("agent_model", AGENT_MODEL))
except Exception:
    pass

_SYNTH_SYSTEM = (
    "Anda AI Asisten super-apps (IT Management). Jawab ringkas & akurat dalam Bahasa Indonesia "
    "HANYA berdasarkan [KONTEKS DOKUMEN], [DATA], dan [ANOMALI] di bawah. Jika informasi tidak ada, "
    "katakan jujur 'informasi tidak ditemukan di data super-apps'. Jangan mengarang; sebutkan angka & "
    "sumber yang relevan."
)


class _AgentState(TypedDict, total=False):
    query: str
    history: list
    user_ctx: dict
    doc_context: str
    data_text: str
    anomaly_text: str
    sources: list
    answer: str


# ------------------------------------------------------------------ bounded graph
async def _retrieve_node(state: _AgentState) -> dict:
    from database import SessionLocal
    from utils.rag_retrieve import search as rag_search, build_context_block
    from utils.ai_intent_router import route
    from utils.ai_bridge import fetch_data, _serialize_data_for_prompt

    q = state["query"]
    uc = state["user_ctx"]
    role = uc.get("role", "user")
    acc = uc.get("accessible_modules") or []
    sources: List[str] = []
    doc_context = data_text = anomaly_text = ""

    db = SessionLocal()
    try:
        # 1) RAG dokumen/pengetahuan
        try:
            chunks = rag_search(db, q, role=role, accessible_modules=acc)
            doc_context = build_context_block(chunks)
            sources += [c.get("source_ref") for c in chunks[:5] if c.get("source_ref")]
        except Exception as e:
            logger.debug("retrieve rag skip: %s", e)

        # 2) Data modul via intent router yang ada (RBAC ditegakkan fetch_data)
        try:
            intent = await route(q, state.get("history") or [])
            modul = intent.get("modul")
            action = intent.get("action")
            if modul and modul not in ("UNKNOWN", "CLARIFY", "GUARDRAIL_BLOCKED") and action in ("SELECT_ALL", "SELECT_COUNT"):
                res = fetch_data(intent, db, uc.get("user_id", 0), role, acc)
                data_text = _serialize_data_for_prompt(res)
                sources.append(f"modul:{modul}")
        except Exception as e:
            logger.debug("retrieve data skip: %s", e)

        # 3) Anomali terbuka (bila relevan dengan pertanyaan)
        if any(k in q.lower() for k in ("anomali", "anomaly", "insight", "kejanggalan", "outlier")):
            try:
                from sqlalchemy import or_
                from models import AnomalyFinding
                aq = db.query(AnomalyFinding).filter(AnomalyFinding.status == "open")
                if role != "superadmin":
                    aq = aq.filter(or_(AnomalyFinding.owner_role == role, AnomalyFinding.owner_role.is_(None)))
                rows = aq.order_by(AnomalyFinding.detected_at.desc()).limit(10).all()
                if rows:
                    anomaly_text = "\n".join(f"- [{r.severity}] {r.module}/{r.entity}: {r.message}" for r in rows)
                    sources.append("ai-insights")
            except Exception as e:
                logger.debug("retrieve anomaly skip: %s", e)
    finally:
        db.close()

    return {"doc_context": doc_context, "data_text": data_text,
            "anomaly_text": anomaly_text, "sources": sources}


async def _synthesize_node(state: _AgentState) -> dict:
    from utils.ai_engine import query_llm, query_heavy_llm
    doc = state.get("doc_context") or "(tidak ada)"
    data = state.get("data_text") or "(tidak ada)"
    anom = state.get("anomaly_text") or "(tidak ada)"
    system = (f"{_SYNTH_SYSTEM}\n\n[KONTEKS DOKUMEN]\n{doc}\n\n[DATA]\n{data}\n\n[ANOMALI]\n{anom}")
    msgs = [{"role": "system", "content": system}]
    for h in (state.get("history") or [])[-4:]:
        if h.get("role") in ("user", "assistant"):
            msgs.append({"role": h["role"], "content": (h.get("content") or "")[:300]})
    msgs.append({"role": "user", "content": state["query"]})
    llm = query_heavy_llm if AGENT_MODEL == "heavy" else query_llm
    answer = await llm(msgs, max_tokens=512, temperature=0.1)
    return {"answer": (answer or "").strip()}


def _build_bounded():
    from langgraph.graph import StateGraph, START, END
    g = StateGraph(_AgentState)
    g.add_node("retrieve", _retrieve_node)
    g.add_node("synthesize", _synthesize_node)
    g.add_edge(START, "retrieve")
    g.add_edge("retrieve", "synthesize")
    g.add_edge("synthesize", END)
    return g.compile()


_bounded_graph = None


async def _run_bounded(query, user_ctx, history) -> dict:
    global _bounded_graph
    if _bounded_graph is None:
        _bounded_graph = _build_bounded()
    state = {"query": query, "history": history or [], "user_ctx": user_ctx}
    result = await asyncio.wait_for(_bounded_graph.ainvoke(state), timeout=AGENT_TIMEOUT_S)
    return {"answer": result.get("answer") or "", "sources": result.get("sources") or [],
            "mode": "bounded", "fallback": False}


# ------------------------------------------------------------------ deep (autonomous, opsional)
async def _run_deep(query, user_ctx, history, thread_id) -> dict:
    from langgraph.prebuilt import create_react_agent
    from langgraph.checkpoint.memory import MemorySaver
    from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
    from utils.agent_llm import LocalQwenChat
    from utils.agent_tools import make_tools

    agent = create_react_agent(LocalQwenChat(model=AGENT_MODEL), make_tools(user_ctx),
                               prompt=_SYNTH_SYSTEM, checkpointer=MemorySaver())
    msgs = [SystemMessage(content=_SYNTH_SYSTEM)]
    for h in (history or [])[-4:]:
        if h.get("role") in ("user", "assistant"):
            cls = HumanMessage if h["role"] == "user" else AIMessage
            msgs.append(cls(content=(h.get("content") or "")[:400]))
    msgs.append(HumanMessage(content=query))
    cfg = {"configurable": {"thread_id": thread_id}, "recursion_limit": AGENT_MAX_STEPS * 2 + 1}
    result = await asyncio.wait_for(agent.ainvoke({"messages": msgs}, cfg), timeout=AGENT_TIMEOUT_S)
    out = result.get("messages", [])
    tools_used = [tc.get("name") for m in out for tc in (getattr(m, "tool_calls", None) or [])]
    answer = ""
    for m in reversed(out):
        if getattr(m, "type", "") == "ai" and not (getattr(m, "tool_calls", None)):
            answer = m.content or ""
            break
    return {"answer": answer, "sources": tools_used, "mode": "deep", "fallback": False}


# ------------------------------------------------------------------ entrypoint
async def run_agent(query: str, user_ctx: dict, history: Optional[List[dict]] = None,
                    thread_id: str = "default") -> dict:
    if not AGENT_ENABLED:
        return await _fallback(query, user_ctx, history, "disabled")
    try:
        if AGENT_MODE == "deep":
            r = await _run_deep(query, user_ctx, history, thread_id)
        else:
            r = await _run_bounded(query, user_ctx, history)
        if not (r.get("answer") or "").strip():
            return await _fallback(query, user_ctx, history, "empty")
        return r
    except asyncio.TimeoutError:
        return await _fallback(query, user_ctx, history, "timeout")
    except Exception as e:
        logger.warning("agent failed: %s", e)
        return await _fallback(query, user_ctx, history, f"error:{e}")


async def _fallback(query, user_ctx, history, reason) -> dict:
    from database import SessionLocal
    from utils.ai_bridge import rag_query
    db = SessionLocal()
    try:
        ans = await rag_query(query, history or [], db, user_ctx.get("user_id", 0),
                              user_ctx.get("role", "user"), user_ctx.get("accessible_modules") or [])
        return {"answer": ans, "sources": [], "mode": "fallback", "fallback": True, "fallback_reason": reason}
    finally:
        db.close()
