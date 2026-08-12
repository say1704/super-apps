from utils.timezone import to_iso, utcnow
"""Audit Trail - ISO 27001:2022 & ISO 9001:2015 Compliance"""
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime, date
import csv
import io

from database import get_db
from models import User, AuditFinding, CorrectiveAction, PenilaianRisiko
from api.dependencies import get_current_user, log_activity
from api.dependencies import get_offset, calculate_pagination

router = APIRouter(tags=["Audit Trail"])


def _generate_finding_number(db: Session) -> str:
    """Generate auto-increment finding number: F-YYYY-NNN"""
    year = datetime.now().year
    prefix = f"F-{year}-"
    max_finding = db.query(AuditFinding).filter(
        AuditFinding.finding_number.like(f"{prefix}%")
    ).order_by(AuditFinding.finding_number.desc()).first()
    
    if not max_finding:
        return f"{prefix}001"
    
    last_num = int(max_finding.finding_number.split("-")[-1])
    return f"{prefix}{last_num + 1:03d}"


@router.get("/audit-trail/findings")
async def get_findings(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    source: Optional[str] = Query(None),
    iso_standard: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List audit findings with filters and pagination"""
    query = db.query(AuditFinding).filter(AuditFinding.deleted_at == None)
    
    # RBAC: non-superadmin sees only their role's findings
    if current_user.role != "superadmin":
        query = query.filter(AuditFinding.owner_role == current_user.role)
    
    # Filters
    if source:
        query = query.filter(AuditFinding.source == source)
    if iso_standard:
        query = query.filter(AuditFinding.iso_standard == iso_standard)
    if severity:
        query = query.filter(AuditFinding.severity == severity)
    if status:
        query = query.filter(AuditFinding.status == status)
    if from_date:
        try:
            from_dt = datetime.strptime(from_date, "%Y-%m-%d").date()
            query = query.filter(AuditFinding.audit_date >= from_dt)
        except ValueError:
            pass
    if to_date:
        try:
            to_dt = datetime.strptime(to_date, "%Y-%m-%d").date()
            query = query.filter(AuditFinding.audit_date <= to_dt)
        except ValueError:
            pass
    
    # Sort by audit_date desc
    query = query.order_by(AuditFinding.audit_date.desc(), AuditFinding.id.desc())
    
    total_records = query.count()
    offset = get_offset(page, page_size)
    items = query.offset(offset).limit(page_size).all()
    
    # Serialize
    data = []
    for item in items:
        data.append({
            "id": item.id,
            "finding_number": item.finding_number,
            "source": item.source,
            "iso_standard": item.iso_standard,
            "clause": item.clause,
            "title": item.title,
            "description": item.description,
            "evidence": item.evidence,
            "severity": item.severity,
            "status": item.status,
            "auditor_name": item.auditor_name,
            "audit_date": str(item.audit_date) if item.audit_date else None,
            "risk_id": item.risk_id,
            "responsible_user_id": item.responsible_user_id,
            "due_date": str(item.due_date) if item.due_date else None,
            "owner_role": item.owner_role,
            "created_at": to_iso(item.created_at),
            "created_by": item.created_by,
            "updated_at": to_iso(item.updated_at),
            "version": item.version,
            # Intertek format fields
            "client_name": item.client_name,
            "site_location": item.site_location,
            "audit_type": item.audit_type,
            "scope": item.scope,
            "criteria": item.criteria,
            "finding_category": item.finding_category,
            "root_cause": item.root_cause,
            "follow_up_date": str(item.follow_up_date) if item.follow_up_date else None,
            "verification_effectiveness": item.verification_effectiveness,
        })
    
    return {
        "data": data,
        "pagination": calculate_pagination(page, page_size, total_records).dict()
    }


@router.post("/audit-trail/findings")
async def create_finding(
    source: str,
    iso_standard: str,
    clause: str,
    title: str,
    description: str,
    severity: str,
    auditor_name: str,
    audit_date: str,
    evidence: Optional[str] = None,
    status: str = "open",
    risk_id: Optional[int] = None,
    responsible_user_id: Optional[int] = None,
    due_date: Optional[str] = None,
    # Intertek format fields
    client_name: Optional[str] = None,
    site_location: Optional[str] = None,
    audit_type: Optional[str] = None,
    scope: Optional[str] = None,
    criteria: Optional[str] = None,
    finding_category: Optional[str] = None,
    root_cause: Optional[str] = None,
    follow_up_date: Optional[str] = None,
    verification_effectiveness: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create new audit finding"""
    # Validate severity
    if severity not in ["minor", "major", "critical"]:
        raise HTTPException(status_code=400, detail="Severity must be: minor, major, or critical")
    
    # Validate status
    if status not in ["open", "in_progress", "closed"]:
        raise HTTPException(status_code=400, detail="Status must be: open, in_progress, or closed")
    
    # Parse dates
    try:
        audit_dt = datetime.strptime(audit_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid audit_date format (use YYYY-MM-DD)")
    
    due_dt = None
    if due_date:
        try:
            due_dt = datetime.strptime(due_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid due_date format (use YYYY-MM-DD)")
    
    follow_up_dt = None
    if follow_up_date:
        try:
            follow_up_dt = datetime.strptime(follow_up_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid follow_up_date format (use YYYY-MM-DD)")
    
    # Generate finding number
    finding_number = _generate_finding_number(db)
    
    # Create finding
    finding = AuditFinding(
        finding_number=finding_number,
        source=source,
        iso_standard=iso_standard,
        clause=clause,
        title=title,
        description=description,
        evidence=evidence,
        severity=severity,
        status=status,
        auditor_name=auditor_name,
        audit_date=audit_dt,
        risk_id=risk_id,
        responsible_user_id=responsible_user_id,
        due_date=due_dt,
        owner_role=current_user.role,
        created_by=current_user.id,
        # Intertek format fields
        client_name=client_name,
        site_location=site_location,
        audit_type=audit_type,
        scope=scope,
        criteria=criteria,
        finding_category=finding_category,
        root_cause=root_cause,
        follow_up_date=follow_up_dt,
        verification_effectiveness=verification_effectiveness,
    )
    
    db.add(finding)
    log_activity(db, current_user.id, "CREATE", "audit-trail", f"Created audit finding: {finding_number}")
    db.commit()
    db.refresh(finding)
    
    return {
        "id": finding.id,
        "finding_number": finding.finding_number,
        "message": "Audit finding created successfully"
    }


@router.get("/audit-trail/findings/{finding_id}")
async def get_finding(
    finding_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get audit finding detail"""
    finding = db.query(AuditFinding).filter(
        AuditFinding.id == finding_id,
        AuditFinding.deleted_at == None
    ).first()
    
    if not finding:
        raise HTTPException(status_code=404, detail="Audit finding not found")
    
    # RBAC check
    if current_user.role != "superadmin" and finding.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return {
        "id": finding.id,
        "finding_number": finding.finding_number,
        "source": finding.source,
        "iso_standard": finding.iso_standard,
        "clause": finding.clause,
        "title": finding.title,
        "description": finding.description,
        "evidence": finding.evidence,
        "severity": finding.severity,
        "status": finding.status,
        "auditor_name": finding.auditor_name,
        "audit_date": str(finding.audit_date) if finding.audit_date else None,
        "risk_id": finding.risk_id,
        "responsible_user_id": finding.responsible_user_id,
        "due_date": str(finding.due_date) if finding.due_date else None,
        "owner_role": finding.owner_role,
        "created_at": to_iso(finding.created_at),
        "created_by": finding.created_by,
        "updated_at": to_iso(finding.updated_at),
        "version": finding.version,
        # Intertek format fields
        "client_name": finding.client_name,
        "site_location": finding.site_location,
        "audit_type": finding.audit_type,
        "scope": finding.scope,
        "criteria": finding.criteria,
        "finding_category": finding.finding_category,
        "root_cause": finding.root_cause,
        "follow_up_date": str(finding.follow_up_date) if finding.follow_up_date else None,
        "verification_effectiveness": finding.verification_effectiveness,
    }


@router.put("/audit-trail/findings/{finding_id}")
async def update_finding(
    finding_id: int,
    source: Optional[str] = None,
    iso_standard: Optional[str] = None,
    clause: Optional[str] = None,
    title: Optional[str] = None,
    description: Optional[str] = None,
    evidence: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    auditor_name: Optional[str] = None,
    audit_date: Optional[str] = None,
    risk_id: Optional[int] = None,
    responsible_user_id: Optional[int] = None,
    due_date: Optional[str] = None,
    # Intertek format fields
    client_name: Optional[str] = None,
    site_location: Optional[str] = None,
    audit_type: Optional[str] = None,
    scope: Optional[str] = None,
    criteria: Optional[str] = None,
    finding_category: Optional[str] = None,
    root_cause: Optional[str] = None,
    follow_up_date: Optional[str] = None,
    verification_effectiveness: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update audit finding"""
    finding = db.query(AuditFinding).filter(
        AuditFinding.id == finding_id,
        AuditFinding.deleted_at == None
    ).first()
    
    if not finding:
        raise HTTPException(status_code=404, detail="Audit finding not found")
    
    # RBAC check
    if current_user.role != "superadmin" and finding.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Validate severity if provided
    if severity and severity not in ["minor", "major", "critical"]:
        raise HTTPException(status_code=400, detail="Severity must be: minor, major, or critical")
    
    # Validate status if provided
    if status and status not in ["open", "in_progress", "closed"]:
        raise HTTPException(status_code=400, detail="Status must be: open, in_progress, or closed")
    
    # Parse dates if provided
    audit_dt = None
    if audit_date:
        try:
            audit_dt = datetime.strptime(audit_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid audit_date format (use YYYY-MM-DD)")
    
    due_dt = None
    if due_date:
        try:
            due_dt = datetime.strptime(due_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid due_date format (use YYYY-MM-DD)")
    
    follow_up_dt = None
    if follow_up_date:
        try:
            follow_up_dt = datetime.strptime(follow_up_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid follow_up_date format (use YYYY-MM-DD)")
    
    # Update fields
    if source is not None: finding.source = source
    if iso_standard is not None: finding.iso_standard = iso_standard
    if clause is not None: finding.clause = clause
    if title is not None: finding.title = title
    if description is not None: finding.description = description
    if evidence is not None: finding.evidence = evidence
    if severity is not None: finding.severity = severity
    if status is not None: finding.status = status
    if auditor_name is not None: finding.auditor_name = auditor_name
    if audit_dt is not None: finding.audit_date = audit_dt
    if risk_id is not None: finding.risk_id = risk_id
    if responsible_user_id is not None: finding.responsible_user_id = responsible_user_id
    if due_date is not None: finding.due_date = due_dt
    # Intertek format fields
    if client_name is not None: finding.client_name = client_name
    if site_location is not None: finding.site_location = site_location
    if audit_type is not None: finding.audit_type = audit_type
    if scope is not None: finding.scope = scope
    if criteria is not None: finding.criteria = criteria
    if finding_category is not None: finding.finding_category = finding_category
    if root_cause is not None: finding.root_cause = root_cause
    if follow_up_date is not None: finding.follow_up_date = follow_up_dt
    if verification_effectiveness is not None: finding.verification_effectiveness = verification_effectiveness
    
    finding.version += 1
    log_activity(db, current_user.id, "UPDATE", "audit-trail", f"Updated audit finding: {finding.finding_number}")
    db.commit()
    db.refresh(finding)
    
    return {
        "id": finding.id,
        "finding_number": finding.finding_number,
        "message": "Audit finding updated successfully"
    }


@router.delete("/audit-trail/findings/{finding_id}")
async def delete_finding(
    finding_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Soft delete audit finding"""
    finding = db.query(AuditFinding).filter(
        AuditFinding.id == finding_id,
        AuditFinding.deleted_at == None
    ).first()
    
    if not finding:
        raise HTTPException(status_code=404, detail="Audit finding not found")
    
    # RBAC check
    if current_user.role != "superadmin" and finding.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    
    finding.deleted_at = utcnow()
    finding.version += 1
    log_activity(db, current_user.id, "DELETE", "audit-trail", f"Deleted audit finding: {finding.finding_number}")
    db.commit()
    
    return {"message": "Audit finding deleted successfully"}


@router.get("/audit-trail/stats")
async def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get audit trail statistics"""
    query = db.query(AuditFinding).filter(AuditFinding.deleted_at == None)
    
    # RBAC
    if current_user.role != "superadmin":
        query = query.filter(AuditFinding.owner_role == current_user.role)
    
    total = query.count()
    open_count = query.filter(AuditFinding.status == "open").count()
    in_progress_count = query.filter(AuditFinding.status == "in_progress").count()
    closed_count = query.filter(AuditFinding.status == "closed").count()
    
    # Overdue (due_date < today and status != closed)
    today = date.today()
    overdue_count = query.filter(
        AuditFinding.due_date < today,
        AuditFinding.status != "closed"
    ).count()
    
    # By severity
    minor_count = query.filter(AuditFinding.severity == "minor").count()
    major_count = query.filter(AuditFinding.severity == "major").count()
    critical_count = query.filter(AuditFinding.severity == "critical").count()
    
    return {
        "total": total,
        "open": open_count,
        "in_progress": in_progress_count,
        "closed": closed_count,
        "overdue": overdue_count,
        "by_severity": {
            "minor": minor_count,
            "major": major_count,
            "critical": critical_count,
        }
    }


@router.get("/audit-trail/findings/{finding_id}/corrective-actions")
async def get_corrective_actions(
    finding_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get corrective actions for a finding"""
    finding = db.query(AuditFinding).filter(
        AuditFinding.id == finding_id,
        AuditFinding.deleted_at == None
    ).first()
    
    if not finding:
        raise HTTPException(status_code=404, detail="Audit finding not found")
    
    # RBAC check
    if current_user.role != "superadmin" and finding.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    
    actions = db.query(CorrectiveAction).filter(
        CorrectiveAction.finding_id == finding_id,
        CorrectiveAction.deleted_at == None
    ).order_by(CorrectiveAction.created_at.desc()).all()
    
    data = []
    for action in actions:
        data.append({
            "id": action.id,
            "finding_id": action.finding_id,
            "action_description": action.action_description,
            "responsible_user_id": action.responsible_user_id,
            "due_date": str(action.due_date) if action.due_date else None,
            "status": action.status,
            "completion_date": str(action.completion_date) if action.completion_date else None,
            "verification_notes": action.verification_notes,
            "verified_by": action.verified_by,
            "verified_at": to_iso(action.verified_at) if action.verified_at else None,
            "attachments": action.attachments,
            "created_at": to_iso(action.created_at),
            "created_by": action.created_by,
            "updated_at": to_iso(action.updated_at),
            "version": action.version,
            # Intertek format fields
            "action_plan": action.action_plan,
            "timeline": action.timeline,
            "resources_required": action.resources_required,
            "effectiveness_criteria": action.effectiveness_criteria,
            "follow_up_actions": action.follow_up_actions,
        })
    
    return {"data": data}


@router.post("/audit-trail/findings/{finding_id}/corrective-actions")
async def create_corrective_action(
    finding_id: int,
    action_description: str,
    due_date: str,
    responsible_user_id: Optional[int] = None,
    status: str = "pending",
    # Intertek format fields
    action_plan: Optional[str] = None,
    timeline: Optional[str] = None,
    resources_required: Optional[str] = None,
    effectiveness_criteria: Optional[str] = None,
    follow_up_actions: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create corrective action for a finding"""
    finding = db.query(AuditFinding).filter(
        AuditFinding.id == finding_id,
        AuditFinding.deleted_at == None
    ).first()
    
    if not finding:
        raise HTTPException(status_code=404, detail="Audit finding not found")
    
    # RBAC check
    if current_user.role != "superadmin" and finding.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Validate status
    if status not in ["pending", "in_progress", "verified", "closed"]:
        raise HTTPException(status_code=400, detail="Status must be: pending, in_progress, verified, or closed")
    
    # Parse due_date
    try:
        due_dt = datetime.strptime(due_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid due_date format (use YYYY-MM-DD)")
    
    action = CorrectiveAction(
        finding_id=finding_id,
        action_description=action_description,
        responsible_user_id=responsible_user_id,
        due_date=due_dt,
        status=status,
        created_by=current_user.id,
        # Intertek format fields
        action_plan=action_plan,
        timeline=timeline,
        resources_required=resources_required,
        effectiveness_criteria=effectiveness_criteria,
        follow_up_actions=follow_up_actions,
    )
    
    db.add(action)
    log_activity(db, current_user.id, "CREATE", "audit-trail", 
                 f"Created corrective action for finding {finding.finding_number}")
    db.commit()
    db.refresh(action)
    
    return {
        "id": action.id,
        "finding_id": action.finding_id,
        "message": "Corrective action created successfully"
    }


@router.put("/audit-trail/corrective-actions/{action_id}")
async def update_corrective_action(
    action_id: int,
    action_description: Optional[str] = None,
    responsible_user_id: Optional[int] = None,
    due_date: Optional[str] = None,
    status: Optional[str] = None,
    completion_date: Optional[str] = None,
    # Intertek format fields
    action_plan: Optional[str] = None,
    timeline: Optional[str] = None,
    resources_required: Optional[str] = None,
    effectiveness_criteria: Optional[str] = None,
    follow_up_actions: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update corrective action"""
    action = db.query(CorrectiveAction).filter(
        CorrectiveAction.id == action_id,
        CorrectiveAction.deleted_at == None
    ).first()
    
    if not action:
        raise HTTPException(status_code=404, detail="Corrective action not found")
    
    # Get finding for RBAC check
    finding = db.query(AuditFinding).filter(AuditFinding.id == action.finding_id).first()
    if current_user.role != "superadmin" and finding.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Validate status if provided
    if status and status not in ["pending", "in_progress", "verified", "closed"]:
        raise HTTPException(status_code=400, detail="Status must be: pending, in_progress, verified, or closed")
    
    # Parse dates if provided
    due_dt = None
    if due_date:
        try:
            due_dt = datetime.strptime(due_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid due_date format (use YYYY-MM-DD)")
    
    completion_dt = None
    if completion_date:
        try:
            completion_dt = datetime.strptime(completion_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid completion_date format (use YYYY-MM-DD)")
    
    # Update fields
    if action_description is not None: action.action_description = action_description
    if responsible_user_id is not None: action.responsible_user_id = responsible_user_id
    if due_dt is not None: action.due_date = due_dt
    if status is not None: action.status = status
    if completion_dt is not None: action.completion_date = completion_dt
    # Intertek format fields
    if action_plan is not None: action.action_plan = action_plan
    if timeline is not None: action.timeline = timeline
    if resources_required is not None: action.resources_required = resources_required
    if effectiveness_criteria is not None: action.effectiveness_criteria = effectiveness_criteria
    if follow_up_actions is not None: action.follow_up_actions = follow_up_actions
    
    action.version += 1
    log_activity(db, current_user.id, "UPDATE", "audit-trail",
                 f"Updated corrective action for finding {finding.finding_number}")
    db.commit()
    db.refresh(action)
    
    return {
        "id": action.id,
        "finding_id": action.finding_id,
        "message": "Corrective action updated successfully"
    }


@router.put("/audit-trail/corrective-actions/{action_id}/verify")
async def verify_corrective_action(
    action_id: int,
    verification_notes: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Verify corrective action (mark as verified)"""
    action = db.query(CorrectiveAction).filter(
        CorrectiveAction.id == action_id,
        CorrectiveAction.deleted_at == None
    ).first()
    
    if not action:
        raise HTTPException(status_code=404, detail="Corrective action not found")
    
    # Get finding for RBAC check
    finding = db.query(AuditFinding).filter(AuditFinding.id == action.finding_id).first()
    if current_user.role != "superadmin" and finding.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    
    action.status = "verified"
    action.verified_by = current_user.id
    action.verified_at = utcnow()
    if verification_notes:
        action.verification_notes = verification_notes
    
    action.version += 1
    log_activity(db, current_user.id, "UPDATE", "audit-trail",
                 f"Verified corrective action for finding {finding.finding_number}")
    db.commit()
    db.refresh(action)
    
    return {
        "id": action.id,
        "finding_id": action.finding_id,
        "message": "Corrective action verified successfully"
    }


@router.delete("/audit-trail/corrective-actions/{action_id}")
async def delete_corrective_action(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Soft delete corrective action"""
    action = db.query(CorrectiveAction).filter(
        CorrectiveAction.id == action_id,
        CorrectiveAction.deleted_at == None
    ).first()
    
    if not action:
        raise HTTPException(status_code=404, detail="Corrective action not found")
    
    # Get finding for RBAC check
    finding = db.query(AuditFinding).filter(AuditFinding.id == action.finding_id).first()
    if current_user.role != "superadmin" and finding.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    
    action.deleted_at = utcnow()
    action.version += 1
    log_activity(db, current_user.id, "DELETE", "audit-trail",
                 f"Deleted corrective action for finding {finding.finding_number}")
    db.commit()
    
    return {"message": "Corrective action deleted successfully"}


@router.get("/audit-trail/risks")
async def get_risks_dropdown(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get risk assessment list for dropdown (Phase 3)"""
    query = db.query(PenilaianRisiko).filter(PenilaianRisiko.deleted_at == None)
    
    # RBAC
    if current_user.role != "superadmin":
        query = query.filter(PenilaianRisiko.owner_role == current_user.role)
    
    risks = query.order_by(PenilaianRisiko.nama_isu.asc()).all()
    
    return {
        "data": [
            {
                "id": r.id,
                "nama_isu": r.nama_isu,
                "proses_bisnis": r.proses_bisnis,
            }
            for r in risks
        ]
    }


@router.get("/audit-trail/export/csv")
async def export_csv(
    source: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Export audit findings to CSV (Phase 3)"""
    query = db.query(AuditFinding).filter(AuditFinding.deleted_at == None)
    
    # RBAC
    if current_user.role != "superadmin":
        query = query.filter(AuditFinding.owner_role == current_user.role)
    
    # Filters
    if source:
        query = query.filter(AuditFinding.source == source)
    if severity:
        query = query.filter(AuditFinding.severity == severity)
    if status:
        query = query.filter(AuditFinding.status == status)
    if from_date:
        try:
            from_dt = datetime.strptime(from_date, "%Y-%m-%d").date()
            query = query.filter(AuditFinding.audit_date >= from_dt)
        except ValueError:
            pass
    if to_date:
        try:
            to_dt = datetime.strptime(to_date, "%Y-%m-%d").date()
            query = query.filter(AuditFinding.audit_date <= to_dt)
        except ValueError:
            pass
    
    findings = query.order_by(AuditFinding.audit_date.desc()).all()
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "Finding Number", "Source", "ISO Standard", "Clause", "Title",
        "Description", "Evidence", "Severity", "Status", "Auditor Name",
        "Audit Date", "Due Date", "Created At",
        # Intertek format fields
        "Client Name", "Site Location", "Audit Type", "Scope", "Criteria",
        "Finding Category", "Root Cause", "Follow-up Date", "Verification Effectiveness"
    ])
    
    # Data
    for f in findings:
        writer.writerow([
            f.finding_number,
            f.source,
            f.iso_standard,
            f.clause,
            f.title,
            f.description,
            f.evidence or "",
            f.severity,
            f.status,
            f.auditor_name,
            str(f.audit_date) if f.audit_date else "",
            str(f.due_date) if f.due_date else "",
            to_iso(f.created_at) if f.created_at else "",
            f.client_name or "",
            f.site_location or "",
            f.audit_type or "",
            f.scope or "",
            f.criteria or "",
            f.finding_category or "",
            f.root_cause or "",
            str(f.follow_up_date) if f.follow_up_date else "",
            f.verification_effectiveness or ""
        ])
    
    output.seek(0)
    
    log_activity(db, current_user.id, "EXPORT", "audit-trail",
                 f"Exported {len(findings)} audit findings to CSV")
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=audit_findings_{datetime.now().strftime('%Y%m%d')}.csv"}
    )


@router.get("/audit-trail/export/data", response_model=dict)
async def export_audit_trail_data(
    source: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Export audit findings with corrective actions (for PDF report). Phase 3"""
    query = db.query(AuditFinding).filter(AuditFinding.deleted_at == None)

    # RBAC
    if current_user.role != "superadmin":
        query = query.filter(AuditFinding.owner_role == current_user.role)

    # Filters
    if source:
        query = query.filter(AuditFinding.source == source)
    if severity:
        query = query.filter(AuditFinding.severity == severity)
    if status:
        query = query.filter(AuditFinding.status == status)
    if from_date:
        try:
            from_dt = datetime.strptime(from_date, "%Y-%m-%d").date()
            query = query.filter(AuditFinding.audit_date >= from_dt)
        except ValueError:
            pass
    if to_date:
        try:
            to_dt = datetime.strptime(to_date, "%Y-%m-%d").date()
            query = query.filter(AuditFinding.audit_date <= to_dt)
        except ValueError:
            pass

    findings = query.order_by(AuditFinding.audit_date.desc(), AuditFinding.id.desc()).all()

    data = []
    for f in findings:
        actions = db.query(CorrectiveAction).filter(
            CorrectiveAction.finding_id == f.id,
            CorrectiveAction.deleted_at == None
        ).order_by(CorrectiveAction.created_at.desc()).all()

        data.append({
            "id": f.id,
            "finding_number": f.finding_number,
            "source": f.source,
            "iso_standard": f.iso_standard,
            "clause": f.clause,
            "title": f.title,
            "description": f.description,
            "evidence": f.evidence,
            "severity": f.severity,
            "status": f.status,
            "auditor_name": f.auditor_name,
            "audit_date": str(f.audit_date) if f.audit_date else None,
            "due_date": str(f.due_date) if f.due_date else None,
            "owner_role": f.owner_role,
            "created_at": to_iso(f.created_at) if f.created_at else None,
            # Intertek format fields
            "client_name": f.client_name,
            "site_location": f.site_location,
            "audit_type": f.audit_type,
            "scope": f.scope,
            "criteria": f.criteria,
            "finding_category": f.finding_category,
            "root_cause": f.root_cause,
            "follow_up_date": str(f.follow_up_date) if f.follow_up_date else None,
            "verification_effectiveness": f.verification_effectiveness,
            "corrective_actions": [
                {
                    "id": a.id,
                    "action_description": a.action_description,
                    "responsible_user_id": a.responsible_user_id,
                    "due_date": str(a.due_date) if a.due_date else None,
                    "status": a.status,
                    "completion_date": str(a.completion_date) if a.completion_date else None,
                    "verification_notes": a.verification_notes,
                    "verified_by": a.verified_by,
                    "verified_at": to_iso(a.verified_at) if a.verified_at else None,
                    # Intertek format fields
                    "action_plan": a.action_plan,
                    "timeline": a.timeline,
                    "resources_required": a.resources_required,
                    "effectiveness_criteria": a.effectiveness_criteria,
                    "follow_up_actions": a.follow_up_actions,
                }
                for a in actions
            ],
        })

    log_activity(db, current_user.id, "EXPORT", "audit-trail",
                 f"Exported {len(findings)} audit findings to PDF report")

    return {
        "data": data,
        "total": len(data),
    }
