from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models import Position
from schemas import PositionResponse

router = APIRouter(prefix="/api/v1/positions", tags=["Positions"])

@router.get("", response_model=List[PositionResponse])
def get_open_positions(
    account_id: Optional[int] = Query(None, description="Filter by MT5 account ID"),
    db: Session = Depends(get_db)
):
    q = db.query(Position)
    if account_id:
        q = q.filter(Position.account_id == account_id)
    return q.order_by(Position.profit.desc()).all()
