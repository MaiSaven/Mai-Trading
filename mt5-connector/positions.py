import MetaTrader5 as mt5

def get_open_positions():
    try:
        positions = mt5.positions_get()
    except Exception:
        return []

    if positions is None:
        return []

    result = []
    for pos in positions:
        try:
            result.append({
                "ticket": int(pos.ticket),
                "symbol": str(pos.symbol),
                "type": "BUY" if pos.type == mt5.POSITION_TYPE_BUY else "SELL",
                "volume": round(float(pos.volume), 2),
                "price_open": round(float(pos.price_open), 5),
                "price_current": round(float(pos.price_current), 5),
                "sl": round(float(pos.sl or 0.0), 5),
                "tp": round(float(pos.tp or 0.0), 5),
                "profit": round(float(pos.profit or 0.0), 2),
                "swap": round(float(pos.swap or 0.0), 2),
                "time": int(pos.time)
            })
        except Exception:
            continue
    return result