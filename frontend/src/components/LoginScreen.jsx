import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { 
  Activity, 
  ShieldCheck, 
  Sparkles, 
  Lock, 
  ExternalLink, 
  AlertCircle,
  ArrowRight,
  TrendingUp,
  BrainCircuit
} from 'lucide-react';

export default function LoginScreen() {
  const { isConfigured, loginWithGoogle, loginDemo } = useAuth();
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleSuccess = async (credentialResponse) => {
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      if (!credentialResponse?.credential) {
        throw new Error("No credential received from Google");
      }
      const res = await loginWithGoogle(credentialResponse.credential);
      if (!res.success) {
        setErrorMsg(res.error || "Failed to sign in with Google");
      }
    } catch (err) {
      setErrorMsg(err.message || "An unexpected error occurred during Google sign in");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleError = () => {
    setErrorMsg("Google Sign-In popup was closed or authorization failed.");
  };

  const handleDemoSignIn = async () => {
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const res = await loginDemo();
      if (!res.success) {
        setErrorMsg(res.error || "Failed to sign in with Demo user");
      }
    } catch (err) {
      setErrorMsg(err.message || "Demo sign in error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background ambient glowing orbs */}
      <div style={{
        position: 'absolute',
        top: '15%',
        left: '20%',
        width: '450px',
        height: '450px',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(0, 0, 0, 0) 70%)',
        borderRadius: '50%',
        pointerEvents: 'none',
        filter: 'blur(50px)'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '15%',
        right: '20%',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, rgba(0, 0, 0, 0) 70%)',
        borderRadius: '50%',
        pointerEvents: 'none',
        filter: 'blur(50px)'
      }} />

      {/* Main Login Card */}
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '460px',
        padding: '40px 32px',
        position: 'relative',
        zIndex: 10,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(99, 102, 241, 0.15)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(20px)'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
            boxShadow: '0 8px 24px rgba(79, 70, 229, 0.4)',
            marginBottom: '16px'
          }}>
            <Activity size={28} color="#ffffff" />
          </div>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '9999px',
            padding: '4px 12px',
            fontSize: '0.72rem',
            color: '#a5b4fc',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '10px'
          }}>
            <Lock size={12} />
            Secure Trader Portal
          </div>

          <h1 style={{
            fontSize: '1.65rem',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-0.02em',
            margin: '0 0 8px 0'
          }}>
            MAI TRADING
          </h1>
          <p style={{
            color: 'var(--text-dim)',
            fontSize: '0.875rem',
            lineHeight: 1.5,
            margin: 0
          }}>
            Automated MT5 Trading Journal, Real-Time PnL Analytics & Psychology Playbook
          </p>
        </div>

        {/* Feature Highlights */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.25)',
          borderRadius: '12px',
          padding: '14px 16px',
          marginBottom: '28px',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <TrendingUp size={15} color="#34D399" />
            <span>Real-time deal matching & multi-account tracking</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <BrainCircuit size={15} color="#818CF8" />
            <span>Psychological reflections & strategy win-rate analysis</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <ShieldCheck size={15} color="#06B6D4" />
            <span>Private self-hosted database on PostgreSQL</span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#FCA5A5',
            fontSize: '0.82rem'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Sign In Options */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px'
        }}>
          {isConfigured ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <div style={{ opacity: isSubmitting ? 0.6 : 1, pointerEvents: isSubmitting ? 'none' : 'auto' }}>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  theme="filled_black"
                  shape="pill"
                  size="large"
                  text="signin_with"
                  width="340"
                />
              </div>

              {isSubmitting && (
                <div style={{ fontSize: '0.8rem', color: '#818CF8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={14} className="pulsing-indicator" />
                  <span>Verifying credentials...</span>
                </div>
              )}

              {/* Secondary Demo bypass */}
              <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px', width: '100%', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={handleDemoSignIn}
                  disabled={isSubmitting}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-dim)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
                >
                  Or enter with Developer Demo Mode
                </button>
              </div>
            </div>
          ) : (
            <div style={{ width: '100%' }}>
              {/* Setup Guidance Box */}
              <div style={{
                background: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '18px',
                fontSize: '0.82rem',
                color: 'var(--text-muted)',
                lineHeight: 1.5
              }}>
                <div style={{ fontWeight: 700, color: '#A5B4FC', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={15} />
                  Google Client ID Setup
                </div>
                <p style={{ margin: '0 0 8px 0', fontSize: '0.78rem' }}>
                  To enable Google Sign-In, create an OAuth Client ID in Google Cloud Console and paste it into <code style={{ color: '#E0E7FF', background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '4px' }}>frontend/.env</code>:
                </p>
                <div style={{ background: 'rgba(0,0,0,0.4)', padding: '8px 10px', borderRadius: '6px', fontSize: '0.73rem', fontFamily: 'monospace', color: '#34D399', wordBreak: 'break-all' }}>
                  VITE_GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
                </div>
              </div>

              {/* Developer / Demo Login Action */}
              <button
                type="button"
                onClick={handleDemoSignIn}
                disabled={isSubmitting}
                className="btn-primary"
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)'
                }}
              >
                <span>{isSubmitting ? "Signing in..." : "Enter Dashboard (Developer Mode)"}</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div style={{
          marginTop: '28px',
          textAlign: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-dim)',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          paddingTop: '16px'
        }}>
          MAI Trading Platform v2.0 • Protected by Google OAuth 2.0
        </div>
      </div>
    </div>
  );
}

