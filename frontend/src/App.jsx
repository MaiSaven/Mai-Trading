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

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [activeAccountId, setActiveAccountId] = useState(null);
  // Ref so interval callbacks always read the latest value (avoids stale closure)
  const activeAccountRef = useRef(null);

  const [summary, setSummary] = useState(null);
  const [trades, setTrades] = useState([]);
  const [positions, setPositions] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Always read account from the ref so interval never uses a stale closure value
  const fetchData = async (showSpinner = false, accountId = activeAccountRef.current) => {
    if (showSpinner) setIsRefreshing(true);
    try {
      const acctParam = accountId ? `?account_id=${accountId}` : '';
      const [sumRes, tradesRes, posRes, statusRes] = await Promise.all([
        fetch(`${API_BASE}/analytics/summary${acctParam}`).catch(() => null),
        fetch(`${API_BASE}/trades${acctParam}`).catch(() => null),
        fetch(`${API_BASE}/positions${acctParam}`).catch(() => null),
        fetch(`${API_BASE}/sync/status`).catch(() => null)
      ]);

      if (sumRes && sumRes.ok) setSummary(await sumRes.json());
      if (tradesRes && tradesRes.ok) setTrades(await tradesRes.json());
      if (posRes && posRes.ok) setPositions(await posRes.json());
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
      const res = await fetch(`${API_BASE}/accounts`);
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
    // Fetch accounts once on mount, then start polling only dashboard data
    fetchAccounts();
    const interval = setInterval(() => {
      fetchData(false); // uses activeAccountRef.current — always current
    }, 10000); // 10s is enough; real-time feel without hammering
    return () => clearInterval(interval);
  }, []); // empty deps — no stale closure risk because we use the ref

  const handleSaveJournal = async (journalData) => {
    try {
      const res = await fetch(`${API_BASE}/journal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
        method: "DELETE"
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
        method: "POST"
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

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px 60px' }}>
      
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: toast.type === 'error' ? '#E11D48' : '#10B981',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '10px',
          fontSize: '0.875rem',
          fontWeight: 600,
          boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
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
      />

      {/* Hero Metric Cards */}
      <MetricsCards summary={summary} />

      {/* Tab 1: Dashboard & Analytics Overview */}
      {activeTab === 'overview' && (
        <div className="animate-fade-in">
          <PnLChart summary={summary} />
          <OpenPositions positions={positions} />
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
          <OpenPositions positions={positions} />
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
    </div>
  );
}
