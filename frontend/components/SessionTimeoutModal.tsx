"use client";

import { useState, useEffect, useCallback } from 'react';

interface SessionTimeoutModalProps {
  remaining: number;
  warningTime: number;
  onStay: () => void;
  onLogout: () => void;
}

export default function SessionTimeoutModal({
  remaining,
  warningTime,
  onStay,
  onLogout,
}: SessionTimeoutModalProps) {
  const [countdown, setCountdown] = useState(warningTime);

  useEffect(() => {
    setCountdown(warningTime);
  }, [warningTime]);

  useEffect(() => {
    if (remaining <= warningTime && remaining > 0) {
      setCountdown(remaining);
    }
  }, [remaining, warningTime]);

  useEffect(() => {
    if (remaining <= 0) {
      onLogout();
    }
  }, [remaining, onLogout]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Session Expiring Soon</h2>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Your session will expire due to inactivity. To comply with ISO 27001:2022 security standards, inactive sessions are automatically terminated.
        </p>

        <div className="flex items-center justify-center mb-6">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-gray-200 dark:text-gray-700"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${(countdown / warningTime) * 100}, 100`}
                className={countdown <= 30 ? 'text-red-500' : 'text-amber-500'}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-2xl font-bold ${countdown <= 30 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                {countdown}s
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onLogout}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium text-sm transition-colors"
          >
            Sign Out
          </button>
          <button
            onClick={onStay}
            className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
          >
            Stay Signed In
          </button>
        </div>
      </div>
    </div>
  );
}
