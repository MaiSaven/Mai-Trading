from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from typing import Optional
from database import get_db
from models import Trade, Account, User
from schemas import AnalyticsSummary, PnLPoint
from routers.auth import get_current_user, verify_account_access

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])

@router.get("/summary", response_model=AnalyticsSummary)
def get_analytics_summary(
    account_id: Optional[int] = Query(None, description="Filter by MT5 account ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    allowed_ids = verify_account_access(db, current_user, account_id)

    # --- Account balance info (single row, fast) ---
    acc_q = db.query(Account).filter(Account.user_id == current_user.id)
    if account_id:
        acc_q = acc_q.filter(Account.account_id == account_id)
    account = acc_q.first()

    balance    = float(account.balance)    if account and account.balance    is not None else 0.0
    equity     = float(account.equity)     if account and account.equity     is not None else balance
    margin     = float(account.margin)     if account and account.margin     is not None else 0.0
    free_margin= float(account.free_margin)if account and account.free_margin is not None else balance

    # --- Single-pass SQL aggregation (replaces loading all rows into Python) ---
    base_filter = (Trade.account_id == account_id) if account_id else Trade.account_id.in_(allowed_ids)

    agg = db.query(
        func.count(Trade.id).label("total"),
        func.sum(case((Trade.net_pnl > 0, 1), else_=0)).label("wins"),
        func.sum(case((Trade.net_pnl < 0, 1), else_=0)).label("losses"),
        func.sum(case((Trade.net_pnl == 0, 1), else_=0)).label("breakevens"),
        func.sum(Trade.net_pnl).label("total_pnl"),
        func.sum(case((Trade.net_pnl > 0, Trade.net_pnl), else_=0)).label("gross_profit"),
        func.sum(case((Trade.net_pnl < 0, Trade.net_pnl), else_=0)).label("gross_loss"),
        func.max(Trade.net_pnl).label("best"),
        func.min(Trade.net_pnl).label("worst"),
        func.avg(Trade.net_pnl).label("avg"),
    ).filter(base_filter).one()

    total_trades = agg.total or 0
    if total_trades == 0:
        return AnalyticsSummary(
            balance=balance, equity=equity, margin=margin, free_margin=free_margin,
            total_trades=0, win_rate=0.0, total_wins=0, total_losses=0, breakeven_trades=0,
            total_net_pnl=0.0, net_pnl=0.0, gross_profit=0.0, gross_loss=0.0,
            profit_factor=0.0, best_trade=0.0, worst_trade=0.0, avg_trade=0.0,
            expectancy=0.0, symbols_breakdown={}, pnl_curve=[]
        )

    wins_count   = int(agg.wins   or 0)
    losses_count = int(agg.losses or 0)
    total_pnl    = round(float(agg.total_pnl  or 0), 2)
    gross_profit = round(float(agg.gross_profit or 0), 2)
    gross_loss   = round(abs(float(agg.gross_loss or 0)), 2)
    best_trade   = round(float(agg.best  or 0), 2)
    worst_trade  = round(float(agg.worst or 0), 2)
    avg_trade    = round(float(agg.avg   or 0), 2)
    win_rate     = round((wins_count / total_trades) * 100, 1)
    profit_factor= round(gross_profit / gross_loss, 2) if gross_loss > 0 else (round(gross_profit, 2) if gross_profit > 0 else 0.0)

    avg_win  = round(gross_profit / wins_count,   2) if wins_count   > 0 else 0.0
    avg_loss = round(gross_loss   / losses_count, 2) if losses_count > 0 else 0.0
    expectancy = round(((wins_count / total_trades) * avg_win) - ((losses_count / total_trades) * avg_loss), 2)

    # --- Symbols breakdown (SQL GROUP BY — no Python loop over all trades) ---
    sym_rows = db.query(
        Trade.symbol,
        func.count(Trade.id).label("trades"),
        func.sum(case((Trade.net_pnl > 0, 1), else_=0)).label("wins"),
        func.sum(case((Trade.net_pnl < 0, 1), else_=0)).label("losses"),
        func.sum(Trade.net_pnl).label("net_pnl"),
        func.sum(Trade.volume).label("volume"),
    ).filter(base_filter).group_by(Trade.symbol).all()

    symbols_breakdown = {}
    for row in sym_rows:
        sym = row.symbol or "UNKNOWN"
        t   = int(row.trades or 0)
        symbols_breakdown[sym] = {
            "trades":   t,
            "wins":     int(row.wins   or 0),
            "losses":   int(row.losses or 0),
            "net_pnl":  round(float(row.net_pnl or 0), 2),
            "volume":   round(float(row.volume  or 0), 2),
            "win_rate": round((int(row.wins or 0) / t) * 100, 1) if t > 0 else 0.0,
        }

    # --- PnL curve: only fetch id, close_time, net_pnl, symbol (no SELECT *) ---
    curve_rows = db.query(
        Trade.id, Trade.close_time, Trade.net_pnl, Trade.symbol
    ).filter(base_filter).order_by(Trade.close_time.asc()).all()

    pnl_curve = []
    running = 0.0
    for row in curve_rows:
        running = round(running + (row.net_pnl or 0), 2)
        time_str = row.close_time.strftime("%b %d %H:%M") if row.close_time else "N/A"
        pnl_curve.append(PnLPoint(
            trade_id=row.id,
            time=time_str,
            symbol=row.symbol,
            net_pnl=round(float(row.net_pnl or 0), 2),
            cumulative_pnl=running
        ))

    return AnalyticsSummary(
        balance=balance, equity=equity, margin=margin, free_margin=free_margin,
        total_trades=total_trades, win_rate=win_rate,
        total_wins=wins_count, total_losses=losses_count,
        breakeven_trades=int(agg.breakevens or 0),
        total_net_pnl=total_pnl, net_pnl=total_pnl,
        gross_profit=gross_profit, gross_loss=gross_loss,
        profit_factor=profit_factor,
        best_trade=best_trade, worst_trade=worst_trade, avg_trade=avg_trade,
        expectancy=expectancy,
        symbols_breakdown=symbols_breakdown,
        pnl_curve=pnl_curve
    )