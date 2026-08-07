"""Seed dummy data for testing"""
from database import SessionLocal
from models import ProjectTask, WorkLog
from datetime import datetime, date, timedelta

db = SessionLocal()

try:
    # ==================== PROJECT TASKS ====================
    tasks_data = [
        # Urgent/High Priority
        {
            "title": "Fix Production Server Disk Issue",
            "description": "Server PROD-01 mengalami disk full. Perlu cleanup dan monitoring setup.",
            "status": "doing",
            "assignee": "Soni",
            "priority": "high",
            "due_date": date.today() - timedelta(days=1),
            "tags": "incident,production,server",
            "estimated_hours": "4",
        },
        {
            "title": "Security Patch - Critical Vulnerability",
            "description": "Apply security patch untuk CVE-2026-0001 pada semua server production",
            "status": "todo",
            "assignee": "Soni",
            "priority": "high",
            "due_date": date.today(),
            "tags": "security,patch,critical",
            "estimated_hours": "3",
        },
        {
            "title": "Backup Restoration Test",
            "description": "Monthly backup restoration test untuk compliance audit",
            "status": "todo",
            "assignee": "Soni",
            "priority": "high",
            "due_date": date.today() - timedelta(days=2),
            "tags": "backup,compliance,monthly",
            "estimated_hours": "2",
        },
        
        # Medium Priority
        {
            "title": "Monthly Security Audit Report",
            "description": "Prepare security audit report for management review",
            "status": "doing",
            "assignee": "Soni",
            "priority": "medium",
            "due_date": date.today() + timedelta(days=2),
            "tags": "audit,security,monthly,report",
            "estimated_hours": "6",
        },
        {
            "title": "Update Network Documentation",
            "description": "Update network diagram and IP allocation documentation",
            "status": "todo",
            "assignee": "Soni",
            "priority": "medium",
            "due_date": date.today() + timedelta(days=5),
            "tags": "documentation,network",
            "estimated_hours": "3",
        },
        {
            "title": "Setup Monitoring for New Application",
            "description": "Configure Nagios monitoring for new CRM application",
            "status": "todo",
            "assignee": "Soni",
            "priority": "medium",
            "due_date": date.today() + timedelta(days=7),
            "tags": "monitoring,application,nagios",
            "estimated_hours": "4",
        },
        {
            "title": "Review Firewall Rules",
            "description": "Quarterly firewall rules review and cleanup",
            "status": "todo",
            "assignee": "Soni",
            "priority": "medium",
            "due_date": date.today() + timedelta(days=10),
            "tags": "security,firewall,quarterly",
            "estimated_hours": "5",
        },
        
        # Low Priority
        {
            "title": "Clean Up Old Log Files",
            "description": "Archive and delete log files older than 90 days",
            "status": "todo",
            "assignee": "Soni",
            "priority": "low",
            "due_date": date.today() + timedelta(days=14),
            "tags": "maintenance,cleanup",
            "estimated_hours": "2",
        },
        {
            "title": "Update SOP Document",
            "description": "Update IT Operations SOP based on recent changes",
            "status": "done",
            "assignee": "Soni",
            "priority": "low",
            "due_date": date.today() - timedelta(days=5),
            "tags": "documentation,sop",
            "estimated_hours": "3",
            "completed_at": datetime.now() - timedelta(days=6),
        },
        {
            "title": "Test Disaster Recovery Plan",
            "description": "Annual DR test - coordinate with all teams",
            "status": "todo",
            "assignee": "Soni",
            "priority": "low",
            "due_date": date.today() + timedelta(days=30),
            "tags": "dr,testing,annual",
            "estimated_hours": "8",
        },
    ]
    
    print("Creating Project Tasks...")
    for task_data in tasks_data:
        task = ProjectTask(
            created_by=1,
            updated_at=datetime.now(),
            **task_data
        )
        db.add(task)
    
    db.commit()
    
    tasks = db.query(ProjectTask).all()
    task_map = {t.title: t.id for t in tasks}
    
    # ==================== WORK LOGS ====================
    worklogs_data = [
        {"date": date.today(), "time": "09:00", "description": "Investigated disk space issue on PROD-01", "category": "Incident", "status": "done", "actual_time": "2h", "tags": "incident,production", "task_id": task_map.get("Fix Production Server Disk Issue")},
        {"date": date.today(), "time": "11:30", "description": "Weekly IT sync meeting", "category": "Meeting", "status": "done", "actual_time": "1h", "tags": "meeting,weekly", "task_id": None},
        {"date": date.today(), "time": "14:00", "description": "Working on security audit report", "category": "Documentation", "status": "in_progress", "actual_time": "1.5h", "tags": "audit,report", "task_id": task_map.get("Monthly Security Audit Report")},
        {"date": date.today() - timedelta(days=1), "time": "08:30", "description": "Started investigation on PROD-01 disk issue", "category": "Incident", "status": "done", "actual_time": "1h", "tags": "incident,production", "task_id": task_map.get("Fix Production Server Disk Issue")},
        {"date": date.today() - timedelta(days=1), "time": "10:00", "description": "Applied security patches on staging servers", "category": "Maintenance", "status": "done", "actual_time": "2h", "tags": "security,patch", "task_id": task_map.get("Security Patch - Critical Vulnerability")},
        {"date": date.today() - timedelta(days=1), "time": "14:00", "description": "User support - password reset", "category": "Support", "status": "done", "actual_time": "1h", "tags": "support,users", "task_id": None},
        {"date": date.today() - timedelta(days=2), "time": "09:00", "description": "Prepared backup restoration test environment", "category": "Maintenance", "status": "done", "actual_time": "1.5h", "tags": "backup,test", "task_id": task_map.get("Backup Restoration Test")},
        {"date": date.today() - timedelta(days=2), "time": "13:00", "description": "Network troubleshooting for finance", "category": "Support", "status": "done", "actual_time": "2h", "tags": "network,support", "task_id": None},
        {"date": date.today() - timedelta(days=3), "time": "09:30", "description": "Updated SOP document - incident response", "category": "Documentation", "status": "done", "actual_time": "2.5h", "tags": "documentation,sop", "task_id": task_map.get("Update SOP Document")},
        {"date": date.today() - timedelta(days=3), "time": "14:00", "description": "Server health check and monitoring", "category": "Maintenance", "status": "done", "actual_time": "1h", "tags": "maintenance,monitoring", "task_id": None},
        {"date": date.today() - timedelta(days=4), "time": "10:00", "description": "Started SOP document update", "category": "Documentation", "status": "done", "actual_time": "2h", "tags": "documentation,sop", "task_id": task_map.get("Update SOP Document")},
        {"date": date.today() - timedelta(days=4), "time": "15:00", "description": "Team meeting - sprint planning", "category": "Meeting", "status": "done", "actual_time": "1h", "tags": "meeting,planning", "task_id": None},
    ]
    
    print("Creating Work Logs...")
    for wl_data in worklogs_data:
        worklog = WorkLog(user_id=1, **wl_data)
        db.add(worklog)
    
    db.commit()
    
    # Update actual_hours
    print("Updating task actual hours...")
    for task in tasks:
        worklogs = db.query(WorkLog).filter(WorkLog.task_id == task.id).all()
        total_hours = sum(
            float(wl.actual_time.replace('h', '')) 
            for wl in worklogs 
            if wl.actual_time and 'h' in wl.actual_time
        )
        if total_hours > 0:
            task.actual_hours = f"{total_hours:.1f}"
    
    db.commit()
    
    print("\n✅ Data dummy berhasil dibuat!")
    print(f"\n📋 Project Tasks: {len(tasks_data)} tasks")
    print(f"📅 Work Logs: {len(worklogs_data)} entries")
    print(f"\n📊 Summary:")
    print(f"   - High Priority: {sum(1 for t in tasks_data if t['priority'] == 'high')}")
    print(f"   - Medium Priority: {sum(1 for t in tasks_data if t['priority'] == 'medium')}")
    print(f"   - Low Priority: {sum(1 for t in tasks_data if t['priority'] == 'low')}")
    print(f"   - Overdue: {sum(1 for t in tasks_data if t['due_date'] < date.today() and t['status'] != 'done')}")
    print(f"   - Completed: {sum(1 for t in tasks_data if t['status'] == 'done')}")
    
except Exception as e:
    print(f"❌ Error: {e}")
    db.rollback()
    import traceback
    traceback.print_exc()
finally:
    db.close()
