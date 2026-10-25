from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import JournalEntry, Trade
from schemas import JournalCreate, JournalResponse

router = APIRouter(prefix="/api/v1/journal", tags=["Journal"])

@router.post("", response_model=JournalResponse)
def create_or_update_journal(entry: JournalCreate, db: Session = Depends(get_db)):
    trade = db.query(Trade).filter(Trade.id == entry.trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    existing = db.query(JournalEntry).filter(JournalEntry.trade_id == entry.trade_id).first()
    if existing:
        existing.setup = entry.setup
        existing.emotion = entry.emotion
        existing.notes = entry.notes
        existing.rating = entry.rating
        existing.screenshot_url = entry.screenshot_url
        db.commit()
        db.refresh(existing)
        return existing

    new_entry = JournalEntry(
        trade_id=entry.trade_id,
        setup=entry.setup,
        emotion=entry.emotion,
        notes=entry.notes,
        rating=entry.rating,
        screenshot_url=entry.screenshot_url
    )
    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)
    return new_entry

@router.delete("/{trade_id}")
def delete_journal_entry(trade_id: int, db: Session = Depends(get_db)):
    entry = db.query(JournalEntry).filter(JournalEntry.trade_id == trade_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    db.delete(entry)
    db.commit()
    return {"status": "deleted", "trade_id": trade_id}

@router.get("/tags")
def get_popular_tags(db: Session = Depends(get_db)):
    setups = db.query(JournalEntry.setup).filter(JournalEntry.setup != "").distinct().all()
    emotions = db.query(JournalEntry.emotion).filter(JournalEntry.emotion != "").distinct().all()
    
    default_setups = ["Breakout", "Retest", "ICT / FVG", "Liquidity Sweep", "Trend Following", "Counter-Trend", "Range Scalp"]
    default_emotions = ["Disciplined", "Calm", "FOMO", "Greedy", "Hesitant", "Revenge Trade", "Anxious", "Confident"]

    user_setups = [s[0] for s in setups if s[0]]
    user_emotions = [e[0] for e in emotions if e[0]]

    return {
        "setups": list(dict.fromkeys(default_setups + user_setups)),
        "emotions": list(dict.fromkeys(default_emotions + user_emotions))
    }