import React, { useState } from 'react';
import { formatLocalDateTime, toLocalDate } from '../utils/dateUtils';
import { 
  Search, 
  Filter, 
  Star, 
  MessageSquare, 
  Trash2, 
  ArrowRight,
  ExternalLink,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export default function TradeList({ trades, onSelectTrade, onDeleteTrade }) {
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [symbolFilter, setSymbolFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [pageSize, setPageSize] = useState('50');
  const [currentPage, setCurrentPage] = useState(1);

  const symbols = Array.from(new Set(trades.map(t => t.symbol))).filter(Boolean);

  const filteredTrades = trades.filter(t => {
    // Search filter
    const dateStr = formatLocalDateTime(t.close_time || t.open_time);
    const matchesSearch = 
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      dateStr.toLowerCase().includes(search.toLowerCase()) ||
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

    // Date filter
    let matchesDate = true;
    if (dateFilter !== 'all') {
      const d = toLocalDate(t.close_time || t.open_time);
      if (!d) {
        matchesDate = false;
      } else {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

        if (dateFilter === 'today') {
          matchesDate = d >= startOfToday && d < startOfTomorrow;
        } else if (dateFilter === 'yesterday') {
          matchesDate = d >= startOfYesterday && d < startOfToday;
        } else if (dateFilter === 'week') {
          const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
          matchesDate = d >= sevenDaysAgo && d < startOfTomorrow;
        } else if (dateFilter === 'month') {
          matchesDate = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }
      }
    }

    return matchesSearch && matchesOutcome && matchesSymbol && matchesDate;
  });

  // Pagination calculation
  const totalItems = filteredTrades.length;
  const isAll = pageSize === 'all';
  const sizeNum = isAll ? totalItems : Number(pageSize);
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalItems / sizeNum));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = isAll ? 0 : (validPage - 1) * sizeNum;
  const endIndex = isAll ? totalItems : Math.min(startIndex + sizeNum, totalItems);
  const displayedTrades = isAll ? filteredTrades : filteredTrades.slice(startIndex, endIndex);

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
            {isAll
              ? `${filteredTrades.length} of ${trades.length}`
              : `${totalItems === 0 ? 0 : startIndex + 1}-${endIndex} of ${totalItems} (${trades.length} total)`}
          </span>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%', maxWidth: '780px' }}>
          {/* Search box */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '6px 12px',
            flex: '1 1 160px',
            minWidth: '130px'
          }}>
            <Search size={14} color="var(--text-dim)" />
            <input
              type="text"
              placeholder="Filter symbol, date, notes..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
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
                onClick={() => {
                  setOutcomeFilter(mode);
                  setCurrentPage(1);
                }}
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

          {/* Date Select */}
          <select
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setCurrentPage(1);
            }}
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
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">Last 7 Days</option>
            <option value="month">This Month</option>
          </select>

          {/* Symbol Select */}
          {symbols.length > 0 && (
            <select
              value={symbolFilter}
              onChange={(e) => {
                setSymbolFilter(e.target.value);
                setCurrentPage(1);
              }}
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

          {/* Page Size Select */}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(e.target.value);
              setCurrentPage(1);
            }}
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
            title="Entries per page"
          >
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
            <option value="250">250 / page</option>
            <option value="all">Show All</option>
          </select>
        </div>
      </div>

      {/* Trades Table */}
      {displayedTrades.length > 0 ? (
        <>
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
              {displayedTrades.map(trade => {
                const isWin = trade.net_pnl >= 0;
                const journal = trade.journal_entry;
                const dateStr = formatLocalDateTime(trade.close_time);

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

        {/* Optional Pagination Footer */}
        {!isAll && totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-color)',
            fontSize: '0.8rem',
            color: 'var(--text-dim)',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div>
              Showing {startIndex + 1} - {endIndex} of {totalItems} trades
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={validPage <= 1}
                className="btn-secondary"
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  opacity: validPage <= 1 ? 0.4 : 1,
                  cursor: validPage <= 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <span>
                Page {validPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={validPage >= totalPages}
                className="btn-secondary"
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  opacity: validPage >= totalPages ? 0.4 : 1,
                  cursor: validPage >= totalPages ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
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
