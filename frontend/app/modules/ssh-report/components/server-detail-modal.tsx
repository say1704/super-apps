"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiRequest } from '@/lib/auth';
import ExportButton from '@/components/ExportButton';

interface ServerDetailModalProps {
  hostname: string;
  onClose: () => void;
  onRefresh: () => void;
}

interface SummaryData {
  hostname: string;
  total_logins: number;
  success_count: number;
  failed_count: number;
  unique_users: number;
  unique_source_ips: number;
  last_scan_date: string | null;
}

interface DailyHistoryRecord {
  scan_date: string;
  total: number;
  success_count: number;
  failed_count: number;
}

interface LoginRecord {
  id: number;
  hostname: string;
  ip_address: string;
  login_timestamp: string;
  username: string;
  source_ip: string;
  auth_method: string;
  status: string;
  duration: string | null;
  severity: string;
  scan_date: string;
  created_at: string;
  created_by: string;
}

interface RankingItem {
  username?: string;
  source_ip?: string;
  total: number;
  max_severity?: string;
}

type TabType = 'summary' | 'successful' | 'failed' | 'top-users' | 'top-failed-ips';

export default function ServerDetailModal({ hostname, onClose, onRefresh }: ServerDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [dailyHistory, setDailyHistory] = useState<DailyHistoryRecord[]>([]);
  const [successfulLogins, setSuccessfulLogins] = useState<LoginRecord[]>([]);
  const [failedLogins, setFailedLogins] = useState<LoginRecord[]>([]);
  const [topUsers, setTopUsers] = useState<RankingItem[]>([]);
  const [topFailedIps, setTopFailedIps] = useState<RankingItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [successPage, setSuccessPage] = useState(1);
  const [failedPage, setFailedPage] = useState(1);
  const [historyPagination, setHistoryPagination] = useState<any>(null);
  const [successPagination, setSuccessPagination] = useState<any>(null);
  const [failedPagination, setFailedPagination] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportData, setExportData] = useState<any[]>([]);

  const exportColumns = useMemo(() => {
    if (exportData.length === 0) return [];
    const keys = Object.keys(exportData[0]);
    return keys
      .filter(k => k !== 'rowNumber')
      .map(k => ({ key: k, label: k }));
  }, [exportData]);

  useEffect(() => {
    loadData();
  }, [hostname, activeTab, historyPage, successPage, failedPage]);

  const fetchExportData = useCallback(async () => {
    try {
      let data: any[] = [];
      if (activeTab === 'summary') {
        const res = await apiRequest(`/api/ssh-report/servers/${hostname}/daily-history?page=1&page_size=100`);
        data = (res.data || []).map((r: any, idx: number) => ({
          rowNumber: idx + 1,
          Tanggal: r.scan_date,
          Total: r.total,
          Success: r.success_count,
          Failed: r.failed_count,
          'Success Rate': r.total > 0 ? `${((r.success_count / r.total) * 100).toFixed(1)}%` : '0.0%',
        }));
      } else if (activeTab === 'successful') {
        const res = await apiRequest(`/api/ssh-report/export-data?hostname=${hostname}&status=success&page_size=5000`);
        data = (res.data || []).map((r: any, idx: number) => ({
          rowNumber: idx + 1,
          Timestamp: r.login_timestamp ? new Date(r.login_timestamp).toLocaleString() : '',
          Username: r.username,
          'Source IP': r.source_ip,
          'Auth Method': r.auth_method,
        }));
      } else if (activeTab === 'failed') {
        const res = await apiRequest(`/api/ssh-report/export-data?hostname=${hostname}&status=failed&page_size=5000`);
        data = (res.data || []).map((r: any, idx: number) => ({
          rowNumber: idx + 1,
          Timestamp: r.login_timestamp ? new Date(r.login_timestamp).toLocaleString() : '',
          Username: r.username,
          'Source IP': r.source_ip,
          'Auth Method': r.auth_method,
          Severity: r.severity,
        }));
      } else if (activeTab === 'top-users') {
        data = topUsers.map((u, idx) => ({
          rowNumber: idx + 1,
          Username: u.username,
          Total: u.total,
        }));
      } else if (activeTab === 'top-failed-ips') {
        data = topFailedIps.map((ip, idx) => ({
          rowNumber: idx + 1,
          'Source IP': ip.source_ip,
          'Failed Attempts': ip.total,
          'Max Severity': ip.max_severity || 'LOW',
        }));
      }
      setExportData(data);
    } catch (error) {
      console.error('Failed to fetch export data:', error);
    }
  }, [activeTab, hostname, topUsers, topFailedIps]);

  useEffect(() => {
    fetchExportData();
  }, [fetchExportData]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'summary') {
        const [summaryRes, historyRes] = await Promise.all([
          apiRequest(`/api/ssh-report/servers/${hostname}/summary`),
          apiRequest(`/api/ssh-report/servers/${hostname}/daily-history?page=${historyPage}&page_size=30`),
        ]);
        setSummary(summaryRes);
        setDailyHistory(historyRes.data || []);
        setHistoryPagination(historyRes.pagination);
      } else if (activeTab === 'successful') {
        const res = await apiRequest(`/api/ssh-report/servers/${hostname}/successful-logins?page=${successPage}&page_size=50`);
        setSuccessfulLogins(res.data || []);
        setSuccessPagination(res.pagination);
      } else if (activeTab === 'failed') {
        const res = await apiRequest(`/api/ssh-report/servers/${hostname}/failed-logins?page=${failedPage}&page_size=50`);
        setFailedLogins(res.data || []);
        setFailedPagination(res.pagination);
      } else if (activeTab === 'top-users') {
        const res = await apiRequest(`/api/ssh-report/servers/${hostname}/top-users?limit=20`);
        setTopUsers(res.data || []);
      } else if (activeTab === 'top-failed-ips') {
        const res = await apiRequest(`/api/ssh-report/servers/${hostname}/top-failed-ips?limit=20`);
        setTopFailedIps(res.data || []);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Yakin ingin menghapus semua data SSH login untuk ${hostname}? Tindakan ini tidak bisa dibatalkan.`)) {
      return;
    }
    setDeleting(true);
    try {
      await apiRequest(`/api/ssh-report/servers/${hostname}`, { method: 'DELETE' });
      alert('Data berhasil dihapus');
      onClose();
      onRefresh();
    } catch (error: any) {
      alert(`Gagal menghapus: ${error.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case 'HIGH': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      case 'MEDIUM': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300';
      default: return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
    }
  };

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'summary', label: 'Summary', icon: '📊' },
    { key: 'successful', label: 'Successful Logins', icon: '✅' },
    { key: 'failed', label: 'Failed Logins', icon: '❌' },
    { key: 'top-users', label: 'Top Users', icon: '👤' },
    { key: 'top-failed-ips', label: 'Top Failed IPs', icon: '🌐' },
  ];

  const renderPagination = (pagination: any, currentPage: number, setPage: (p: number) => void) => {
    if (!pagination || pagination.total_pages <= 1) return null;
    return (
      <div className="mt-4 flex justify-between items-center">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Menampilkan {((pagination.page - 1) * pagination.page_size) + 1}-{Math.min(pagination.page * pagination.page_size, pagination.total_records)} dari {pagination.total_records} data
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={!pagination.has_prev} className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 hover:bg-blue-600">← Sebelumnya</button>
          <span className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm">Halaman {pagination.page} / {pagination.total_pages}</span>
          <button onClick={() => setPage(Math.min(pagination.total_pages, currentPage + 1))} disabled={!pagination.has_next} className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 hover:bg-blue-600">Selanjutnya →</button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xl">
                {hostname.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">SSH Report: {hostname}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Detail audit login SSH</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {exportData.length > 0 && (
                <ExportButton
                  data={exportData}
                  filename={`SSH_${activeTab}_${hostname}`}
                  title={`SSH Report: ${hostname}`}
                  columns={exportColumns}
                />
              )}
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? '⏳ Menghapus...' : '🗑️ Hapus'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                ✕ Tutup
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setHistoryPage(1); setSuccessPage(1); setFailedPage(1); }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                  activeTab === tab.key
                    ? 'bg-blue-500 text-white shadow-lg'
                    : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <p className="mt-4 text-gray-500 dark:text-gray-400">Memuat data...</p>
            </div>
          ) : activeTab === 'summary' ? (
            <div className="space-y-6">
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white shadow-lg">
                    <div className="text-sm opacity-90">Total Login</div>
                    <div className="text-3xl font-bold">{summary.total_logins}</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white shadow-lg">
                    <div className="text-sm opacity-90">Berhasil</div>
                    <div className="text-3xl font-bold">{summary.success_count}</div>
                  </div>
                  <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 text-white shadow-lg">
                    <div className="text-sm opacity-90">Gagal</div>
                    <div className="text-3xl font-bold">{summary.failed_count}</div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white shadow-lg">
                    <div className="text-sm opacity-90">User Unik</div>
                    <div className="text-3xl font-bold">{summary.unique_users}</div>
                  </div>
                  <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white shadow-lg">
                    <div className="text-sm opacity-90">IP Unik</div>
                    <div className="text-3xl font-bold">{summary.unique_source_ips}</div>
                  </div>
                  <div className="bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl p-4 text-white shadow-lg">
                    <div className="text-sm opacity-90">Scan Terakhir</div>
                    <div className="text-lg font-bold">
                      {summary.last_scan_date
                        ? new Date(summary.last_scan_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '-'}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Riwayat Harian</h3>
                {dailyHistory.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <div className="text-6xl mb-4">📭</div>
                    <p className="text-lg font-medium">Belum ada riwayat harian</p>
                    <p className="text-sm mt-2">Lakukan scan data SSH terlebih dahulu</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-white dark:bg-slate-700 rounded-lg shadow overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-700">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Tanggal</th>
                            <th className="px-4 py-3 text-right text-sm font-bold text-gray-700 dark:text-gray-300">Total</th>
                            <th className="px-4 py-3 text-right text-sm font-bold text-green-700 dark:text-green-300">Berhasil</th>
                            <th className="px-4 py-3 text-right text-sm font-bold text-red-700 dark:text-red-300">Gagal</th>
                            <th className="px-4 py-3 text-right text-sm font-bold text-gray-700 dark:text-gray-300">Success Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dailyHistory.map((record, idx) => {
                            const rate = record.total > 0 ? ((record.success_count / record.total) * 100).toFixed(1) : '0.0';
                            return (
                              <tr key={idx} className={`border-t border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-slate-600/50 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-700' : 'bg-gray-50 dark:bg-slate-800'}`}>
                                <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900 dark:text-white">
                                  {new Date(record.scan_date).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-mono text-gray-700 dark:text-gray-300">{record.total}</td>
                                <td className="px-4 py-3 text-right text-sm font-mono text-green-600 dark:text-green-400">{record.success_count}</td>
                                <td className="px-4 py-3 text-right text-sm font-mono text-red-600 dark:text-red-400">{record.failed_count}</td>
                                <td className="px-4 py-3 text-right">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${parseFloat(rate) >= 90 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : parseFloat(rate) >= 70 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                                    {rate}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {renderPagination(historyPagination, historyPage, setHistoryPage)}
                  </>
                )}
              </div>
            </div>
          ) : activeTab === 'successful' ? (
            <div>
              {successfulLogins.length === 0 ? (
                <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                  <div className="text-6xl mb-4">✅</div>
                  <p className="text-lg font-medium">Tidak ada data login berhasil</p>
                </div>
              ) : (
                <>
                  <div className="bg-white dark:bg-slate-700 rounded-lg shadow overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Timestamp</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Username</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Source IP</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Auth Method</th>
                        </tr>
                      </thead>
                      <tbody>
                        {successfulLogins.map((login) => (
                          <tr key={login.id} className="border-t border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-slate-600/50 transition-colors">
                            <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">
                              {login.login_timestamp ? new Date(login.login_timestamp).toLocaleString('id-ID') : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">{login.username}</td>
                            <td className="px-4 py-3 text-sm font-mono text-gray-700 dark:text-gray-300">{login.source_ip}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{login.auth_method}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {renderPagination(successPagination, successPage, setSuccessPage)}
                </>
              )}
            </div>
          ) : activeTab === 'failed' ? (
            <div>
              {failedLogins.length === 0 ? (
                <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                  <div className="text-6xl mb-4">❌</div>
                  <p className="text-lg font-medium">Tidak ada data login gagal</p>
                </div>
              ) : (
                <>
                  <div className="bg-white dark:bg-slate-700 rounded-lg shadow overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Timestamp</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Username</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Source IP</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Auth Method</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Severity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {failedLogins.map((login) => (
                          <tr key={login.id} className="border-t border-gray-200 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-slate-600/50 transition-colors">
                            <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">
                              {login.login_timestamp ? new Date(login.login_timestamp).toLocaleString('id-ID') : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">{login.username}</td>
                            <td className="px-4 py-3 text-sm font-mono text-gray-700 dark:text-gray-300">{login.source_ip}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{login.auth_method}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(login.severity)}`}>
                                {login.severity}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {renderPagination(failedPagination, failedPage, setFailedPage)}
                </>
              )}
            </div>
          ) : activeTab === 'top-users' ? (
            <div>
              {topUsers.length === 0 ? (
                <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                  <div className="text-6xl mb-4">👤</div>
                  <p className="text-lg font-medium">Tidak ada data user login</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-700 rounded-lg shadow overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Peringkat</th>
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Username</th>
                        <th className="px-4 py-3 text-right text-sm font-bold text-gray-700 dark:text-gray-300">Total Login</th>
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Distribusi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topUsers.map((user, idx) => {
                        const maxTotal = Math.max(...topUsers.map(u => u.total));
                        const pct = maxTotal > 0 ? (user.total / maxTotal) * 100 : 0;
                        return (
                          <tr key={idx} className={`border-t border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-slate-600/50 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-700' : 'bg-gray-50 dark:bg-slate-800'}`}>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                                idx === 0 ? 'bg-yellow-400 text-yellow-900' :
                                idx === 1 ? 'bg-gray-300 text-gray-700' :
                                idx === 2 ? 'bg-amber-600 text-amber-100' :
                                'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                              }`}>
                                {idx + 1}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{user.username}</td>
                            <td className="px-4 py-3 text-right text-sm font-mono font-bold text-gray-700 dark:text-gray-300">{user.total}</td>
                            <td className="px-4 py-3">
                              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
                                <div className="h-3 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }}></div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : activeTab === 'top-failed-ips' ? (
            <div>
              {topFailedIps.length === 0 ? (
                <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                  <div className="text-6xl mb-4">🌐</div>
                  <p className="text-lg font-medium">Tidak ada data IP gagal</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-700 rounded-lg shadow overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Peringkat</th>
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Source IP</th>
                        <th className="px-4 py-3 text-right text-sm font-bold text-gray-700 dark:text-gray-300">Percobaan Gagal</th>
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Max Severity</th>
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Distribusi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topFailedIps.map((ip, idx) => {
                        const maxTotal = Math.max(...topFailedIps.map(i => i.total));
                        const pct = maxTotal > 0 ? (ip.total / maxTotal) * 100 : 0;
                        return (
                          <tr key={idx} className={`border-t border-gray-200 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-slate-600/50 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-700' : 'bg-gray-50 dark:bg-slate-800'}`}>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                                idx === 0 ? 'bg-red-500 text-white' :
                                idx === 1 ? 'bg-red-400 text-white' :
                                idx === 2 ? 'bg-red-300 text-red-900' :
                                'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                              }`}>
                                {idx + 1}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900 dark:text-white">{ip.source_ip}</td>
                            <td className="px-4 py-3 text-right text-sm font-mono font-bold text-red-600 dark:text-red-400">{ip.total}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(ip.max_severity || 'LOW')}`}>
                                {ip.max_severity || 'LOW'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
                                <div className="h-3 rounded-full bg-red-500 transition-all" style={{ width: `${pct}%` }}></div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
