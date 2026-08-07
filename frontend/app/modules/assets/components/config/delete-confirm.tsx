"use client";

import { useState } from 'react';

interface DeleteConfirmProps {
  config: any;
  onConfirm: () => void;
  onCancel: () => void;
  error?: string | null;
}

export default function DeleteConfirm({ config, onConfirm, onCancel, error }: DeleteConfirmProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try { await onConfirm(); } finally { setDeleting(false); }
  };

  return (
    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">Confirm Delete</h3>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
        Are you sure you want to delete <strong>{config?.parameter}</strong>? This action cannot be undone.
      </p>
      {error && (
        <div className="p-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-sm text-red-700 dark:text-red-300 mb-4">
          {error}
        </div>
      )}
      {config?.value && (
        <div className="p-2 bg-white dark:bg-gray-800 rounded text-sm font-mono text-gray-900 dark:text-white mb-4">
          {config.value.substring(0, 100)}{config.value.length > 100 ? '...' : ''}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50">Delete</button>
        <button onClick={onCancel} disabled={deleting} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium disabled:opacity-50">Cancel</button>
      </div>
    </div>
  );
}
