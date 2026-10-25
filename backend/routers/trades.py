from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from database import get_db
from models import Trade, JournalEntry
from schemas import TradeResponse, ManualTradeCreate

router = APIRouter(prefix="/api/v1/trades", tags=["Trades"])

@router.get("", response_model=List[TradeResponse])
def get_trades(
    account_id: Optional[int] = Query(None, description="Filter by MT5 account ID"),
    symbol: Optional[str] = None,
    trade_type: Optional[str] = None,
    outcome: Optional[str] = Query(None, description="'win', 'loss', or 'all'"),
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    query = db.query(Trade)
    if account_id:
        query = query.filter(Trade.account_id == account_id)

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

    return query.order_by(Trade.close_time.desc()).offset(offset).limit(limit).all()

@router.get("/{trade_id}", response_model=TradeResponse)
def get_trade_by_id(trade_id: int, db: Session = Depends(get_db)):
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    return trade

@router.post("", response_model=TradeResponse)
def create_manual_trade(payload: ManualTradeCreate, db: Session = Depends(get_db)):
    # Generate unique pseudo position_id based on timestamp
    pseudo_pos_id = int(datetime.utcnow().timestamp() * 1000)

    trade = Trade(
        position_id=pseudo_pos_id,
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
def delete_trade(trade_id: int, db: Session = Depends(get_db)):
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    db.delete(trade)
    db.commit()
    return {"status": "deleted", "trade_id": trade_id}

@router.delete("")
def clear_all_trades(confirm: bool = False, db: Session = Depends(get_db)):
    if not confirm:
        raise HTTPException(status_code=400, detail="Pass confirm=true to clear all trades")
    db.query(JournalEntry).delete()
    db.query(Trade).delete()
    db.commit()
    return {"status": "success", "message": "All trades cleared"}