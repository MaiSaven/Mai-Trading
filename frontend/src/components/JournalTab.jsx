import React from 'react';
import { BookOpen, Star, Brain, Compass, MessageSquare, ExternalLink } from 'lucide-react';

export default function JournalTab({ trades, onSelectTrade }) {
  const journaledTrades = trades.filter(t => t.journal_entry);

  // Calculate psychology stats
  const setupStats = {};
  const emotionStats = {};

  journaledTrades.forEach(t => {
    const j = t.journal_entry;
    if (j.setup) {
      if (!setupStats[j.setup]) setupStats[j.setup] = { count: 0, pnl: 0, wins: 0 };
      setupStats[j.setup].count++;
      setupStats[j.setup].pnl += t.net_pnl;
      if (t.net_pnl > 0) setupStats[j.setup].wins++;
    }
    if (j.emotion) {
      if (!emotionStats[j.emotion]) emotionStats[j.emotion] = { count: 0, pnl: 0, wins: 0 };
      emotionStats[j.emotion].count++;
      emotionStats[j.emotion].pnl += t.net_pnl;
      if (t.net_pnl > 0) emotionStats[j.emotion].wins++;
    }
  });

  return (
    <div>
      {/* Top Insights Row */}
      <div className="journal-insights-grid">
        {/* Setup Playbook Breakdown */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Compass size={18} color="#818CF8" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Strategy Setup Performance</h3>
          </div>

          {Object.keys(setupStats).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Object.entries(setupStats).map(([setup, s]) => {
                const winRate = Math.round((s.wins / s.count) * 100);
                return (
                  <div key={setup} style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{setup}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        {s.count} trades • {winRate}% Win Rate
                      </div>
                    </div>
                    <span className="font-mono" style={{ 
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      color: s.pnl >= 0 ? '#34D399' : '#FB7185'
                    }}>
                      {s.pnl >= 0 ? `+$${s.pnl.toFixed(2)}` : `-$${Math.abs(s.pnl).toFixed(2)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No strategy setups tagged yet.</p>
          )}
        </div>

        {/* Emotion / Discipline Breakdown */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Brain size={18} color="#F43F5E" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Emotional State Impact</h3>
          </div>

          {Object.keys(emotionStats).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Object.entries(emotionStats).map(([emotion, s]) => {
                const winRate = Math.round((s.wins / s.count) * 100);
                const isNegative = ["FOMO", "Greedy", "Revenge Trade", "Anxious"].includes(emotion);
                return (
                  <div key={emotion} style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ 
                        fontWeight: 600, 
                        fontSize: '0.85rem',
                        color: isNegative ? '#FB7185' : 'var(--text-main)'
                      }}>
                        {emotion}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        {s.count} trades • {winRate}% Win Rate
                      </div>
                    </div>
                    <span className="font-mono" style={{ 
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      color: s.pnl >= 0 ? '#34D399' : '#FB7185'
                    }}>
                      {s.pnl >= 0 ? `+$${s.pnl.toFixed(2)}` : `-$${Math.abs(s.pnl).toFixed(2)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No emotional states tagged yet.</p>
          )}
        </div>
      </div>

      {/* Reflections Feed */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <BookOpen size={18} color="#34D399" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
            Trader Reflections Feed ({journaledTrades.length})
          </h3>
        </div>

        {journaledTrades.length > 0 ? (
          <div className="journal-feed-grid">
            {journaledTrades.map(trade => {
              const j = trade.journal_entry;
              const isWin = trade.net_pnl >= 0;
              return (
                <div
                  key={trade.id}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    {/* Top Row: Symbol, Side, Net PnL */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 800 }}>{trade.symbol}</span>
                        <span className={trade.type === 'BUY' ? 'badge-buy' : 'badge-sell'}>
                          {trade.type}
                        </span>
                      </div>
                      <span className="font-mono" style={{ 
                        fontWeight: 700, 
                        color: isWin ? '#34D399' : '#FB7185' 
                      }}>
                        {isWin ? `+$${trade.net_pnl.toFixed(2)}` : `-$${Math.abs(trade.net_pnl).toFixed(2)}`}
                      </span>
                    </div>

                    {/* Setup & Emotion Badges */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      {j.setup && <span className="badge-tag">{j.setup}</span>}
                      {j.emotion && (
                        <span style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border-color)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.7rem'
                        }}>
                          {j.emotion}
                        </span>
                      )}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: '2px' }}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star 
                            key={star} 
                            size={12} 
                            color={star <= j.rating ? "#FBBF24" : "rgba(255, 255, 255, 0.15)"}
                            fill={star <= j.rating ? "#FBBF24" : "none"}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Notes text */}
                    {j.notes ? (
                      <p style={{
                        color: 'var(--text-main)',
                        fontSize: '0.85rem',
                        lineHeight: 1.5,
                        background: 'rgba(0, 0, 0, 0.25)',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.04)',
                        marginBottom: '10px'
                      }}>
                        "{j.notes}"
                      </p>
                    ) : null}

                    {/* Chart preview thumbnail */}
                    {j.screenshot_url && (
                      <div style={{ borderRadius: '6px', overflow: 'hidden', marginBottom: '10px' }}>
                        <img 
                          src={j.screenshot_url} 
                          alt="Chart Screenshot" 
                          style={{ width: '100%', maxHeight: '120px', objectFit: 'cover' }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <button
                      onClick={() => onSelectTrade(trade)}
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                    >
                      <MessageSquare size={13} />
                      <span>Edit Reflection</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: 'var(--text-dim)',
            fontSize: '0.875rem'
          }}>
            No journaled reflections yet. Go to the "Trade Executions" tab and click "+ Journal" on any ticket to add setup tags, discipline ratings, and reflections.
          </div>
        )}
      </div>
    </div>
  );
}
