from datetime import datetime, timedelta
import MetaTrader5 as mt5

def get_deal_history(days=60):
    from_date = datetime.now() - timedelta(days=days)
    to_date = datetime.now() + timedelta(days=1)
    
    try:
        deals = mt5.history_deals_get(from_date, to_date)
    except Exception:
        return []

    if deals is None:
        return []

    result = []
    for deal in deals:
        try:
            # Filter deal entry types: IN (0), OUT (1), IN/OUT (2)
            if deal.entry in (mt5.DEAL_ENTRY_IN, mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_INOUT):
                result.append({
                    "deal_id": int(deal.ticket),
                    "order_id": int(deal.order),
                    "position_id": int(deal.position_id),
                    "symbol": str(deal.symbol),
                    "type": "BUY" if deal.type == mt5.DEAL_TYPE_BUY else "SELL",
                    "entry": "IN" if deal.entry == mt5.DEAL_ENTRY_IN else "OUT",
                    "volume": round(float(deal.volume), 2),
                    "price": round(float(deal.price), 5),
                    "profit": round(float(deal.profit or 0.0), 2),
                    "commission": round(float(deal.commission or 0.0), 2),
                    "swap": round(float(deal.swap or 0.0), 2),
                    "time": int(deal.time)
                })
        except Exception:
            continue
    return result