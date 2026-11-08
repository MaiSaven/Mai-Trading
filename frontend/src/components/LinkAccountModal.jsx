import React, { useState, useEffect } from 'react';
import { X, Shield, ArrowRight, HelpCircle, Building2, AlertCircle } from 'lucide-react';

export default function LinkAccountModal({ isOpen, onClose, onClaimAccount, isSubmitting, token }) {
  const [accountIdInput, setAccountIdInput] = useState('');
  const [selectedBroker, setSelectedBroker] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [brokerList, setBrokerList] = useState([]);
  const [loadingBrokers, setLoadingBrokers] = useState(false);

  // Fetch registered brokers from database when modal is open
  useEffect(() => {
    if (!isOpen || !token) return;
    const fetchBrokers = async () => {
      setLoadingBrokers(true);
      try {
        const res = await fetch('/api/v1/accounts/brokers', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setBrokerList(data);
        }
      } catch (e) {
        // silently fallback
      } finally {
        setLoadingBrokers(false);
      }
    };
    fetchBrokers();
  }, [isOpen, token]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const id = parseInt(accountIdInput.trim(), 10);
    if (!id || isNaN(id)) {
      setErrorMsg('Please enter a valid numeric MT5 account number.');
      return;
    }

    const result = await onClaimAccount(id, selectedBroker || null);
    if (result && result.success) {
      setAccountIdInput('');
      setSelectedBroker('');
      setErrorMsg('');
      onClose();
    } else if (result && result.error) {
      setErrorMsg(result.error);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '16px'
    }}>
      <div style={{
        background: '#131722',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '480px',
        maxHeight: '90vh',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(99, 102, 241, 0.2)',
        overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: 'rgba(99, 102, 241, 0.2)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              borderRadius: '10px',
              padding: '8px',
              display: 'flex'
            }}>
              <Shield size={18} color="#818CF8" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#F1F5F9' }}>
                Link MT5 Account
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted, #94A3B8)' }}>
                Connect your MetaTrader 5 account to your journal
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '22px' }}>
          <form onSubmit={handleSubmit}>
            {/* Account ID Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#E2E8F0',
                marginBottom: '6px'
              }}>
                MT5 Account Login Number <span style={{ color: '#F87171' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 55682561"
                value={accountIdInput}
                onChange={(e) => setAccountIdInput(e.target.value)}
                disabled={isSubmitting}
                autoFocus
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#FFFFFF',
                  fontSize: '0.95rem',
                  fontFamily: 'monospace',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Broker Dropdown */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#E2E8F0',
                marginBottom: '6px'
              }}>
                <Building2 size={13} color="#94A3B8" />
                <span>Select Broker</span>
              </label>
              <select
                value={selectedBroker}
                onChange={(e) => setSelectedBroker(e.target.value)}
                disabled={isSubmitting || loadingBrokers}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: selectedBroker ? '#FFFFFF' : '#94A3B8',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  cursor: 'pointer'
                }}
              >
                <option value="" style={{ background: '#131722', color: '#94A3B8' }}>
                  {loadingBrokers ? 'Loading brokers...' : '-- Select Broker --'}
                </option>
                {brokerList.map(b => (
                  <option 
                    key={b.id || b.name} 
                    value={b.name}
                    style={{ background: '#131722', color: '#FFFFFF' }}
                  >
                    {b.display || b.name}
                  </option>
                ))}
              </select>

              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94A3B8)', display: 'block', marginTop: '4px' }}>
                Select your broker to match your account.
              </span>
            </div>

            {/* High-Contrast Error Alert Box */}
            {errorMsg && (
              <div style={{
                background: 'rgba(225, 29, 72, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.5)',
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                boxShadow: '0 4px 12px rgba(225, 29, 72, 0.2)'
              }} className="animate-fade-in">
                <AlertCircle size={18} color="#FB7185" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.82rem', color: '#FFE4E6', lineHeight: 1.45, fontWeight: 500 }}>
                  {errorMsg}
                </div>
              </div>
            )}

            <div style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '20px',
              display: 'flex',
              gap: '10px'
            }}>
              <HelpCircle size={18} color="#60A5FA" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.76rem', color: '#CBD5E1', lineHeight: 1.45 }}>
                Ensure your MT5 account is connected and synced on the server before linking.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                style={{
                  padding: '9px 16px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#CBD5E1',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !accountIdInput.trim()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 18px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#FFFFFF',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: isSubmitting || !accountIdInput.trim() ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting || !accountIdInput.trim() ? 0.6 : 1
                }}
              >
                <span>{isSubmitting ? 'Linking...' : 'Link Account'}</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
