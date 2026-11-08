import React, { createContext, useContext, useState, useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";
const ENV_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('mai_auth_token'));
  const [isLoading, setIsLoading] = useState(true);
  const [googleClientId, setGoogleClientId] = useState(ENV_CLIENT_ID);
  const [isConfigured, setIsConfigured] = useState(Boolean(ENV_CLIENT_ID && !ENV_CLIENT_ID.startsWith("your-")));

  // On mount, restore session if token exists
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        // Validate existing token with /auth/me
        const savedToken = localStorage.getItem('mai_auth_token');
        if (savedToken) {
          const meRes = await fetch(`${API_BASE}/auth/me`, {
            headers: {
              'Authorization': `Bearer ${savedToken}`
            }
          }).catch(() => null);

          if (meRes && meRes.ok) {
            const userData = await meRes.json();
            if (isMounted) {
              setUser(userData);
              setToken(savedToken);
            }
          } else {
            // Invalid or expired token
            localStorage.removeItem('mai_auth_token');
            if (isMounted) {
              setUser(null);
              setToken(null);
            }
          }
        }
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();
    return () => { isMounted = false; };
  }, []);

  // Google Login handler
  const loginWithGoogle = async (credential) => {
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Google authentication failed");
      }

      const data = await res.json();
      localStorage.setItem('mai_auth_token', data.access_token);
      setToken(data.access_token);
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (err) {
      console.error("Google login failed:", err);
      return { success: false, error: err.message };
    }
  };

  // Demo Login handler (allows logging in before Google Cloud Console credentials are set up)
  const loginDemo = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/demo-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Demo authentication failed");
      }

      const data = await res.json();
      localStorage.setItem('mai_auth_token', data.access_token);
      setToken(data.access_token);
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (err) {
      console.error("Demo login failed:", err);
      return { success: false, error: err.message };
    }
  };

  // Logout handler
  const logout = () => {
    localStorage.removeItem('mai_auth_token');
    setToken(null);
    setUser(null);
  };

  const contextValue = {
    user,
    token,
    isLoading,
    isConfigured,
    googleClientId,
    loginWithGoogle,
    loginDemo,
    logout
  };

  // Provide a safe fallback client ID so GoogleOAuthProvider does not throw if empty
  const activeClientId = googleClientId || "placeholder-client-id.apps.googleusercontent.com";

  return (
    <AuthContext.Provider value={contextValue}>
      <GoogleOAuthProvider clientId={activeClientId}>
        {children}
      </GoogleOAuthProvider>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

