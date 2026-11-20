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
  const [loading, setLoading] = useState(false);
  const [signalsData, setSignalsData] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [orderFlow, setOrderFlow] = useState(null);

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
    fetchOrderFlow(selectedTf, val);
  };

  // In-flight request guards to avoid network contention on 1s intervals
  const isFetchingSignalsRef = useRef(false);
  const isFetchingOrderFlowRef = useRef(false);

  const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

  // Fetch CoinGlass order flow footprint data (for local testing)
  // NOTE: /orderflow is a PUBLIC endpoint — no auth headers needed
  const fetchOrderFlow = async (tf = selectedTf, limit = orderFlowLimit) => {
    if (isFetchingOrderFlowRef.current) return;
    isFetchingOrderFlowRef.current = true;
    try {
      const res = await fetch(`${API_BASE}/strategy/orderflow?timeframe=${tf}&limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        setOrderFlow(data);
      }
    } catch (err) {
      console.warn('[OrderFlow] fetch error:', err);
    } finally {
      isFetchingOrderFlowRef.current = false;
    }
  };

  // Fetch signals for selected symbol & timeframe
  const fetchSignals = async (symbol = selectedSymbol, tf = selectedTf, isBackground = false) => {
    if (isFetchingSignalsRef.current) return;
    isFetchingSignalsRef.current = true;
    if (!isBackground) setLoading(true);
    if (!isBackground) setError(null);

    try {
      const res = await fetch(`${API_BASE}/strategy/signals?symbol=${symbol}&timeframe=${tf}&limit=20`, {
        headers: authHeaders
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Failed to fetch signals (${res.status})`);
      }
      const data = await res.json();
      setSignalsData(data);
    } catch (err) {
      if (!isBackground) {
        console.error("Signal fetch error:", err);
        setError(err.message);
      }
    } finally {
      if (!isBackground) setLoading(false);
      isFetchingSignalsRef.current = false;
    }
  };

  // Scan all pairs across watchlist
  const scanAll = async (tf = selectedTf) => {
    setScanning(true);
    try {
      const res = await fetch(`${API_BASE}/strategy/scan?timeframe=${tf}`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        setWatchlist(data.results || []);
      }
    } catch (err) {
      console.error("Scan error:", err);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    fetchSignals(selectedSymbol, selectedTf, false);
    fetchOrderFlow(selectedTf, orderFlowLimit);

    // If paused (0), don't start the auto-refresh interval
    if (refreshInterval <= 0) return;

    // Configurable auto-refresh chart & signals from backend
    const timer = setInterval(() => {
      fetchSignals(selectedSymbol, selectedTf, true);
      fetchOrderFlow(selectedTf, orderFlowLimit);
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [selectedSymbol, selectedTf, refreshInterval, orderFlowLimit]);

  useEffect(() => {
    scanAll(selectedTf);
  }, [selectedTf]);

  const live = signalsData?.live;
  const signals = signalsData?.signals || [];

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
            onClick={() => { fetchSignals(); fetchOrderFlow(); scanAll(); }}
            disabled={loading || scanning}
            className="btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              fontSize: '0.78rem'
            }}
          >
            <RefreshCw size={14} className={loading || scanning ? 'animate-spin' : ''} />
            <span>Scan</span>
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

                {/* Big Signal Status */}
                <div style={{
                  padding: '8px 18px',
                  borderRadius: '12px',
                  background: live.signal === 'BUY'
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.4) 100%)'
                    : live.signal === 'SELL'
                      ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(185, 28, 28, 0.4) 100%)'
                      : 'rgba(255, 255, 255, 0.05)',
                  border: live.signal === 'BUY'
                    ? '1px solid #10B981'
                    : live.signal === 'SELL'
                      ? '1px solid #EF4444'
                      : '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  {live.signal === 'BUY' ? <TrendingUp size={20} color="#34D399" /> : live.signal === 'SELL' ? <TrendingDown size={20} color="#F87171" /> : <Clock size={20} color="var(--text-muted)" />}
                  <span style={{
                    fontSize: '1.1rem',
                    fontWeight: 800,
                    color: live.signal === 'BUY' ? '#34D399' : live.signal === 'SELL' ? '#F87171' : 'var(--text-muted)'
                  }}>
                    {live.signal === 'WAIT' ? 'NO ACTIVE SETUP' : `${live.signal} SETUP`}
                  </span>
                  {live.quality_grade && live.quality_grade !== 'NONE' && live.signal !== 'WAIT' && (
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '5px',
                      background: live.quality_grade === 'A+ ELITE' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(99, 102, 241, 0.25)',
                      color: live.quality_grade === 'A+ ELITE' ? '#FBBF24' : '#A5B4FC',
                      border: live.quality_grade === 'A+ ELITE' ? '1px solid #F59E0B' : '1px solid rgba(99, 102, 241, 0.4)',
                    }}>
                      ★ {live.quality_grade}
                    </span>
                  )}
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

                {/* Metric 4: Zones in Range */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '10px',
                  padding: '12px'
                }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Mapped Zones</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#A5B4FC' }}>
                    {live.ob_zones + live.fvg_zones} Total
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                    {live.ob_zones} OBs · {live.fvg_zones} FVGs
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
                      <div>Imbalance Zones: <strong style={{ color: '#FBBF24' }}>{orderFlow.imbalance_zones?.length || 0} active</strong></div>
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

              {/* SL / TP Target Box when signal is active */}
              {live.signal !== 'WAIT' && (
                <div style={{
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px dashed rgba(99, 102, 241, 0.3)',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Entry Price</span>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#FFFFFF' }}>
                      ${live.entry_price?.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#F87171' }}>Stop Loss (Zone Invalidation)</span>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#F87171' }}>
                      ${live.stop_loss?.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#34D399' }}>Take Profit (1.272 Fib)</span>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#34D399' }}>
                      ${live.take_profit?.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#FBBF24' }}>Risk : Reward</span>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#FBBF24' }}>
                      1 : {live.risk_reward}
                    </div>
                  </div>
                </div>
              )}
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
                {signalsData?.candles?.length || 0} bars · Scroll to zoom · Drag to pan
              </span>
            </div>

            <TradingViewChart
              candles={signalsData?.candles || []}
              anchorData={signalsData?.anchor_data || []}
              pressureData={signalsData?.pressure_data || []}
              indicators={signalsData?.indicators || {}}
              zones={signalsData?.zones || []}
              signals={signals}
              liveSignal={live}
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

          {/* Historical Signal Audit Table */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FFFFFF' }}>
                Recent Strategy Trigger History ({selectedSymbol})
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {signals.length} recorded signals
              </span>
            </div>

            {signals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                No recent signals detected for {selectedSymbol} with score ≥ 2 and pressure ≥ 25%.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-dim)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px' }}>Type</th>
                      <th style={{ padding: '8px 10px' }}>Time (UTC)</th>
                      <th style={{ padding: '8px 10px' }}>Entry</th>
                      <th style={{ padding: '8px 10px' }}>Stop Loss</th>
                      <th style={{ padding: '8px 10px' }}>Take Profit</th>
                      <th style={{ padding: '8px 10px' }}>R : R</th>
                      <th style={{ padding: '8px 10px' }}>Score</th>
                      <th style={{ padding: '8px 10px' }}>Pressure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map((sig, idx) => {
                      const isBuy = sig.signal === 'BUY';
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '10px' }}>
                            <span style={{
                              background: isBuy ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                              color: isBuy ? '#34D399' : '#F87171',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: 800,
                              fontSize: '0.72rem'
                            }}>
                              {sig.signal}
                            </span>
                          </td>
                          <td style={{ padding: '10px', color: 'var(--text-muted)' }}>
                            {new Date(sig.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '10px', fontWeight: 600, color: '#FFFFFF' }}>
                            ${sig.entry_price?.toLocaleString()}
                          </td>
                          <td style={{ padding: '10px', color: '#F87171' }}>
                            ${sig.stop_loss?.toLocaleString()}
                          </td>
                          <td style={{ padding: '10px', color: '#34D399' }}>
                            ${sig.take_profit?.toLocaleString()}
                          </td>
                          <td style={{ padding: '10px', fontWeight: 700, color: '#FBBF24' }}>
                            1 : {sig.risk_reward}
                          </td>
                          <td style={{ padding: '10px', fontWeight: 700, color: '#F59E0B' }}>
                            {sig.confluence_score}✦
                          </td>
                          <td style={{ padding: '10px', color: sig.pressure_bias >= 0 ? '#34D399' : '#F87171' }}>
                            {(sig.pressure_bias * 100).toFixed(0)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}

