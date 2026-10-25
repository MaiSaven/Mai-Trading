import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Target, 
  Scale, 
  Award, 
  Percent,
  Flame,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

export default function MetricsCards({ summary }) {
  if (!summary) return null;

  const isNetProfitable = (summary.total_net_pnl || 0) >= 0;
  const netPnLFormatted = (summary.total_net_pnl || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  });

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* 4 Primary Hero Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px',
        marginBottom: '16px'
      }}>
        
        {/* Card 1: Account Balance & Equity */}
        <div className="glass-panel glass-panel-hover" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>Account Balance</span>
            <div style={{
              background: 'rgba(59, 130, 246, 0.15)',
              padding: '6px',
              borderRadius: '8px'
            }}>
              <Wallet size={18} color="#60A5FA" />
            </div>
          </div>
          <div className="font-mono" style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '8px' }}>
            ${(summary.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            <span>Equity: <strong className="font-mono" style={{ color: 'var(--text-main)' }}>${(summary.equity || 0).toLocaleString()}</strong></span>
            <span>Free: <strong className="font-mono" style={{ color: 'var(--text-main)' }}>${(summary.free_margin || 0).toLocaleString()}</strong></span>
          </div>
        </div>

        {/* Card 2: Net PnL */}
        <div className="glass-panel glass-panel-hover" style={{ 
          padding: '20px',
          borderLeft: `4px solid ${isNetProfitable ? 'var(--green)' : 'var(--red)'}`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>Net PnL</span>
            <div style={{
              background: isNetProfitable ? 'var(--green-glow)' : 'var(--red-glow)',
              padding: '6px',
              borderRadius: '8px'
            }}>
              {isNetProfitable ? (
                <TrendingUp size={18} color="var(--green)" />
              ) : (
                <TrendingDown size={18} color="var(--red)" />
              )}
            </div>
          </div>
          <div className="font-mono" style={{ 
            fontSize: '1.75rem', 
            fontWeight: 700, 
            letterSpacing: '-0.02em',
            marginBottom: '8px',
            color: isNetProfitable ? '#34D399' : '#FB7185'
          }}>
            {netPnLFormatted}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            <span>Gross Win: <strong className="font-mono" style={{ color: '#34D399' }}>+${(summary.gross_profit || 0).toLocaleString()}</strong></span>
            <span>Loss: <strong className="font-mono" style={{ color: '#FB7185' }}>-${(summary.gross_loss || 0).toLocaleString()}</strong></span>
          </div>
        </div>

        {/* Card 3: Win Rate */}
        <div className="glass-panel glass-panel-hover" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>Win Rate</span>
            <div style={{
              background: 'rgba(16, 185, 129, 0.15)',
              padding: '6px',
              borderRadius: '8px'
            }}>
              <Percent size={18} color="#34D399" />
            </div>
          </div>
          <div className="font-mono" style={{ 
            fontSize: '1.75rem', 
            fontWeight: 700, 
            letterSpacing: '-0.02em',
            marginBottom: '8px',
            color: (summary.win_rate || 0) >= 50 ? '#34D399' : '#FBBF24'
          }}>
            {summary.win_rate || 0}%
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Visual Win Rate Bar */}
            <div style={{ flex: 1, height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '9999px', overflow: 'hidden' }}>
              <div style={{
                width: `${summary.win_rate || 0}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #10B981, #34D399)',
                borderRadius: '9999px'
              }} />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
              {summary.total_wins || 0}W / {summary.total_losses || 0}L
            </span>
          </div>
        </div>

        {/* Card 4: Profit Factor */}
        <div className="glass-panel glass-panel-hover" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>Profit Factor</span>
            <div style={{
              background: 'rgba(99, 102, 241, 0.15)',
              padding: '6px',
              borderRadius: '8px'
            }}>
              <Scale size={18} color="#818CF8" />
            </div>
          </div>
          <div className="font-mono" style={{ 
            fontSize: '1.75rem', 
            fontWeight: 700, 
            letterSpacing: '-0.02em',
            marginBottom: '8px',
            color: (summary.profit_factor || 0) >= 1.5 ? '#818CF8' : 'var(--text-main)'
          }}>
            {summary.profit_factor || 0}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            <span>Expectancy:</span>
            <strong className="font-mono" style={{ color: (summary.expectancy || 0) >= 0 ? '#34D399' : '#FB7185' }}>
              ${(summary.expectancy || 0).toLocaleString()}/trade
            </strong>
          </div>
        </div>
      </div>

      {/* Secondary Fast Stats Strip */}
      <div className="glass-panel" style={{
        padding: '12px 20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        fontSize: '0.8rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowUpRight size={16} color="#34D399" />
          <span style={{ color: 'var(--text-muted)' }}>Best Trade:</span>
          <span className="font-mono" style={{ fontWeight: 600, color: '#34D399' }}>
            +${(summary.best_trade || 0).toLocaleString()}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowDownRight size={16} color="#FB7185" />
          <span style={{ color: 'var(--text-muted)' }}>Worst Trade:</span>
          <span className="font-mono" style={{ fontWeight: 600, color: '#FB7185' }}>
            ${(summary.worst_trade || 0).toLocaleString()}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Award size={16} color="#818CF8" />
          <span style={{ color: 'var(--text-muted)' }}>Avg Trade:</span>
          <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>
            ${(summary.avg_trade || 0).toLocaleString()}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Target size={16} color="#FBBF24" />
          <span style={{ color: 'var(--text-muted)' }}>Total Closed:</span>
          <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>
            {summary.total_trades || 0} trades
          </span>
        </div>
      </div>
    </div>
  );
}
