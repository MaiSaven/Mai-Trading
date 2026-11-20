"""
combined_strategy.py
Triple-Confluence Strategy Engine combining:
1. BBMA (Bollinger Bands + Moving Averages: Mid BB, MA5/10 High/Low, EMA 50)
2. Rolling Candle Profile (Anchor EMA 21 corridor + Directional Pressure Engine)
3. CoinGlass Order Flow Delta & Footprint Confirmation (Real-Time Traded Volume)

Produces high-confidence, quality-graded BUY / SELL / WAIT signals.
Works on any OHLCV DataFrame with optional injected CoinGlass Order Flow.
"""

from __future__ import annotations

import logging
import pandas as pd
import numpy as np
from datetime import datetime, timezone
from typing import Literal, Optional

from .pressure_engine import calculate_pressure
from .confluence_engine import (
    calculate_anchor,
    detect_order_blocks,
    detect_fvg,
    confluence_score,
    Zone,
)
from .bbma_engine import calculate_bbma, evaluate_bbma_bar

logger = logging.getLogger(__name__)

SignalKind = Literal["BUY", "SELL", "WAIT"]
QualityGrade = Literal["A+ ELITE", "A HIGH", "B MODERATE", "SPECULATIVE"]


def _fib_tp(entry: float, swing_low: float, swing_high: float, is_buy: bool) -> float:
    """1.272 Fibonacci extension TP level."""
    rng = swing_high - swing_low
    if rng <= 0:
        rng = entry * 0.005
    if is_buy:
        return entry + rng * 1.272
    else:
        return entry - rng * 1.272


def _zone_sl(price: float, zones: list[Zone], is_buy: bool, atr: float) -> float:
    """SL = beyond the nearest activated zone, or 1.5 ATR fallback."""
    best = None
    for z in reversed(zones):
        if is_buy and z.is_bull and z.bot < price:
            if best is None or z.bot > best:
                best = z.bot
        if not is_buy and not z.is_bull and z.top > price:
            if best is None or z.top < best:
                best = z.top
    if best is not None:
        return (best - atr * 0.5) if is_buy else (best + atr * 0.5)
    return (price - atr * 1.5) if is_buy else (price + atr * 1.5)


def run_strategy(
    df: pd.DataFrame,
    symbol: str = "UNKNOWN",
    timeframe: str = "M15",
    min_confluence: int = 2,
    min_pressure_bias: float = 0.25,
    order_flow_candles: Optional[list[dict]] = None,
) -> list[dict]:
    """
    Run the Triple-Confluence Strategy (Rolling Candle Profile + BBMA + CoinGlass Delta).

    Parameters
    ----------
    df : pd.DataFrame
        Columns: open, high, low, close, volume (lowercase).
        Index: DatetimeIndex (UTC preferred).
    symbol : str
    timeframe : str
    min_confluence : int
        Minimum confluence score needed to trigger (default 2, recommended 3 for high confirm).
    min_pressure_bias : float
        Minimum absolute pressure_bias value (0–1).
    order_flow_candles : list[dict], optional
        List of CoinGlass order flow footprint candles.

    Returns
    -------
    list[dict] — chronological list of high-confirmation signal dicts
    """
    if len(df) < 50:
        return []

    df = df.copy()
    df.index = pd.to_datetime(df.index, utc=True)

    # ── 1. Calculate Core Indicator Suites ───────────────────────
    pressure = calculate_pressure(df)
    anchor = calculate_anchor(df)
    bbma_df = calculate_bbma(df)
    atr = (df["high"] - df["low"]).rolling(14).mean()

    ob_zones = detect_order_blocks(df)
    fvg_zones = detect_fvg(df)

    roll_high = df["high"].rolling(20).max()
    roll_low = df["low"].rolling(20).min()

    # Build CoinGlass Order Flow lookup if provided
    # Note: CoinGlass candles have UTC time. We align them with MT5 (+7200s offset)
    of_by_time: dict[int, dict] = {}
    if order_flow_candles:
        for c in order_flow_candles:
            # Map both raw UTC and broker offset (+7200s)
            of_by_time[c["time"]] = c
            of_by_time[c["time"] + 7200] = c

    signals: list[dict] = []
    last_signal_bar = -999
    min_signal_spacing = 4  # minimum bars between signals

    for i in range(50, len(df)):
        bar = df.iloc[i]
        price = float(bar["close"])
        open_ = float(bar["open"])
        high = float(bar["high"])
        low = float(bar["low"])

        anch = float(anchor.iloc[i])
        bias = float(pressure.iloc[i])
        atr_val = float(atr.iloc[i]) if not np.isnan(atr.iloc[i]) else (price * 0.002)
        swing_hi = float(roll_high.iloc[i])
        swing_lo = float(roll_low.iloc[i])
        ts = df.index[i]
        t_sec = int(ts.timestamp())

        # BBMA Evaluation
        trend, setup_buy, setup_sell, bbma_points = evaluate_bbma_bar(
            close=price,
            open_=open_,
            high=high,
            low=low,
            top_bb=float(bbma_df["top_bb"].iloc[i]),
            mid_bb=float(bbma_df["mid_bb"].iloc[i]),
            low_bb=float(bbma_df["low_bb"].iloc[i]),
            ma5_high=float(bbma_df["ma5_high"].iloc[i]),
            ma5_low=float(bbma_df["ma5_low"].iloc[i]),
            ma10_high=float(bbma_df["ma10_high"].iloc[i]),
            ma10_low=float(bbma_df["ma10_low"].iloc[i]),
            ema50=float(bbma_df["ema50"].iloc[i]),
        )

        # CoinGlass Delta Confirmation
        delta_val = 0.0
        delta_confirmed_buy = False
        delta_confirmed_sell = False
        has_coinglass_match = False

        if t_sec in of_by_time:
            of_c = of_by_time[t_sec]
            delta_val = float(of_c.get("delta", 0.0))
            delta_confirmed_buy = delta_val > 0
            delta_confirmed_sell = delta_val < 0
            has_coinglass_match = True
        else:
            # Proxy delta from price displacement if CoinGlass not covering this bar
            delta_val = float(bar["volume"]) if (price >= open_) else -float(bar["volume"])
            delta_confirmed_buy = price > open_
            delta_confirmed_sell = price < open_

        # SMC Zone Confluence
        active_obs = [z for z in ob_zones if z.time <= ts]
        active_fvgs = [z for z in fvg_zones if z.time <= ts]
        smc_score = confluence_score(price, anch, active_obs, active_fvgs)

        # ── BUY SIGNAL EVALUATION ──
        # Pillars:
        # P1: BBMA Setup (Re-entry or Extreme MHV) + Bullish Trend
        # P2: Rolling Profile (Price >= Anchor, Pressure Bias >= min_pressure_bias)
        # P3: CoinGlass Delta Confirmation (Delta > 0)
        buy_score = 0
        if setup_buy is not None:
            buy_score += bbma_points
        if price >= anch:
            buy_score += 1
        if bias >= min_pressure_bias:
            buy_score += 1
        elif bias >= 0.10:
            buy_score += 0.5
        if delta_confirmed_buy:
            buy_score += 1
        if smc_score >= 1:
            buy_score += 1

        buy_score = int(min(5, round(buy_score)))

        # ── SELL SIGNAL EVALUATION ──
        # Pillars:
        # P1: BBMA Setup (Re-entry or Extreme MHV) + Bearish Trend
        # P2: Rolling Profile (Price <= Anchor, Pressure Bias <= -min_pressure_bias)
        # P3: CoinGlass Delta Confirmation (Delta < 0)
        sell_score = 0
        if setup_sell is not None:
            sell_score += bbma_points
        if price <= anch:
            sell_score += 1
        if bias <= -min_pressure_bias:
            sell_score += 1
        elif bias <= -0.10:
            sell_score += 0.5
        if delta_confirmed_sell:
            sell_score += 1
        if smc_score >= 1:
            sell_score += 1

        sell_score = int(min(5, round(sell_score)))

        # Trigger logic
        is_buy_trigger = (
            buy_score >= min_confluence
            and (setup_buy is not None or bias >= min_pressure_bias)
            and price >= anch
            and (i - last_signal_bar >= min_signal_spacing)
        )

        is_sell_trigger = (
            sell_score >= min_confluence
            and (setup_sell is not None or bias <= -min_pressure_bias)
            and price <= anch
            and (i - last_signal_bar >= min_signal_spacing)
        )

        if is_buy_trigger:
            last_signal_bar = i
            # Intelligent SL: Below nearest BBMA Mid BB or swing low with buffer
            zone_sl = _zone_sl(price, active_obs + active_fvgs, True, atr_val)
            mid_bb_val = float(bbma_df["mid_bb"].iloc[i])
            sl = min(zone_sl, mid_bb_val - atr_val * 0.5, low - atr_val * 0.3)
            # Ensure minimum SL distance
            if (price - sl) < atr_val * 0.8:
                sl = price - atr_val * 1.5

            # Dynamic TP: Upper BB or Fib extension
            top_bb_val = float(bbma_df["top_bb"].iloc[i])
            fib_tp = _fib_tp(price, swing_lo, swing_hi, True)
            tp = max(top_bb_val, fib_tp, price + (price - sl) * 1.5)

            risk = price - sl
            reward = tp - price
            rr = round(reward / risk, 2) if risk > 0 else 0.0

            grade: QualityGrade = "A+ ELITE" if buy_score >= 5 else "A HIGH" if buy_score == 4 else "B MODERATE"

            signals.append({
                "symbol": symbol,
                "timeframe": timeframe,
                "signal": "BUY",
                "time": ts.isoformat(),
                "entry_price": round(price, 5),
                "stop_loss": round(sl, 5),
                "take_profit": round(tp, 5),
                "risk_reward": rr,
                "confluence_score": buy_score,
                "pressure_bias": round(bias, 4),
                "anchor": round(anch, 5),
                "quality_grade": grade,
                "bbma_setup": setup_buy or "TREND_FOLLOW",
                "bbma_trend": trend,
                "delta_confirmed": delta_confirmed_buy,
                "delta": round(delta_val, 2),
            })

        elif is_sell_trigger:
            last_signal_bar = i
            # Intelligent SL: Above nearest BBMA Mid BB or swing high with buffer
            zone_sl = _zone_sl(price, active_obs + active_fvgs, False, atr_val)
            mid_bb_val = float(bbma_df["mid_bb"].iloc[i])
            sl = max(zone_sl, mid_bb_val + atr_val * 0.5, high + atr_val * 0.3)
            # Ensure minimum SL distance
            if (sl - price) < atr_val * 0.8:
                sl = price + atr_val * 1.5

            # Dynamic TP: Lower BB or Fib extension
            low_bb_val = float(bbma_df["low_bb"].iloc[i])
            fib_tp = _fib_tp(price, swing_lo, swing_hi, False)
            tp = min(low_bb_val, fib_tp, price - (sl - price) * 1.5)

            risk = sl - price
            reward = price - tp
            rr = round(reward / risk, 2) if risk > 0 else 0.0

            grade: QualityGrade = "A+ ELITE" if sell_score >= 5 else "A HIGH" if sell_score == 4 else "B MODERATE"

            signals.append({
                "symbol": symbol,
                "timeframe": timeframe,
                "signal": "SELL",
                "time": ts.isoformat(),
                "entry_price": round(price, 5),
                "stop_loss": round(sl, 5),
                "take_profit": round(tp, 5),
                "risk_reward": rr,
                "confluence_score": sell_score,
                "pressure_bias": round(bias, 4),
                "anchor": round(anch, 5),
                "quality_grade": grade,
                "bbma_setup": setup_sell or "TREND_FOLLOW",
                "bbma_trend": trend,
                "delta_confirmed": delta_confirmed_sell,
                "delta": round(delta_val, 2),
            })

    return signals


def latest_signal(
    df: pd.DataFrame,
    symbol: str = "UNKNOWN",
    timeframe: str = "M15",
    min_confluence: int = 2,
    min_pressure_bias: float = 0.25,
    order_flow_candles: Optional[list[dict]] = None,
) -> dict:
    """
    Returns only the LATEST signal (last row of signals list),
    or a WAIT dict if no active signal is found.
    Also attaches current live values including BBMA setup and CoinGlass delta.
    """
    signals = run_strategy(
        df,
        symbol=symbol,
        timeframe=timeframe,
        min_confluence=min_confluence,
        min_pressure_bias=min_pressure_bias,
        order_flow_candles=order_flow_candles,
    )

    pressure = calculate_pressure(df)
    anchor = calculate_anchor(df)
    bbma_df = calculate_bbma(df)
    ob_zones = detect_order_blocks(df)
    fvg_zones = detect_fvg(df)

    df_idx = pd.to_datetime(df.index, utc=True)
    last_price = float(df["close"].iloc[-1])
    last_open = float(df["open"].iloc[-1])
    last_high = float(df["high"].iloc[-1])
    last_low = float(df["low"].iloc[-1])
    last_anchor = float(anchor.iloc[-1])
    last_bias = float(pressure.iloc[-1])
    last_time = df_idx[-1].isoformat()

    # Current BBMA state
    trend, setup_buy, setup_sell, bbma_pts = evaluate_bbma_bar(
        close=last_price,
        open_=last_open,
        high=last_high,
        low=last_low,
        top_bb=float(bbma_df["top_bb"].iloc[-1]),
        mid_bb=float(bbma_df["mid_bb"].iloc[-1]),
        low_bb=float(bbma_df["low_bb"].iloc[-1]),
        ma5_high=float(bbma_df["ma5_high"].iloc[-1]),
        ma5_low=float(bbma_df["ma5_low"].iloc[-1]),
        ma10_high=float(bbma_df["ma10_high"].iloc[-1]),
        ma10_low=float(bbma_df["ma10_low"].iloc[-1]),
        ema50=float(bbma_df["ema50"].iloc[-1]),
    )

    # Current CoinGlass delta state
    live_delta = 0.0
    if order_flow_candles and len(order_flow_candles) > 0:
        live_delta = float(order_flow_candles[-1].get("delta", 0.0))

    base = {
        "symbol": symbol,
        "timeframe": timeframe,
        "time": last_time,
        "current_price": round(last_price, 5),
        "anchor": round(last_anchor, 5),
        "pressure_bias": round(last_bias, 4),
        "bbma_trend": trend,
        "bbma_setup": setup_buy if last_bias >= 0 else setup_sell,
        "mid_bb": round(float(bbma_df["mid_bb"].iloc[-1]), 5),
        "top_bb": round(float(bbma_df["top_bb"].iloc[-1]), 5),
        "low_bb": round(float(bbma_df["low_bb"].iloc[-1]), 5),
        "ema50": round(float(bbma_df["ema50"].iloc[-1]), 5),
        "live_delta": round(live_delta, 2),
        "ob_zones": len(ob_zones),
        "fvg_zones": len(fvg_zones),
    }

    if signals:
        last_sig = signals[-1]
        base.update({
            "signal": last_sig["signal"],
            "entry_price": last_sig["entry_price"],
            "stop_loss": last_sig["stop_loss"],
            "take_profit": last_sig["take_profit"],
            "risk_reward": last_sig["risk_reward"],
            "confluence_score": last_sig["confluence_score"],
            "quality_grade": last_sig["quality_grade"],
            "bbma_setup": last_sig["bbma_setup"],
            "delta_confirmed": last_sig["delta_confirmed"],
            "signal_time": last_sig["time"],
        })
    else:
        base.update({
            "signal": "WAIT",
            "entry_price": None,
            "stop_loss": None,
            "take_profit": None,
            "risk_reward": None,
            "confluence_score": 0,
            "quality_grade": "NONE",
            "delta_confirmed": False,
            "signal_time": None,
        })

    return base
