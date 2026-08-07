"""
AI Workflow Builder — Create and execute automated workflows from natural language.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from models import AiWorkflow

logger = logging.getLogger(__name__)


async def parse_workflow_intent(message: str) -> Dict[str, Any]:
    """Use LLM to parse a natural language workflow description into structured format."""
    from utils.ai_engine import query_llm

    prompt = (
        "Kamu asisten IT Management. Ubah instruksi berikut ke JSON workflow.\n\n"
        "Instruksi: " + message + "\n\n"
        "Format JSON:\n"
        '{"name": "nama workflow", "description": "deskripsi",\n'
        ' "trigger_module": "incident_report|project_tasks|vulnerability_report|...",\n'
        ' "trigger_condition": {"field": "severity|status|...", "op": "eq|neq|gt|gte|lt|lte|like", "value": "..."},\n'
        ' "actions": [{"type": "create_task|send_notification|update_status|send_email", "params": {...}}]}\n\n'
        "Actions available:\n"
        '- create_task: {"title": "...", "description": "...", "assignee": "...", "priority": "high|medium|low"}\n'
        '- send_notification: {"user_id": int|"$trigger.user_id", "title": "...", "message": "..."}\n'
        '- update_status: {"target_field": "status", "new_value": "..."}\n'
        "- send_email: {\"to\": \"...\", \"subject\": \"...\", \"body\": \"...\"}\n\n"
        "Respond only with valid JSON, no other text."
    )

    try:
        raw = await query_llm(
            [{"role": "system", "content": "Kamu asisten pembuat workflow."},
             {"role": "user", "content": prompt}],
            max_tokens=500, temperature=0.1,
        )
        return _parse_workflow_json(raw)
    except Exception as e:
        logger.error("Parse workflow intent failed: %s", e, exc_info=True)
        return {"error": f"Gagal memahami instruksi: {str(e)}"}


def _parse_workflow_json(raw: str) -> Dict[str, Any]:
    """Extract and validate JSON from LLM output."""
    import re
    json_match = re.search(r'\{.*\}', raw, re.DOTALL)
    if not json_match:
        return {"error": "Gagal parse JSON dari output AI."}
    try:
        parsed = json.loads(json_match.group())
        required = ["name", "trigger_module", "actions"]
        for field in required:
            if field not in parsed:
                return {"error": f"Field '{field}' tidak ditemukan."}
        if not isinstance(parsed["actions"], list):
            return {"error": "'actions' harus berupa array."}
        return parsed
    except json.JSONDecodeError:
        return {"error": "JSON tidak valid."}


def create_workflow(db: Session, data: dict, user_id: int) -> Dict[str, Any]:
    """Save a parsed workflow to the database."""
    wf = AiWorkflow(
        name=data["name"],
        description=data.get("description"),
        trigger_module=data["trigger_module"],
        trigger_condition=data.get("trigger_condition"),
        actions=data["actions"],
        created_by=user_id,
    )
    db.add(wf)
    db.flush()
    logger.info("Workflow created: %s (trigger=%s)", wf.name, wf.trigger_module)
    return _workflow_to_dict(wf)


def list_workflows(db: Session, user_id: int, role: str) -> List[Dict[str, Any]]:
    """List all workflows (superadmin) or user's own."""
    query = db.query(AiWorkflow).order_by(AiWorkflow.created_at.desc())
    if role != "superadmin":
        query = query.filter(AiWorkflow.created_by == user_id)
    return [_workflow_to_dict(w) for w in query.all()]


def toggle_workflow(db: Session, workflow_id: int, user_id: int, role: str) -> Dict[str, Any]:
    """Enable/disable a workflow."""
    wf = db.query(AiWorkflow).filter(AiWorkflow.id == workflow_id).first()
    if not wf:
        return {"error": "Workflow tidak ditemukan."}
    if role != "superadmin" and wf.created_by != user_id:
        return {"error": "Tidak punya akses ke workflow ini."}
    wf.enabled = not wf.enabled
    db.flush()
    return {"status": "ok", "enabled": wf.enabled}


def delete_workflow(db: Session, workflow_id: int, user_id: int, role: str) -> bool:
    """Delete a workflow."""
    wf = db.query(AiWorkflow).filter(AiWorkflow.id == workflow_id).first()
    if not wf:
        return False
    if role != "superadmin" and wf.created_by != user_id:
        return False
    db.delete(wf)
    db.flush()
    return True


def evaluate_workflows(
    db: Session, trigger_module: str, trigger_data: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Evaluate all enabled workflows for a given trigger. Execute matching ones."""
    from datetime import date
    import importlib

    workflows = db.query(AiWorkflow).filter(
        AiWorkflow.trigger_module == trigger_module,
        AiWorkflow.enabled == True,
    ).all()

    results = []
    models_module = importlib.import_module("models")

    for wf in workflows:
        condition = wf.trigger_condition or {}
        if not condition:
            results.append({"workflow_id": wf.id, "matched": True, "executed": True})
            _execute_workflow_actions(db, wf.actions, trigger_data, models_module)
            continue

        field = condition.get("field")
        op = condition.get("op", "eq")
        value = condition.get("value")
        actual = trigger_data.get(field)

        if actual is not None and value is not None:
            matched = False
            if op == "eq":
                matched = str(actual).lower() == str(value).lower()
            elif op == "neq":
                matched = str(actual).lower() != str(value).lower()
            elif op == "gt":
                matched = float(actual) > float(value)
            elif op == "gte":
                matched = float(actual) >= float(value)
            elif op == "lt":
                matched = float(actual) < float(value)
            elif op == "lte":
                matched = float(actual) <= float(value)
            elif op == "like":
                matched = str(value).lower() in str(actual).lower()

            if matched:
                _execute_workflow_actions(db, wf.actions, trigger_data, models_module)
                results.append({"workflow_id": wf.id, "matched": True, "executed": True})
            else:
                results.append({"workflow_id": wf.id, "matched": False})

    return results


def _execute_workflow_actions(
    db: Session, actions: list, trigger_data: dict, models_module,
):
    """Execute workflow actions."""
    for action in actions:
        action_type = action.get("type")
        params = action.get("params", {})

        if action_type == "create_task":
            pt = getattr(models_module, "ProjectTask", None)
            if pt:
                obj = pt()
                obj.title = params.get("title", trigger_data.get("title", "Task dari workflow"))
                obj.description = params.get("description", trigger_data.get("description", ""))
                obj.assignee = params.get("assignee")
                obj.priority = params.get("priority", "medium")
                obj.status = params.get("status", "todo")
                if hasattr(obj, "created_at"):
                    obj.created_at = datetime.now(timezone.utc)
                db.add(obj)
                db.flush()

        elif action_type == "send_notification":
            Notification = getattr(models_module, "Notification", None)
            if Notification:
                notif = Notification()
                notif.user_id = params.get("user_id", 1)
                notif.type = "workflow"
                notif.title = params.get("title", "Notifikasi Workflow")
                notif.message = params.get("message", trigger_data.get("description", ""))
                if hasattr(notif, "created_at"):
                    notif.created_at = datetime.now(timezone.utc)
                db.add(notif)
                db.flush()

        elif action_type == "update_status":
            if "target_id" in trigger_data and "target_module" in trigger_data:
                target_cls = _resolve_model(trigger_data["target_module"], models_module)
                if target_cls:
                    target = db.query(target_cls).filter(
                        target_cls.id == trigger_data["target_id"]
                    ).first()
                    if target:
                        field = params.get("target_field", "status")
                        if hasattr(target, field):
                            setattr(target, field, params.get("new_value"))
                            db.flush()

    db.commit()


def _resolve_model(table_name: str, module) -> Any:
    mapping = {
        "incident_report": "IncidentReport", "project_tasks": "ProjectTask",
        "work_log": "WorkLog", "asset_common": "AssetCommon",
        "vulnerability_report": "VulnerabilityReport",
    }
    class_name = mapping.get(table_name)
    if class_name:
        return getattr(module, class_name, None)
    return None


def _workflow_to_dict(wf: AiWorkflow) -> Dict[str, Any]:
    return {
        "id": wf.id,
        "name": wf.name,
        "description": wf.description,
        "trigger_module": wf.trigger_module,
        "trigger_condition": wf.trigger_condition,
        "actions": wf.actions,
        "enabled": wf.enabled,
        "created_by": wf.created_by,
        "created_at": wf.created_at.isoformat() if wf.created_at else None,
    }
