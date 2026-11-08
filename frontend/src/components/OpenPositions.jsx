import React, { useState, useEffect, useRef } from 'react';
import { Radio } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const POLL_INTERVAL_MS = 10000; // 10 seconds — only this endpoint polls

export default function OpenPositions({ accountId, token }) {
  const [positions, setPositions] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const accountIdRef = useRef(accountId);

  // Keep ref in sync so the interval always uses the latest accountId
  useEffect(() => {
    accountIdRef.current = accountId;
  }, [accountId]);

  const fetchPositions = async (id = accountIdRef.current) => {
    try {
      const param = id ? `?account_id=${id}` : '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/positions${param}`, { headers });
      if (res.ok) {
        setPositions(await res.json());
        setLastUpdated(new Date());
      }
    } catch {
      // silent — network hiccup, retry next interval
    }
  };

  useEffect(() => {
    if (!token) return;
    // Fetch immediately when account changes, then poll every 10s
    fetchPositions(accountId);
    const interval = setInterval(() => fetchPositions(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [accountId, token]);

  const totalFloating = positions.reduce((acc, p) => acc + (p.profit || 0), 0);
  const updatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  if (!positions || positions.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Radio size={16} color="#60A5FA" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Active Open Positions (0)</h3>
          {updatedStr && (
            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
              updated {updatedStr}
            </span>
          )}
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          No active positions in MT5 right now. Any open orders placed in MetaTrader 5 will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Radio size={16} color="#34D399" className="pulsing-indicator" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
            Active Open Positions ({positions.length})
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {updatedStr && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
              updated {updatedStr}
            </span>
          )}
          <div style={{ fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Floating PnL: </span>
            <span className="font-mono" style={{
              fontWeight: 700,
              color: totalFloating >= 0 ? '#34D399' : '#FB7185'
            }}>
              {totalFloating >= 0 ? `+$${totalFloating.toFixed(2)}` : `-$${Math.abs(totalFloating).toFixed(2)}`}
            </span>
          </div>
        </div>
      </div>

      <div className="table-scroll-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Symbol</th>
              <th>Side</th>
              <th>Volume</th>
              <th>Open Price</th>
              <th>Current Price</th>
              <th>SL / TP</th>
              <th>Floating PnL</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const isWin = pos.profit >= 0;
              return (
                <tr key={pos.id || pos.ticket}>
                  <td className="font-mono" style={{ color: 'var(--text-dim)' }}>
                    #{pos.ticket}
                  </td>
                  <td style={{ fontWeight: 700 }}>{pos.symbol}</td>
                  <td>
                    <span className={pos.type === 'BUY' ? 'badge-buy' : 'badge-sell'}>
                      {pos.type}
                    </span>
                  </td>
                  <td className="font-mono">{pos.volume}</td>
                  <td className="font-mono">{pos.price_open}</td>
                  <td className="font-mono" style={{ fontWeight: 600 }}>{pos.price_current}</td>
                  <td className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    {pos.sl > 0 ? pos.sl : '-'} / {pos.tp > 0 ? pos.tp : '-'}
                  </td>
                  <td className="font-mono" style={{
                    fontWeight: 700,
                    color: isWin ? '#34D399' : '#FB7185'
                  }}>
                    {isWin ? `+$${pos.profit.toFixed(2)}` : `-$${Math.abs(pos.profit).toFixed(2)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
