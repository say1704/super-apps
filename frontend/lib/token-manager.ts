// frontend/lib/token-manager.ts
// httpOnly cookie auth — browser handles token storage automatically

const PROXY_BASE = '/api/proxy/api/v1';

// No-op: cookies are set by backend via Set-Cookie headers
export const saveToken = (_token: string, _user: any): void => {};

// Cannot read httpOnly cookies from JS
export const getToken = (): string | null => null;

// No longer stored in localStorage
export const getUser = (): any | null => null;

// Call logout endpoint to clear server-side session + cookies
export const clearToken = async (): Promise<void> => {
  try {
    await fetch(`${PROXY_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    // Ignore errors during logout
  }
};

// Cannot determine validity from httpOnly cookies — rely on API response status
export const isTokenValid = (): boolean => false;

// Refresh via cookie — no headers needed
export const refreshIfNeeded = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${PROXY_BASE}/token/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return response.ok;
  } catch {
    return false;
  }
};
