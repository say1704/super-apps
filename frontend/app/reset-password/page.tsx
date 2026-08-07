"use client";

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const PROXY = '/api/proxy/api/v1';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tokenFromUrl = searchParams.get('token');
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      setStep('reset');
    }
  }, [searchParams]);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await fetch(`${PROXY}/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.reset_token) {
          setToken(data.reset_token);
          setStep('reset');
          setMessage('Token generated. Enter your new password below.');
        } else {
          setMessage(data.message || 'Reset token has been sent to your email');
        }
      } else {
        setError(data.detail || 'Failed to request password reset');
      }
    } catch (err) {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${PROXY}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_token: token, new_password: newPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('Password reset successful! Redirecting to login...');
        setTimeout(() => router.push('/login'), 2000);
      } else {
        setError(data.detail || 'Failed to reset password');
      }
    } catch (err) {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative bg-gray-100 dark:bg-[rgb(10,10,10)]">
      <div className="max-w-md w-full p-8 rounded-lg shadow-lg bg-white dark:bg-[rgb(31,41,55)]" suppressHydrationWarning>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-[rgb(249,250,251)]">
            🔑 Reset Password
          </h1>
          <p className="mt-2 text-gray-500 dark:text-[rgb(209,213,219)]">
            {step === 'request' ? 'Request a password reset token' : 'Set your new password'}
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg text-sm mb-4 bg-red-100 dark:bg-[rgb(127,29,29)] text-red-800 dark:text-[rgb(254,202,202)]">
            {error}
          </div>
        )}

        {message && (
          <div className="p-3 rounded-lg text-sm mb-4 bg-green-100 dark:bg-[rgb(21,128,61)] text-green-800 dark:text-[rgb(187,247,208)]">
            {message}
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={handleRequest} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-[rgb(249,250,251)]">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-[rgb(55,65,81)] border-gray-300 dark:border-[rgb(75,85,99)] text-gray-900 dark:text-[rgb(249,250,251)]"
                placeholder="Enter your username"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 rounded-lg transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-70"
            >
              {loading ? 'Sending...' : 'Request Reset Token'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-[rgb(249,250,251)]">
                Reset Token
              </label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg font-mono bg-white dark:bg-[rgb(55,65,81)] border-gray-300 dark:border-[rgb(75,85,99)] text-gray-900 dark:text-[rgb(249,250,251)]"
                placeholder="Enter reset token"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-[rgb(249,250,251)]">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 pr-12 border rounded-lg bg-white dark:bg-[rgb(55,65,81)] border-gray-300 dark:border-[rgb(75,85,99)] text-gray-900 dark:text-[rgb(249,250,251)]"
                  placeholder="Min 8 characters"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  title={showPassword ? 'Hide' : 'Show'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-[rgb(249,250,251)]">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-[rgb(55,65,81)] border-gray-300 dark:border-[rgb(75,85,99)] text-gray-900 dark:text-[rgb(249,250,251)]"
                placeholder="Re-enter password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 rounded-lg transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-70"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/login')}
            className="text-sm font-medium text-gray-500 dark:text-[rgb(209,213,219)] hover:underline"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-[rgb(10,10,10)] text-gray-900 dark:text-white">Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
