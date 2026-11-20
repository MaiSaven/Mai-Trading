"""
routers/strategy.py
Confluence Pressure Strategy API — signals & scanner endpoints.
All endpoints are JWT-protected (uses existing get_current_user dependency).
"""

from __future__ import annotations

import logging
import pandas as pd
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from routers.auth import get_current_user
from models import User
from strategy.data_provider import get_ohlcv
from strategy.combined_strategy import latest_signal, run_strategy

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/strategy", tags=["strategy"])

# Default symbol strictly focused on Gold
DEFAULT_SYMBOLS = ["XAUUSD"]
DEFAULT_TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"]


@router.get("/signals")
async def get_signals(
    symbol: str = Query("XAUUSD", description="MT5 symbol, e.g. XAUUSD"),
    timeframe: str = Query("M15", description="Timeframe: M1 M5 M15 M30 H1 H4 D1"),
    limit: int = Query(20, ge=1, le=200, description="Number of recent signals to return"),
    min_confluence: int = Query(2, ge=1, le=10),
    min_pressure: float = Query(0.25, ge=0.0, le=1.0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns the last `limit` BUY/SELL signals for a given symbol & timeframe.
    Also includes current live indicator values (pressure bias, confluence score, anchor).
    """
    try:
        df = get_ohlcv(symbol.upper(), timeframe.upper())
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    from strategy.order_flow import fetch_order_flow
    of_candles = None
    try:
        of_candles = fetch_order_flow(timeframe.upper(), limit=50)
    except Exception as e:
        logger.warning(f"Order flow fetch in get_signals: {e}")

    signals = run_strategy(
        df,
        symbol=symbol.upper(),
        timeframe=timeframe.upper(),
        min_confluence=min_confluence,
        min_pressure_bias=min_pressure,
        order_flow_candles=of_candles,
    )

    # Latest live snapshot
    live = latest_signal(
        df,
        symbol=symbol.upper(),
        timeframe=timeframe.upper(),
        min_confluence=min_confluence,
        min_pressure_bias=min_pressure,
        order_flow_candles=of_candles,
    )

    # Format candles, anchor, pressure histogram, and zones for TradingView Lightweight Charts
    from strategy.confluence_engine import calculate_anchor, detect_order_blocks, detect_fvg
    from strategy.pressure_engine import calculate_pressure
    from strategy.indicators import compute_all_indicators

    anchor_series = calculate_anchor(df)
    pressure_series = calculate_pressure(df)
    ob_zones = detect_order_blocks(df, max_zones=15)
    fvg_zones = detect_fvg(df, max_zones=15)
    extra_indicators = compute_all_indicators(df, slice_len=300)

    candles = []
    anchor_data = []
    pressure_data = []

    # Take last 300 bars for fast rendering and snappy charts
    df_slice = df.tail(300)
    anchor_slice = anchor_series.tail(300)
    pressure_slice = pressure_series.tail(300)

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
            anchor_data.append({
                "time": t_sec,
                "value": round(float(val), 5)
            })
        
        p_val = pressure_slice.iloc[i]
        if not pd.isna(p_val):
            pressure_data.append({
                "time": t_sec,
                "value": round(float(p_val * 100), 2),
                "color": "#10B981" if p_val >= 0 else "#EF4444"
            })

    # Format mapped zones (OB & FVG) for visualization
    zones_data = []
    for z in ob_zones:
        zones_data.append({
            "kind": "OB",
            "is_bull": z.is_bull,
            "top": round(z.top, 5),
            "bot": round(z.bot, 5),
            "time": int(pd.to_datetime(z.time).timestamp()),
            "color": "rgba(16, 185, 129, 0.15)" if z.is_bull else "rgba(239, 68, 68, 0.15)",
            "border_color": "#10B981" if z.is_bull else "#EF4444",
        })

    for z in fvg_zones:
        zones_data.append({
            "kind": "FVG",
            "is_bull": z.is_bull,
            "top": round(z.top, 5),
            "bot": round(z.bot, 5),
            "time": int(pd.to_datetime(z.time).timestamp()),
            "color": "rgba(59, 130, 246, 0.15)" if z.is_bull else "rgba(245, 158, 11, 0.15)",
            "border_color": "#3B82F6" if z.is_bull else "#F59E0B",
        })

    # Persist newly detected signals into database (trading.strategy_signals)
    from models import StrategySignal
    for sig in signals:
        try:
            raw_t = pd.to_datetime(sig["time"])
            sig_time = raw_t.to_pydatetime()
            if sig_time.tzinfo is not None:
                sig_time = sig_time.replace(tzinfo=None)

            existing = db.query(StrategySignal).filter(
                StrategySignal.symbol == str(sig["symbol"]),
                StrategySignal.timeframe == str(sig["timeframe"]),
                StrategySignal.time == sig_time
            ).first()

            if not existing:
                new_row = StrategySignal(
                    symbol=str(sig["symbol"]),
                    timeframe=str(sig["timeframe"]),
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
        except Exception as db_err:
            logger.warning(f"Failed to persist signal row: {db_err}")
    try:
        db.commit()
    except Exception as commit_err:
        db.rollback()
        logger.warning(f"Commit error for signals: {commit_err}")

    # Read persistent audit history from DB for this user/symbol
    db_signals = db.query(StrategySignal).filter(
        StrategySignal.symbol == symbol.upper(),
        StrategySignal.timeframe == timeframe.upper()
    ).order_by(StrategySignal.time.desc()).limit(limit).all()

    formatted_signals = []
    for s in db_signals:
        score = s.confluence_score or 0
        grade = "A+ ELITE" if score >= 5 else "A HIGH" if score == 4 else "B MODERATE" if score >= 3 else "SPECULATIVE"
        formatted_signals.append({
            "id": s.id,
            "symbol": s.symbol,
            "timeframe": s.timeframe,
            "signal": s.signal,
            "time": s.time.isoformat() + "Z",
            "entry_price": s.entry_price,
            "stop_loss": s.stop_loss,
            "take_profit": s.take_profit,
            "risk_reward": s.risk_reward,
            "confluence_score": s.confluence_score,
            "quality_grade": grade,
            "pressure_bias": s.pressure_bias,
            "anchor": s.anchor,
        })

    return {
        "live": live,
        "signals": formatted_signals,
        "candles": candles,
        "anchor_data": anchor_data,
        "pressure_data": pressure_data,
        "zones": zones_data,
        "indicators": extra_indicators,
        "total": len(formatted_signals),
        "bars_analyzed": len(df),
    }


@router.get("/scan")
async def scan_all(
    timeframe: str = Query("M15", description="Timeframe for all symbols"),
    min_confluence: int = Query(2, ge=1),
    min_pressure: float = Query(0.25, ge=0.0, le=1.0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Scans DEFAULT_SYMBOLS for active setups. Returns one live snapshot per symbol.
    Useful for the multi-symbol watchlist panel in the dashboard.
    """
    results = []
    errors = []

    for symbol in DEFAULT_SYMBOLS:
        try:
            df = get_ohlcv(symbol, timeframe.upper())
            snap = latest_signal(
                df,
                symbol=symbol,
                timeframe=timeframe.upper(),
                min_confluence=min_confluence,
                min_pressure_bias=min_pressure,
            )
            results.append(snap)
        except Exception as e:
            logger.warning(f"Scan failed for {symbol}: {e}")
            errors.append({"symbol": symbol, "error": str(e)})

    # Sort: active signals first (BUY/SELL before WAIT)
    results.sort(key=lambda x: (x["signal"] == "WAIT", -abs(x["pressure_bias"])))

    return {
        "timeframe": timeframe.upper(),
        "results": results,
        "errors": errors,
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
):
    """
    Fetch real-time Order Flow / Footprint Chart data for XAUUSDT from CoinGlass.
    Returns per-candle delta (buy vol - sell vol) and imbalance zones per price level.
    Data source: Binance XAUUSDT perpetual futures (crypto-collateralized gold).
    For LOCAL TESTING only.
    """
    from strategy.order_flow import (
        fetch_order_flow,
        get_delta_series,
        get_all_imbalance_zones,
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

    delta_series = get_delta_series(candles)
    imbalance_zones = get_all_imbalance_zones(candles)
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
            "imb_count":   len(c["imbalances"]),
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
        "imbalances":           last.get("imbalances", []),
        "absorption_intensity": absorption_intensity_last,
        "high_buyer_bubbles":   high_buyer_count,
        "high_seller_bubbles":  high_seller_count,
        "absorption_nodes":     high_buyer_count + high_seller_count,
    }

    return {
        "source":              "CoinGlass (Binance XAUUSDT perp) — test only",
        "timeframe":           timeframe.upper(),
        "candles_fetched":     len(candles),
        "live":                live,
        "delta_series":        delta_series,
        "imbalance_zones":     imbalance_zones,
        "absorption_series":   absorption_series,
        "absorption_bubbles":  absorption_bubbles,
        "absorption_zones":    absorption_bubbles,
        "summary":             summary,
        "volume_profile":      volume_profile,
    }
