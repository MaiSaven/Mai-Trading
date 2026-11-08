from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models import Position, Account, User
from schemas import PositionResponse
from routers.auth import get_current_user, verify_account_access

router = APIRouter(prefix="/api/v1/positions", tags=["Positions"])

@router.get("", response_model=List[PositionResponse])
def get_open_positions(
    account_id: Optional[int] = Query(None, description="Filter by MT5 account ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    allowed_ids = verify_account_access(db, current_user, account_id)
    q = db.query(Position)
    if account_id:
        q = q.filter(Position.account_id == account_id)
    else:
        q = q.filter(Position.account_id.in_(allowed_ids))
    return q.order_by(Position.profit.desc()).all()
