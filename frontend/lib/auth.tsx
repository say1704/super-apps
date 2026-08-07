"use client";

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clearToken } from './token-manager';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'backend';
const API_BASE = '/api/v1';

// Token persistence via sessionStorage (survives page refresh, cleared on tab close)
const TOKEN_KEY = 'sa_auth_token';
function _persistToken(token: string | null) {
  if (token) {
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch {}
  } else {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
  }
}
function _loadToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

interface User {
  id: number;
  username: string;
  full_name: string;
  role: string;
  modules?: string[];
  settings_tabs?: string[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  // True only while the initial /users/me bootstrap (from a stored token) is in flight.
  // Consumers MUST wait for this to be false before treating a null `user` as "logged out"
  // — otherwise a hard page load redirects to /login before auth resolves.
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ requiresOtp?: boolean; email?: string }>;
  verifyOtp: (username: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(_loadToken());
  // Start "loading" only when a token is present to bootstrap; with no token the
  // auth state is already resolved (unauthenticated).
  const [isLoading, setIsLoading] = useState<boolean>(() => !!_loadToken());
  const router = useRouter();

  useEffect(() => {
    const storedToken = _loadToken();
    if (!storedToken) { setIsLoading(false); return; }
    fetch(`/api/proxy${API_BASE}/users/me`, { headers: { 'Authorization': `Bearer ${storedToken}` } })
      .then(r => {
        if (r.ok) return r.json();
        return null;
      })
      .then(u => { if (u) setUser(u); })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (username: string, password: string): Promise<{ requiresOtp?: boolean; email?: string; otpToken?: string }> => {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    const response = await fetch(`/api/proxy${API_BASE}/token`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Login failed');
    }

    const data = await response.json();
    if (data.requires_otp) {
      if (data.otp_token) {
        sessionStorage.setItem('otp_token', data.otp_token);
      }
      return { requiresOtp: true, email: data.user?.email || '', otpToken: data.otp_token };
    }

    const newToken = data.access_token || null;
    setUser(data.user);
    setToken(newToken);
    _persistToken(newToken);
    return { requiresOtp: false };
  };

  const verifyOtp = async (username: string, code: string) => {
    const otpToken = sessionStorage.getItem('otp_token');
    const response = await fetch(`/api/proxy${API_BASE}/auth/otp/login-verify`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(otpToken ? { 'Authorization': `Bearer ${otpToken}` } : {}),
      },
      body: JSON.stringify({ username, code }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'OTP verification failed');
    }

    const data = await response.json();
    const newToken = data.access_token || null;
    setUser(data.user);
    setToken(newToken);
    _persistToken(newToken);
    sessionStorage.removeItem('otp_token');
  };

  const logout = async () => {
    setToken(null);
    _persistToken(null);
    await clearToken();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, verifyOtp, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function _buildAuthHeaders(options: RequestInit = {}): Record<string, string> {
  const headers: Record<string, string> = {};
  const method = (options.method || 'GET').toUpperCase();

  // Only add Content-Type for non-GET requests with body
  if (options.body && !(options.body instanceof FormData) && method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }

  // Add Authorization header from sessionStorage
  const storedToken = _loadToken();
  if (storedToken) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }

  // Merge with any user-provided headers
  if (options.headers) {
    Object.assign(headers, options.headers as Record<string, string>);
  }

  return headers;
}

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const headers = _buildAuthHeaders(options);
  let path = endpoint;
  if (path.startsWith('/api/v1')) { /* already versioned */ }
  else if (path.startsWith('/api/')) path = '/' + path.slice(5);
  if (!path.startsWith('/api/v1') && !path.startsWith('http')) path = `${API_BASE}${path}`;

  // Use local proxy to avoid self-signed cert issues in browser
  const proxyUrl = `/api/proxy${path}`;

  try {
    const response = await fetch(proxyUrl, {
      ...options,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        _persistToken(null);
        window.location.href = '/login';
        throw new Error('Session expired');
      }
      if (response.status === 409) {
        try {
          const errorData = await response.json();
          if (errorData.code === 'CONFLICT') {
            window.dispatchEvent(new CustomEvent('resource-conflict', {
              detail: { currentVersion: errorData.current_version, message: errorData.message },
            }));
          }
        } catch {}
        throw new Error('Conflict');
      }
      const errorText = await response.text();
      console.error(`API Error ${response.status}:`, errorText);
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  } catch (error: any) {
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      console.error('Network error - is backend running on', API_URL, '?');
      throw new Error('Failed to connect to backend. Please ensure backend is running on port 8001.');
    }
    throw error;
  }
}

export async function authFetch(url: string, options: RequestInit = {}) {
  const headers = _buildAuthHeaders(options);
  let path = url;
  if (path.startsWith('/api/v1')) { /* already versioned */ }
  else if (path.startsWith('/api/')) path = '/' + path.slice(5);
  if (!path.startsWith('/api/v1') && !path.startsWith('http')) path = `${API_BASE}${path}`;

  // Use local proxy to avoid self-signed cert issues in browser
  const fullUrl = url.startsWith('http') ? url : `/api/proxy${path}`;
  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      _persistToken(null);
      window.location.href = '/login';
      throw new Error('Session expired - please login again');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  } catch (error: any) {
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error(`Failed to connect to backend at ${API_URL}. Please ensure backend is running.`);
    }
    throw error;
  }
}
