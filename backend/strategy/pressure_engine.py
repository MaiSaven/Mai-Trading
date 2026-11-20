"""
pressure_engine.py
Vectorized translation of the Rolling Candle Profile pressure algorithm
(Pine Script → NumPy/pandas). Identical math as confluence-pressure-strategy.pine.
"""

import numpy as np
import pandas as pd


def calculate_pressure(df: pd.DataFrame, wick_weight: float = 0.85, span: int = 14) -> pd.Series:
    """
    Returns a Series of pressure_bias values in [-1, 1].
      +1 = max buying pressure
      -1 = max selling pressure
       0 = neutral

    df must have columns: open, high, low, close (lowercase).
    """
    r = np.maximum(df["high"] - df["low"], 1e-5)

    directional = np.clip((df["close"] - df["open"]) / r, -1.0, 1.0)
    travel = np.clip((df["close"] - df["close"].shift(1)) / r, -1.5, 1.5)
    close_loc = np.clip((2.0 * df["close"] - df["high"] - df["low"]) / r, -1.0, 1.0)

    response = np.clip(0.55 * travel + 0.25 * directional + 0.20 * close_loc, -1.5, 1.5)
    force = np.abs(response)

    low_wick = np.maximum(0.0, np.minimum(df["open"], df["close"]) - df["low"]) / r
    high_wick = np.maximum(0.0, df["high"] - np.maximum(df["open"], df["close"])) / r

    buy_part = np.maximum(response, 0.0) * (1.0 + force * 1.25) * 2.0
    sell_part = np.maximum(-response, 0.0) * (1.0 + force * 1.25) * 2.0

    total_buy = buy_part + wick_weight * low_wick
    total_sell = sell_part + wick_weight * high_wick

    roll_buy = total_buy.ewm(span=span, adjust=False).mean()
    roll_sell = total_sell.ewm(span=span, adjust=False).mean()
    roll_total = roll_buy + roll_sell

    pressure_bias = np.where(roll_total > 0, (roll_buy - roll_sell) / roll_total, 0.0)
    return pd.Series(pressure_bias, index=df.index, name="pressure_bias")
