"""
bbma_engine.py
Bollinger Bands + Moving Averages (BBMA) Analysis Engine.
Implements the core BBMA rules:
- Bollinger Bands (Period 20, 2.0 std dev) -> Top BB, Mid BB, Low BB
- MA 5 High & Low
- MA 10 High & Low
- EMA 50 trend baseline
- Setups: Re-Entry (RE), Extreme (EXT), and Market Hilang Volume (MHV)
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from typing import NamedTuple, Optional


class BBMARow(NamedTuple):
    top_bb: float
    mid_bb: float
    low_bb: float
    ma5_high: float
    ma5_low: float
    ma10_high: float
    ma10_low: float
    ema50: float
    trend: str            # 'BULLISH' | 'BEARISH' | 'NEUTRAL'
    setup_buy: Optional[str]   # 'RE_ENTRY' | 'EXTREME' | 'MHV' | None
    setup_sell: Optional[str]  # 'RE_ENTRY' | 'EXTREME' | 'MHV' | None


def calculate_bbma(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes all BBMA series on an OHLCV DataFrame.
    Returns DataFrame with columns:
      top_bb, mid_bb, low_bb, ma5_high, ma5_low, ma10_high, ma10_low, ema50
    """
    close = df["close"]
    high = df["high"]
    low = df["low"]

    # 1. Bollinger Bands (20, 2.0)
    mid_bb = close.rolling(20).mean()
    std = close.rolling(20).std(ddof=0)
    top_bb = mid_bb + 2.0 * std
    low_bb = mid_bb - 2.0 * std

    # 2. Moving Averages
    ma5_high = high.rolling(5).mean()
    ma5_low = low.rolling(5).mean()
    ma10_high = high.rolling(10).mean()
    ma10_low = low.rolling(10).mean()
    ema50 = close.ewm(span=50, adjust=False).mean()

    res = pd.DataFrame(index=df.index)
    res["top_bb"] = top_bb
    res["mid_bb"] = mid_bb
    res["low_bb"] = low_bb
    res["ma5_high"] = ma5_high
    res["ma5_low"] = ma5_low
    res["ma10_high"] = ma10_high
    res["ma10_low"] = ma10_low
    res["ema50"] = ema50

    return res


def evaluate_bbma_bar(
    close: float,
    open_: float,
    high: float,
    low: float,
    top_bb: float,
    mid_bb: float,
    low_bb: float,
    ma5_high: float,
    ma5_low: float,
    ma10_high: float,
    ma10_low: float,
    ema50: float,
    prev_high: Optional[float] = None,
    prev_low: Optional[float] = None,
    prev_top_bb: Optional[float] = None,
    prev_low_bb: Optional[float] = None,
) -> tuple[str, Optional[str], Optional[str], int]:
    """
    Evaluates a single bar under BBMA rules.
    Returns: (trend, setup_buy, setup_sell, bbma_points)
      bbma_points: 0 to 2 points for confluence scoring
    """
    # 1. Trend Direction (EMA 50 & Mid BB)
    is_bull = close > ema50 and mid_bb >= ema50 * 0.998
    is_bear = close < ema50 and mid_bb <= ema50 * 1.002
    trend = "BULLISH" if is_bull else "BEARISH" if is_bear else "NEUTRAL"

    setup_buy: Optional[str] = None
    setup_sell: Optional[str] = None
    points = 0

    # Tolerance helper
    tol = (top_bb - low_bb) * 0.05 if (top_bb > low_bb) else (close * 0.001)

    # ── BUY EVALUATION ──
    # Re-Entry Buy:
    # 1) In bullish structure
    # 2) Low tests or dips into MA5_Low / MA10_Low / Mid_BB corridor
    # 3) Close holds above Mid_BB and bounces
    in_buy_pocket = (low <= ma5_low + tol) or (low <= ma10_low + tol) or (low <= mid_bb + tol)
    buy_holds = close >= mid_bb - tol and close > low

    if is_bull and in_buy_pocket and buy_holds:
        setup_buy = "RE_ENTRY"
        points = 2
    # Extreme / MHV Buy (Reversal):
    # Candle dipped below Lower BB, but closes back inside with bullish wick
    elif low <= low_bb and close > low_bb and close > open_:
        setup_buy = "MHV_EXTREME"
        points = 1 if not is_bull else 2

    # ── SELL EVALUATION ──
    # Re-Entry Sell:
    # 1) In bearish structure
    # 2) High tests or pokes into MA5_High / MA10_High / Mid_BB corridor
    # 3) Close holds below Mid_BB
    in_sell_pocket = (high >= ma5_high - tol) or (high >= ma10_high - tol) or (high >= mid_bb - tol)
    sell_holds = close <= mid_bb + tol and close < high

    if is_bear and in_sell_pocket and sell_holds:
        setup_sell = "RE_ENTRY"
        points = 2
    # Extreme / MHV Sell (Reversal):
    # Candle spiked above Upper BB, but closes back inside with bearish wick
    elif high >= top_bb and close < top_bb and close < open_:
        setup_sell = "MHV_EXTREME"
        points = 1 if not is_bear else 2

    return trend, setup_buy, setup_sell, points
