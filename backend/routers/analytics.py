from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from models import Trade, Account
from schemas import AnalyticsSummary, PnLPoint

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])

@router.get("/summary", response_model=AnalyticsSummary)
def get_analytics_summary(
    account_id: Optional[int] = Query(None, description="Filter by MT5 account ID"),
    db: Session = Depends(get_db)
):
    q = db.query(Trade)
    if account_id:
        q = q.filter(Trade.account_id == account_id)
    trades = q.order_by(Trade.close_time.asc()).all()

    acc_q = db.query(Account)
    if account_id:
        acc_q = acc_q.filter(Account.account_id == account_id)
    account = acc_q.first()

    balance = float(account.balance) if account and account.balance is not None else 0.0
    equity = float(account.equity) if account and account.equity is not None else balance
    margin = float(account.margin) if account and account.margin is not None else 0.0
    free_margin = float(account.free_margin) if account and account.free_margin is not None else balance

    total_trades = len(trades)
    if total_trades == 0:
        return AnalyticsSummary(
            balance=balance,
            equity=equity,
            margin=margin,
            free_margin=free_margin,
            total_trades=0,
            win_rate=0.0,
            total_wins=0,
            total_losses=0,
            breakeven_trades=0,
            total_net_pnl=0.0,
            net_pnl=0.0,
            gross_profit=0.0,
            gross_loss=0.0,
            profit_factor=0.0,
            best_trade=0.0,
            worst_trade=0.0,
            avg_trade=0.0,
            expectancy=0.0,
            symbols_breakdown={},
            pnl_curve=[]
        )

    wins = [t for t in trades if t.net_pnl > 0]
    losses = [t for t in trades if t.net_pnl < 0]
    breakevens = [t for t in trades if t.net_pnl == 0]

    win_rate = round((len(wins) / total_trades) * 100, 1)
    gross_profit = round(sum(t.net_pnl for t in wins), 2)
    gross_loss = round(abs(sum(t.net_pnl for t in losses)), 2)
    total_net_pnl = round(sum(t.net_pnl for t in trades), 2)

    if gross_loss > 0:
        profit_factor = round(gross_profit / gross_loss, 2)
    else:
        profit_factor = round(gross_profit, 2) if gross_profit > 0 else 0.0

    all_pnls = [t.net_pnl for t in trades]
    best_trade = round(max(all_pnls), 2)
    worst_trade = round(min(all_pnls), 2)
    avg_trade = round(total_net_pnl / total_trades, 2)

    # Expectancy = (Win% * Avg Win) - (Loss% * Avg Loss)
    avg_win = (gross_profit / len(wins)) if wins else 0.0
    avg_loss = (gross_loss / len(losses)) if losses else 0.0
    expectancy = round(((len(wins) / total_trades) * avg_win) - ((len(losses) / total_trades) * avg_loss), 2)

    # Symbols breakdown
    symbols_breakdown = {}
    for t in trades:
        sym = t.symbol or "UNKNOWN"
        if sym not in symbols_breakdown:
            symbols_breakdown[sym] = {"trades": 0, "wins": 0, "losses": 0, "net_pnl": 0.0, "volume": 0.0}
        symbols_breakdown[sym]["trades"] += 1
        symbols_breakdown[sym]["volume"] = round(symbols_breakdown[sym]["volume"] + (t.volume or 0), 2)
        symbols_breakdown[sym]["net_pnl"] = round(symbols_breakdown[sym]["net_pnl"] + t.net_pnl, 2)
        if t.net_pnl > 0:
            symbols_breakdown[sym]["wins"] += 1
        elif t.net_pnl < 0:
            symbols_breakdown[sym]["losses"] += 1

    for sym, data in symbols_breakdown.items():
        data["win_rate"] = round((data["wins"] / data["trades"]) * 100, 1) if data["trades"] > 0 else 0.0

    # Cumulative PnL Curve
    pnl_curve = []
    running_pnl = 0.0
    for t in trades:
        running_pnl = round(running_pnl + t.net_pnl, 2)
        time_str = t.close_time.strftime("%b %d %H:%M") if t.close_time else "N/A"
        pnl_curve.append(
            PnLPoint(
                trade_id=t.id,
                time=time_str,
                symbol=t.symbol,
                net_pnl=t.net_pnl,
                cumulative_pnl=running_pnl
            )
        )

    return AnalyticsSummary(
        balance=balance,
        equity=equity,
        margin=margin,
        free_margin=free_margin,
        total_trades=total_trades,
        win_rate=win_rate,
        total_wins=len(wins),
        total_losses=len(losses),
        breakeven_trades=len(breakevens),
        total_net_pnl=total_net_pnl,
        net_pnl=total_net_pnl,
        gross_profit=gross_profit,
        gross_loss=gross_loss,
        profit_factor=profit_factor,
        best_trade=best_trade,
        worst_trade=worst_trade,
        avg_trade=avg_trade,
        expectancy=expectancy,
        symbols_breakdown=symbols_breakdown,
        pnl_curve=pnl_curve
    )