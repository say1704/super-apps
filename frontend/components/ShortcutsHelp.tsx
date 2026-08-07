"use client";

import { useState } from "react";

const shortcuts = [
  { shortcut: "Ctrl + K", description: "Open command palette" },
  { shortcut: "Esc", description: "Close modals / command palette" },
  { shortcut: "?", description: "Show this shortcuts help" },
  { shortcut: "↑ / ↓", description: "Navigate command palette results" },
  { shortcut: "Enter", description: "Select command palette result" },
];

export default function ShortcutsHelp({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-3">
          {shortcuts.map((s) => (
            <div key={s.shortcut} className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">{s.description}</span>
              <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-600">
                {s.shortcut}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
