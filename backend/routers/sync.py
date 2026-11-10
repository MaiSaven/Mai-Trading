import os
import hashlib
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import random
from database import get_db
from models import Account, Deal, Trade, Position, JournalEntry, User, Broker
from schemas import SyncPayload
from trade_matching import process_deal_matching
from routers.auth import get_current_user
import jwt
from config import ENABLE_DEMO_DATA, API_KEY, JWT_SECRET, JWT_ALGORITHM

def get_synthetic_account_id(broker: str, login: int, server: str = "") -> int:
    """
    Deterministically generates a 63-bit positive BigInteger ID from (broker, login, server).
    Ensures that if two different brokers have the same login, they will never collide.
    """
    clean_broker = (broker or "").strip().lower()
    clean_server = (server or "").strip().lower()
    if not clean_broker or clean_broker in ("metatrader 5 broker", "unknown broker", "metaquotes-demo (simulated)"):
        return login

    key = f"{clean_broker}:{clean_server}:{login}" if clean_server else f"{clean_broker}:{login}"
    digest = hashlib.sha256(key.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], byteorder="big") & 0x7FFFFFFFFFFFFFFF

# ---------------------------------------------------------------------------
# Broker timezone correction
# MT5 reports pos.time / deal.time in broker server time, NOT true Unix UTC.
# Broker: UTC+3  |  Your local: UTC+7
# Subtract broker offset so the DB always stores real UTC.
# The frontend then converts UTC → UTC+7 automatically via the browser.
# ---------------------------------------------------------------------------
# Change this if you switch brokers
# Current broker is UTC+3 so chnage to my local UTC+7
BROKER_UTC_OFFSET_HOURS = 4  

def broker_ts_to_utc(ts: int) -> datetime:
    """Convert a broker-timezone Unix-like timestamp to a real UTC datetime."""
    if ts <= 0:
        return datetime.utcnow()
    real_utc_ts = ts + BROKER_UTC_OFFSET_HOURS * 3600
    return datetime.utcfromtimestamp(real_utc_ts)

router = APIRouter(prefix="/api/v1", tags=["Sync"])

@router.post("/sync")
def sync_data(
    payload: SyncPayload,
    db: Session = Depends(get_db),
    x_api_key: str = Header(None),
    authorization: str = Header(None),
    x_user_email: str = Header(None)
):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized API key")

    # Determine user identity if provided in sync request
    sync_user_id = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        try:
            tok_payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            sync_user_id = int(tok_payload.get("sub"))
        except Exception:
            pass
    elif x_user_email:
        u = db.query(User).filter(User.email == x_user_email.strip()).first()
        if u:
            sync_user_id = u.id

    # 1. Update Account Record (Collision-Resistant for Multiple Brokers)
    acc_data = payload.account
    raw_login = acc_data.login or acc_data.account_id
    raw_broker = acc_data.broker or "Unknown Broker"
    raw_server = acc_data.server or ""

    # Auto-record broker & server in brokers table
    if raw_broker and raw_broker != "Unknown Broker":
        existing_broker = db.query(Broker).filter(
            Broker.name == raw_broker,
            Broker.server == raw_server
        ).first()
        if not existing_broker:
            db.add(Broker(name=raw_broker, server=raw_server))
            db.commit()

    synthetic_id = get_synthetic_account_id(raw_broker, raw_login, raw_server)

    # Check A: Existing account by (account_id == raw_login AND matching broker)
    account = db.query(Account).filter(
        Account.account_id == raw_login,
        Account.broker == raw_broker
    ).first()

    # Check B: Existing account by synthetic_id
    if not account:
        account = db.query(Account).filter(Account.account_id == synthetic_id).first()

    # Check C: Check if raw_login is occupied by another broker (collision)
    if not account:
        collision = db.query(Account).filter(Account.account_id == raw_login).first()
        if collision and collision.broker != raw_broker:
            # Collision! Another broker already uses raw_login. Use synthetic_id.
            target_account_id = synthetic_id
        else:
            # No collision, or matches raw_login
            target_account_id = raw_login

        account = Account(
            account_id=target_account_id,
            login=raw_login,
            server=raw_server,
            broker=raw_broker,
            user_id=sync_user_id
        )
        db.add(account)
    else:
        target_account_id = account.account_id
        if not account.login:
            account.login = raw_login
        if not account.server:
            account.server = raw_server
        # If account had no owner, assign to sync user
        if not account.user_id and sync_user_id:
            account.user_id = sync_user_id

    account.broker = raw_broker
    account.currency = acc_data.currency
    account.balance = acc_data.balance
    account.equity = acc_data.equity
    account.margin = acc_data.margin
    account.free_margin = acc_data.free_margin
    account.leverage = acc_data.leverage
    account.profit = acc_data.profit
    account.updated_at = datetime.utcnow()

    current_account_id = target_account_id

    # 2. Update Open Positions (replace snapshot with active tickets)
    active_tickets = [p.ticket for p in payload.positions]
    # Delete positions for THIS account that are no longer open
    db.query(Position).filter(
        Position.account_id == current_account_id,
        ~Position.ticket.in_(active_tickets)
    ).delete(synchronize_session=False)

    if payload.positions:
        existing_pos_map = {
            pos.ticket: pos
            for pos in db.query(Position).filter(Position.account_id == current_account_id).all()
        }
        for p in payload.positions:
            pos_time = broker_ts_to_utc(p.time)
            pos = existing_pos_map.get(p.ticket)
            if not pos:
                pos = Position(
                    account_id=current_account_id,
                    ticket=p.ticket,
                    symbol=p.symbol,
                    type=p.type,
                    volume=p.volume,
                    price_open=p.price_open,
                    price_current=p.price_current,
                    sl=p.sl,
                    tp=p.tp,
                    profit=p.profit,
                    swap=p.swap,
                    time=pos_time,
                    updated_at=datetime.utcnow()
                )
                db.add(pos)
            else:
                pos.symbol = p.symbol
                pos.type = p.type
                pos.volume = p.volume
                pos.price_open = p.price_open
                pos.price_current = p.price_current
                pos.sl = p.sl
                pos.tp = p.tp
                pos.profit = p.profit
                pos.swap = p.swap
                pos.updated_at = datetime.utcnow()

    # 3. Ingest Deals (Optimized Batch Ingestion)
    new_deals_count = 0
    if payload.deals:
        # Step 3a: Get all existing deal_ids for this account in 1 query
        existing_deal_ids = {
            r[0] for r in db.query(Deal.deal_id).filter(
                Deal.account_id == current_account_id
            ).all()
        }

        # Step 3b: Filter candidate new deals
        candidate_deals = [d for d in payload.deals if d.deal_id not in existing_deal_ids]

        if candidate_deals:
            # Check if any candidate deal_id is already in the database across other accounts (chunks of 500)
            candidate_ids = [d.deal_id for d in candidate_deals]
            other_existing_ids = set()
            chunk_size = 500
            for i in range(0, len(candidate_ids), chunk_size):
                chunk = candidate_ids[i:i + chunk_size]
                rows = db.query(Deal.deal_id).filter(Deal.deal_id.in_(chunk)).all()
                other_existing_ids.update(r[0] for r in rows)

            new_deals = []
            for d in candidate_deals:
                if d.deal_id not in other_existing_ids:
                    deal_time = broker_ts_to_utc(d.time)
                    new_deals.append(
                        Deal(
                            account_id=current_account_id,
                            deal_id=d.deal_id,
                            order_id=d.order_id,
                            position_id=d.position_id,
                            symbol=d.symbol,
                            type=d.type,
                            entry=d.entry,
                            volume=d.volume,
                            price=d.price,
                            profit=d.profit,
                            commission=d.commission,
                            swap=d.swap,
                            timestamp=deal_time
                        )
                    )

            if new_deals:
                db.add_all(new_deals)
                new_deals_count = len(new_deals)

    db.commit()

    # 4. Match position tickets into trades (scoped to this account)
    # Only run matching if new deals were inserted, OR if account has no closed trades yet
    has_trades = db.query(Trade.id).filter(Trade.account_id == current_account_id).first() is not None
    if new_deals_count > 0 or not has_trades:
        process_deal_matching(db, current_account_id)

    return {
        "status": "success",
        "deals_received": len(payload.deals),
        "deals_new": new_deals_count,
        "positions_active": len(payload.positions),
        "account_balance": account.balance
    }

@router.get("/sync/status")
def get_sync_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns sync status scoped to the authenticated user's own accounts only."""
    # Only show accounts owned by the current user
    user_accounts = db.query(Account).filter(Account.user_id == current_user.id).all()
    user_account_ids = [a.account_id for a in user_accounts]

    # Pick the most-recently updated account for the top-level status
    account = (
        db.query(Account)
        .filter(Account.user_id == current_user.id)
        .order_by(Account.updated_at.desc())
        .first()
    )

    # Counts scoped to this user's account IDs only
    deals_count = db.query(Deal).filter(Deal.account_id.in_(user_account_ids)).count()
    trades_count = db.query(Trade).filter(Trade.account_id.in_(user_account_ids)).count()
    positions_count = db.query(Position).filter(Position.account_id.in_(user_account_ids)).count()

    return {
        "connected": account is not None,
        "account": {
            "account_id": account.account_id if account else None,
            "broker": account.broker if account else "Not connected",
            "balance": account.balance if account else 0.0,
            "equity": account.equity if account else 0.0,
            "profit": account.profit if account else 0.0,
            "updated_at": account.updated_at if account else None
        },
        "stats": {
            "deals_recorded": deals_count,
            "trades_matched": trades_count,
            "open_positions": positions_count
        }
    }

@router.post("/sync/seed-demo")
def seed_demo_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Seeds realistic trading data for instant dashboard demonstration.

    This endpoint is **disabled by default**.  To enable it, set
    ``ENABLE_DEMO_DATA=true`` in the backend ``.env`` file and restart
    the server.
    """
    if not ENABLE_DEMO_DATA:
        raise HTTPException(
            status_code=403,
            detail="Demo data seeding is disabled.  Set ENABLE_DEMO_DATA=true in .env to enable it."
        )
    # 1. Seed Account (linked to the current user)
    account = db.query(Account).filter(Account.user_id == current_user.id).first()
    if not account:
        account = Account(
            account_id=5892104,
            user_id=current_user.id,
            broker="MetaQuotes-Demo (Simulated)",
            currency="USD",
            balance=102450.00,
            equity=103120.50,
            margin=1200.0,
            free_margin=101920.50,
            leverage=100,
            profit=670.50,
            updated_at=datetime.utcnow()
        )
        db.add(account)
    else:
        account.balance = 102450.00
        account.equity = 103120.50
        account.margin = 1200.00
        account.free_margin = 101920.50
        account.profit = 670.50
        account.updated_at = datetime.utcnow()

    # 2. Seed Open Positions
    db.query(Position).delete()
    pos1 = Position(
        ticket=981023,
        symbol="XAUUSD",
        type="BUY",
        volume=0.50,
        price_open=2735.40,
        price_current=2742.60,
        sl=2725.00,
        tp=2760.00,
        profit=360.00,
        swap=-2.50,
        time=datetime.utcnow() - timedelta(hours=3),
        updated_at=datetime.utcnow()
    )
    pos2 = Position(
        ticket=981024,
        symbol="EURUSD",
        type="SELL",
        volume=1.00,
        price_open=1.0850,
        price_current=1.0819,
        sl=1.0890,
        tp=1.0770,
        profit=310.00,
        swap=-1.20,
        time=datetime.utcnow() - timedelta(hours=1),
        updated_at=datetime.utcnow()
    )
    db.add(pos1)
    db.add(pos2)

    # 3. Demo Trades Dataset
    demo_trades = [
        {
            "pos_id": 9001,
                "symbol": "XAUUSD",
                "type": "BUY",
                "vol": 0.5,
                "entry": 2715.20,
                "exit": 2732.50,
                "pnl": 865.00,
                "days_ago": 6,
                "setup": "ICT / FVG",
                "emotion": "Disciplined",
                "notes": "Waited for 15m Fair Value Gap tap during London session open. Clear invalidation below swing low. Target hit cleanly.",
                "rating": 5
            },
            {
                "pos_id": 9002,
                "symbol": "EURUSD",
                "type": "SELL",
                "vol": 1.0,
                "entry": 1.0895,
                "exit": 1.0845,
                "pnl": 500.00,
                "days_ago": 5,
                "setup": "Breakout",
                "emotion": "Calm",
                "notes": "Bearish break of structural support after ECB speech. Trailed stop loss behind previous candle highs.",
                "rating": 4
            },
            {
                "pos_id": 9003,
                "symbol": "GBPUSD",
                "type": "BUY",
                "vol": 0.75,
                "entry": 1.2980,
                "exit": 1.2940,
                "pnl": -300.00,
                "days_ago": 5,
                "setup": "Retest",
                "emotion": "FOMO",
                "notes": "Jumped in before 4H candle closed. Got caught in false breakout spike. Lesson: wait for confirmation close.",
                "rating": 2
            },
            {
                "pos_id": 9004,
                "symbol": "XAUUSD",
                "type": "SELL",
                "vol": 0.3,
                "entry": 2748.00,
                "exit": 2736.00,
                "pnl": 360.00,
                "days_ago": 4,
                "setup": "Liquidity Sweep",
                "emotion": "Confident",
                "notes": "Asian session highs were swept with strong pin-bar rejection. Took 2:1 RR quick scalp.",
                "rating": 5
            },
            {
                "pos_id": 9005,
                "symbol": "USDJPY",
                "type": "BUY",
                "vol": 1.2,
                "entry": 152.10,
                "exit": 153.25,
                "pnl": 920.00,
                "days_ago": 3,
                "setup": "Trend Following",
                "emotion": "Disciplined",
                "notes": "Daily trend alignment + BoJ rate pause. Rallied strongly into US session close.",
                "rating": 5
            },
            {
                "pos_id": 9006,
                "symbol": "BTCUSD",
                "type": "BUY",
                "vol": 0.1,
                "entry": 67200.00,
                "exit": 66500.00,
                "pnl": -70.00,
                "days_ago": 2,
                "setup": "Breakout",
                "emotion": "Hesitant",
                "notes": "Small sizing test on weekend crypto momentum. Cut early due to low volume chop.",
                "rating": 3
            },
            {
                "pos_id": 9007,
                "symbol": "XAUUSD",
                "type": "BUY",
                "vol": 0.4,
                "entry": 2728.50,
                "exit": 2742.00,
                "pnl": 540.00,
                "days_ago": 1,
                "setup": "Retest",
                "emotion": "Calm",
                "notes": "Retest of key psychological level $2,725 with tight 20 pip risk. Great execution.",
                "rating": 5
            },
            {
                "pos_id": 9008,
                "symbol": "EURUSD",
                "type": "BUY",
                "vol": 0.8,
                "entry": 1.0820,
                "exit": 1.0795,
                "pnl": -200.00,
                "days_ago": 1,
                "setup": "Counter-Trend",
                "emotion": "Anxious",
                "notes": "Tried to pick the bottom against DXY strength. Exited on stop loss without emotion.",
                "rating": 3
            }
        ]

    # 3. Seed Realistic Trades
    for dt in demo_trades:
        close_time = datetime.utcnow() - timedelta(days=dt["days_ago"], hours=random.randint(1, 10))
        open_time = close_time - timedelta(hours=random.randint(1, 6))
        
        trade = db.query(Trade).filter(Trade.position_id == dt["pos_id"]).first()
        if not trade:
            trade = Trade(
                position_id=dt["pos_id"],
                symbol=dt["symbol"],
                type=dt["type"],
                volume=dt["vol"],
                entry_price=dt["entry"],
                exit_price=dt["exit"],
                open_time=open_time,
                close_time=close_time,
                gross_profit=dt["pnl"] + 15.0 if dt["pnl"] > 0 else dt["pnl"] + 5.0,
                commission=-10.0,
                swap=-5.0,
                net_pnl=dt["pnl"],
                status="CLOSED"
            )
            db.add(trade)
            db.commit()
            db.refresh(trade)

        journal = db.query(JournalEntry).filter(JournalEntry.trade_id == trade.id).first()
        if not journal:
            journal = JournalEntry(
                trade_id=trade.id,
                setup=dt["setup"],
                emotion=dt["emotion"],
                notes=dt["notes"],
                rating=dt["rating"],
                created_at=close_time
            )
            db.add(journal)

    db.commit()

    return {
        "status": "success",
        "message": "Demo data populated successfully!",
        "account": account.account_id,
        "balance": account.balance
    }