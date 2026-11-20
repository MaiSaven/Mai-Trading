"""
data_provider.py
Fetches OHLCV bars for the strategy engine.

Priority:
  1. MetaTrader5 Python lib (requires MT5 terminal open on same machine)
  2. yfinance (free, no terminal needed — good for demo / server deployment)

Returns a pd.DataFrame with columns: open, high, low, close, volume
Index: DatetimeIndex (UTC)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

import pandas as pd

logger = logging.getLogger(__name__)

# MT5 timeframe constants (duplicated here so we don't crash if mt5 not installed)
_MT5_TF = {
    "M1": 1, "M5": 5, "M15": 15, "M30": 30,
    "H1": 16385, "H4": 16388, "D1": 16408, "W1": 32769,
}


def _yf_tf(tf: str) -> str:
    return {
        "M1": "1m", "M5": "5m", "M15": "15m", "M30": "30m",
        "H1": "1h", "H4": "4h", "D1": "1d", "W1": "1wk",
    }.get(tf, "1h")


def _yf_period(tf: str) -> str:
    return {
        "M1": "7d", "M5": "60d", "M15": "60d", "M30": "60d",
        "H1": "730d", "H4": "730d", "D1": "5y", "W1": "10y",
    }.get(tf, "60d")


def _yf_symbol(symbol: str) -> str:
    """Convert MT5-style symbols to yfinance tickers."""
    mapping = {
        "XAUUSD": "GC=F",
        "EURUSD": "EURUSD=X",
        "GBPUSD": "GBPUSD=X",
        "USDJPY": "USDJPY=X",
        "USDCHF": "USDCHF=X",
        "AUDUSD": "AUDUSD=X",
        "USDCAD": "USDCAD=X",
        "NZDUSD": "NZDUSD=X",
        "BTCUSD": "BTC-USD",
        "ETHUSD": "ETH-USD",
        "US30": "^DJI",
        "NAS100": "^NDX",
        "SPX500": "^GSPC",
    }
    return mapping.get(symbol.upper(), symbol)


def fetch_mt5(symbol: str, timeframe: str, bars: int = 500) -> pd.DataFrame | None:
    """Fetch OHLCV from MT5 terminal. Returns None if MT5 unavailable.
    Automatically handles broker symbol suffixes (e.g., XAUUSD.c, XAUUSD.m, GOLD, etc.)
    """
    try:
        import MetaTrader5 as mt5

        if not mt5.initialize():
            logger.warning("MT5 initialize() failed — terminal may not be running.")
            return None

        tf_code = _MT5_TF.get(timeframe.upper())
        if tf_code is None:
            logger.warning(f"Unknown timeframe: {timeframe}")
            mt5.shutdown()
            return None

        # Resolve broker-specific symbol name (e.g. XAUUSD vs XAUUSD.c)
        target_symbol = symbol.upper()
        available_symbols = [s.name for s in (mt5.symbols_get() or [])]

        if target_symbol not in available_symbols:
            # Look for matching symbol with broker suffix
            candidates = [
                s for s in available_symbols
                if s == target_symbol
                or s.startswith(target_symbol + ".")
                or s.startswith(target_symbol + "_")
                or (target_symbol == "XAUUSD" and "GOLD" in s.upper())
            ]
            if candidates:
                target_symbol = candidates[0]
                logger.info(f"Resolved MT5 symbol '{symbol}' -> '{target_symbol}'")
            else:
                logger.warning(f"Symbol '{symbol}' not found in MT5 symbols")
                mt5.shutdown()
                return None

        # Ensure symbol is selected in Market Watch
        mt5.symbol_select(target_symbol, True)

        rates = mt5.copy_rates_from_pos(target_symbol, tf_code, 0, bars)
        mt5.shutdown()

        if rates is None or len(rates) == 0:
            logger.warning(f"MT5 returned no data for {target_symbol} {timeframe}")
            return None

        df = pd.DataFrame(rates)
        df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
        df.set_index("time", inplace=True)
        df.rename(columns={"tick_volume": "volume"}, inplace=True)
        return df[["open", "high", "low", "close", "volume"]]

    except ImportError:
        logger.info("MetaTrader5 package not installed — falling back to yfinance.")
        return None
    except Exception as e:
        logger.error(f"MT5 fetch error: {e}")
        return None


def fetch_yfinance(symbol: str, timeframe: str) -> pd.DataFrame | None:
    """Fetch OHLCV from yfinance. Free, no terminal required."""
    try:
        import yfinance as yf

        ticker = _yf_symbol(symbol)
        period = _yf_period(timeframe)
        interval = _yf_tf(timeframe)

        data = yf.download(ticker, period=period, interval=interval,
                           auto_adjust=True, progress=False)

        if data.empty:
            return None

        df = data.rename(columns={
            "Open": "open", "High": "high", "Low": "low",
            "Close": "close", "Volume": "volume"
        })[["open", "high", "low", "close", "volume"]]

        # Flatten MultiIndex columns if present
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        df.index = pd.to_datetime(df.index, utc=True)
        return df.dropna()

    except ImportError:
        logger.warning("yfinance not installed. Install with: pip install yfinance")
        return None
    except Exception as e:
        logger.error(f"yfinance fetch error: {e}")
        return None


def load_from_db(symbol: str, timeframe: str, bars: int = 500) -> pd.DataFrame | None:
    """Load cached OHLCV candles directly from PostgreSQL trading.market_candles."""
    try:
        from database import engine
        from sqlalchemy import text
        
        query = text("""
            SELECT time, open, high, low, close, volume 
            FROM trading.market_candles
            WHERE symbol = :symbol AND timeframe = :timeframe
            ORDER BY time DESC
            LIMIT :limit
        """)
        
        with engine.connect() as conn:
            rows = conn.execute(query, {
                "symbol": symbol.upper(),
                "timeframe": timeframe.upper(),
                "limit": bars
            }).fetchall()
            
        if not rows or len(rows) < 50:
            return None
            
        df = pd.DataFrame(rows, columns=["time", "open", "high", "low", "close", "volume"])
        df["time"] = pd.to_datetime(df["time"], utc=True)
        df.set_index("time", inplace=True)
        df.sort_index(inplace=True)
        return df
    except Exception as e:
        logger.warning(f"DB load error for {symbol} {timeframe}: {e}")
        return None


def save_to_db(df: pd.DataFrame, symbol: str, timeframe: str):
    """Save/upsert OHLCV candles into PostgreSQL trading.market_candles. Strictly enforces XAUUSD only."""
    sym = symbol.upper()
    if sym != "XAUUSD":
        # Disallow any non-Gold symbol from entering the database
        return

    if df is None or len(df) == 0:
        return
    try:
        from database import engine
        from sqlalchemy import text

        # Prepare parameters as native Python types
        records = []
        for idx, row in df.iterrows():
            t_dt = idx.to_pydatetime() if hasattr(idx, 'to_pydatetime') else pd.to_datetime(idx).to_pydatetime()
            if t_dt.tzinfo is not None:
                t_dt = t_dt.replace(tzinfo=None)
                
            records.append({
                "symbol": symbol.upper(),
                "timeframe": timeframe.upper(),
                "time": t_dt,
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row.get("volume", 0.0)),
            })

        upsert_sql = text("""
            INSERT INTO trading.market_candles (symbol, timeframe, time, open, high, low, close, volume)
            VALUES (:symbol, :timeframe, :time, :open, :high, :low, :close, :volume)
            ON CONFLICT (symbol, timeframe, time) 
            DO UPDATE SET
                open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                volume = EXCLUDED.volume;
        """)

        with engine.begin() as conn:
            # Batch execute in chunks of 500
            for i in range(0, len(records), 500):
                conn.execute(upsert_sql, records[i:i+500])
                
        logger.info(f"Persisted {len(records)} candles to DB for {symbol} {timeframe}")
    except Exception as e:
        logger.warning(f"Failed to persist candles to DB: {e}")


def get_ohlcv(symbol: str, timeframe: str = "M15", bars: int = 500) -> pd.DataFrame:
    """
    Main entry point for strategy and charting.
    Priority:
      1. Pull fresh live candles from MT5 if available (so latest forming candle is always up-to-date)
      2. If MT5 unavailable, check local PostgreSQL cache
      3. Fall back to yfinance, persist to DB, then return
    """
    sym = symbol.upper()
    tf = timeframe.upper()

    # 1. First priority: live feed directly from MT5
    df_live = fetch_mt5(sym, tf, bars)
    if df_live is not None and len(df_live) >= 50:
        logger.info(f"[MT5 Live] {sym} {tf}: {len(df_live)} bars fetched")
        save_to_db(df_live, sym, tf)
        return df_live

    # 2. Next: try local private DB cache
    df_db = load_from_db(sym, tf, bars)
    if df_db is not None and len(df_db) >= bars:
        logger.info(f"[Database] Loaded {len(df_db)} candles for {sym} {tf}")
        return df_db

    # 3. Next: fallback to yfinance
    df_yf = fetch_yfinance(sym, tf)
    if df_yf is not None and len(df_yf) >= 50:
        logger.info(f"[yfinance] {sym} {tf}: {len(df_yf)} bars pulled")
        save_to_db(df_yf, sym, tf)
        return df_yf

    # 4. Fallback: If DB had at least some bars, return whatever was cached
    if df_db is not None and len(df_db) >= 50:
        return df_db

    raise RuntimeError(
        f"Could not load OHLCV data for {sym} {tf}. "
        "Ensure MT5 terminal is running or internet is connected."
    )
