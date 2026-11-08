from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime
from database import get_db
from models import Trade, JournalEntry, Account, User
from schemas import TradeResponse, ManualTradeCreate
from routers.auth import get_current_user, verify_account_access

router = APIRouter(prefix="/api/v1/trades", tags=["Trades"])

@router.get("", response_model=List[TradeResponse])
def get_trades(
    account_id: Optional[int] = Query(None, description="Filter by MT5 account ID"),
    symbol: Optional[str] = None,
    trade_type: Optional[str] = None,
    outcome: Optional[str] = Query(None, description="'win', 'loss', or 'all'"),
    search: Optional[str] = None,
    limit: Optional[int] = Query(None),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    allowed_ids = verify_account_access(db, current_user, account_id)
    query = db.query(Trade).options(joinedload(Trade.journal_entry))
    if account_id:
        query = query.filter(Trade.account_id == account_id)
    else:
        query = query.filter(Trade.account_id.in_(allowed_ids))

    if symbol:
        query = query.filter(Trade.symbol.ilike(f"%{symbol}%"))
    if trade_type:
        query = query.filter(Trade.type.ilike(trade_type))
    if outcome == "win":
        query = query.filter(Trade.net_pnl > 0)
    elif outcome == "loss":
        query = query.filter(Trade.net_pnl < 0)

    if search:
        search_filter = f"%{search}%"
        query = query.join(Trade.journal_entry, isouter=True).filter(
            (Trade.symbol.ilike(search_filter)) |
            (JournalEntry.setup.ilike(search_filter)) |
            (JournalEntry.emotion.ilike(search_filter)) |
            (JournalEntry.notes.ilike(search_filter))
        )

    query = query.order_by(Trade.close_time.desc())
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)

    return query.all()

@router.get("/{trade_id}", response_model=TradeResponse)
def get_trade_by_id(
    trade_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    # Verify ownership
    if trade.account_id:
        verify_account_access(db, current_user, trade.account_id)
    return trade

@router.post("", response_model=TradeResponse)
def create_manual_trade(
    payload: ManualTradeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Determine account_id: use payload's or fall back to user's first owned account
    if hasattr(payload, 'account_id') and payload.account_id:
        verify_account_access(db, current_user, payload.account_id)
        account_id = payload.account_id
    else:
        owned = db.query(Account).filter(Account.user_id == current_user.id).first()
        account_id = owned.account_id if owned else None

    pseudo_pos_id = int(datetime.utcnow().timestamp() * 1000)

    trade = Trade(
        position_id=pseudo_pos_id,
        account_id=account_id,
        symbol=payload.symbol.upper(),
        type=payload.type.upper(),
        volume=payload.volume,
        entry_price=payload.entry_price,
        exit_price=payload.exit_price,
        open_time=datetime.utcnow(),
        close_time=datetime.utcnow(),
        gross_profit=payload.net_pnl,
        commission=0.0,
        swap=0.0,
        net_pnl=payload.net_pnl,
        status="CLOSED"
    )
    db.add(trade)
    db.commit()
    db.refresh(trade)

    if payload.setup or payload.emotion or payload.notes:
        journal = JournalEntry(
            trade_id=trade.id,
            setup=payload.setup or "",
            emotion=payload.emotion or "",
            notes=payload.notes or "",
            rating=payload.rating or 5
        )
        db.add(journal)
        db.commit()
        db.refresh(trade)

    return trade

@router.delete("/{trade_id}")
def delete_trade(
    trade_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    # Verify ownership before deleting
    if trade.account_id:
        verify_account_access(db, current_user, trade.account_id)
    db.delete(trade)
    db.commit()
    return {"status": "deleted", "trade_id": trade_id}

@router.delete("")
def clear_all_trades(
    confirm: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not confirm:
        raise HTTPException(status_code=400, detail="Pass confirm=true to clear all trades")
    # Only delete trades belonging to the current user's accounts
    owned_ids = [a.account_id for a in db.query(Account).filter(Account.user_id == current_user.id).all()]
    trade_ids = [t.id for t in db.query(Trade.id).filter(Trade.account_id.in_(owned_ids)).all()]
    if trade_ids:
        db.query(JournalEntry).filter(JournalEntry.trade_id.in_(trade_ids)).delete(synchronize_session=False)
        db.query(Trade).filter(Trade.id.in_(trade_ids)).delete(synchronize_session=False)
    db.commit()
    return {"status": "success", "message": "All your trades cleared"}