"""IRMC Check Report — daily summary for PDF export."""
import logging
from datetime import datetime, date
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, IRMCCheck, IrmcFolder
from api.dependencies import get_current_user, log_activity

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/irmc-reports", tags=["IRMC Reports"])


@router.get("/daily")
def get_irmc_daily_report(
    date_str: str = Query(None, alias="date"),
    from_date: str = Query(None, alias="from_date"),
    to_date: str = Query(None, alias="to_date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Daily IRMC check report — all checks for a given date or date range."""
    admin = current_user.role == "superadmin"
    role_user_ids = db.query(User.id).filter(User.role == current_user.role)

    start_date = None
    end_date = None

    if from_date and to_date:
        try:
            start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
            end_date = datetime.strptime(to_date, "%Y-%m-%d").date()
            if start_date > end_date:
                raise HTTPException(status_code=400, detail="from_date must be before or equal to to_date")
            if (end_date - start_date).days > 365:
                raise HTTPException(status_code=400, detail="Date range too large. Maximum 365 days allowed")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    elif date_str:
        try:
            start_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            end_date = start_date
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        latest = db.query(IRMCCheck.check_date)
        if not admin:
            latest = latest.filter(IRMCCheck.created_by.in_(role_user_ids))
        latest = latest.order_by(IRMCCheck.check_date.desc()).first()
        start_date = latest[0] if latest else date.today()
        end_date = start_date

    query = db.query(IRMCCheck).filter(
        IRMCCheck.check_date >= start_date,
        IRMCCheck.check_date <= end_date
    )
    if not admin:
        query = query.filter(IRMCCheck.created_by.in_(role_user_ids))

    checks = query.order_by(IRMCCheck.check_date, IRMCCheck.server_name).all()

    checks_data = [
        {
            "server_name": c.server_name,
            "check_date": c.check_date.isoformat(),
            "status": c.status,
            "notes": c.notes or '',
            "folder_id": c.folder_id,
        }
        for c in checks
    ]

    total = len(checks_data)
    pass_count = sum(1 for c in checks_data if c['status'] == 'pass')
    warning_count = sum(1 for c in checks_data if c['status'] == 'warning')
    fail_count = sum(1 for c in checks_data if c['status'] == 'fail')
    pending_count = sum(1 for c in checks_data if c['status'] == 'pending')

    # Format date range for response
    date_range = start_date.isoformat() if start_date == end_date else f"{start_date.isoformat()} to {end_date.isoformat()}"

    log_activity(db, current_user.id, "EXPORT", "irmc",
                 f"Exported IRMC daily report ({date_range})")
    db.commit()

    return {
        "date": date_range,
        "from_date": start_date.isoformat(),
        "to_date": end_date.isoformat(),
        "summary": {
            "total": total,
            "pass": pass_count,
            "warning": warning_count,
            "fail": fail_count,
            "pending": pending_count,
        },
        "checks": checks_data,
    }
