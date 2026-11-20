import React, { useState, useEffect, useRef } from 'react';
import TradingViewChart from './TradingViewChart';
import {
  Zap,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Target,
  ShieldAlert,
  Activity,
  Clock,
  CheckCircle2,
  SlidersHorizontal,
  Flame,
  ArrowRight
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];

export const REFRESH_INTERVALS = [
  { label: '⚡ 1s', value: 1000 },
  { label: '3s', value: 3000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '⏸ Pause', value: 0 },
];

export default function SignalDashboard({ token }) {
  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");
  const [selectedTf, setSelectedTf] = useState("M15");
  const [snapshotData, setSnapshotData] = useState(null);
  const [candles, setCandles] = useState([]);
  const [error, setError] = useState(null);
  const [orderFlow, setOrderFlow] = useState(null);

  // Track latest candle timestamps for delta/incremental polling
  const lastCandleTimeRef = useRef(null);
  const lastOrderFlowTimeRef = useRef(null);

  // Helper to merge time-series arrays in place by timestamp
  const mergeSeriesByTime = (existing = [], incoming = [], maxItems = 500) => {
    if (!incoming || incoming.length === 0) return existing;
    if (!existing || existing.length === 0) return incoming;
    const map = new Map();
    existing.forEach(item => map.set(item.time, item));
    incoming.forEach(item => map.set(item.time, item));
    return Array.from(map.values())
      .sort((a, b) => a.time - b.time)
      .slice(-maxItems);
  };

  // Helper to merge indicator series dictionary preserving full historical series
  const mergeIndicators = (existing = {}, incoming = {}, maxItems = 300) => {
    if (!incoming || Object.keys(incoming).length === 0) return existing;
    if (!existing || Object.keys(existing).length === 0) return incoming;
    const merged = { ...existing };
    for (const [key, val] of Object.entries(incoming)) {
      if (Array.isArray(val)) {
        merged[key] = mergeSeriesByTime(existing[key] || [], val, maxItems);
      } else {
        merged[key] = val;
      }
    }
    return merged;
  };

  // Configurable live chart refresh interval (persisted in localStorage, default 1s)
  const [refreshInterval, setRefreshInterval] = useState(() => {
    try {
      const saved = localStorage.getItem('mai_chart_refresh_interval');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed)) return parsed;
      }
    } catch (_) {}
    return 1000;
  });

  const handleRefreshIntervalChange = (val) => {
    setRefreshInterval(val);
    try {
      localStorage.setItem('mai_chart_refresh_interval', val.toString());
    } catch (_) {}
  };

  // Configurable order flow candle limit (default 50, flexible over 50: 50, 100, 150, 200)
  const [orderFlowLimit, setOrderFlowLimit] = useState(() => {
    try {
      const saved = localStorage.getItem('mai_orderflow_limit');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 10) return parsed;
      }
    } catch (_) {}
    return 50;
  });

  const handleOrderFlowLimitChange = (val) => {
    setOrderFlowLimit(val);
    try {
      localStorage.setItem('mai_orderflow_limit', val.toString());
    } catch (_) {}
    lastOrderFlowTimeRef.current = null;
    fetchOrderFlow(selectedTf, val, false);
  };

  // In-flight request guards to avoid network contention on 1s intervals
  const isFetchingCandlesRef = useRef(false);
  const isFetchingOrderFlowRef = useRef(false);
  const isFetchingSnapshotRef = useRef(false);

  // Fetch base OHLCV candles (fast, lightweight, public)
  const fetchCandles = async (symbol = selectedSymbol, tf = selectedTf, isPoll = false) => {
    if (isFetchingCandlesRef.current) return;
    isFetchingCandlesRef.current = true;
    try {
      const sinceParam = isPoll && lastCandleTimeRef.current ? `&since=${lastCandleTimeRef.current}` : '&full=true';
      const res = await fetch(`${API_BASE}/strategy/candles?symbol=${symbol}&timeframe=${tf}&limit=200${sinceParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data.candles && data.candles.length > 0) {
          setCandles(prev => (isPoll && prev.length > 0) ? mergeSeriesByTime(prev, data.candles, 300) : data.candles);
          lastCandleTimeRef.current = data.latest_candle_time || data.candles[data.candles.length - 1].time;
        }
      }
    } catch (err) {
      console.warn('[Candles] fetch error:', err);
    } finally {
      isFetchingCandlesRef.current = false;
    }
  };

  // Fetch CoinGlass order flow footprint data (supports incremental 1-candle polling)
  const fetchOrderFlow = async (tf = selectedTf, limit = orderFlowLimit, isPoll = false) => {
    if (isFetchingOrderFlowRef.current) return;
    isFetchingOrderFlowRef.current = true;
    try {
      const sinceParam = isPoll && lastOrderFlowTimeRef.current ? `&since=${lastOrderFlowTimeRef.current}` : '&full=true';
      const res = await fetch(`${API_BASE}/strategy/orderflow?timeframe=${tf}&limit=${limit}${sinceParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data.incremental) {
          setOrderFlow(prev => {
            if (!prev) return data;
            return {
              ...prev,
              live: data.live || prev.live,
              latest_candle_time: data.latest_candle_time || prev.latest_candle_time,
              delta_series: mergeSeriesByTime(prev.delta_series, data.delta_series, limit),
              summary: mergeSeriesByTime(prev.summary, data.summary, limit),
              absorption_series: mergeSeriesByTime(prev.absorption_series, data.absorption_series, limit),
              absorption_bubbles: (data.absorption_bubbles && data.absorption_bubbles.length > 0)
                ? data.absorption_bubbles
                : prev.absorption_bubbles,
              volume_profile: data.volume_profile || prev.volume_profile,
            };
          });
        } else {
          setOrderFlow(data);
        }
        if (data.latest_candle_time) {
          lastOrderFlowTimeRef.current = data.latest_candle_time;
        }
      }
    } catch (err) {
      console.warn('[OrderFlow] fetch error:', err);
    } finally {
      isFetchingOrderFlowRef.current = false;
    }
  };

  // Fetch Live Snapshot (anchor, pressure, bbma, confluence) for the Live Snapshot card
  const fetchSnapshot = async (symbol = selectedSymbol, tf = selectedTf, isPoll = false) => {
    if (isFetchingSnapshotRef.current) return;
    isFetchingSnapshotRef.current = true;
    try {
      const sinceParam = isPoll && lastCandleTimeRef.current ? `&since=${lastCandleTimeRef.current}` : '&full=true';
      const res = await fetch(`${API_BASE}/strategy/snapshot?symbol=${symbol}&timeframe=${tf}${sinceParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data.incremental) {
          setSnapshotData(prev => {
            if (!prev) return data;
            return {
              ...prev,
              live: data.live || prev.live,
              candles: mergeSeriesByTime(prev.candles, data.candles, 300),
              anchor_data: mergeSeriesByTime(prev.anchor_data, data.anchor_data, 300),
              pressure_data: mergeSeriesByTime(prev.pressure_data, data.pressure_data, 300),
              indicators: mergeIndicators(prev.indicators, data.indicators, 300),
            };
          });
        } else {
          setSnapshotData(data);
        }
      }
    } catch (err) {
      console.warn('[Snapshot] fetch error:', err);
    } finally {
      isFetchingSnapshotRef.current = false;
    }
  };

  useEffect(() => {
    lastCandleTimeRef.current = null;
    lastOrderFlowTimeRef.current = null;

    // Fetch base chart candles, order flow, and live snapshot
    fetchCandles(selectedSymbol, selectedTf, false);
    fetchOrderFlow(selectedTf, orderFlowLimit, false);
    fetchSnapshot(selectedSymbol, selectedTf, false);

    // If paused (0), don't start the auto-refresh interval
    if (refreshInterval <= 0) return;

    // Configurable auto-refresh chart & snapshot from backend
    const timer = setInterval(() => {
      fetchCandles(selectedSymbol, selectedTf, true);
      fetchOrderFlow(selectedTf, orderFlowLimit, true);
      fetchSnapshot(selectedSymbol, selectedTf, true);
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [selectedSymbol, selectedTf, refreshInterval, orderFlowLimit]);

  const live = snapshotData?.live;
  const signals = [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }} className="animate-fade-in">

      {/* Top Banner & Control Bar */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '20px 24px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div style={{
              background: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',
              padding: '6px',
              borderRadius: '8px',
              color: '#FFFFFF'
            }}>
              <Zap size={18} />
            </div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF' }}>
              Confluence Pressure Scanner
            </h2>
            <span style={{
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#FBBF24',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 700
            }}>
              PYTHON 0.0s LATENCY
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Vectorized Smart Money Concepts (Order Blocks + FVGs) & Rolling Directional Momentum
          </p>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Active Asset Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '8px',
            padding: '6px 14px',
            color: '#FBBF24',
            fontWeight: 800,
            fontSize: '0.85rem'
          }}>
            <span>● XAUUSD (Gold)</span>
          </div>

          {/* Timeframe Select */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '3px' }}>
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => setSelectedTf(tf)}
                style={{
                  background: selectedTf === tf ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                  color: selectedTf === tf ? '#A5B4FC' : 'var(--text-muted)',
                  border: selectedTf === tf ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid transparent',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Configurable Auto-Refresh Interval Selector */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
            {REFRESH_INTERVALS.map((intv) => (
              <button
                key={intv.value}
                onClick={() => handleRefreshIntervalChange(intv.value)}
                title={intv.value === 0 ? "Pause auto-refresh" : `Auto-refresh chart every ${intv.label}`}
                style={{
                  background: refreshInterval === intv.value ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
                  color: refreshInterval === intv.value ? '#34D399' : 'var(--text-dim)',
                  border: refreshInterval === intv.value ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid transparent',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {intv.label}
              </button>
            ))}
          </div>

          {/* Configurable Order Flow Lookback Limit Selector */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', padding: '0 4px', fontWeight: 600 }}>OF:</span>
            {[50, 100, 150, 200].map((cnt) => (
              <button
                key={cnt}
                onClick={() => handleOrderFlowLimitChange(cnt)}
                title={`Fetch last ${cnt} order flow candles from CoinGlass`}
                style={{
                  background: orderFlowLimit === cnt ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                  color: orderFlowLimit === cnt ? '#38BDF8' : 'var(--text-dim)',
                  border: orderFlowLimit === cnt ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid transparent',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {cnt}
              </button>
            ))}
          </div>

          {/* Refresh Action */}
          <button
            onClick={() => { fetchCandles(selectedSymbol, selectedTf, false); fetchSnapshot(selectedSymbol, selectedTf, false); fetchOrderFlow(selectedTf, orderFlowLimit, false); }}
            className="btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              fontSize: '0.78rem'
            }}
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#FCA5A5',
          padding: '12px 16px',
          borderRadius: '10px',
          fontSize: '0.85rem'
        }}>
          {error}
        </div>
      )}

      {/* Main Container: Focused Single-Asset Dashboard (XAUUSD Gold) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Live Diagnostic + Active Signal Setup */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Live Indicator Gauge Card */}
          {live && (
            <div style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Live Snapshot ({live.symbol} · {live.timeframe})
                  </span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                    ${live.current_price?.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Confluence Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>

                {/* Metric 1: Confluence Score */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '10px',
                  padding: '12px'
                }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Confluence Score</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: live.confluence_score >= 3 ? '#F59E0B' : '#FFFFFF' }}>
                    {live.confluence_score} / 5 {live.confluence_score >= 4 ? '✦✦' : ''}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: live.confluence_score >= 3 ? '#FBBF24' : 'var(--text-dim)' }}>
                    {live.confluence_score >= 4 ? 'High Quality (≥4)' : live.confluence_score >= 3 ? 'Moderate (3)' : 'Weak (<3)'}
                  </div>
                </div>

                {/* Metric 2: BBMA Setup */}
                <div style={{
                  background: 'rgba(236, 72, 153, 0.03)',
                  border: '1px solid rgba(236, 72, 153, 0.2)',
                  borderRadius: '10px',
                  padding: '12px'
                }}>
                  <div style={{ fontSize: '0.72rem', color: '#F472B6', marginBottom: '4px' }}>BBMA Confluence</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF' }}>
                    {live.bbma_setup || 'MONITORING'}
                  </div>
                  <div style={{
                    fontSize: '0.68rem',
                    color: live.bbma_trend === 'BULLISH' ? '#34D399' : live.bbma_trend === 'BEARISH' ? '#F87171' : 'var(--text-dim)',
                    fontWeight: 600
                  }}>
                    Trend: {live.bbma_trend || 'NEUTRAL'}
                  </div>
                </div>

                {/* Metric 2: Pressure Bias */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '10px',
                  padding: '12px'
                }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Pressure Bias</div>
                  <div style={{
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    color: live.pressure_bias >= 0.25 ? '#34D399' : live.pressure_bias <= -0.25 ? '#F87171' : 'var(--text-muted)'
                  }}>
                    {(live.pressure_bias * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                    {live.pressure_bias >= 0.25 ? 'Bullish pressure' : live.pressure_bias <= -0.25 ? 'Bearish pressure' : 'Neutral range'}
                  </div>
                </div>

                {/* Metric 3: Anchor Trend */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '10px',
                  padding: '12px'
                }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Anchor (EMA 21)</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FFFFFF' }}>
                    ${live.anchor?.toLocaleString()}
                  </div>
                  <div style={{
                    fontSize: '0.68rem',
                    color: live.current_price >= live.anchor ? '#34D399' : '#F87171',
                    fontWeight: 600
                  }}>
                    {live.current_price >= live.anchor ? 'Price Above (Bull)' : 'Price Below (Bear)'}
                  </div>
                </div>

                {/* Metric 5: CoinGlass Real Order Flow (Test) */}
                {orderFlow?.live && (
                  <div style={{
                    background: 'rgba(249, 115, 22, 0.05)',
                    border: '1px solid rgba(249, 115, 22, 0.2)',
                    borderRadius: '10px',
                    padding: '12px',
                    gridColumn: 'span 4'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#FB923C', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        ⚡ Real Order Flow (CoinGlass Binance XAUUSDT · Local Test)
                      </span>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: orderFlow.live.delta >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: orderFlow.live.delta >= 0 ? '#34D399' : '#F87171'
                      }}>
                        Net Delta: {orderFlow.live.delta >= 0 ? '+' : ''}{orderFlow.live.delta} ({(orderFlow.live.delta_pct * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '20px', marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <div>Buy Vol: <strong style={{ color: '#34D399' }}>{orderFlow.live.buy_vol}</strong> ({orderFlow.live.buy_trades} trades)</div>
                      <div>Sell Vol: <strong style={{ color: '#F87171' }}>{orderFlow.live.sell_vol}</strong> ({orderFlow.live.sell_trades} trades)</div>
                      <div>Total: <strong style={{ color: '#FFFFFF' }}>{orderFlow.live.total_vol}</strong></div>
                    </div>
                    {orderFlow?.live?.absorption_intensity !== undefined && (
                      <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                        <div>Abs Bubbles: <strong style={{ color: '#10B981' }}>
                          {(orderFlow.live.absorption_intensity * 100).toFixed(1)}%
                        </strong></div>
                        <div>High Buyers: <strong style={{ color: '#10B981' }}>
                          {orderFlow.live.high_buyer_bubbles ?? 0}
                        </strong></div>
                        <div>High Sellers: <strong style={{ color: '#EF4444' }}>
                          {orderFlow.live.high_seller_bubbles ?? 0}
                        </strong></div>
                        <div>Bubble Nodes: <strong style={{ color: '#A78BFA' }}>
                          {orderFlow.live.absorption_nodes || 0}
                        </strong></div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}

          {/* Interactive TradingView Lightweight Chart */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={15} color="#10B981" />
                Live Self-Hosted Candlestick Chart
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {(snapshotData?.candles?.length || candles.length)} bars · Scroll to zoom · Drag to pan
              </span>
            </div>

            <TradingViewChart
              candles={snapshotData?.candles?.length ? snapshotData.candles : candles}
              anchorData={snapshotData?.anchor_data || []}
              pressureData={snapshotData?.pressure_data || []}
              indicators={snapshotData?.indicators || {}}
              orderFlow={orderFlow}
              symbol={selectedSymbol}
              timeframe={selectedTf}
              height={520}
              refreshInterval={refreshInterval}
              onRefreshIntervalChange={handleRefreshIntervalChange}
              orderFlowLimit={orderFlowLimit}
              onOrderFlowLimitChange={handleOrderFlowLimitChange}
            />
          </div>

        </div>

      </div>

    </div>
  );
}

