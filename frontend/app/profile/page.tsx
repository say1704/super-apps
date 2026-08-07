"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, authFetch } from '@/lib/auth';
import { getToken } from '@/lib/token-manager';

const PROXY = '/api/proxy/api/v1';

interface TwoFAStatus {
  enabled: boolean;
}

interface TwoFASetup {
  secret: string;
  qr_code_uri: string;
  manual_entry_key: string;
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [twoFAStatus, setTwoFAStatus] = useState<TwoFAStatus | null>(null);
  const [twoFASetup, setTwoFASetup] = useState<TwoFASetup | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [password, setPassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push('/login');
      return;
    }
    fetchTwoFAStatus();
  }, []);

  const fetchTwoFAStatus = async () => {
    try {
      const data = await authFetch('/auth/2fa/status');
      setTwoFAStatus(data);
    } catch (err) {
      console.error('Failed to fetch 2FA status:', err);
    }
  };

  const handleSetup2FA = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const response = await fetch(`${PROXY}/auth/2fa/setup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
        },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to setup 2FA');
      }
      const data = await response.json();
      setTwoFASetup(data);
      setShowSetup(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const response = await fetch(`${PROXY}/auth/2fa/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: twoFACode }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Invalid code');
      }
      setSuccess('2FA enabled successfully!');
      setShowSetup(false);
      setTwoFASetup(null);
      setTwoFACode('');
      fetchTwoFAStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const response = await fetch(`${PROXY}/auth/2fa/disable`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password, code: disableCode }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to disable 2FA');
      }
      setSuccess('2FA disabled successfully!');
      setShowDisable(false);
      setPassword('');
      setDisableCode('');
      fetchTwoFAStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setError('');
    setSuccess('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${PROXY}/settings/users/${user?.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to change password');
      }
      setSuccess('Password changed successfully!');
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div
      className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900"
    >
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Profile Settings
          </h1>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-lg transition-colors bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"
          >
            Back
          </button>
        </div>

        {error && (
          <div
            className="p-3 rounded-lg mb-4 text-sm bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            className="p-3 rounded-lg mb-4 text-sm bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300"
          >
            {success}
          </div>
        )}

        <div
          className="p-6 rounded-lg shadow-lg mb-6 bg-white dark:bg-gray-800"
        >
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            User Information
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Username</label>
              <p className="font-medium text-gray-900 dark:text-white">{user.username}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Full Name</label>
              <p className="font-medium text-gray-900 dark:text-white">{user.full_name || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Role</label>
              <p className="font-medium text-gray-900 dark:text-white">{user.role}</p>
            </div>
          </div>
        </div>

        <div
          className="p-6 rounded-lg shadow-lg mb-6 bg-white dark:bg-gray-800"
        >
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Two-Factor Authentication
          </h2>
          
          {twoFAStatus && (
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Status: {twoFAStatus.enabled ? (
                    <span className="text-green-600">Enabled</span>
                  ) : (
                    <span className="text-red-600">Disabled</span>
                  )}
                </p>
                <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
                  {twoFAStatus.enabled 
                    ? 'Your account is protected with 2FA' 
                    : 'Enable 2FA for additional security'}
                </p>
              </div>
              {!twoFAStatus.enabled ? (
                <button
                  onClick={handleSetup2FA}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg transition-colors bg-blue-600 text-white disabled:opacity-70"
                >
                  {loading ? 'Loading...' : 'Enable 2FA'}
                </button>
              ) : (
                <button
                  onClick={() => setShowDisable(true)}
                  className="px-4 py-2 rounded-lg transition-colors bg-red-600 text-white"
                >
                  Disable 2FA
                </button>
              )}
            </div>
          )}

          {showSetup && twoFASetup && (
            <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
              <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">
                Setup 2FA with Authenticator App
              </h3>
              <p className="text-sm mb-4 text-gray-500 dark:text-gray-400">
                1. Open your authenticator app (Google Authenticator, Authy, etc.)
                <br />
                2. Scan the QR code below or enter the manual key
                <br />
                3. Enter the 6-digit code to verify
              </p>
              
              <div className="flex flex-col items-center mb-4">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(twoFASetup.qr_code_uri)}`}
                  alt="2FA QR Code"
                  className="w-48 h-48 border rounded-lg border-gray-200 dark:border-gray-700"
                />
              </div>

              <div className="mb-4">
                <label className="text-sm text-gray-500 dark:text-gray-400">
                  Manual Entry Key
                </label>
                <p
                  className="font-mono text-lg p-2 rounded mt-1 text-center bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"
                >
                  {twoFASetup.manual_entry_key}
                </p>
              </div>

              <div className="mb-4">
                <label className="text-sm mb-1 block text-gray-900 dark:text-white">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={twoFACode}
                  onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-4 py-2 border rounded-lg text-center text-2xl tracking-widest bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                  placeholder="000000"
                  maxLength={6}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleVerify2FA}
                  disabled={loading || twoFACode.length !== 6}
                  className="flex-1 px-4 py-2 rounded-lg transition-colors bg-blue-600 text-white disabled:opacity-70"
                >
                  {loading ? 'Verifying...' : 'Verify & Enable'}
                </button>
                <button
                  onClick={() => {
                    setShowSetup(false);
                    setTwoFASetup(null);
                    setTwoFACode('');
                  }}
                  className="px-4 py-2 rounded-lg transition-colors bg-transparent text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showDisable && (
            <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
              <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">
                Disable 2FA
              </h3>
              <p className="text-sm mb-4 text-gray-500 dark:text-gray-400">
                Enter your password and current 2FA code to disable
              </p>
              
              <div className="space-y-3">
                <div>
                  <label className="text-sm mb-1 block text-gray-900 dark:text-white">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-sm mb-1 block text-gray-900 dark:text-white">
                    2FA Code
                  </label>
                  <input
                    type="text"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-2 border rounded-lg text-center text-xl tracking-widest bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDisable2FA}
                    disabled={loading || !password || disableCode.length !== 6}
                    className="flex-1 px-4 py-2 rounded-lg transition-colors bg-red-600 text-white disabled:opacity-70"
                  >
                    {loading ? 'Disabling...' : 'Disable 2FA'}
                  </button>
                  <button
                    onClick={() => {
                      setShowDisable(false);
                      setPassword('');
                      setDisableCode('');
                    }}
                    className="px-4 py-2 rounded-lg transition-colors bg-transparent text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          className="p-6 rounded-lg shadow-lg bg-white dark:bg-gray-800"
        >
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Change Password
          </h2>
          
          {!showChangePassword ? (
            <button
              onClick={() => setShowChangePassword(true)}
              className="px-4 py-2 rounded-lg transition-colors bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"
            >
              Change Password
            </button>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-sm mb-1 block text-gray-900 dark:text-white">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-sm mb-1 block text-gray-900 dark:text-white">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleChangePassword}
                  disabled={loading || !newPassword || !confirmPassword}
                  className="flex-1 px-4 py-2 rounded-lg transition-colors bg-blue-600 text-white disabled:opacity-70"
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setShowChangePassword(false);
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                  className="px-4 py-2 rounded-lg transition-colors bg-transparent text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
