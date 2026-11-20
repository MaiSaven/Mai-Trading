"""
routers/strategy.py
Confluence Pressure Strategy API — signals & scanner endpoints.
All endpoints are JWT-protected (uses existing get_current_user dependency).
"""

from __future__ import annotations

import logging
import time
import pandas as pd
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from strategy.data_provider import get_ohlcv

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/strategy", tags=["strategy"])

# In-memory access tracker to automatically return 1 candle (incremental) on repeated polls
_SNAPSHOT_ACCESSED: dict[str, float] = {}
_ORDER_FLOW_ACCESSED: dict[str, float] = {}

# Default symbol strictly focused on Gold
DEFAULT_SYMBOLS = ["XAUUSD"]
DEFAULT_TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"]


@router.get("/candles")
async def get_candles(
    symbol: str = Query("XAUUSD", description="Symbol name"),
    timeframe: str = Query("M15", description="Timeframe: M1 M5 M15 M30 H1 H4 D1"),
    limit: int = Query(200, ge=1, le=1000, description="Number of candles"),
    since: int | None = Query(None, ge=0, description="Return only candles with time >= since"),
    full: bool = Query(False, description="Force full historical response"),
):
    """
    Lightweight public candle endpoint.
    Used by the chart when strategy signals are disabled, avoiding heavy calculations.
    Returns standard OHLCV candles, supporting incremental polling via `since`.
    """
    df = get_ohlcv(symbol.upper(), timeframe.upper())
    if df is None or len(df) == 0:
        raise HTTPException(status_code=503, detail="Could not fetch candle data")

    df_slice = df.tail(limit)
    candles = []
    for i in range(len(df_slice)):
        t_sec = int(df_slice.index[i].timestamp())
        candles.append({
            "time": t_sec,
            "open": round(float(df_slice["open"].iloc[i]), 5),
            "high": round(float(df_slice["high"].iloc[i]), 5),
            "low": round(float(df_slice["low"].iloc[i]), 5),
            "close": round(float(df_slice["close"].iloc[i]), 5),
            "volume": round(float(df_slice["volume"].iloc[i]), 2) if "volume" in df_slice.columns else 1.0,
        })

    latest_time = candles[-1]["time"] if candles else None

    # Incremental mode if since is passed
    if since and since > 0 and candles and not full:
        inc_candles = [c for c in candles if c["time"] >= since]
        if not inc_candles:
            inc_candles = candles[-1:]
        return {
            "symbol": symbol.upper(),
            "timeframe": timeframe.upper(),
            "incremental": True,
            "latest_candle_time": latest_time,
            "candles": inc_candles,
            "count": len(inc_candles),
        }

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe.upper(),
        "incremental": False,
        "latest_candle_time": latest_time,
        "candles": candles,
        "count": len(candles),
    }


@router.get("/snapshot")
@router.get("/signals")
async def get_live_snapshot(
    symbol: str = Query("XAUUSD", description="MT5 symbol, e.g. XAUUSD"),
    timeframe: str = Query("M15", description="Timeframe: M1 M5 M15 M30 H1 H4 D1"),
    since: int | None = Query(None, ge=0, description="Return only candles/indicators with time >= since (incremental update)"),
    full: bool = Query(False, description="Force full historical response even if previously requested"),
):
    """
    Returns Live Snapshot (current price, anchor trend, pressure bias, confluence gauge)
    and indicator series for the chart.
    Does NOT compute or persist BUY/SELL signals, SMC zones, or SL/TP targets.
    """
    try:
        df = get_ohlcv(symbol.upper(), timeframe.upper())
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    from strategy.confluence_engine import calculate_anchor
    from strategy.pressure_engine import calculate_pressure
    from strategy.indicators import compute_all_indicators
    from strategy.bbma_engine import calculate_bbma, evaluate_bbma_bar

    anchor_series = calculate_anchor(df)
    pressure_series = calculate_pressure(df)
    bbma_df = calculate_bbma(df)
    extra_indicators = compute_all_indicators(df, slice_len=300)

    # Build live snapshot
    df_idx = pd.to_datetime(df.index, utc=True)
    last_price = float(df["close"].iloc[-1])
    last_open = float(df["open"].iloc[-1])
    last_high = float(df["high"].iloc[-1])
    last_low = float(df["low"].iloc[-1])
    last_anchor = float(anchor_series.iloc[-1])
    last_bias = float(pressure_series.iloc[-1])
    last_time = df_idx[-1].isoformat()

    trend, setup_buy, setup_sell, _ = evaluate_bbma_bar(
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

    # Confluence Score (0 to 5)
    score = 0
    if abs(last_bias) >= 0.25:
        score += 2
    elif abs(last_bias) >= 0.10:
        score += 1
    if (last_bias >= 0 and last_price >= last_anchor) or (last_bias < 0 and last_price < last_anchor):
        score += 1
    if trend in ("BULLISH", "BEARISH"):
        score += 1
    if (last_bias >= 0 and setup_buy) or (last_bias < 0 and setup_sell):
        score += 1

    bias_label = "BULLISH" if last_bias >= 0.15 else "BEARISH" if last_bias <= -0.15 else "NEUTRAL"

    live = {
        "symbol": symbol.upper(),
        "timeframe": timeframe.upper(),
        "time": last_time,
        "current_price": round(last_price, 5),
        "anchor": round(last_anchor, 5),
        "pressure_bias": round(last_bias, 4),
        "bias": bias_label,
        "confluence_score": score,
        "bbma_trend": trend,
        "bbma_setup": setup_buy if last_bias >= 0 else setup_sell,
        "mid_bb": round(float(bbma_df["mid_bb"].iloc[-1]), 5),
        "top_bb": round(float(bbma_df["top_bb"].iloc[-1]), 5),
        "low_bb": round(float(bbma_df["low_bb"].iloc[-1]), 5),
        "ema50": round(float(bbma_df["ema50"].iloc[-1]), 5),
    }

    # Format 300 bars for charts
    df_slice = df.tail(300)
    anchor_slice = anchor_series.tail(300)
    pressure_slice = pressure_series.tail(300)

    candles = []
    anchor_data = []
    pressure_data = []

    for i in range(len(df_slice)):
        t_sec = int(df_slice.index[i].timestamp())
        candles.append({
            "time": t_sec,
            "open": round(float(df_slice["open"].iloc[i]), 5),
            "high": round(float(df_slice["high"].iloc[i]), 5),
            "low": round(float(df_slice["low"].iloc[i]), 5),
            "close": round(float(df_slice["close"].iloc[i]), 5),
            "volume": round(float(df_slice["volume"].iloc[i]), 2) if "volume" in df_slice.columns else 1.0,
        })
        val = anchor_slice.iloc[i]
        if not pd.isna(val):
            anchor_data.append({"time": t_sec, "value": round(float(val), 5)})
        p_val = pressure_slice.iloc[i]
        if not pd.isna(p_val):
            pressure_data.append({
                "time": t_sec,
                "value": round(float(p_val * 100), 2),
                "color": "#10B981" if p_val >= 0 else "#EF4444"
            })

    latest_candle_time = candles[-1]["time"] if candles else None

    # Incremental mode only when since parameter is explicitly provided and full is False
    is_incremental_mode = (since is not None and since > 0) and not full

    if is_incremental_mode and candles:
        if since and since > 0:
            inc_candles = [c for c in candles if c["time"] >= since] or candles[-1:]
            inc_anchor = [a for a in anchor_data if a["time"] >= since] or (anchor_data[-1:] if anchor_data else [])
            inc_pressure = [p for p in pressure_data if p["time"] >= since] or (pressure_data[-1:] if pressure_data else [])
            inc_indicators = {}
            for k, v in extra_indicators.items():
                if isinstance(v, list):
                    f = [item for item in v if isinstance(item, dict) and item.get("time", 0) >= since]
                    inc_indicators[k] = f if f else (v[-1:] if v else [])
                else:
                    inc_indicators[k] = v
        else:
            inc_candles = candles[-1:]
            inc_anchor = anchor_data[-1:] if anchor_data else []
            inc_pressure = pressure_data[-1:] if pressure_data else []
            inc_indicators = {k: (v[-1:] if isinstance(v, list) else v) for k, v in extra_indicators.items()}

        return {
            "incremental":         True,
            "since":               since,
            "latest_candle_time":  latest_candle_time,
            "live":                live,
            "candles":             inc_candles,
            "anchor_data":         inc_anchor,
            "pressure_data":       inc_pressure,
            "indicators":          inc_indicators,
            "bars_analyzed":       len(df),
        }

    return {
        "incremental":         False,
        "latest_candle_time":  latest_candle_time,
        "live":                live,
        "candles":             candles,
        "anchor_data":         anchor_data,
        "pressure_data":       pressure_data,
        "indicators":          extra_indicators,
        "bars_analyzed":       len(df),
    }


@router.get("/health")
async def strategy_health():
    """Public health check — no auth required. Used by frontend to detect availability."""
    deps = {}
    try:
        import MetaTrader5  # noqa
        deps["MetaTrader5"] = "installed"
    except ImportError:
        deps["MetaTrader5"] = "not installed (will use yfinance)"

    try:
        import yfinance  # noqa
        deps["yfinance"] = "installed"
    except ImportError:
        deps["yfinance"] = "not installed"

    try:
        import numpy  # noqa
        import pandas  # noqa
        deps["numpy_pandas"] = "ok"
    except ImportError:
        deps["numpy_pandas"] = "missing"

    return {"status": "ok", "dependencies": deps}


@router.get("/orderflow")
async def get_order_flow(
    timeframe: str = Query("M15", description="Timeframe: M1 M5 M15 M30 H1 H4 D1"),
    limit: int = Query(50, ge=1, le=1000, description="Number of candles to return"),
    vp_candles: int | None = Query(None, ge=1, le=1000, description="Number of recent candles for Volume Profile. Default 32 for session, or matches limit"),
    since: int | None = Query(None, ge=0, description="Return only candles with time >= since (incremental update)"),
    full: bool = Query(False, description="Force full historical response even if previously requested"),
):
    """
    Fetch real-time Order Flow / Footprint Chart data for XAUUSDT from CoinGlass.
    Returns per-candle delta (buy vol - sell vol), absorption bubbles, and volume profile.
    Supports `since` or automatic incremental updates: if previously requested, returns only latest candle.
    """
    tf_key = timeframe.upper()
    now = time.time()
    already_requested = (tf_key in _ORDER_FLOW_ACCESSED) and (now - _ORDER_FLOW_ACCESSED[tf_key] < 120.0)
    _ORDER_FLOW_ACCESSED[tf_key] = now
    is_incremental_mode = (since is not None and since > 0) or (already_requested and not full)

    from strategy.order_flow import (
        fetch_order_flow,
        get_delta_series,
        get_absorption_series,
        get_absorption_zones,
        get_absorption_bubbles,
        get_volume_profile,
    )

    candles = fetch_order_flow(timeframe.upper(), limit)
    if candles is None:
        raise HTTPException(
            status_code=503,
            detail="Could not fetch order flow from data feed. Check network or try again."
        )

    latest_time = (candles[-1]["time"] + 7200) if candles else None
    delta_series = get_delta_series(candles)
    absorption_series = get_absorption_series(candles)
    absorption_bubbles = get_absorption_bubbles(candles)
    absorption_zones = absorption_bubbles  # backward-compatible alias

    # Volume Profile: session (32) by default, or customized via vp_candles
    vp_lookback = vp_candles if vp_candles is not None else min(32, len(candles))
    volume_profile = get_volume_profile(candles[-vp_lookback:] if vp_lookback > 0 else candles, num_bins=35)

    # Lightweight summary per candle (align time to broker offset +7200)
    summary = [
        {
            "time":        c["time"] + 7200,
            "buy_vol":     c["buy_vol"],
            "sell_vol":    c["sell_vol"],
            "delta":       c["delta"],
            "delta_pct":   c["delta_pct"],
            "total_vol":   c["total_vol"],
            "buy_trades":  c["buy_trades"],
            "sell_trades": c["sell_trades"],
        }
        for c in candles
    ]

    # Last candle live snapshot
    last = candles[-1] if candles else {}
    # Compute absorption for last candle
    total_last = last.get("total_vol", 0)
    if total_last > 0 and last.get("price_levels"):
        contested_last = sum(min(pl["bv"], pl["sv"]) for pl in last["price_levels"])
        absorption_intensity_last = round((contested_last / total_last) * 2, 3)
        high_buyer_count = sum(
            1 for pl in last["price_levels"]
            if (pl["bv"] + pl["sv"]) >= 350
            and max(pl["bv"], pl["sv"]) > 0
            and min(pl["bv"], pl["sv"]) / max(pl["bv"], pl["sv"]) >= 0.40
            and pl["bv"] >= pl["sv"]
        )
        high_seller_count = sum(
            1 for pl in last["price_levels"]
            if (pl["bv"] + pl["sv"]) >= 350
            and max(pl["bv"], pl["sv"]) > 0
            and min(pl["bv"], pl["sv"]) / max(pl["bv"], pl["sv"]) >= 0.40
            and pl["sv"] > pl["bv"]
        )
    else:
        absorption_intensity_last = 0.0
        high_buyer_count = 0
        high_seller_count = 0

    live = {
        "time":                 last.get("time"),
        "delta":                last.get("delta"),
        "delta_pct":            last.get("delta_pct"),
        "buy_vol":              last.get("buy_vol"),
        "sell_vol":             last.get("sell_vol"),
        "total_vol":            last.get("total_vol"),
        "buy_trades":           last.get("buy_trades"),
        "sell_trades":          last.get("sell_trades"),
        "bias":                 "BUYING" if (last.get("delta", 0) or 0) > 0 else "SELLING",
        "absorption_intensity": absorption_intensity_last,
        "high_buyer_bubbles":   high_buyer_count,
        "high_seller_bubbles":  high_seller_count,
        "absorption_nodes":     high_buyer_count + high_seller_count,
    }

    # Incremental update support: if client specifies `since` OR data already exists from recent request, return only the last candle(s)
    if is_incremental_mode and candles:
        if since and since > 0:
            since_broker = since if (summary and since >= summary[0]["time"]) else (since + 7200)

            delta_inc = [d for d in delta_series if d["time"] >= since_broker]
            if not delta_inc and delta_series:
                delta_inc = delta_series[-1:]

            summary_inc = [s for s in summary if s["time"] >= since_broker]
            if not summary_inc and summary:
                summary_inc = summary[-1:]

            abs_inc = [a for a in absorption_series if a["time"] >= since_broker]
            if not abs_inc and absorption_series:
                abs_inc = absorption_series[-1:]

            bubbles_inc = [b for b in absorption_bubbles if b["time"] >= since_broker]
        else:
            # Automatic last candle: client already received historical data previously
            delta_inc = delta_series[-1:]
            summary_inc = summary[-1:]
            abs_inc = absorption_series[-1:]
            bubbles_inc = absorption_bubbles[:3]

        return {
            "source":              "CoinGlass (Binance XAUUSDT perp) — test only",
            "timeframe":           timeframe.upper(),
            "incremental":         True,
            "since":               since,
            "latest_candle_time":  latest_time,
            "candles_fetched":     len(summary_inc),
            "live":                live,
            "delta_series":        delta_inc,
            "absorption_series":   abs_inc,
            "absorption_bubbles":  bubbles_inc if bubbles_inc else absorption_bubbles[:5],
            "absorption_zones":    bubbles_inc if bubbles_inc else absorption_bubbles[:5],
            "summary":             summary_inc,
            "volume_profile":      volume_profile,
        }

    return {
        "source":              "CoinGlass (Binance XAUUSDT perp) — test only",
        "timeframe":           timeframe.upper(),
        "incremental":         False,
        "latest_candle_time":  latest_time,
        "candles_fetched":     len(candles),
        "live":                live,
        "delta_series":        delta_series,
        "absorption_series":   absorption_series,
        "absorption_bubbles":  absorption_bubbles,
        "absorption_zones":    absorption_bubbles,
        "summary":             summary,
        "volume_profile":      volume_profile,
    }
