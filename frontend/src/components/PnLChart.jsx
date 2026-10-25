import React from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid 
} from 'recharts';
import { LineChart as ChartIcon, PieChart as PieIcon } from 'lucide-react';

export default function PnLChart({ summary }) {
  if (!summary) return null;

  const data = summary.pnl_curve || [];
  const symbols = summary.symbols_breakdown || {};
  const symbolList = Object.entries(symbols);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
      return (
        <div style={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '10px',
          padding: '10px 14px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          fontSize: '0.8rem'
        }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>{point.time} • Trade #{point.trade_id}</div>
          <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>{point.symbol}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span style={{ color: 'var(--text-dim)' }}>Trade PnL:</span>
            <span className="font-mono" style={{ 
              fontWeight: 700, 
              color: point.net_pnl >= 0 ? '#34D399' : '#FB7185' 
            }}>
              {point.net_pnl >= 0 ? `+$${point.net_pnl}` : `-$${Math.abs(point.net_pnl)}`}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginTop: '2px' }}>
            <span style={{ color: 'var(--text-dim)' }}>Cumulative:</span>
            <span className="font-mono" style={{ 
              fontWeight: 700, 
              color: point.cumulative_pnl >= 0 ? '#818CF8' : '#FB7185' 
            }}>
              ${point.cumulative_pnl}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="pnl-chart-grid">
      {/* Chart Panel */}
      <div className="glass-panel" style={{ padding: '16px 20px', minHeight: '320px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ChartIcon size={18} color="#818CF8" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Cumulative PnL Performance</h3>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Chronological Closed Trades
          </span>
        </div>

        {data.length > 0 ? (
          <div style={{ width: '100%', height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="pnlGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="var(--text-dim)" 
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis 
                  stroke="var(--text-dim)" 
                  fontSize={11} 
                  tickLine={false}
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="cumulative_pnl" 
                  stroke="#818CF8" 
                  strokeWidth={2.5}
                  fillOpacity={1} 
                  fill="url(#pnlGlow)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{
            height: '220px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-dim)',
            fontSize: '0.875rem'
          }}>
            <p>No trade executions recorded yet.</p>
            <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>Click "Seed Demo Data" above to view live interactive charts.</p>
          </div>
        )}
      </div>

      {/* Symbol Breakdown Panel */}
      <div className="glass-panel" style={{ padding: '20px', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <PieIcon size={18} color="#34D399" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Instrument Distribution</h3>
        </div>

        {symbolList.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {symbolList.map(([sym, stats]) => (
              <div key={sym} style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '10px 14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{sym}</span>
                  <span className="font-mono" style={{ 
                    fontWeight: 600, 
                    fontSize: '0.85rem',
                    color: stats.net_pnl >= 0 ? '#34D399' : '#FB7185'
                  }}>
                    {stats.net_pnl >= 0 ? `+$${stats.net_pnl}` : `-$${Math.abs(stats.net_pnl)}`}
                  </span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  <span>{stats.trades} trades</span>
                  <span>•</span>
                  <span>Vol: {stats.volume} lots</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Win:</span>
                    <strong style={{ color: stats.win_rate >= 50 ? '#34D399' : '#FBBF24' }}>
                      {stats.win_rate}%
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            height: '220px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-dim)',
            fontSize: '0.875rem'
          }}>
            Awaiting trade executions
          </div>
        )}
      </div>
    </div>
  );
}
