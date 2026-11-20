"""
confluence_engine.py
Detects Order Blocks, Fair Value Gaps, and Fibonacci swing levels from OHLCV data.
Translated from confluence-pressure-strategy.pine.
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Zone:
    top: float
    bot: float
    time: pd.Timestamp
    is_bull: bool
    kind: str  # "OB" | "FVG"
    touched: bool = False


def _pivot_high(series: pd.Series, left: int = 5, right: int = 5) -> pd.Series:
    """Returns the pivot high value at that bar, NaN otherwise."""
    result = pd.Series(np.nan, index=series.index)
    for i in range(left, len(series) - right):
        window = series.iloc[i - left: i + right + 1]
        if series.iloc[i] == window.max():
            result.iloc[i] = series.iloc[i]
    return result


def _pivot_low(series: pd.Series, left: int = 5, right: int = 5) -> pd.Series:
    result = pd.Series(np.nan, index=series.index)
    for i in range(left, len(series) - right):
        window = series.iloc[i - left: i + right + 1]
        if series.iloc[i] == window.min():
            result.iloc[i] = series.iloc[i]
    return result


def detect_order_blocks(df: pd.DataFrame, max_zones: int = 35) -> list[Zone]:
    """
    Bullish OB: last bearish candle before a bullish impulse that sweeps prior high.
    Bearish OB: last bullish candle before a bearish impulse that sweeps prior low.
    Simplified vectorized approximation suitable for dashboard display.
    """
    zones: list[Zone] = []
    highs = df["high"].values
    lows = df["low"].values
    opens = df["open"].values
    closes = df["close"].values
    times = df.index

    for i in range(2, len(df) - 1):
        # Bullish OB: bearish candle[i-1], then bullish impulse candle[i]
        if closes[i - 1] < opens[i - 1] and closes[i] > opens[i]:
            if highs[i] > highs[i - 2]:  # sweeps prior high
                zones.append(Zone(
                    top=max(opens[i - 1], closes[i - 1]),
                    bot=min(opens[i - 1], closes[i - 1]),
                    time=times[i - 1],
                    is_bull=True,
                    kind="OB",
                ))
        # Bearish OB: bullish candle[i-1], then bearish impulse candle[i]
        if closes[i - 1] > opens[i - 1] and closes[i] < opens[i]:
            if lows[i] < lows[i - 2]:  # sweeps prior low
                zones.append(Zone(
                    top=max(opens[i - 1], closes[i - 1]),
                    bot=min(opens[i - 1], closes[i - 1]),
                    time=times[i - 1],
                    is_bull=False,
                    kind="OB",
                ))

    return zones[-max_zones:]  # keep most recent


def detect_fvg(df: pd.DataFrame, max_zones: int = 35) -> list[Zone]:
    """
    Fair Value Gap: 3-candle imbalance.
    Bullish FVG: low[0] > high[2]  (gap up)
    Bearish FVG: high[0] < low[2]  (gap down)
    """
    zones: list[Zone] = []
    highs = df["high"].values
    lows = df["low"].values
    times = df.index

    for i in range(2, len(df)):
        # Bullish FVG
        if lows[i] > highs[i - 2]:
            zones.append(Zone(
                top=lows[i],
                bot=highs[i - 2],
                time=times[i - 1],
                is_bull=True,
                kind="FVG",
            ))
        # Bearish FVG
        elif highs[i] < lows[i - 2]:
            zones.append(Zone(
                top=lows[i - 2],
                bot=highs[i],
                time=times[i - 1],
                is_bull=False,
                kind="FVG",
            ))

    return zones[-max_zones:]


def calculate_anchor(df: pd.DataFrame, length: int = 21) -> pd.Series:
    """EMA-based anchor (trend direction baseline)."""
    return df["close"].ewm(span=length, adjust=False).mean()


def confluence_score(
    price: float,
    anchor: float,
    ob_zones: list[Zone],
    fvg_zones: list[Zone],
    threshold: float = 0.001,
) -> int:
    """
    Returns integer score 0–N counting how many zones price is currently inside.
    'Inside' means bot*(1-threshold) ≤ price ≤ top*(1+threshold).
    """
    score = 0
    for zone in ob_zones + fvg_zones:
        low = zone.bot * (1 - threshold)
        high = zone.top * (1 + threshold)
        if low <= price <= high:
            # Directional alignment: price approaching from correct side
            if zone.is_bull and price >= anchor:
                score += 1
            elif not zone.is_bull and price <= anchor:
                score += 1
    return score
