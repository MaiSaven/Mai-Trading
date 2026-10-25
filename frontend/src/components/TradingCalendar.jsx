import React, { useState, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  TrendingDown, 
  Star, 
  MessageSquare, 
  Filter,
  Flame,
  Award
} from 'lucide-react';

function formatFullPnL(val) {
  const abs = Math.abs(val);
  const sign = val >= 0 ? '+' : '-';
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMobilePnL(val) {
  const abs = Math.abs(val);
  const sign = val >= 0 ? '+' : '-';
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
}

function formatWeekPnL(val) {
  const abs = Math.abs(val);
  const sign = val >= 0 ? '+' : '-';
  if (abs >= 10000) {
    return `${sign}$${(abs / 1000).toFixed(1)}k`;
  }
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
}

export default function TradingCalendar({ trades, onSelectTrade }) {
  // Determine initial month based on latest trade or current date
  const initialDate = useMemo(() => {
    if (trades && trades.length > 0) {
      const latestTrade = trades[0];
      if (latestTrade.close_time) {
        return new Date(latestTrade.close_time);
      }
    }
    return new Date();
  }, [trades]);

  const [currentDate, setCurrentDate] = useState(initialDate);
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [symbolFilter, setSymbolFilter] = useState('all');

  const symbols = Array.from(new Set(trades.map(t => t.symbol))).filter(Boolean);

  // Filter trades by symbol if selected
  const filteredTrades = useMemo(() => {
    if (symbolFilter === 'all') return trades;
    return trades.filter(t => t.symbol === symbolFilter);
  }, [trades, symbolFilter]);

  // Group trades by date string "YYYY-MM-DD"
  const tradesByDate = useMemo(() => {
    const map = {};
    filteredTrades.forEach(trade => {
      const dateVal = trade.close_time || trade.open_time;
      if (!dateVal) return;
      const d = new Date(dateVal);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;

      if (!map[dateKey]) {
        map[dateKey] = {
          dateKey,
          dateObj: d,
          trades: [],
          totalPnL: 0,
          wins: 0,
          losses: 0,
          breakevens: 0
        };
      }

      map[dateKey].trades.push(trade);
      map[dateKey].totalPnL = Math.round((map[dateKey].totalPnL + trade.net_pnl) * 100) / 100;
      if (trade.net_pnl > 0) map[dateKey].wins++;
      else if (trade.net_pnl < 0) map[dateKey].losses++;
      else map[dateKey].breakevens++;
    });
    return map;
  }, [filteredTrades]);

  // Month navigation
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const jumpToToday = () => {
    setCurrentDate(new Date());
  };

  // Monthly stats
  const monthStats = useMemo(() => {
    let monthlyPnL = 0;
    let monthTradesCount = 0;
    let greenDays = 0;
    let redDays = 0;
    let bestDay = null;
    let worstDay = null;

    Object.entries(tradesByDate).forEach(([dateKey, dayData]) => {
      const [y, m] = dateKey.split('-').map(Number);
      if (y === year && m === month + 1) {
        monthlyPnL += dayData.totalPnL;
        monthTradesCount += dayData.trades.length;
        if (dayData.totalPnL > 0) greenDays++;
        else if (dayData.totalPnL < 0) redDays++;

        if (!bestDay || dayData.totalPnL > bestDay.totalPnL) {
          bestDay = dayData;
        }
        if (!worstDay || dayData.totalPnL < worstDay.totalPnL) {
          worstDay = dayData;
        }
      }
    });

    const tradingDays = greenDays + redDays;
    const greenDayRate = tradingDays > 0 ? Math.round((greenDays / tradingDays) * 100) : 0;

    return {
      monthlyPnL: Math.round(monthlyPnL * 100) / 100,
      monthTradesCount,
      tradingDays,
      greenDays,
      redDays,
      greenDayRate,
      bestDay,
      worstDay
    };
  }, [tradesByDate, year, month]);

  // Generate calendar days for month
  const calendarWeeks = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    // Monday as start of week (0=Mon, 6=Sun)
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday is 6

    const weeks = [];
    let currentWeek = [];

    // Prepend empty padding days for previous month
    for (let i = 0; i < startDayOfWeek; i++) {
      currentWeek.push(null);
    }

    // Days of this month
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const dayData = tradesByDate[dateKey] || null;

      currentWeek.push({
        dayNum,
        dateKey,
        dayData
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Append empty padding days for end of month
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [year, month, tradesByDate]);

  // Selected day data
  const selectedDayData = selectedDateKey ? tradesByDate[selectedDateKey] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Monthly Header & Quick Metrics Bar */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px'
        }}>
          {/* Month / Year Navigator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              padding: '10px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
            }}>
              <CalendarIcon size={20} color="#ffffff" />
            </div>

            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                {monthName} {year}
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                Trading Performance Calendar
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '12px' }}>
              <button
                onClick={prevMonth}
                className="btn-secondary"
                style={{ padding: '6px 10px', borderRadius: '8px' }}
                title="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={jumpToToday}
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '8px' }}
              >
                Current Month
              </button>
              <button
                onClick={nextMonth}
                className="btn-secondary"
                style={{ padding: '6px 10px', borderRadius: '8px' }}
                title="Next Month"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Symbol Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={15} color="var(--text-dim)" />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Symbol:</span>
            <select
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Instruments</option>
              {symbols.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Monthly Summary Cards Strip */}
        <div className="calendar-summary-strip">
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
              Month Net PnL
            </span>
            <span className="font-mono" style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              color: monthStats.monthlyPnL >= 0 ? '#34D399' : '#FB7185'
            }}>
              {monthStats.monthlyPnL >= 0 ? `+$${monthStats.monthlyPnL.toLocaleString()}` : `-$${Math.abs(monthStats.monthlyPnL).toLocaleString()}`}
            </span>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
              Green Day Consistency
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span className="font-mono" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#34D399' }}>
                {monthStats.greenDayRate}%
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                ({monthStats.greenDays}W / {monthStats.redDays}L days)
              </span>
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
              Trades Executed
            </span>
            <span className="font-mono" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)' }}>
              {monthStats.monthTradesCount} trades
            </span>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
              Best Day
            </span>
            <span className="font-mono" style={{ fontSize: '1rem', fontWeight: 700, color: '#34D399' }}>
              {monthStats.bestDay ? `+${monthStats.bestDay.totalPnL.toLocaleString()}` : '-'}
            </span>
            {monthStats.bestDay && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginLeft: '6px' }}>
                ({monthStats.bestDay.dateKey.split('-').slice(1).join('/')})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Calendar Grid Container */}
      <div className="glass-panel calendar-main-card">
        <div className="calendar-scroll-wrapper">
          <div className="calendar-inner-grid">
            {/* Day-of-Week Headers */}
            <div className="calendar-grid-row" style={{ marginBottom: '8px', textAlign: 'center' }}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} className="calendar-day-header">
                  {day}
                </div>
              ))}
              <div className="calendar-week-header">
                <span className="hide-on-mobile">Week PnL</span>
                <span className="show-on-mobile">Wk PnL</span>
              </div>
            </div>

        {/* Calendar Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {calendarWeeks.map((week, wIdx) => {
            // Calculate total weekly PnL
            let weeklyPnL = 0;
            let weekHasTrades = false;

            week.forEach(day => {
              if (day && day.dayData) {
                weeklyPnL += day.dayData.totalPnL;
                weekHasTrades = true;
              }
            });
            weeklyPnL = Math.round(weeklyPnL * 100) / 100;

            return (
              <div
                key={wIdx}
                className="calendar-grid-row"
              >
                {/* 7 Days of the Week */}
                {week.map((day, dIdx) => {
                  if (!day) {
                    return (
                      <div
                        key={`empty-${dIdx}`}
                        className="calendar-day-cell"
                        style={{
                          background: 'rgba(255, 255, 255, 0.01)',
                          border: '1px solid rgba(255, 255, 255, 0.02)',
                          opacity: 0.3
                        }}
                      />
                    );
                  }

                  const { dayNum, dateKey, dayData } = day;
                  const isSelected = selectedDateKey === dateKey;
                  const hasTrades = Boolean(dayData && dayData.trades.length > 0);
                  const isProfitable = hasTrades && dayData.totalPnL >= 0;
                  const isLoss = hasTrades && dayData.totalPnL < 0;

                  return (
                    <div
                      key={dateKey}
                      className="calendar-day-cell"
                      onClick={() => {
                        if (hasTrades) {
                          setSelectedDateKey(isSelected ? null : dateKey);
                        }
                      }}
                      style={{
                        background: hasTrades
                          ? isProfitable 
                            ? 'linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, rgba(16, 185, 129, 0.04) 100%)'
                            : 'linear-gradient(180deg, rgba(244, 63, 94, 0.12) 0%, rgba(244, 63, 94, 0.04) 100%)'
                          : 'rgba(255, 255, 255, 0.02)',
                        border: isSelected 
                          ? '2px solid #818CF8'
                          : hasTrades
                            ? isProfitable ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(244, 63, 94, 0.35)'
                            : '1px solid var(--border-color)',
                        cursor: hasTrades ? 'pointer' : 'default',
                        boxShadow: isSelected ? '0 0 16px rgba(99, 102, 241, 0.4)' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (hasTrades && !isSelected) {
                          e.currentTarget.style.borderColor = isProfitable ? '#34D399' : '#FB7185';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (hasTrades && !isSelected) {
                          e.currentTarget.style.borderColor = isProfitable ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)';
                          e.currentTarget.style.transform = 'none';
                        }
                      }}
                    >
                      {/* Top Header in Cell: Day Number */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '2px' }}>
                        <span
                          className="calendar-day-cell-number"
                          style={{ color: hasTrades ? 'var(--text-main)' : 'var(--text-dim)' }}
                        >
                          {dayNum}
                        </span>

                        {hasTrades && (
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: isProfitable ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                            color: isProfitable ? '#34D399' : '#FB7185',
                            whiteSpace: 'nowrap'
                          }}>
                            <span className="hide-on-mobile">
                              {dayData.trades.length} {dayData.trades.length === 1 ? 'trade' : 'trades'}
                            </span>
                            <span className="show-on-mobile">
                              {dayData.trades.length}t
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Bottom in Cell: Daily PnL */}
                      {hasTrades ? (
                        <div style={{ marginTop: 'auto' }}>
                          <div
                            className="font-mono calendar-day-pnl"
                            style={{ color: isProfitable ? '#34D399' : '#FB7185' }}
                          >
                            <span className="hide-on-mobile">
                              {formatFullPnL(dayData.totalPnL)}
                            </span>
                            <span className="show-on-mobile">
                              {formatMobilePnL(dayData.totalPnL)}
                            </span>
                          </div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.65rem',
                            color: 'var(--text-muted)',
                            marginTop: '2px'
                          }}>
                            <span style={{ color: '#34D399', fontWeight: 600 }}>{dayData.wins}W</span>
                            <span>·</span>
                            <span style={{ color: '#FB7185', fontWeight: 600 }}>{dayData.losses}L</span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.05)', textAlign: 'center', marginTop: 'auto' }}>
                          -
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 8th Column: Weekly Total PnL Cell */}
                <div
                  className="calendar-week-cell"
                  style={{
                    background: weekHasTrades ? 'rgba(99, 102, 241, 0.06)' : 'rgba(255, 255, 255, 0.01)',
                    border: '1px solid rgba(99, 102, 241, 0.18)',
                  }}
                >
                  <span className="calendar-week-label">
                    <span className="hide-on-mobile">Week {wIdx + 1}</span>
                    <span className="show-on-mobile">W{wIdx + 1}</span>
                  </span>
                  {weekHasTrades ? (
                    <span className="font-mono calendar-week-pnl" style={{
                      color: weeklyPnL >= 0 ? '#34D399' : '#FB7185'
                    }}>
                      <span className="hide-on-mobile">
                        {formatFullPnL(weeklyPnL)}
                      </span>
                      <span className="show-on-mobile">
                        {formatWeekPnL(weeklyPnL)}
                      </span>
                    </span>
                  ) : (
                    <span className="calendar-week-empty">-</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </div>

      {/* Selected Day Inspector Panel */}
      {selectedDayData && (
        <div className="glass-panel animate-fade-in" style={{ padding: '24px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '16px',
            marginBottom: '16px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CalendarIcon size={18} color="#818CF8" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  Executions for {selectedDayData.dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </h3>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                Click on any trade below to review or update your journal notes.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginRight: '6px' }}>Day PnL:</span>
                <span className="font-mono" style={{
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  color: selectedDayData.totalPnL >= 0 ? '#34D399' : '#FB7185'
                }}>
                  {selectedDayData.totalPnL >= 0 ? `+$${selectedDayData.totalPnL.toFixed(2)}` : `-$${Math.abs(selectedDayData.totalPnL.toFixed(2))}`}
                </span>
              </div>

              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '0.8rem'
              }}>
                <span style={{ color: '#34D399', fontWeight: 700 }}>{selectedDayData.wins} Wins</span>
                <span style={{ color: 'var(--text-dim)', margin: '0 4px' }}>/</span>
                <span style={{ color: '#FB7185', fontWeight: 700 }}>{selectedDayData.losses} Losses</span>
              </div>

              <button
                onClick={() => setSelectedDateKey(null)}
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              >
                Close Day View
              </button>
            </div>
          </div>

          {/* List of Trades for Selected Day */}
          <div className="table-scroll-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Volume</th>
                  <th>Entry → Exit</th>
                  <th>Net PnL</th>
                  <th>Setup Tag</th>
                  <th>Emotion</th>
                  <th>Rating</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {selectedDayData.trades.map(trade => {
                  const isWin = trade.net_pnl >= 0;
                  const j = trade.journal_entry;
                  const timeStr = trade.close_time ? new Date(trade.close_time).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : 'N/A';

                  return (
                    <tr key={trade.id}>
                      <td className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        {timeStr}
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
                        {j?.setup ? (
                          <span className="badge-tag">{j.setup}</span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>-</span>
                        )}
                      </td>

                      <td>
                        {j?.emotion ? (
                          <span style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border-color)',
                            padding: '2px 6px',
                            borderRadius: '6px',
                            fontSize: '0.7rem'
                          }}>
                            {j.emotion}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>-</span>
                        )}
                      </td>

                      <td>
                        {j?.rating ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star
                                key={star}
                                size={12}
                                color={star <= j.rating ? "#FBBF24" : "rgba(255, 255, 255, 0.15)"}
                                fill={star <= j.rating ? "#FBBF24" : "none"}
                              />
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>-</span>
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => onSelectTrade(trade)}
                          className={j ? "btn-secondary" : "btn-primary"}
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            borderRadius: '6px'
                          }}
                        >
                          <MessageSquare size={13} />
                          <span>{j ? 'Edit' : '+ Journal'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
