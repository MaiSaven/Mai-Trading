"""
indicators.py
Vectorized technical indicator calculations for the strategy engine.
RSI, MACD, Bollinger Bands, ATR — all computed from raw OHLCV DataFrame.
No external TA libraries required: pure NumPy / pandas.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


# ─── RSI ────────────────────────────────────────────────────────────────────

def calculate_rsi(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Returns RSI [0, 100] series.
    Uses Wilder's smoothed average (EMA with alpha = 1/period).
    """
    delta = df["close"].diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)

    avg_gain = gain.ewm(alpha=1 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return rsi.fillna(50.0).rename("rsi")


# ─── MACD ───────────────────────────────────────────────────────────────────

def calculate_macd(
    df: pd.DataFrame,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> dict[str, pd.Series]:
    """
    Returns dict with keys: 'macd', 'signal', 'histogram'.
    All are pd.Series aligned to df.index.
    """
    ema_fast = df["close"].ewm(span=fast, adjust=False).mean()
    ema_slow = df["close"].ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line

    return {
        "macd": macd_line.rename("macd"),
        "signal": signal_line.rename("macd_signal"),
        "histogram": histogram.rename("macd_histogram"),
    }


# ─── Bollinger Bands ────────────────────────────────────────────────────────

def calculate_bollinger_bands(
    df: pd.DataFrame,
    period: int = 20,
    std_dev: float = 2.0,
) -> dict[str, pd.Series]:
    """
    Returns dict with keys: 'upper', 'middle', 'lower', 'width', 'pct_b'.
    """
    middle = df["close"].rolling(period).mean()
    std = df["close"].rolling(period).std(ddof=0)

    upper = middle + std_dev * std
    lower = middle - std_dev * std
    width = (upper - lower) / middle.replace(0, np.nan)
    pct_b = (df["close"] - lower) / (upper - lower).replace(0, np.nan)

    return {
        "upper": upper.rename("bb_upper"),
        "middle": middle.rename("bb_middle"),
        "lower": lower.rename("bb_lower"),
        "width": width.rename("bb_width"),
        "pct_b": pct_b.rename("bb_pct_b"),
    }


# ─── ATR ────────────────────────────────────────────────────────────────────

def calculate_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Average True Range using Wilder's smoothing (same as TradingView).
    """
    high = df["high"]
    low = df["low"]
    prev_close = df["close"].shift(1)

    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)

    atr = tr.ewm(alpha=1 / period, adjust=False).mean()
    return atr.rename("atr")


# ─── Combined Snapshot ───────────────────────────────────────────────────────

def compute_all_indicators(df: pd.DataFrame, slice_len: int = 300) -> dict:
    """
    Compute every indicator and return a dict ready for the API response.
    Slices to last `slice_len` bars to align with chart candle slicing.
    """
    rsi = calculate_rsi(df)
    macd_dict = calculate_macd(df)
    bb_dict = calculate_bollinger_bands(df)
    atr = calculate_atr(df)

    from strategy.bbma_engine import calculate_bbma
    bbma_df = calculate_bbma(df)

    # Slice series to match candle window
    if slice_len and len(df) > slice_len:
        rsi = rsi.tail(slice_len)
        macd = macd_dict["macd"].tail(slice_len)
        macd_signal = macd_dict["signal"].tail(slice_len)
        macd_hist = macd_dict["histogram"].tail(slice_len)
        bb_upper = bb_dict["upper"].tail(slice_len)
        bb_middle = bb_dict["middle"].tail(slice_len)
        bb_lower = bb_dict["lower"].tail(slice_len)
        atr = atr.tail(slice_len)
        bbma_sliced = bbma_df.tail(slice_len)
    else:
        macd = macd_dict["macd"]
        macd_signal = macd_dict["signal"]
        macd_hist = macd_dict["histogram"]
        bb_upper = bb_dict["upper"]
        bb_middle = bb_dict["middle"]
        bb_lower = bb_dict["lower"]
        bbma_sliced = bbma_df

    def to_list(series: pd.Series, round_dp: int = 4) -> list[dict]:
        out = []
        for idx, val in series.items():
            if pd.isna(val):
                continue
            out.append({
                "time": int(pd.Timestamp(idx).timestamp()),
                "value": round(float(val), round_dp),
            })
        return out

    # MACD histogram with colour
    macd_hist_list = []
    for idx, val in macd_hist.items():
        if pd.isna(val):
            continue
        macd_hist_list.append({
            "time": int(pd.Timestamp(idx).timestamp()),
            "value": round(float(val), 5),
            "color": "#10B981" if val >= 0 else "#EF4444",
        })

    return {
        "rsi": to_list(rsi, 2),
        "macd": to_list(macd, 5),
        "macd_signal": to_list(macd_signal, 5),
        "macd_histogram": macd_hist_list,
        "bb_upper": to_list(bb_upper, 5),
        "bb_middle": to_list(bb_middle, 5),
        "bb_lower": to_list(bb_lower, 5),
        "atr": to_list(atr, 5),
        "bbma_ma5_high": to_list(bbma_sliced["ma5_high"], 5),
        "bbma_ma5_low": to_list(bbma_sliced["ma5_low"], 5),
        "bbma_ma10_high": to_list(bbma_sliced["ma10_high"], 5),
        "bbma_ma10_low": to_list(bbma_sliced["ma10_low"], 5),
        "bbma_ema50": to_list(bbma_sliced["ema50"], 5),
    }

