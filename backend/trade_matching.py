from datetime import datetime
from sqlalchemy.orm import Session
from models import Deal, Trade

def process_deal_matching(db: Session, account_id: int = None):
    # Fetch all distinct position IDs from deals (optionally scoped to account)
    q = db.query(Deal.position_id)
    if account_id:
        q = q.filter(Deal.account_id == account_id)
    positions_to_check = q.group_by(Deal.position_id).all()
    
    for pos in positions_to_check:
        position_id = pos[0]
        deal_q = db.query(Deal).filter(Deal.position_id == position_id)
        if account_id:
            deal_q = deal_q.filter(Deal.account_id == account_id)
        deals = deal_q.order_by(Deal.timestamp.asc()).all()
        
        in_deals = [d for d in deals if d.entry == "IN"]
        out_deals = [d for d in deals if d.entry == "OUT"]
        
        # Only aggregate if we have paired entry and exit deals
        if in_deals and out_deals:
            existing_trade = db.query(Trade).filter(Trade.position_id == position_id).first()
            
            # Weighted average price calculations for scaling entries/exits
            total_in_vol = sum(d.volume for d in in_deals)
            avg_entry_price = sum(d.price * d.volume for d in in_deals) / total_in_vol if total_in_vol > 0 else 0
            
            total_out_vol = sum(d.volume for d in out_deals)
            avg_exit_price = sum(d.price * d.volume for d in out_deals) / total_out_vol if total_out_vol > 0 else 0
            
            gross_profit = sum(d.profit for d in deals)
            commission = sum(d.commission for d in deals)
            swap = sum(d.swap for d in deals)
            net_pnl = gross_profit + commission + swap
            
            if not existing_trade:
                trade = Trade(
                    account_id=account_id,
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
    db.commit()