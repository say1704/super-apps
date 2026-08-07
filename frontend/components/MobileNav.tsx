"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileNav({ isOpen, onClose }: MobileNavProps) {
  const { user, logout } = useAuth();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute left-0 top-0 bottom-0 w-64 bg-white dark:bg-slate-800 shadow-xl flex flex-col">
        <div className="p-4 flex-shrink-0 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">🔒 Super Apps</h2>
            <p className="text-xs mt-0.5 text-slate-500 dark:text-slate-400">IT Management System</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {user && (
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-blue-600 text-white">
                {user.full_name?.charAt(0) || user.username?.charAt(0) || "U"}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate text-slate-900 dark:text-white">{user.full_name || user.username}</p>
                <p className="text-xs capitalize text-slate-500 dark:text-slate-400">{user.role}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Use the sidebar on desktop for navigation</p>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={() => {
              logout();
              onClose();
            }}
            className="w-full px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
          >
            <span>🚪</span> Logout
          </button>
        </div>
      </div>
    </div>
  );
}
