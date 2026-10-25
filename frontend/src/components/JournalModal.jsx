import React, { useState, useEffect } from 'react';
import { X, Star, Save, Image, Check, Sparkles } from 'lucide-react';

const PRESET_SETUPS = [
  "ICT / FVG", 
  "Liquidity Sweep", 
  "Breakout", 
  "Retest", 
  "Trend Following", 
  "Counter-Trend", 
  "Range Scalp"
];

const PRESET_EMOTIONS = [
  "Disciplined", 
  "Calm", 
  "Confident", 
  "FOMO", 
  "Greedy", 
  "Hesitant", 
  "Revenge Trade", 
  "Anxious"
];

export default function JournalModal({ trade, onClose, onSave }) {
  if (!trade) return null;

  const [setup, setSetup] = useState(trade.journal_entry?.setup || "");
  const [emotion, setEmotion] = useState(trade.journal_entry?.emotion || "");
  const [notes, setNotes] = useState(trade.journal_entry?.notes || "");
  const [rating, setRating] = useState(trade.journal_entry?.rating || 5);
  const [screenshotUrl, setScreenshotUrl] = useState(trade.journal_entry?.screenshot_url || "");
  const [isSaving, setIsSaving] = useState(false);

  const isWin = trade.net_pnl >= 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave({
      trade_id: trade.id,
      setup,
      emotion,
      notes,
      rating,
      screenshot_url: screenshotUrl || null
    });
    setIsSaving(false);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(3, 7, 18, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '16px'
    }}>
      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '620px',
        maxHeight: '90vh',
        overflowY: 'auto',
        background: '#0F172A',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Trade Reflection & Journal</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '2px' }}>
              Document your psychology, rules execution, and lessons learned.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Trade Recap Banner */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid var(--border-color)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          fontSize: '0.85rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 800 }}>{trade.symbol}</span>
            <span className={trade.type === 'BUY' ? 'badge-buy' : 'badge-sell'}>
              {trade.type}
            </span>
            <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
              {trade.volume} lots
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              {trade.entry_price} → {trade.exit_price}
            </span>
            <span className="font-mono" style={{
              fontWeight: 800,
              fontSize: '0.95rem',
              color: isWin ? '#34D399' : '#FB7185'
            }}>
              {isWin ? `+$${trade.net_pnl.toFixed(2)}` : `-$${Math.abs(trade.net_pnl).toFixed(2)}`}
            </span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          
          {/* Strategy / Setup */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Strategy / Technical Setup
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {PRESET_SETUPS.map(item => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setSetup(item)}
                  style={{
                    background: setup === item ? '#6366F1' : 'rgba(255, 255, 255, 0.05)',
                    color: setup === item ? 'white' : 'var(--text-muted)',
                    border: '1px solid',
                    borderColor: setup === item ? '#818CF8' : 'var(--border-color)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Or type custom setup..."
              value={setup}
              onChange={(e) => setSetup(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: 'white',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Emotional State */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Emotional State & Psychology
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {PRESET_EMOTIONS.map(item => {
                const isSelected = emotion === item;
                const isNegative = ["FOMO", "Greedy", "Revenge Trade", "Anxious"].includes(item);
                return (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setEmotion(item)}
                    style={{
                      background: isSelected ? (isNegative ? '#E11D48' : '#10B981') : 'rgba(255, 255, 255, 0.05)',
                      color: isSelected ? 'white' : 'var(--text-muted)',
                      border: '1px solid',
                      borderColor: isSelected ? 'white' : 'var(--border-color)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              placeholder="Or specify emotions..."
              value={emotion}
              onChange={(e) => setEmotion(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: 'white',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Rating */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Discipline & Execution Rating
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setRating(star)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px'
                  }}
                >
                  <Star
                    size={24}
                    color={star <= rating ? "#FBBF24" : "rgba(255, 255, 255, 0.2)"}
                    fill={star <= rating ? "#FBBF24" : "none"}
                  />
                </button>
              ))}
              <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginLeft: '8px' }}>
                {rating === 5 ? "Flawless Execution" : rating >= 3 ? "Followed Plan" : "Broke Trading Rules"}
              </span>
            </div>
          </div>

          {/* Reflections / Notes */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Trade Reflections & Takeaways
            </label>
            <textarea
              rows={4}
              placeholder="What triggered this entry? Did you respect risk sizing? What could have been managed better?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '10px 12px',
                color: 'white',
                fontSize: '0.85rem',
                outline: 'none',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Screenshot URL */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              TradingView / MT5 Chart Screenshot URL
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Image size={16} color="var(--text-dim)" />
              <input
                type="url"
                placeholder="https://www.tradingview.com/x/... or image link"
                value={screenshotUrl}
                onChange={(e) => setScreenshotUrl(e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: 'white',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
            </div>
            {screenshotUrl && (
              <div style={{ marginTop: '10px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <img 
                  src={screenshotUrl} 
                  alt="Trade Chart Preview" 
                  style={{ width: '100%', maxHeight: '200px', objectFit: 'cover' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSaving}
            >
              <Save size={16} />
              <span>{isSaving ? "Saving..." : "Save Reflection"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
