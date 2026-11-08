from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models import Account, User, Broker
from routers.auth import get_current_user

router = APIRouter(prefix="/api/v1/accounts", tags=["Accounts"])

class ClaimAccountRequest(BaseModel):
    account_id: int
    broker_id: Optional[int] = None
    broker: Optional[str] = None

@router.get("/brokers")
def list_brokers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return distinct active brokers and servers from the brokers table."""
    brokers = db.query(Broker).order_by(Broker.name.asc()).all()
    result = []
    seen = set()
    for b in brokers:
        key = (b.name, b.server)
        if key not in seen:
            seen.add(key)
            result.append({
                "id": b.id,
                "name": b.name,
                "server": b.server,
                "display": f"{b.name} ({b.server})" if b.server else b.name
            })
    return result

@router.get("")
def list_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return only connected MT5 accounts owned by the authenticated user."""
    accounts = (
        db.query(Account)
        .filter(Account.user_id == current_user.id)
        .order_by(Account.updated_at.desc())
        .all()
    )
    return [
        {
            "account_id": a.account_id,
            "login": a.login or a.account_id,
            "broker": a.broker,
            "server": a.server,
            "currency": a.currency,
            "balance": a.balance,
            "equity": a.equity,
            "profit": a.profit,
            "leverage": a.leverage,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
        }
        for a in accounts
    ]

@router.post("/claim")
def claim_account(
    payload: ClaimAccountRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Allows a user to claim ownership of an unassigned MT5 trading account, optionally specifying broker."""
    query = db.query(Account).filter(
        (Account.account_id == payload.account_id) | (Account.login == payload.account_id)
    )

    target_broker = payload.broker
    if payload.broker_id:
        b_record = db.query(Broker).filter(Broker.id == payload.broker_id).first()
        if b_record:
            target_broker = b_record.name

    if target_broker and target_broker.strip():
        query = query.filter(Account.broker.ilike(f"%{target_broker.strip()}%"))

    matches = query.all()
    if not matches:
        detail_msg = f"Account #{payload.account_id}"
        if target_broker:
            detail_msg += f" with broker '{target_broker}'"
        detail_msg += " not found in database. Make sure MT5 has synced at least once."
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail_msg)

    if len(matches) > 1 and not target_broker:
        broker_names = list(dict.fromkeys(m.broker for m in matches))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Multiple accounts found with login #{payload.account_id}. Please select your broker: {', '.join(broker_names)}"
        )

    acc = matches[0]

    if acc.user_id and acc.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This account ({acc.broker} #{acc.login or acc.account_id}) has already been claimed by another user."
        )

    acc.user_id = current_user.id
    db.commit()
    return {
        "status": "success",
        "message": f"Account {acc.broker} #{acc.login or acc.account_id} claimed successfully!",
        "account_id": acc.account_id
    }
