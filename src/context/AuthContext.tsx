import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, setAuthToken } from '../api/client.ts';
import type { AuthUser, CompanyInfo } from '../types/nexora.ts';

interface AuthContextValue {
  user: AuthUser | null;
  company: CompanyInfo | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  demoLogin: (userId: string) => Promise<void>;
  registerCompany: (payload: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: AuthUser; company: CompanyInfo | null; token?: string }>('/api/auth/me');
      if (data.token) setAuthToken(data.token);
      setUser(data.user);
      setCompany(data.company);
    } catch {
      setAuthToken(null);
      setUser(null);
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: AuthUser; company: CompanyInfo | null }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(res.token);
    setUser(res.user);
    setCompany(res.company);
  };

  const demoLogin = async (userId: string) => {
    const res = await apiFetch<{ token: string; user: AuthUser; company: CompanyInfo | null }>('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    setAuthToken(res.token);
    setUser(res.user);
    setCompany(res.company);
  };

  const registerCompany = async (payload: Record<string, unknown>) => {
    const res = await apiFetch<{ token: string; user: AuthUser; company: CompanyInfo | null }>(
      '/api/auth/register-company',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    setAuthToken(res.token);
    setUser(res.user);
    setCompany(res.company);
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
    setCompany(null);
  };

  return (
    <AuthContext.Provider value={{ user, company, loading, login, demoLogin, registerCompany, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
