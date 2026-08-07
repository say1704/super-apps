"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/auth';

interface AuditEntry {
  id: number;
  user_id: number;
  action_type: string;
  table_name: string;
  record_ids: number[] | null;
  details: Record<string, unknown> | null;
  status: string;
  approved_by: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
  ip_address: string | null;
  created_at: string | null;
}

interface PendingApproval {
  id: number;
  user_id: number;
  action_type: string;
  table_name: string;
  record_ids: number[] | null;
  details: Record<string, unknown> | null;
  status: string;
  created_at: string | null;
}

const ACTION_ICONS: Record<string, string> = {
  create: '➕',
  update: '✏️',
  delete: '🗑️',
  undo: '↩️',
  approve: '✅',
  reject: '❌',
};

const STATUS_COLORS: Record<string, string> = {
  executed: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
  pending_approval: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30',
  approved: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
  rejected: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
  failed: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
};

export default function AiAuditTab() {
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'executed' | 'pending_approval'>('all');
  const [actionFilter, setActionFilter] = useState('');
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [auditRes, pendingRes] = await Promise.allSettled([
        apiRequest('/ai/audit-logs', { method: 'GET' }),
        apiRequest('/ai/pending-approvals', { method: 'GET' }),
      ]);

      if (auditRes.status === 'fulfilled') {
        setAuditLogs(auditRes.value.audit_logs || []);
      } else {
        console.error('Failed to load audit logs:', auditRes.reason);
      }

      if (pendingRes.status === 'fulfilled') {
        setPendingApprovals(pendingRes.value.pending_approvals || []);
        setIsSuperadmin(true);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data audit.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (auditId: number) => {
    try {
      await apiRequest(`/ai/approve/${auditId}`, { method: 'POST', body: '{}' });
      loadData();
    } catch (err: any) {
      setError(err.message || 'Gagal menyetujui.');
    }
  };

  const handleReject = async (auditId: number) => {
    const reason = prompt('Alasan penolakan (opsional):');
    try {
      await apiRequest(`/ai/approve/${auditId}`, {
        method: 'POST',
        body: JSON.stringify({ rejection_reason: reason || '' }),
      });
      loadData();
    } catch (err: any) {
      setError(err.message || 'Gagal menolak.');
    }
  };

  const filteredLogs = auditLogs.filter((entry) => {
    if (filter === 'executed' && entry.status !== 'executed') return false;
    if (filter === 'pending_approval' && entry.status !== 'pending_approval') return false;
    if (actionFilter && entry.action_type !== actionFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Pending Approvals */}
      {isSuperadmin && pendingApprovals.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-xl p-4">
          <h3 className="font-semibold text-sm text-yellow-800 dark:text-yellow-200 mb-3">
            ⏳ Menunggu Persetujuan ({pendingApprovals.length})
          </h3>
          <div className="space-y-2">
            {pendingApprovals.map((item) => (
              <div key={item.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 border border-yellow-100 dark:border-yellow-800/30">
                <div className="flex items-center gap-2">
                  <span>{ACTION_ICONS[item.action_type] || '❓'}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {item.action_type.toUpperCase()} — {item.table_name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      User #{item.user_id} — {item.created_at ? new Date(item.created_at).toLocaleString('id-ID') : '-'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(item.id)} className="px-3 py-1 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white">
                    ✅ Setuju
                  </button>
                  <button onClick={() => handleReject(item.id)} className="px-3 py-1 text-xs font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white">
                    ❌ Tolak
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
          {(['all', 'executed', 'pending_approval'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === f
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {f === 'all' ? 'Semua' : f === 'executed' ? 'Tereksekusi' : 'Pending'}
            </button>
          ))}
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          <option value="">Semua Aksi</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="undo">Undo</option>
        </select>

        <button onClick={loadData} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
          ↻ Refresh
        </button>
      </div>

      {/* Audit Log Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">Memuat data audit...</div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">Belum ada data audit.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400 text-xs">ID</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400 text-xs">Aksi</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400 text-xs">Tabel</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400 text-xs">User</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400 text-xs">Status</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400 text-xs">Waktu</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400 text-xs">Detail</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((entry) => (
                <tr key={entry.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="py-2 px-3 text-gray-500 dark:text-gray-400 text-xs">#{entry.id}</td>
                  <td className="py-2 px-3">
                    <span className="text-sm">{ACTION_ICONS[entry.action_type] || '❓'} {entry.action_type}</span>
                  </td>
                  <td className="py-2 px-3 text-gray-700 dark:text-gray-300 text-xs">{entry.table_name}</td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400 text-xs">#{entry.user_id}</td>
                  <td className="py-2 px-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[entry.status] || 'text-gray-600 bg-gray-100'}`}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                    {entry.created_at ? new Date(entry.created_at).toLocaleString('id-ID') : '-'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {entry.details && Object.keys(entry.details).length > 0 && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer" title={JSON.stringify(entry.details, null, 2)}>
                        📋
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
