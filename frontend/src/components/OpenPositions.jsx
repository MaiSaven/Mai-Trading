import React from 'react';
import { Radio, AlertCircle } from 'lucide-react';

export default function OpenPositions({ positions }) {
  if (!positions || positions.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Radio size={16} color="#60A5FA" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Active Open Positions (0)</h3>
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          No active positions in MT5 right now. Any open orders placed in MetaTrader 5 will stream here in real time.
        </p>
      </div>
    );
  }

  const totalFloating = positions.reduce((acc, p) => acc + (p.profit || 0), 0);

  return (
    <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Radio size={16} color="#34D399" className="pulsing-indicator" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
            Active Open Positions ({positions.length})
          </h3>
        </div>
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

      <div className="mobile-scroll-hint">
        <span>↔ Scroll horizontally to view all position columns</span>
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
