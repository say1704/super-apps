"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';

const PROXY = '/api/proxy/api/v1';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${PROXY}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, full_name: fullName, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Registration failed');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center relative bg-gray-100 dark:bg-[rgb(10,10,10)]">
        <div className="fixed top-4 right-4">
          <ThemeToggle />
        </div>

        <div className="max-w-md w-full p-8 rounded-lg shadow-lg text-center bg-white dark:bg-[rgb(31,41,55)]" suppressHydrationWarning>
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-3 text-gray-900 dark:text-[rgb(249,250,251)]">
            Registration Submitted
          </h1>
          <p className="mb-6 text-gray-500 dark:text-[rgb(209,213,219)]">
            Your registration is waiting for admin approval. You will receive an email once your account is approved.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="w-full px-4 py-2 rounded-lg transition-colors bg-blue-600 hover:bg-blue-700 text-white"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative bg-gray-100 dark:bg-[rgb(10,10,10)]">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="max-w-md w-full p-8 rounded-lg shadow-lg bg-white dark:bg-[rgb(31,41,55)]" suppressHydrationWarning>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-[rgb(249,250,251)]">
            Register
          </h1>
          <p className="mt-2 text-gray-500 dark:text-[rgb(209,213,219)]">
            Create your Super Apps account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-[rgb(249,250,251)]">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-[rgb(55,65,81)] border-gray-300 dark:border-[rgb(75,85,99)] text-gray-900 dark:text-[rgb(249,250,251)]"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-[rgb(249,250,251)]">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-[rgb(55,65,81)] border-gray-300 dark:border-[rgb(75,85,99)] text-gray-900 dark:text-[rgb(249,250,251)]"
              required
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

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-[rgb(249,250,251)]">
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-[rgb(55,65,81)] border-gray-300 dark:border-[rgb(75,85,99)] text-gray-900 dark:text-[rgb(249,250,251)]"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-70"
          >
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <a href="/login" className="text-sm font-medium hover:underline text-gray-500 dark:text-[rgb(209,213,219)]">
            Already have an account? Login
          </a>
        </div>
      </div>
    </div>
  );
}
