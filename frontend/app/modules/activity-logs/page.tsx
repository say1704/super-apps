"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiRequest } from "@/lib/auth";
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast';
import ExportButton from '@/components/ExportButton';

interface ActivityLogEntry {
  id: number;
  log_type: 'activity' | 'asset_audit';
  timestamp: string | null;
  module: string;
  action: string;
  user_id: number | null;
  user: string;
  user_role: string | null;
  description: string;
  details: any;
  asset_code: string | null;
  asset_name: string | null;
  ip_address: string | null;
}

interface Pagination {
  current_page: number;
  page_size: number;
  total_records: number;
  total_pages: number;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  UPDATE: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  DELETE: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  VIEW: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  EXPORT: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  LOGIN: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  LOGOUT: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Create',
  UPDATE: 'Update',
  DELETE: 'Delete',
  VIEW: 'View',
  EXPORT: 'Export',
  LOGIN: 'Login',
  LOGOUT: 'Logout',
};

export default function ActivityLogsPage() {
  const router = useRouter();
  const toast = useToast();
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [filterAction, setFilterAction] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Export data state
  const [exportData, setExportData] = useState<ActivityLogEntry[]>([]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        sort_by: 'created_at',
        sort_order: 'desc',
      });

      if (filterAction) params.set('action', filterAction);
      if (filterModule) params.set('module', filterModule);

      const result = await apiRequest(`/api/activity-logs?${params}`);

      setLogs(result.data || []);
      setPagination(result.pagination);
    } catch (error: any) {
      console.error('Failed to fetch activity logs:', error);
      if (error.message?.includes('401')) {
        toast.error('Session expired. Please login again.');
        router.push('/login');
      } else {
        toast.error('Failed to load activity logs');
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterAction, filterModule, router, toast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const fetchExportData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterAction) params.set('action', filterAction);
      if (filterModule) params.set('module', filterModule);
      if (startDate) params.set('from_date', startDate);
      if (endDate) params.set('to_date', endDate);

      const result = await apiRequest(`/api/activity-logs/export?format=json&${params}`);
      setExportData(result.data || []);
    } catch (error: any) {
      console.error('Failed to fetch export data:', error);
    }
  }, [filterAction, filterModule, startDate, endDate]);

  useEffect(() => {
    fetchExportData();
  }, [fetchExportData]);

  const exportColumns = useMemo(() => [
    { key: 'rowNumber', label: '#' },
    { key: 'log_type', label: 'Type' },
    { key: 'timestamp', label: 'Timestamp' },
    { key: 'module', label: 'Module' },
    { key: 'action', label: 'Action' },
    { key: 'user', label: 'User' },
    { key: 'description', label: 'Description' },
    { key: 'ip_address', label: 'IP Address' },
  ], []);

  const exportDataWithNumbering = useMemo(() =>
    exportData.map((row, idx) => ({
      ...row,
      rowNumber: idx + 1,
      timestamp: row.timestamp ? new Date(row.timestamp).toLocaleString() : '',
    })),
  [exportData]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Activity Logs
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Track all system activities for ISO 27001 compliance
            </p>
          </div>
          <ExportButton
            data={exportDataWithNumbering}
            filename="activity-logs"
            columns={exportColumns}
            title="Activity Logs"
          />
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Action
              </label>
              <select
                value={filterAction}
                onChange={(e) => {
                  setFilterAction(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              >
                <option value="">All Actions</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
                <option value="VIEW">View</option>
                <option value="EXPORT">Export</option>
                <option value="LOGIN">Login</option>
                <option value="LOGOUT">Logout</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Module
              </label>
              <input
                type="text"
                value={filterModule}
                onChange={(e) => {
                  setFilterModule(e.target.value);
                  setPage(1);
                }}
                placeholder="Search module..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <p>Loading activity logs...</p>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Module
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Action
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                      IP Address
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={`${log.log_type}-${log.id}`}
                      className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          {log.log_type === 'asset_audit' && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                              asset
                            </span>
                          )}
                          <span className="text-gray-900 dark:text-white">
                            {log.module}
                          </span>
                        </div>
                        {log.asset_code && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {log.asset_code} {log.asset_name ? `- ${log.asset_name}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${ACTION_COLORS[log.action] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        <div>{log.user}</div>
                        {log.user_role && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {log.user_role}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate">
                        {log.description || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-mono">
                        {log.ip_address || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {logs.length === 0 && (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                <p className="text-lg font-medium">No activity logs found</p>
                <p className="text-sm mt-1">Try adjusting your filters</p>
              </div>
            )}

            {/* Pagination */}
            {pagination && (
              <div className="flex justify-between items-center bg-white dark:bg-slate-800 rounded-lg shadow p-4 border-t">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, pagination.total_records)} of {pagination.total_records} entries
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
                  >
                    ◀ Prev
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Page {page} of {pagination.total_pages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.total_pages, p + 1))}
                    disabled={page === pagination.total_pages}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
                  >
                    Next ▶
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}