from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import Account

router = APIRouter(prefix="/api/v1/accounts", tags=["Accounts"])

@router.get("")
def list_accounts(db: Session = Depends(get_db)):
    """Return all connected MT5 accounts so the frontend can render a switcher."""
    accounts = db.query(Account).order_by(Account.updated_at.desc()).all()
    return [
        {
            "account_id": a.account_id,
            "broker": a.broker,
            "currency": a.currency,
            "balance": a.balance,
            "equity": a.equity,
            "profit": a.profit,
            "leverage": a.leverage,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
        }
        for a in accounts
    ]
