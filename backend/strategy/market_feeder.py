"""
market_feeder.py
Background daemon that automatically syncs XAUUSD market candles and 
detects strategy signals every 60 seconds directly into PostgreSQL.
"""

import asyncio
import logging
from datetime import datetime

logger = logging.getLogger("market_feeder")

# Sync XAUUSD across key active trading timeframes every minute
FEEDER_TIMEFRAMES = ["M1", "M5", "M15", "H1"]


async def sync_gold_market_cycle():
    """Run one pass of fetching, DB upserting, and signal evaluation for XAUUSD."""
    from strategy.data_provider import get_ohlcv
    from strategy.combined_strategy import run_strategy
    from database import engine, get_db
    from models import StrategySignal
    import pandas as pd

    for tf in FEEDER_TIMEFRAMES:
        try:
            # 1. Fetch latest candles and save into trading.market_candles (forces fresh fetch)
            from strategy.data_provider import fetch_mt5, fetch_yfinance, save_to_db

            df = fetch_mt5("XAUUSD", tf, bars=300)
            if df is None or len(df) < 50:
                df = fetch_yfinance("XAUUSD", tf)

            if df is not None and len(df) >= 50:
                save_to_db(df, "XAUUSD", tf)

                # 2. Evaluate strategy signals
                signals = run_strategy(df, symbol="XAUUSD", timeframe=tf, min_confluence=2, min_pressure_bias=0.25)
                
                # 3. Persist new signals into trading.strategy_signals
                if signals:
                    db = next(get_db())
                    try:
                        for sig in signals[-10:]:  # Check recent triggers
                            raw_t = pd.to_datetime(sig["time"])
                            sig_time = raw_t.to_pydatetime()
                            if sig_time.tzinfo is not None:
                                sig_time = sig_time.replace(tzinfo=None)

                            existing = db.query(StrategySignal).filter(
                                StrategySignal.symbol == "XAUUSD",
                                StrategySignal.timeframe == tf,
                                StrategySignal.time == sig_time
                            ).first()

                            if not existing:
                                new_row = StrategySignal(
                                    symbol="XAUUSD",
                                    timeframe=tf,
                                    signal=str(sig["signal"]),
                                    time=sig_time,
                                    entry_price=float(sig["entry_price"]),
                                    stop_loss=float(sig["stop_loss"]) if sig.get("stop_loss") is not None else None,
                                    take_profit=float(sig["take_profit"]) if sig.get("take_profit") is not None else None,
                                    risk_reward=float(sig.get("risk_reward") or 0.0),
                                    confluence_score=int(sig.get("confluence_score") or 0),
                                    pressure_bias=float(sig.get("pressure_bias") or 0.0),
                                    anchor=float(sig.get("anchor") or 0.0),
                                )
                                db.add(new_row)
                        db.commit()
                    except Exception as db_err:
                        db.rollback()
                        logger.warning(f"Error persisting feeder signals: {db_err}")
                    finally:
                        db.close()
        except Exception as e:
            logger.warning(f"Error in feeder cycle for XAUUSD {tf}: {e}")


async def start_market_feeder_loop():
    """Infinite loop that triggers every 60 seconds."""
    logger.info("Starting background XAUUSD market feeder loop (60s interval)...")
    while True:
        try:
            await sync_gold_market_cycle()
        except Exception as err:
            logger.error(f"Unexpected error in market feeder loop: {err}")
        await asyncio.sleep(60)

