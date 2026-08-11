"use client";

import { useState, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
import NetworkBackground from '@/components/NetworkBackground';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''));
  const [otpEmail, setOtpEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const { login, verifyOtp } = useAuth();
  const router = useRouter();
  const otpRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null));

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
      await verifyOtp(username, otpDigits.join(''));
      router.push('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OTP verification failed';
      setError(msg);
      if (msg.toLowerCase().includes('expired')) {
        setOtpSent(false);
        setOtpDigits(Array(6).fill(''));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (val: string, i: number) => {
    const digit = val.replace(/\D/g, '');
    if (!digit) return;
    const next = [...otpDigits];
    next[i] = digit;
    setOtpDigits(next);
    if (i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[i] && i > 0) {
        const prev = [...otpDigits];
        prev[i - 1] = '';
        setOtpDigits(prev);
        otpRefs.current[i - 1]?.focus();
      } else {
        const prev = [...otpDigits];
        prev[i] = '';
        setOtpDigits(prev);
      }
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const data = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!data) return;
    const next = [...otpDigits];
    for (let i = 0; i < data.length; i++) {
      next[i] = data[i];
    }
    setOtpDigits(next);
    const focusIdx = Math.min(data.length, 5);
    otpRefs.current[focusIdx]?.focus();
  };

  const resetOtp = () => {
    setRequiresOtp(false);
    setOtpDigits(Array(6).fill(''));
    setOtpSent(false);
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative bg-gray-100 dark:bg-[rgb(10,10,10)]">
      <NetworkBackground />
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-cyan-500/5 dark:from-blue-500/10 dark:via-transparent dark:to-cyan-500/10 pointer-events-none" />

      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div
        className="max-w-md w-full p-8 rounded-2xl shadow-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-white/20 dark:border-white/5 shadow-blue-900/10 dark:shadow-black/30 animate-fade-slide-up"
        suppressHydrationWarning
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-[rgb(249,250,251)]">
            Super Apps
          </h1>
          <p className="mt-2 text-gray-500 dark:text-[rgb(209,213,219)]">
            IT Management System
          </p>
        </div>

        {!requiresOtp ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 rounded-xl text-sm bg-red-100 dark:bg-[rgb(127,29,29)] text-red-800 dark:text-[rgb(254,202,202)]">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-900 dark:text-[rgb(249,250,251)]">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border rounded-xl transition-all duration-200 bg-white dark:bg-[rgb(55,65,81)] border-gray-200 dark:border-gray-600 text-gray-900 dark:text-[rgb(249,250,251)]"
                  required
                  suppressHydrationWarning
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-900 dark:text-[rgb(249,250,251)]">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border rounded-xl transition-all duration-200 bg-white dark:bg-[rgb(55,65,81)] border-gray-200 dark:border-gray-600 text-gray-900 dark:text-[rgb(249,250,251)]"
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
              className="w-full px-4 py-3 rounded-xl transition-all duration-200 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium disabled:opacity-70 disabled:active:scale-100"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="space-y-6">
            {error && (
              <div className="p-3 rounded-xl text-sm bg-red-100 dark:bg-[rgb(127,29,29)] text-red-800 dark:text-[rgb(254,202,202)]">
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
                className="w-full px-4 py-3 rounded-xl transition-all duration-200 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium disabled:opacity-70 disabled:active:scale-100"
              >
                {otpLoading ? 'Sending...' : 'Send OTP Code'}
              </button>
            ) : (
              <>
                <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                  ✅ OTP sent! Check your email.
                </div>

                <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                  {Array.from({ length: 6 }, (_, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={otpDigits[i]}
                      onChange={(e) => handleOtpChange(e.target.value, i)}
                      onKeyDown={(e) => handleOtpKeyDown(e, i)}
                      className="w-11 h-14 text-center text-xl font-semibold rounded-xl border transition-all duration-200 bg-white dark:bg-[rgb(55,65,81)] border-gray-200 dark:border-gray-600 text-gray-900 dark:text-[rgb(249,250,251)] focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
                      autoFocus={i === 0}
                      required
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={loading || otpDigits.some((d) => !d)}
                  className="w-full px-4 py-3 rounded-xl transition-all duration-200 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium disabled:opacity-70 disabled:active:scale-100"
                >
                  {loading ? 'Verifying...' : 'Verify'}
                </button>

                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={otpLoading}
                  className="w-full px-4 py-3 rounded-xl transition-all duration-200 bg-transparent text-gray-500 dark:text-[rgb(209,213,219)] border border-gray-200 dark:border-gray-600 text-sm hover:bg-gray-100 dark:hover:bg-white/5"
                >
                  {otpLoading ? 'Resending...' : 'Resend Code'}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={resetOtp}
              className="w-full px-4 py-3 rounded-xl transition-all duration-200 bg-transparent text-gray-500 dark:text-[rgb(209,213,219)] border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              Back to Login
            </button>
          </form>
        )}

        {!requiresOtp && (
          <div className="mt-6 text-center space-y-2">
            <a href="/reset-password" className="text-sm font-medium hover:underline block text-gray-500 dark:text-[rgb(209,213,219)] hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200">
              Forgot password?
            </a>
            <a href="/register" className="text-sm font-medium hover:underline block text-gray-500 dark:text-[rgb(209,213,219)] hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200">
              Don&apos;t have an account? Register
            </a>
          </div>
        )}
      </div>

      <div className="fixed bottom-4 left-0 right-0 text-center">
        <p className="text-base text-gray-400 dark:text-gray-600">
          © 2026 Super Apps — Built with ❤️ by{' '}
          <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 font-mono tracking-wider">
            [ Soni ]
          </span>
        </p>
      </div>
    </div>
  );
}
