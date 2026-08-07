"use client";

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const { login, verifyOtp } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(username, password);
      if (result.requiresOtp) {
        setRequiresOtp(true);
        setOtpEmail(result.email || '');
        setLoading(false);
        return;
      }
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setError('');
    setOtpLoading(true);
    try {
      const otpToken = sessionStorage.getItem('otp_token');
      const response = await fetch('/api/proxy/api/v1/auth/otp/send', {
        method: 'POST',
        headers: otpToken ? { 'Authorization': `Bearer ${otpToken}` } : {},
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to send OTP');
      }
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await verifyOtp(username, otpCode);
      router.push('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OTP verification failed';
      setError(msg);
      if (msg.toLowerCase().includes('expired')) {
        setOtpSent(false);
        setOtpCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative bg-gray-100 dark:bg-[rgb(10,10,10)]">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="max-w-md w-full p-8 rounded-lg shadow-lg bg-white dark:bg-[rgb(31,41,58)]" suppressHydrationWarning>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-[rgb(249,250,251)]">
            🔒 Super Apps
          </h1>
          <p className="mt-2 text-gray-500 dark:text-[rgb(209,213,219)]">
            IT Management System
          </p>
        </div>

        {!requiresOtp ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 rounded-lg text-sm bg-red-100 dark:bg-[rgb(127,29,29)] text-red-800 dark:text-[rgb(254,202,202)]">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-[rgb(249,250,251)]">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-[rgb(55,65,81)] border-gray-300 dark:border-[rgb(75,85,99)] text-gray-900 dark:text-[rgb(249,250,251)]"
                required
                suppressHydrationWarning
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-[rgb(249,250,251)]">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 pr-12 border rounded-lg bg-white dark:bg-[rgb(55,65,81)] border-gray-300 dark:border-[rgb(75,85,99)] text-gray-900 dark:text-[rgb(249,250,251)]"
                  required
                  suppressHydrationWarning
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 rounded-lg transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-70"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="space-y-6">
            {error && (
              <div className="p-3 rounded-lg text-sm bg-red-100 dark:bg-[rgb(127,29,29)] text-red-800 dark:text-[rgb(254,202,202)]">
                {error}
              </div>
            )}

            <div className="text-center">
              <div className="text-4xl mb-2">📧</div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-[rgb(249,250,251)]">
                Email OTP Verification
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-[rgb(209,213,219)]">
                Code sent to <span className="font-medium">{otpEmail}</span>
              </p>
            </div>

            {!otpSent ? (
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={otpLoading}
                className="w-full px-4 py-2 rounded-lg transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-70"
              >
                {otpLoading ? 'Sending...' : 'Send OTP Code'}
              </button>
            ) : (
              <>
                <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                  ✅ OTP sent! Check your email.
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-[rgb(249,250,251)]">
                    OTP Code
                  </label>
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-2 border rounded-lg text-center text-2xl tracking-widest bg-white dark:bg-[rgb(55,65,81)] border-gray-300 dark:border-[rgb(75,85,99)] text-gray-900 dark:text-[rgb(249,250,251)]"
                    placeholder="000000"
                    maxLength={6}
                    required
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || otpCode.length !== 6}
                  className="w-full px-4 py-2 rounded-lg transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-70"
                >
                  {loading ? 'Verifying...' : 'Verify'}
                </button>

                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={otpLoading}
                  className="w-full px-4 py-2 rounded-lg transition-colors bg-transparent text-gray-500 dark:text-[rgb(209,213,219)] border border-gray-300 dark:border-[rgb(55,65,81)] text-sm"
                >
                  {otpLoading ? 'Resending...' : 'Resend Code'}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setRequiresOtp(false);
                setOtpCode('');
                setOtpSent(false);
                setError('');
              }}
              className="w-full px-4 py-2 rounded-lg transition-colors bg-transparent text-gray-500 dark:text-[rgb(209,213,219)] border border-gray-300 dark:border-[rgb(55,65,81)]"
            >
              Back to Login
            </button>
          </form>
        )}

        {!requiresOtp && (
          <div className="mt-4 text-center space-y-2">
            <a href="/reset-password" className="text-sm font-medium hover:underline block text-gray-500 dark:text-[rgb(209,213,219)]">
              Forgot password?
            </a>
            <a href="/register" className="text-sm font-medium hover:underline block text-gray-500 dark:text-[rgb(209,213,219)]">
              Don&apos;t have an account? Register
            </a>
          </div>
        )}
      </div>

      <div className="fixed bottom-4 left-0 right-0 text-center">
        <p className="text-sm text-gray-400 dark:text-gray-600">
          © 2026 Super Apps — Built by Soni
        </p>
      </div>
    </div>
  );
}
