import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  Star, 
  MessageSquare, 
  Trash2, 
  ArrowRight,
  ExternalLink
} from 'lucide-react';

export default function TradeList({ trades, onSelectTrade, onDeleteTrade }) {
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [symbolFilter, setSymbolFilter] = useState('all');

  const symbols = Array.from(new Set(trades.map(t => t.symbol))).filter(Boolean);

  const filteredTrades = trades.filter(t => {
    // Search filter
    const matchesSearch = 
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      (t.journal_entry?.setup || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.journal_entry?.emotion || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.journal_entry?.notes || '').toLowerCase().includes(search.toLowerCase());

    // Outcome filter
    const matchesOutcome = 
      outcomeFilter === 'all' ? true :
      outcomeFilter === 'win' ? t.net_pnl > 0 :
      t.net_pnl < 0;

    // Symbol filter
    const matchesSymbol = symbolFilter === 'all' ? true : t.symbol === symbolFilter;

    return matchesSearch && matchesOutcome && matchesSymbol;
  });

  return (
    <div className="glass-panel" style={{ padding: '20px' }}>
      {/* Table Controls Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Executed Trades</h3>
          <span style={{
            background: 'rgba(255, 255, 255, 0.08)',
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            color: 'var(--text-muted)'
          }}>
            {filteredTrades.length} of {trades.length}
          </span>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%', maxWidth: '600px' }}>
          {/* Search box */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '6px 12px',
            flex: '1 1 180px',
            minWidth: '140px'
          }}>
            <Search size={14} color="var(--text-dim)" />
            <input
              type="text"
              placeholder="Filter symbol, setup, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'white',
                fontSize: '0.8rem',
                width: '100%'
              }}
            />
          </div>

          {/* Outcome buttons */}
          <div style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '2px'
          }}>
            {['all', 'win', 'loss'].map(mode => (
              <button
                key={mode}
                onClick={() => setOutcomeFilter(mode)}
                style={{
                  background: outcomeFilter === mode ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  color: outcomeFilter === mode ? 'white' : 'var(--text-dim)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {mode === 'all' ? 'All' : mode === 'win' ? 'Wins' : 'Losses'}
              </button>
            ))}
          </div>

          {/* Symbol Select */}
          {symbols.length > 0 && (
            <select
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '0.75rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Symbols</option>
              {symbols.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Trades Table */}
      {filteredTrades.length > 0 ? (
        <>
          <div className="mobile-scroll-hint">
            <span>↔ Scroll horizontally to view full trade execution history</span>
          </div>
          <div className="table-scroll-container">
            <table className="custom-table">
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Volume</th>
                <th>Entry → Exit</th>
                <th>Net PnL</th>
                <th>Strategy / Psychology</th>
                <th>Rating</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map(trade => {
                const isWin = trade.net_pnl >= 0;
                const journal = trade.journal_entry;
                const dateStr = trade.close_time ? new Date(trade.close_time).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                }) : 'N/A';

                return (
                  <tr key={trade.id}>
                    <td className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      {dateStr}
                    </td>

                    <td style={{ fontWeight: 700 }}>{trade.symbol}</td>

                    <td>
                      <span className={trade.type === 'BUY' ? 'badge-buy' : 'badge-sell'}>
                        {trade.type}
                      </span>
                    </td>

                    <td className="font-mono">{trade.volume}</td>

                    <td className="font-mono" style={{ fontSize: '0.8rem' }}>
                      <span>{trade.entry_price}</span>
                      <span style={{ color: 'var(--text-dim)', margin: '0 6px' }}>→</span>
                      <span>{trade.exit_price}</span>
                    </td>

                    <td className="font-mono" style={{ 
                      fontWeight: 700, 
                      color: isWin ? '#34D399' : '#FB7185' 
                    }}>
                      {isWin ? `+$${trade.net_pnl.toFixed(2)}` : `-$${Math.abs(trade.net_pnl).toFixed(2)}`}
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {journal?.setup ? (
                          <span className="badge-tag">{journal.setup}</span>
                        ) : null}
                        {journal?.emotion ? (
                          <span style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border-color)',
                            padding: '2px 6px',
                            borderRadius: '6px',
                            fontSize: '0.7rem'
                          }}>
                            {journal.emotion}
                          </span>
                        ) : null}
                        {!journal && (
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                            Unjournaled
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      {journal?.rating ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                          {[1, 2, 3, 4, 5].map(star => (
                            <Star 
                              key={star} 
                              size={12} 
                              color={star <= journal.rating ? "#FBBF24" : "rgba(255, 255, 255, 0.15)"}
                              fill={star <= journal.rating ? "#FBBF24" : "none"}
                            />
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>-</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => onSelectTrade(trade)}
                          className={journal ? "btn-secondary" : "btn-primary"}
                          style={{
                            padding: '5px 10px',
                            fontSize: '0.75rem',
                            borderRadius: '6px'
                          }}
                        >
                          <MessageSquare size={13} />
                          <span>{journal ? 'Edit Note' : '+ Journal'}</span>
                        </button>

                        <button
                          onClick={() => onDeleteTrade(trade.id)}
                          title="Delete trade entry"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-dim)',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#FB7185'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: 'var(--text-dim)',
          fontSize: '0.875rem'
        }}>
          No executions match your filter criteria.
        </div>
      )}
    </div>
  );
}
