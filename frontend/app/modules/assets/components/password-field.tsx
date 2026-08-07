"use client";

import { apiRequest } from "@/lib/auth";


import { useState } from 'react';

interface PasswordFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  showMasked?: boolean;
  assetId?: number;
}

export default function PasswordField({
  value = '',
  onChange,
  label = 'Password',
  placeholder = 'Enter password',
  required = false,
  disabled = false,
  showMasked = false,
  assetId
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [userPassword, setUserPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const toggleVisibility = () => {
    if (showMasked && !isVisible) {
      setShowModal(true);
      setUserPassword('');
      setError('');
      return;
    }
    setIsVisible(!isVisible);
  };

  const verifyAndReveal = async () => {
    if (!userPassword.trim()) {
      setError('Password is required');
      return;
    }
    if (!assetId) {
      setError('Asset ID not available');
      return;
    }

    setVerifying(true);
    try {
      const result = await apiRequest(`/api/assets/${assetId}/decrypt-password`, {
        method: 'POST',
        body: JSON.stringify({ verification_password: userPassword })
      });

      if (result.password) {
        setIsVisible(true);
        setShowModal(false);
        setUserPassword('');
        setError('');
      } else {
        setError('Incorrect password or no password set');
      }
    } catch (err: any) {
      if (err?.status === 403) {
        setError('Password salah. Masukkan password login Anda.');
      } else if (err?.status === 400) {
        setError('Password tidak tersimpan. Silakan edit dan simpan ulang asset.');
      } else if (err?.status === 500) {
        setError('Error server. Silakan coba lagi.');
      } else {
        setError('Verification failed. Please try again.');
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <input
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={toggleVisibility}
          disabled={disabled || showMasked}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
          title={isVisible ? 'Hide password' : 'Show password'}
        >
          {isVisible ? (
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
      {showMasked && value && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Password is encrypted. Click the eye icon and enter your login password to reveal.
        </p>
      )}

      {/* Verification Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 rounded px-2 py-1">PW</span>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Password Verification Required
                </h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Enter <strong>your login password</strong> to view this password. This action will be logged for security.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Your Password *
                </label>
                <input
                  type="password"
                  value={userPassword}
                  onChange={(e) => {
                    setUserPassword(e.target.value);
                    setError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && verifyAndReveal()}
                  placeholder="Enter your login password"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                {error && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowModal(false);
                    setUserPassword('');
                    setError('');
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  disabled={verifying}
                >
                  Cancel
                </button>
                <button
                  onClick={verifyAndReveal}
                  disabled={verifying}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {verifying ? 'Verifying...' : 'View Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
