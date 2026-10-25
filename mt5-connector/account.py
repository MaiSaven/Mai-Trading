import MetaTrader5 as mt5

def get_account_info():
    info = mt5.account_info()
    if info is None:
        return None
        
    return {
        "account_id": int(info.login),
        "broker": str(info.company or "MetaTrader 5 Broker"),
        "currency": str(info.currency or "USD"),
        "balance": float(info.balance),
        "equity": float(info.equity),
        "margin": float(info.margin),
        "free_margin": float(info.margin_free),
        "leverage": int(info.leverage),
        "profit": float(info.profit)
    }