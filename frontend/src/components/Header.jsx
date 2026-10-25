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
    <header className="glass-panel header-container">
      <div className="header-top-row">
        
        {/* Brand & Connection Badge */}
        <div className="header-left-cluster">
          <div style={{
            background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
            padding: '8px 12px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)'
          }}>
            <Zap size={20} color="#ffffff" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.98rem', letterSpacing: '0.05em', lineHeight: 1 }}>MAI TRADING</div>
              <div style={{ fontSize: '0.62rem', color: '#E0E7FF', letterSpacing: '0.1em', marginTop: '2px' }}>ANALYTICS & JOURNAL</div>
            </div>
          </div>

          {/* MT5 Connection Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-color)',
            borderRadius: '9999px',
            fontSize: '0.78rem',
            maxWidth: '100%'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isConnected ? '#10B981' : '#F59E0B',
              flexShrink: 0
            }} className="pulsing-indicator" />
            <span style={{ color: 'var(--text-muted)' }}>MT5:</span>
            <span style={{ fontWeight: 600, color: isConnected ? '#34D399' : '#FBBF24', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isConnected ? (brokerName.includes('Simulated') ? 'Simulated Live Worker' : brokerName) : 'Awaiting Connection'}
            </span>
            {accountId && (
              <span className="font-mono" style={{ color: 'var(--text-dim)', fontSize: '0.72rem', flexShrink: 0 }}>
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
                  padding: '6px 12px',
                  background: 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  borderRadius: '9999px',
                  fontSize: '0.78rem',
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
                  minWidth: '240px',
                  maxWidth: 'calc(100vw - 32px)',
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
        <div className="header-actions">
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
      <nav className="nav-tabs-bar">
        <button
          onClick={() => setActiveTab('overview')}
          className="nav-tab-btn"
          style={{
            background: activeTab === 'overview' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
            color: activeTab === 'overview' ? '#818CF8' : 'var(--text-muted)',
            border: activeTab === 'overview' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent'
          }}
        >
          <BarChart3 size={16} />
          <span>Dashboard & Analytics</span>
        </button>

        <button
          onClick={() => setActiveTab('calendar')}
          className="nav-tab-btn"
          style={{
            background: activeTab === 'calendar' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
            color: activeTab === 'calendar' ? '#818CF8' : 'var(--text-muted)',
            border: activeTab === 'calendar' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent'
          }}
        >
          <CalendarIcon size={16} />
          <span>Journal Calendar</span>
        </button>

        <button
          onClick={() => setActiveTab('executions')}
          className="nav-tab-btn"
          style={{
            background: activeTab === 'executions' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
            color: activeTab === 'executions' ? '#818CF8' : 'var(--text-muted)',
            border: activeTab === 'executions' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent'
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
          className="nav-tab-btn"
          style={{
            background: activeTab === 'journal' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
            color: activeTab === 'journal' ? '#818CF8' : 'var(--text-muted)',
            border: activeTab === 'journal' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent'
          }}
        >
          <BookOpen size={16} />
          <span>Journal & Psychology</span>
        </button>
      </nav>
    </header>
  );
}
