"""
market_feeder.py
Background daemon that automatically syncs XAUUSD market candles
every 60 seconds directly into PostgreSQL.
"""

import asyncio
import logging
from datetime import datetime

logger = logging.getLogger("market_feeder")

# Sync XAUUSD across key active trading timeframes every minute
FEEDER_TIMEFRAMES = ["M1", "M5", "M15", "H1"]


async def sync_gold_market_cycle():
    """Run one pass of fetching and DB upserting market candles for XAUUSD."""
    from strategy.data_provider import fetch_mt5, fetch_yfinance, save_to_db

    for tf in FEEDER_TIMEFRAMES:
        try:
            df = fetch_mt5("XAUUSD", tf, bars=300)
            if df is None or len(df) < 50:
                df = fetch_yfinance("XAUUSD", tf)

            if df is not None and len(df) >= 50:
                save_to_db(df, "XAUUSD", tf)
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

