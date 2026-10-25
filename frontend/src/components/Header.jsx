import React, { useState } from 'react';
import { 
  Activity, 
  RefreshCw, 
  PlusCircle, 
  BarChart3, 
  Calendar as CalendarIcon,
  ListOrdered, 
  BookOpen, 
  ShieldCheck,
  Zap,
  Users,
  ChevronDown
} from 'lucide-react';

export default function Header({ 
  syncStatus, 
  summary, 
  activeTab, 
  setActiveTab, 
  onRefresh, 
  onSeedDemo, 
  onOpenManualModal,
  isRefreshing,
  accounts = [],
  activeAccountId,
  onSwitchAccount
}) {
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const isConnected = syncStatus?.connected;
  const brokerName = syncStatus?.account?.broker || "MetaTrader 5";
  const accountId = syncStatus?.account?.account_id;
  const activeAccount = accounts.find(a => a.account_id === activeAccountId) || accounts[0];

  return (
    <header className="glass-panel" style={{ padding: '16px 24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        
        {/* Brand & Connection Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
            padding: '10px 14px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)'
          }}>
            <Zap size={22} color="#ffffff" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.05em', lineHeight: 1 }}>MAI TRADING</div>
              <div style={{ fontSize: '0.65rem', color: '#E0E7FF', letterSpacing: '0.1em', marginTop: '2px' }}>ANALYTICS & JOURNAL</div>
            </div>
          </div>

          {/* MT5 Connection Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-color)',
            borderRadius: '9999px',
            fontSize: '0.8rem'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isConnected ? '#10B981' : '#F59E0B'
            }} className="pulsing-indicator" />
            <span style={{ color: 'var(--text-muted)' }}>MT5 Sync:</span>
            <span style={{ fontWeight: 600, color: isConnected ? '#34D399' : '#FBBF24' }}>
              {isConnected ? (brokerName.includes('Simulated') ? 'Simulated Live Worker' : brokerName) : 'Awaiting Connection'}
            </span>
            {accountId && (
              <span className="font-mono" style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                #{accountId}
              </span>
            )}
          </div>

          {/* Account Switcher */}
          {accounts.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowAccountMenu(v => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  background: 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  borderRadius: '9999px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  color: '#A5B4FC',
                  fontWeight: 600,
                  transition: 'all 0.15s ease'
                }}
              >
                <Users size={14} />
                <span>
                  {activeAccount
                    ? `${activeAccount.broker.split(' ')[0]} #${activeAccount.account_id}`
                    : 'Select Account'
                  }
                </span>
                <ChevronDown size={13} style={{ opacity: 0.7 }} />
              </button>

              {showAccountMenu && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  background: '#1e1e2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  padding: '8px',
                  zIndex: 1000,
                  minWidth: '260px',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                }}>
                  <div style={{ padding: '4px 8px 8px', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
                    Switch Account
                  </div>
                  {accounts.map(acct => (
                    <button
                      key={acct.account_id}
                      onClick={() => { onSwitchAccount(acct.account_id); setShowAccountMenu(false); }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        background: activeAccountId === acct.account_id
                          ? 'rgba(99, 102, 241, 0.18)'
                          : 'transparent',
                        transition: 'all 0.1s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: activeAccountId === acct.account_id ? '#818CF8' : '#E2E8F0' }}>
                          #{acct.account_id}
                        </span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: acct.balance >= 0 ? '#34D399' : '#F87171' }}>
                          ${acct.balance?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{acct.broker}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

          <button 
            onClick={onOpenManualModal} 
            className="btn-secondary"
            title="Manually record a trade execution"
          >
            <PlusCircle size={15} color="#34D399" />
            <span>Manual Trade</span>
          </button>

          <button 
            onClick={onRefresh} 
            className="btn-primary"
            disabled={isRefreshing}
            style={{ opacity: isRefreshing ? 0.7 : 1 }}
          >
            <RefreshCw size={15} className={isRefreshing ? "pulsing-indicator" : ""} />
            <span>{isRefreshing ? "Syncing..." : "Sync Now"}</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px', 
        marginTop: '18px', 
        paddingTop: '14px', 
        borderTop: '1px solid var(--border-color)',
        overflowX: 'auto'
      }}>
        <button
          onClick={() => setActiveTab('overview')}
          style={{
            background: activeTab === 'overview' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
            color: activeTab === 'overview' ? '#818CF8' : 'var(--text-muted)',
            border: activeTab === 'overview' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
            padding: '7px 16px',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap'
          }}
        >
          <BarChart3 size={16} />
          <span>Dashboard & Analytics</span>
        </button>

        <button
          onClick={() => setActiveTab('calendar')}
          style={{
            background: activeTab === 'calendar' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
            color: activeTab === 'calendar' ? '#818CF8' : 'var(--text-muted)',
            border: activeTab === 'calendar' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
            padding: '7px 16px',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap'
          }}
        >
          <CalendarIcon size={16} />
          <span>Journal Calendar</span>
        </button>

        <button
          onClick={() => setActiveTab('executions')}
          style={{
            background: activeTab === 'executions' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
            color: activeTab === 'executions' ? '#818CF8' : 'var(--text-muted)',
            border: activeTab === 'executions' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
            padding: '7px 16px',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap'
          }}
        >
          <ListOrdered size={16} />
          <span>Trade Executions</span>
          {summary?.total_trades > 0 && (
            <span style={{
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '1px 6px',
              borderRadius: '9999px',
              fontSize: '0.7rem'
            }}>
              {summary.total_trades}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('journal')}
          style={{
            background: activeTab === 'journal' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
            color: activeTab === 'journal' ? '#818CF8' : 'var(--text-muted)',
            border: activeTab === 'journal' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
            padding: '7px 16px',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap'
          }}
        >
          <BookOpen size={16} />
          <span>Journal & Psychology</span>
        </button>
      </div>
    </header>
  );
}
