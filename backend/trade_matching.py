from collections import defaultdict
from datetime import datetime
from sqlalchemy.orm import Session
from models import Deal, Trade

def process_deal_matching(db: Session, account_id: int = None):
    """
    Consolidates raw MT5 deal executions into closed trades using weighted average pricing.
    Optimized for cloud databases: loads data in 2 queries total instead of N*2 queries.
    """
    # 1. Fetch all deals for this account in a single query
    deal_q = db.query(Deal)
    if account_id:
        deal_q = deal_q.filter(Deal.account_id == account_id)
    all_deals = deal_q.order_by(Deal.timestamp.asc()).all()

    if not all_deals:
        return 0

    # 2. Group deals by position_id in memory (excluding balance/credit deals where position_id == 0)
    deals_by_pos = defaultdict(list)
    for d in all_deals:
        if d.position_id and d.position_id > 0:
            deals_by_pos[d.position_id].append(d)

    if not deals_by_pos:
        return 0

    # 3. Fetch all existing trades in a single query for fast in-memory lookup
    trade_q = db.query(Trade)
    if account_id:
        trade_q = trade_q.filter(Trade.account_id == account_id)
    existing_trades = {t.position_id: t for t in trade_q.all()}

    # 4. Process each position ticket
    trades_created = 0
    for position_id, deals in deals_by_pos.items():
        in_deals = [d for d in deals if d.entry == "IN"]
        out_deals = [d for d in deals if d.entry == "OUT"]

        # Only aggregate if we have paired entry and exit deals
        if in_deals and out_deals:
            total_in_vol = sum(d.volume for d in in_deals)
            avg_entry_price = sum(d.price * d.volume for d in in_deals) / total_in_vol if total_in_vol > 0 else 0

            total_out_vol = sum(d.volume for d in out_deals)
            avg_exit_price = sum(d.price * d.volume for d in out_deals) / total_out_vol if total_out_vol > 0 else 0

            gross_profit = sum(d.profit for d in deals)
            commission = sum(d.commission for d in deals)
            swap = sum(d.swap for d in deals)
            net_pnl = gross_profit + commission + swap

            existing_trade = existing_trades.get(position_id)

            if not existing_trade:
                trade = Trade(
                    account_id=account_id or in_deals[0].account_id,
                    position_id=position_id,
                    symbol=in_deals[0].symbol,
                    type=in_deals[0].type,
                    volume=round(total_in_vol, 2),
                    entry_price=round(avg_entry_price, 5),
                    exit_price=round(avg_exit_price, 5),
                    open_time=in_deals[0].timestamp,
                    close_time=out_deals[-1].timestamp,
                    gross_profit=round(gross_profit, 2),
                    commission=round(commission, 2),
                    swap=round(swap, 2),
                    net_pnl=round(net_pnl, 2),
                    status="CLOSED"
                )
                db.add(trade)
                trades_created += 1
            else:
                existing_trade.symbol = in_deals[0].symbol
                existing_trade.type = in_deals[0].type
                existing_trade.volume = round(total_in_vol, 2)
                existing_trade.entry_price = round(avg_entry_price, 5)
                existing_trade.exit_price = round(avg_exit_price, 5)
                existing_trade.open_time = in_deals[0].timestamp
                existing_trade.close_time = out_deals[-1].timestamp
                existing_trade.gross_profit = round(gross_profit, 2)
                existing_trade.commission = round(commission, 2)
                existing_trade.swap = round(swap, 2)
                existing_trade.net_pnl = round(net_pnl, 2)
                existing_trade.status = "CLOSED"

    # 5. Commit all trades in a single transaction
    db.commit()
    return trades_created
