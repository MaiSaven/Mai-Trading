import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import MetricsCards from './components/MetricsCards';
import PnLChart from './components/PnLChart';
import OpenPositions from './components/OpenPositions';
import TradeList from './components/TradeList';
import TradingCalendar from './components/TradingCalendar';
import JournalTab from './components/JournalTab';
import JournalModal from './components/JournalModal';
import ManualTradeModal from './components/ManualTradeModal';
import LoginScreen from './components/LoginScreen';
import LinkAccountModal from './components/LinkAccountModal';
import { useAuth } from './context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export default function App() {
  const { user, token, isLoading, logout } = useAuth();

  const [accounts, setAccounts] = useState([]);
  const [activeAccountId, setActiveAccountId] = useState(null);
  // Ref so interval callbacks always read the latest value (avoids stale closure)
  const activeAccountRef = useRef(null);

  const [summary, setSummary] = useState(null);
  const [trades, setTrades] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toast, setToast] = useState(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isLinkingAccount, setIsLinkingAccount] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

  // Fetch analytics, trades, sync/status once — NOT on an interval.
  // Open Positions polling is handled inside <OpenPositions> itself.
  const fetchData = async (showSpinner = false, accountId = activeAccountRef.current) => {
    if (showSpinner) setIsRefreshing(true);
    try {
      const acctParam = accountId ? `?account_id=${accountId}` : '';
      const [sumRes, tradesRes, statusRes] = await Promise.all([
        fetch(`${API_BASE}/analytics/summary${acctParam}`, { headers: authHeaders }).catch(() => null),
        fetch(`${API_BASE}/trades${acctParam}`, { headers: authHeaders }).catch(() => null),
        fetch(`${API_BASE}/sync/status`, { headers: authHeaders }).catch(() => null)
      ]);

      if (sumRes && sumRes.ok) setSummary(await sumRes.json());
      if (tradesRes && tradesRes.ok) setTrades(await tradesRes.json());
      if (statusRes && statusRes.ok) setSyncStatus(await statusRes.json());
    } catch (err) {
      console.error("Dashboard refresh error:", err);
    } finally {
      if (showSpinner) setIsRefreshing(false);
    }
  };

  // Fetch accounts once; auto-select first account if nothing is active yet
  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API_BASE}/accounts`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
        // Auto-select only if no account has been chosen yet
        if (activeAccountRef.current === null && data.length > 0) {
          activeAccountRef.current = data[0].account_id;
          setActiveAccountId(data[0].account_id);
          fetchData(true, data[0].account_id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    }
  };

  // Switch account: update ref immediately so next poll uses the new value
  const handleSwitchAccount = (id) => {
    activeAccountRef.current = id;
    setActiveAccountId(id);
    fetchData(true, id);
  };

  useEffect(() => {
    if (!user) return;
    // Fetch accounts once — no polling. Analytics/trades load on account select.
    fetchAccounts();
  }, [user, token]);

  const handleSaveJournal = async (journalData) => {
    try {
      const res = await fetch(`${API_BASE}/journal`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(journalData)
      });
      if (res.ok) {
        showToast("Reflection and psychology saved successfully!");
        fetchData();
      } else {
        showToast("Failed to save reflection.", "error");
      }
    } catch (err) {
      showToast("Network error saving reflection.", "error");
    }
  };

  const handleManualTrade = async (tradeData) => {
    try {
      const res = await fetch(`${API_BASE}/trades`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(tradeData)
      });
      if (res.ok) {
        showToast(`Trade for ${tradeData.symbol} recorded!`);
        fetchData();
      } else {
        showToast("Failed to add trade.", "error");
      }
    } catch (err) {
      showToast("Network error creating trade.", "error");
    }
  };

  const handleDeleteTrade = async (tradeId) => {
    if (!window.confirm("Are you sure you want to delete this trade record?")) return;
    try {
      const res = await fetch(`${API_BASE}/trades/${tradeId}`, {
        method: "DELETE",
        headers: authHeaders
      });
      if (res.ok) {
        showToast("Trade deleted.");
        fetchData();
      }
    } catch (err) {
      showToast("Error deleting trade.", "error");
    }
  };

  const handleSeedDemo = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch(`${API_BASE}/sync/seed-demo`, {
        method: "POST",
        headers: authHeaders
      });
      if (res.ok) {
        showToast("Demo trades and reflections seeded successfully!");
        await fetchData(true);
      }
    } catch (err) {
      showToast("Failed to seed demo data.", "error");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClaimAccount = async (accountId, broker = null) => {
    setIsLinkingAccount(true);
    try {
      const payload = { account_id: accountId };
      if (broker) payload.broker = broker;

      const res = await fetch(`${API_BASE}/accounts/claim`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || `MT5 Account linked successfully!`);
        await fetchAccounts(); // refresh account list
        return { success: true };
      } else {
        const msg = data.detail || 'Failed to link account.';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    } catch (err) {
      const msg = 'Network error while linking account.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    } finally {
      setIsLinkingAccount(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-main, #0b0f19)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="pulsing-indicator" style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
            margin: '0 auto 16px',
            boxShadow: '0 0 25px rgba(99, 102, 241, 0.45)'
          }} />
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Authenticating trader profile...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="app-main-container">

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          background: toast.type === 'error' ? 'rgba(159, 18, 57, 0.95)' : 'rgba(6, 78, 59, 0.95)',
          border: toast.type === 'error' ? '1px solid #f43f5e' : '1px solid #10b981',
          color: '#FFFFFF',
          padding: '12px 20px',
          borderRadius: '12px',
          fontSize: '0.85rem',
          fontWeight: 600,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 15px rgba(0,0,0,0.3)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          maxWidth: '460px',
          lineHeight: 1.45,
          backdropFilter: 'none'
        }} className="animate-fade-in">
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header with Navigation and Sync Status */}
      <Header
        syncStatus={syncStatus}
        summary={summary}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onRefresh={() => fetchData(true)}
        onOpenManualModal={() => setIsManualModalOpen(true)}
        isRefreshing={isRefreshing}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSwitchAccount={handleSwitchAccount}
        user={user}
        onLogout={logout}
        onLinkAccount={() => setIsLinkModalOpen(true)}
      />

      {/* Hero Metric Cards */}
      <MetricsCards summary={summary} />

      {/* Tab 1: Dashboard & Analytics Overview */}
      {activeTab === 'overview' && (
        <div className="animate-fade-in">
          <PnLChart summary={summary} />
          <OpenPositions accountId={activeAccountId} token={token} />
          <TradeList
            trades={trades}
            onSelectTrade={(t) => setSelectedTrade(t)}
            onDeleteTrade={handleDeleteTrade}
          />
        </div>
      )}

      {/* Tab 2: Interactive Trading Journal Calendar */}
      {activeTab === 'calendar' && (
        <div className="animate-fade-in">
          <TradingCalendar
            trades={trades}
            onSelectTrade={(t) => setSelectedTrade(t)}
          />
        </div>
      )}

      {/* Tab 3: Execution Log */}
      {activeTab === 'executions' && (
        <div className="animate-fade-in">
          <OpenPositions accountId={activeAccountId} token={token} />
          <TradeList
            trades={trades}
            onSelectTrade={(t) => setSelectedTrade(t)}
            onDeleteTrade={handleDeleteTrade}
          />
        </div>
      )}

      {/* Tab 4: Trading Journal & Psychology Playbook */}
      {activeTab === 'journal' && (
        <div className="animate-fade-in">
          <JournalTab
            trades={trades}
            onSelectTrade={(t) => setSelectedTrade(t)}
          />
        </div>
      )}

      {/* Journal Reflection Modal */}
      {selectedTrade && (
        <JournalModal
          trade={selectedTrade}
          onClose={() => setSelectedTrade(null)}
          onSave={handleSaveJournal}
        />
      )}

      {/* Manual Trade Entry Modal */}
      {isManualModalOpen && (
        <ManualTradeModal
          onClose={() => setIsManualModalOpen(false)}
          onSave={handleManualTrade}
        />
      )}

      {/* Link / Claim MT5 Account Modal */}
      <LinkAccountModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onClaimAccount={handleClaimAccount}
        isSubmitting={isLinkingAccount}
        user={user}
        token={token}
      />
    </div>
  );
}
