"""
order_flow.py
Fetches real-time Order Flow / Footprint Chart data from CoinGlass (XAUUSDT Binance perp).
NOTE: Uses CoinGlass internal API for local testing only — do not use in production.

Each row in a candle payload:
  [price_low, price_high, buy_vol, sell_vol, buy_usdt, sell_usdt, _, _, buy_trades, sell_trades]
"""

from __future__ import annotations

import logging
import urllib.request
import json
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

COINGLASS_URL = (
    "https://capi.coinglass.com/api/orderFlow"
    "?symbol=Binance_XAUUSDT%23order_flow"
    "&interval={interval}"
    "&minLimit=false"
    "&limit={limit}"
)

INTERVAL_MAP = {
    "M1":  "m1",
    "M5":  "m5",
    "M15": "m15",
    "M30": "m30",
    "H1":  "h1",
    "H4":  "h4",
    "D1":  "d1",
}

IMBALANCE_RATIO = 3.0   # price level considered imbalanced when buy:sell >= 3x or vice versa


def fetch_order_flow(timeframe: str = "M15", limit: int = 50) -> list[dict] | None:
    """
    Fetch order-flow footprint data from CoinGlass.
    Returns a list of candle dicts, newest last:
      {
        time          : int (Unix timestamp seconds),
        buy_vol       : float,
        sell_vol      : float,
        delta         : float,          # buy_vol - sell_vol
        delta_pct     : float,          # delta / (buy_vol + sell_vol) in [-1, 1]
        total_vol     : float,
        buy_trades    : int,
        sell_trades   : int,
        price_levels  : list[dict],     # all price-level rows
        imbalances    : list[dict],     # only strongly imbalanced price levels
      }
    Returns None on error.
    """
    interval = INTERVAL_MAP.get(timeframe.upper(), "m15")
    url = COINGLASS_URL.format(interval=interval, limit=limit)

    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; MAI-Trading/1.0)",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read())

        if payload.get("code") != "0" or not payload.get("data"):
            logger.warning(f"CoinGlass order flow returned unexpected: {payload.get('msg')}")
            return None

        candles = []
        for entry in payload["data"]:
            ts: int = entry[0]
            rows: list = entry[1]

            buy_vol   = sum(r[2] for r in rows)
            sell_vol  = sum(r[3] for r in rows)
            total_vol = buy_vol + sell_vol
            delta     = buy_vol - sell_vol
            delta_pct = delta / total_vol if total_vol > 0 else 0.0
            buy_trades  = sum(int(r[8]) for r in rows)
            sell_trades = sum(int(r[9]) for r in rows)

            # Build per-price-level list (compact)
            price_levels = []
            imbalances   = []
            for r in rows:
                pl = {
                    "pl":  round(r[0], 2),   # price low
                    "ph":  round(r[1], 2),   # price high
                    "bv":  round(r[2], 4),   # buy volume
                    "sv":  round(r[3], 4),   # sell volume
                    "bt":  int(r[8]),         # buy trades
                    "st":  int(r[9]),         # sell trades
                }
                pl["d"] = round(pl["bv"] - pl["sv"], 4)   # delta
                price_levels.append(pl)

                # Flag imbalance zones (3:1 or more)
                if pl["sv"] > 0 and pl["bv"] / pl["sv"] >= IMBALANCE_RATIO:
                    imbalances.append({
                        "type": "BUY_DOM",
                        "price_low":  pl["pl"],
                        "price_high": pl["ph"],
                        "ratio":      round(pl["bv"] / pl["sv"], 2),
                        "delta":      pl["d"],
                    })
                elif pl["bv"] > 0 and pl["sv"] / pl["bv"] >= IMBALANCE_RATIO:
                    imbalances.append({
                        "type": "SELL_DOM",
                        "price_low":  pl["pl"],
                        "price_high": pl["ph"],
                        "ratio":      round(pl["sv"] / pl["bv"], 2),
                        "delta":      pl["d"],
                    })
                elif pl["bv"] == 0 and pl["sv"] > 0:
                    imbalances.append({
                        "type":       "SELL_ONLY",
                        "price_low":  pl["pl"],
                        "price_high": pl["ph"],
                        "ratio":      999.0,
                        "delta":      pl["d"],
                    })
                elif pl["sv"] == 0 and pl["bv"] > 0:
                    imbalances.append({
                        "type":       "BUY_ONLY",
                        "price_low":  pl["pl"],
                        "price_high": pl["ph"],
                        "ratio":      999.0,
                        "delta":      pl["d"],
                    })

            candles.append({
                "time":         ts,
                "buy_vol":      round(buy_vol,   2),
                "sell_vol":     round(sell_vol,  2),
                "delta":        round(delta,     2),
                "delta_pct":    round(delta_pct, 4),
                "total_vol":    round(total_vol, 2),
                "buy_trades":   buy_trades,
                "sell_trades":  sell_trades,
                "price_levels": price_levels,
                "imbalances":   imbalances,
            })

        # Sort oldest → newest
        candles.sort(key=lambda c: c["time"])
        logger.info(f"[OrderFlow] Fetched {len(candles)} candles ({timeframe}) from CoinGlass")
        return candles

    except Exception as e:
        logger.warning(f"[OrderFlow] Fetch error: {e}")
        return None


def get_delta_series(candles: list[dict], broker_offset_seconds: int = 7200) -> list[dict]:
    """
    Returns a lightweight-charts-ready histogram series:
      [{ time, value, color }]  — green if delta > 0, red if delta < 0

    broker_offset_seconds: offset to add to CoinGlass UTC timestamps so they align
    with MT5 broker-time candles. MT5 GTC Global SA uses UTC+2 (7200s ahead of UTC).
    """
    return [
        {
            "time":  c["time"] + broker_offset_seconds,
            "value": c["delta"],
            "color": "#10B981" if c["delta"] >= 0 else "#EF4444",
        }
        for c in candles
    ]


def get_absorption_series(candles: list[dict], broker_offset_seconds: int = 7200) -> list[dict]:
    """
    Absorption Bubbles series for lightweight-charts histogram sub-pane.

    Absorption measures how much of the dominant side's volume was 'fought back'
    by the other side at the same price levels — a classic reversal signal.

    For each candle:
      - contested_vol = sum of min(buy_vol, sell_vol) across all price levels
      - intensity     = contested_vol / total_vol  (0.0 → 0.5 scale, since contested ≤ 50%)
      - normalized    = intensity * 2              (0.0 → 1.0 scale)
      - type          = HIGH_BUYER | HIGH_SELLER | NEUTRAL based on delta direction vs intensity

    Color logic:
      - HIGH_BUYER   (heavy buying absorbed sellers)  → emerald green  #10B981
      - HIGH_SELLER  (heavy selling absorbed buyers)  → coral red      #EF4444
      - NEUTRAL      (balanced / weak delta)          → slate grey     #64748B

    Returns: [{ time, value, color, absorption_type }]
    """
    result = []
    for c in candles:
        total_vol = c["total_vol"]
        if total_vol <= 0:
            continue

        # Sum contested volume across price levels
        contested = sum(min(pl["bv"], pl["sv"]) for pl in c["price_levels"])
        intensity = contested / total_vol          # 0.0 → ~0.5
        normalized = round(intensity * 2, 4)       # 0.0 → 1.0

        # Classify absorption type: High Buyer vs High Seller
        delta = c["delta"]
        delta_pct = abs(c["delta_pct"])
        if delta_pct > 0.04 and delta > 0:
            abs_type = "HIGH_BUYER"
            color = "#10B981"
        elif delta_pct > 0.04 and delta < 0:
            abs_type = "HIGH_SELLER"
            color = "#EF4444"
        else:
            abs_type = "NEUTRAL"
            color = "#64748B"

        result.append({
            "time":             c["time"] + broker_offset_seconds,
            "value":            normalized,
            "color":            color,
            "absorption_type":  abs_type,
        })

    return result


# High Buyer / High Seller Absorption Bubble Thresholds
# Only significant volume nodes qualify as High Buyer / High Seller Absorption Bubbles
ABSORPTION_BUBBLE_MIN_VOL = 350.0
ABSORPTION_BUBBLE_CONTEST_RATIO = 0.40


def get_absorption_bubbles(
    candles: list[dict],
    broker_offset_seconds: int = 7200,
    min_vol: float = ABSORPTION_BUBBLE_MIN_VOL,
    contest_ratio_thresh: float = ABSORPTION_BUBBLE_CONTEST_RATIO,
    max_candles: int = 25,
) -> list[dict]:
    """
    Extract high-conviction Absorption Bubbles from CoinGlass footprint.
    Filters ONLY for HIGH BUYER or HIGH SELLER absorption nodes.
    ENFORCES: One candle can have at most ONE bubble (the peak contested volume node).

    An absorption bubble represents an institutional contested node where:
      1. Total volume at that price level is high (>= min_vol).
      2. Both sides traded actively (contest_ratio >= 0.40).
      3. Categorized strictly as HIGH_BUYER (buyers absorbed sellers) or
         HIGH_SELLER (sellers absorbed buyers).

    Returns: [{
        time: int,
        price: float,
        price_low: float,
        price_high: float,
        buy_vol: float,
        sell_vol: float,
        total_vol: float,
        delta: float,
        contest_ratio: float,
        type: 'HIGH_BUYER' | 'HIGH_SELLER',
        color: '#10B981' | '#EF4444',
        label: str,
        size_tier: 'LARGE' | 'MEDIUM' | 'NORMAL'
    }]
    """
    bubbles = []
    for c in candles[-max_candles:]:
        c_time = c["time"] + broker_offset_seconds
        best_candidate = None
        best_vol = 0.0

        for pl in c["price_levels"]:
            bv, sv = pl["bv"], pl["sv"]
            total = bv + sv
            if total < min_vol:
                continue

            mx = max(bv, sv)
            mn = min(bv, sv)
            if mx <= 0:
                continue

            ratio = mn / mx
            if ratio < contest_ratio_thresh:
                continue  # not contested enough to be an absorption bubble

            # Keep only the highest volume contested node for this candle (1 candle = 1 bubble)
            if total > best_vol:
                best_vol = total
                is_buyer = bv >= sv
                b_type = "HIGH_BUYER" if is_buyer else "HIGH_SELLER"
                color = "#10B981" if is_buyer else "#EF4444"
                mid_price = round((pl["pl"] + pl["ph"]) / 2, 2)
                delta = round(bv - sv, 1)

                size_tier = "LARGE" if total >= 800 else "MEDIUM" if total >= 500 else "NORMAL"
                label = f"🫧 {'High Buyer' if is_buyer else 'High Seller'} {round(total)}v (Δ{delta:+0.0f})"

                best_candidate = {
                    "time":          c_time,
                    "price":         mid_price,
                    "price_low":     pl["pl"],
                    "price_high":    pl["ph"],
                    "buy_vol":       round(bv, 1),
                    "sell_vol":      round(sv, 1),
                    "total_vol":     round(total, 1),
                    "delta":         delta,
                    "contest_ratio": round(ratio, 3),
                    "type":          b_type,
                    "color":         color,
                    "label":         label,
                    "size_tier":     size_tier,
                }

        if best_candidate is not None:
            bubbles.append(best_candidate)

    # Sort newest / highest volume first
    bubbles.sort(key=lambda b: (-b["time"], -b["total_vol"]))
    return bubbles


def get_absorption_zones(candles: list[dict], broker_offset_seconds: int = 7200, max_candles: int = 20) -> list[dict]:
    """
    Backward-compatible alias for absorption bubbles.
    """
    return get_absorption_bubbles(candles, broker_offset_seconds=broker_offset_seconds, max_candles=max_candles)


def get_all_imbalance_zones(candles: list[dict], broker_offset_seconds: int = 7200) -> list[dict]:
    """
    Flatten all per-candle imbalance zones into a single list,
    with their candle timestamp attached (offset to MT5 broker time).
    Only keeps the last N candles worth of zones.
    """
    zones = []
    for c in candles[-20:]:  # only recent 20 candles
        for z in c["imbalances"]:
            z["time"] = c["time"] + broker_offset_seconds  # align to MT5 broker UTC+2
            zones.append(z)
    return zones

