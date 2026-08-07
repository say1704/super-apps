"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { apiRequest } from '@/lib/auth';
import ExportButton from '@/components/ExportButton';

interface ServerDetailModalProps {
  hostname: string;
  onClose: () => void;
  onRefresh: () => void;
}

interface ServerSummary {
  hostname: string;
  ip_address: string;
  total_events: number;
  total_activities: number;
  no_change_days: number;
  unique_users: number;
  last_scan: string | null;
  earliest_scan: string | null;
}

interface AuditEvent {
  id: number;
  hostname: string;
  scan_date: string;
  username: string | null;
  process_name: string | null;
  activity_type: string | null;
  level: string | null;
  file_paths: string[] | null;
  total_files: number;
  time_start: string | null;
  time_end: string | null;
  result: string | null;
  no_changes: boolean;
  created_at: string;
}

type TabType = 'summary' | 'events' | 'users';

const LEVEL_COLORS: Record<string, string> = {
  'INFO': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'WARNING': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  'ERROR': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

const RESULT_COLORS: Record<string, string> = {
  'BERHASIL': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  'GAGAL': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

const ACTIVITY_LABELS: Record<string, { label: string; icon: string }> = {
  'JEJAK SISTEM TERKAIT FILE (PROSES)': { label: 'Modifikasi File', icon: '📝' },
  'JEJAK SISTEM TERKAIT FILE (CREATE)': { label: 'Buat File', icon: '📄' },
  'JEJAK SISTEM TERKAIT FILE (DELETE)': { label: 'Hapus File', icon: '🗑️' },
  'JEJAK SISTEM TERKAIT FILE (MODIFY)': { label: 'Ubah File', icon: '✏️' },
  'FILE CREATE': { label: 'Buat File', icon: '📄' },
  'FILE DELETE': { label: 'Hapus File', icon: '🗑️' },
  'FILE MODIFY': { label: 'Ubah File', icon: '✏️' },
  'JEJAK SISTEM TERKAIT FILE': { label: 'Aktivitas File', icon: '📁' },
  'NO_CHANGE': { label: 'Tidak Ada Perubahan', icon: '✅' },
};

const LEVEL_DISPLAY: Record<string, { label: string; icon: string }> = {
  'INFO': { label: 'Info', icon: 'ℹ️' },
  'WARNING': { label: 'Warning', icon: '⚠️' },
  'ERROR': { label: 'Error', icon: '🚫' },
};

const RESULT_DISPLAY: Record<string, { label: string; icon: string }> = {
  'BERHASIL': { label: 'Sukses', icon: '✅' },
  'GAGAL': { label: 'Gagal', icon: '❌' },
};

const PROCESS_ICONS: Record<string, string> = {
  'java': '☕',
  'vim': '✏️',
  'sftp-server': '📡',
  'ssh': '🔑',
  'bash': '💻',
  'python': '🐍',
  'node': '🟢',
  'npm': '📦',
  'git': '🔀',
  'docker': '🐳',
  'systemd': '⚙️',
  'crond': '⏰',
  'rsyslogd': '📋',
};

function getActivityDisplay(type: string | null): { label: string; icon: string } {
  if (!type) return { label: '-', icon: '' };
  return ACTIVITY_LABELS[type] || { label: type, icon: '📁' };
}

function getLevelDisplay(level: string | null): { label: string; icon: string } {
  if (!level) return { label: '-', icon: '' };
  return LEVEL_DISPLAY[level] || { label: level, icon: '❓' };
}

function getResultDisplay(result: string | null): { label: string; icon: string } {
  if (!result) return { label: '-', icon: '' };
  return RESULT_DISPLAY[result] || { label: result, icon: '❓' };
}

function getProcessIcon(process: string | null): string {
  if (!process) return '⚙️';
  const lower = process.toLowerCase();
  return PROCESS_ICONS[lower] || '⚙️';
}

function formatFilesList(files: string[] | null): string {
  if (!files || files.length === 0) return '';
  return files.join('\n');
}

export default function AuditDetailModal({ hostname, onClose, onRefresh }: ServerDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ServerSummary | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [eventPage, setEventPage] = useState(1);
  const [eventPagination, setEventPagination] = useState<any>(null);
  const [userRanking, setUserRanking] = useState<{ username: string; total: number }[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [exportData, setExportData] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = useCallback((id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exportColumns = useMemo(() => {
    if (exportData.length === 0) return [];
    const keys = Object.keys(exportData[0]);
    return keys.filter(k => k !== 'rowNumber').map(k => ({ key: k, label: k }));
  }, [exportData]);

  useEffect(() => {
    loadData();
  }, [hostname, activeTab, eventPage]);

  const fetchExportData = useCallback(async () => {
    try {
      let data: any[] = [];
      if (activeTab === 'summary') {
        data = events.map((e, idx) => ({
          rowNumber: idx + 1,
          Tanggal: e.scan_date || '-',
          User: e.username || '-',
          Process: e.process_name || '-',
          Activity: getActivityDisplay(e.activity_type).label,
          Level: getLevelDisplay(e.level).label,
          Files: e.total_files,
          'File Paths': e.file_paths?.join(', ') || '-',
          Result: getResultDisplay(e.result).label,
        }));
      } else if (activeTab === 'events') {
        data = events.map((e, idx) => ({
          rowNumber: idx + 1,
          Tanggal: e.scan_date || '-',
          User: e.username || '-',
          Process: e.process_name || '-',
          Activity: getActivityDisplay(e.activity_type).label,
          Level: getLevelDisplay(e.level).label,
          Files: e.total_files,
          'File Paths': e.file_paths?.join(', ') || '-',
          Waktu: e.time_start && e.time_end ? `${e.time_start} - ${e.time_end}` : '-',
          Result: getResultDisplay(e.result).label,
        }));
      } else if (activeTab === 'users') {
        data = userRanking.map((u, idx) => ({
          rowNumber: idx + 1,
          Username: u.username,
          Total: u.total,
        }));
      }
      setExportData(data);
    } catch (error) {
      console.error('Failed to fetch export data:', error);
    }
  }, [activeTab, events, userRanking]);

  useEffect(() => {
    fetchExportData();
  }, [fetchExportData]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'summary') {
        const serverRes = await apiRequest(`/api/audit/servers/${hostname}`);
        setSummary(serverRes.summary);
        setEvents(serverRes.events || []);
      } else if (activeTab === 'events') {
        const res = await apiRequest(`/api/audit/events?hostname=${hostname}&page=${eventPage}&page_size=50`);
        setEvents(res.data || []);
        setEventPagination(res.pagination);
      } else if (activeTab === 'users') {
        const res = await apiRequest(`/api/audit/events?hostname=${hostname}&page_size=10000`);
        const allEvents = res.data || [];
        const userCount: Record<string, number> = {};
        allEvents.forEach((e: any) => {
          if (e.username) {
            userCount[e.username] = (userCount[e.username] || 0) + 1;
          }
        });
        setUserRanking(
          Object.entries(userCount)
            .map(([username, total]) => ({ username, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 20)
        );
        setEvents(allEvents);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Yakin ingin menghapus semua data audit untuk ${hostname}? Tindakan ini tidak bisa dibatalkan.`)) {
      return;
    }
    setDeleting(true);
    try {
      await apiRequest(`/api/audit/servers/${hostname}`, { method: 'DELETE' });
      alert('Data berhasil dihapus');
      onClose();
      onRefresh();
    } catch (error: any) {
      alert(`Gagal menghapus: ${error.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'summary', label: 'Summary', icon: '📊' },
    { key: 'events', label: 'Events', icon: '📋' },
    { key: 'users', label: 'Users', icon: '👤' },
  ];

  const getResultColor = (result: string | null) => {
    if (!result) return '';
    return RESULT_COLORS[result] || '';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xl">
                {hostname.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Audit File: {hostname}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    <span>🌐</span>
                    <span className="font-mono">{summary?.ip_address || '-'}</span>
                  </span>
                  <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
                  File activity monitoring
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {exportData.length > 0 && (
                <ExportButton
                  data={exportData}
                  filename={`audit_${activeTab}_${hostname}`}
                  title={`Audit File: ${hostname}`}
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

          <div className="flex gap-2 mt-4 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setEventPage(1); }}
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

        <div className="flex-1 overflow-y-auto p-6" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <p className="mt-4 text-gray-500 dark:text-gray-400">Memuat data...</p>
            </div>
          ) : activeTab === 'summary' ? (
            <div className="space-y-6">
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white shadow-lg">
                    <div className="text-sm opacity-90">Total Events</div>
                    <div className="text-3xl font-bold">{summary.total_events}</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white shadow-lg">
                    <div className="text-sm opacity-90">Activities</div>
                    <div className="text-3xl font-bold">{summary.total_activities}</div>
                  </div>
                  <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-4 text-white shadow-lg">
                    <div className="text-sm opacity-90">No Change Days</div>
                    <div className="text-3xl font-bold">{summary.no_change_days}</div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white shadow-lg">
                    <div className="text-sm opacity-90">Unique Users</div>
                    <div className="text-3xl font-bold">{summary.unique_users}</div>
                  </div>
                  <div className="bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl p-4 text-white shadow-lg">
                    <div className="text-sm opacity-90">Last Scan</div>
                    <div className="text-lg font-bold">
                      {summary.last_scan
                        ? new Date(summary.last_scan).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '-'}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Daftar Event</h3>
                {events.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <div className="text-6xl mb-4">📭</div>
                    <p className="text-lg font-medium">Belum ada data</p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-700 rounded-lg shadow overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Date</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">User</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Process</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Activity</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Level</th>
                          <th className="px-4 py-3 text-right text-sm font-bold text-gray-700 dark:text-gray-300">Files</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.slice(0, 100).map((e, idx) => {
                          const actDisplay = getActivityDisplay(e.activity_type);
                          const lvlDisplay = getLevelDisplay(e.level);
                          const resDisplay = getResultDisplay(e.result);
                          const procIcon = getProcessIcon(e.process_name);
                          const isExpanded = expandedRows.has(e.id);
                          const hasFiles = e.file_paths && e.file_paths.length > 0;
                          return (
                            <React.Fragment key={`${e.id}-${idx}`}>
                              <tr
                                className={`border-t border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-slate-600/50 transition-colors ${
                                  idx % 2 === 0 ? 'bg-white dark:bg-slate-700' : 'bg-gray-50 dark:bg-slate-800'
                                } ${isExpanded ? 'bg-blue-50 dark:bg-slate-600' : ''}`}
                              >
                                <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white whitespace-nowrap">
                                  {e.scan_date ? new Date(e.scan_date).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                                  <span className="inline-flex items-center gap-1">
                                    <span>👤</span>
                                    {e.username || '-'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                                  <span className="inline-flex items-center gap-1">
                                    <span>{procIcon}</span>
                                    {e.process_name || '-'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate" title={e.activity_type || ''}>
                                  {e.no_changes ? (
                                    <span className="text-gray-400 italic">✅ Tidak Ada Perubahan</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1">
                                      <span>{actDisplay.icon}</span>
                                      <span className="truncate">{actDisplay.label}</span>
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {e.level ? (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[e.level] || ''}`}>
                                      <span>{lvlDisplay.icon}</span>
                                      {lvlDisplay.label}
                                    </span>
                                  ) : '-'}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {e.no_changes ? '-' : (
                                    <button
                                      onClick={() => toggleRow(e.id)}
                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-medium transition-colors ${
                                        hasFiles
                                          ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 cursor-pointer'
                                          : 'text-gray-700 dark:text-gray-300 cursor-default'
                                      }`}
                                      title={hasFiles ? 'Klik untuk lihat daftar file' : ''}
                                    >
                                      <span>📄</span>
                                      {e.total_files}
                                      {hasFiles && (
                                        <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                          ▾
                                        </span>
                                      )}
                                    </button>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {e.result ? (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getResultColor(e.result)}`}>
                                      <span>{resDisplay.icon}</span>
                                      {resDisplay.label}
                                    </span>
                                  ) : '-'}
                                </td>
                              </tr>
                              {isExpanded && hasFiles && (
                                <tr className="bg-gray-50 dark:bg-slate-800/50">
                                  <td colSpan={7} className="px-4 py-3">
                                    <div className="ml-4 pl-4 border-l-2 border-blue-400 dark:border-blue-500">
                                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                        📁 File Terdampak ({e.total_files} file)
                                      </p>
                                      <div className="max-h-48 overflow-y-auto">
                                        {(e.file_paths || []).map((fp, fi) => (
                                          <div key={fi} className="flex items-start gap-2 py-0.5">
                                            <span className="text-blue-400 mt-0.5 shrink-0">└─</span>
                                            <code className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">{fp}</code>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'events' ? (
            <div>
              {events.length === 0 ? (
                <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                  <div className="text-6xl mb-4">📋</div>
                  <p className="text-lg font-medium">Tidak ada data event</p>
                </div>
              ) : (
                <>
                  <div className="bg-white dark:bg-slate-700 rounded-lg shadow overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Date</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">User</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Process</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Activity</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Level</th>
                          <th className="px-4 py-3 text-right text-sm font-bold text-gray-700 dark:text-gray-300">Files</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Time</th>
                          <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((e, idx) => {
                          const actDisplay = getActivityDisplay(e.activity_type);
                          const lvlDisplay = getLevelDisplay(e.level);
                          const resDisplay = getResultDisplay(e.result);
                          const procIcon = getProcessIcon(e.process_name);
                          const isExpanded = expandedRows.has(e.id);
                          const hasFiles = e.file_paths && e.file_paths.length > 0;
                          return (
                            <React.Fragment key={e.id}>
                              <tr
                                className={`border-t border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-slate-600/50 transition-colors ${
                                  idx % 2 === 0 ? 'bg-white dark:bg-slate-700' : 'bg-gray-50 dark:bg-slate-800'
                                } ${isExpanded ? 'bg-blue-50 dark:bg-slate-600' : ''}`}
                              >
                                <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white whitespace-nowrap">
                                  {e.scan_date ? new Date(e.scan_date).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                                  <span className="inline-flex items-center gap-1">
                                    <span>👤</span>
                                    {e.username || '-'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                                  <span className="inline-flex items-center gap-1">
                                    <span>{procIcon}</span>
                                    {e.process_name || '-'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate" title={e.activity_type || ''}>
                                  {e.no_changes ? (
                                    <span className="text-gray-400 italic">✅ Tidak Ada Perubahan</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1">
                                      <span>{actDisplay.icon}</span>
                                      <span className="truncate">{actDisplay.label}</span>
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {e.level ? (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[e.level] || ''}`}>
                                      <span>{lvlDisplay.icon}</span>
                                      {lvlDisplay.label}
                                    </span>
                                  ) : '-'}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {e.no_changes ? '-' : (
                                    <button
                                      onClick={() => toggleRow(e.id)}
                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-medium transition-colors ${
                                        hasFiles
                                          ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 cursor-pointer'
                                          : 'text-gray-700 dark:text-gray-300 cursor-default'
                                      }`}
                                      title={hasFiles ? 'Klik untuk lihat daftar file' : ''}
                                    >
                                      <span>📄</span>
                                      {e.total_files}
                                      {hasFiles && (
                                        <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                          ▾
                                        </span>
                                      )}
                                    </button>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                  {e.time_start && e.time_end ? `${e.time_start} - ${e.time_end}` : '-'}
                                </td>
                                <td className="px-4 py-3">
                                  {e.result ? (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getResultColor(e.result)}`}>
                                      <span>{resDisplay.icon}</span>
                                      {resDisplay.label}
                                    </span>
                                  ) : '-'}
                                </td>
                              </tr>
                              {isExpanded && hasFiles && (
                                <tr className="bg-gray-50 dark:bg-slate-800/50">
                                  <td colSpan={8} className="px-4 py-3">
                                    <div className="ml-4 pl-4 border-l-2 border-blue-400 dark:border-blue-500">
                                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                        📁 File Terdampak ({e.total_files} file)
                                      </p>
                                      <div className="max-h-48 overflow-y-auto">
                                        {(e.file_paths || []).map((fp, fi) => (
                                          <div key={fi} className="flex items-start gap-2 py-0.5">
                                            <span className="text-blue-400 mt-0.5 shrink-0">└─</span>
                                            <code className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">{fp}</code>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {eventPagination && eventPagination.total_pages > 1 && (
                    <div className="mt-4 flex justify-between items-center">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Menampilkan {((eventPage - 1) * 50) + 1}-{Math.min(eventPage * 50, eventPagination.total)} dari {eventPagination.total} data
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEventPage(Math.max(1, eventPage - 1))} disabled={eventPage === 1}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 hover:bg-blue-600">← Sebelumnya</button>
                        <span className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm">Halaman {eventPage} / {eventPagination.total_pages}</span>
                        <button onClick={() => setEventPage(Math.min(eventPagination.total_pages, eventPage + 1))} disabled={eventPage === eventPagination.total_pages}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 hover:bg-blue-600">Selanjutnya →</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : activeTab === 'users' ? (
            <div>
              {userRanking.length === 0 ? (
                <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                  <div className="text-6xl mb-4">👤</div>
                  <p className="text-lg font-medium">Tidak ada data user</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-700 rounded-lg shadow overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Peringkat</th>
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Username</th>
                        <th className="px-4 py-3 text-right text-sm font-bold text-gray-700 dark:text-gray-300">Total Events</th>
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Distribusi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userRanking.map((user, idx) => {
                        const maxTotal = Math.max(...userRanking.map(u => u.total));
                        const pct = maxTotal > 0 ? (user.total / maxTotal) * 100 : 0;
                        return (
                          <tr key={user.username}
                            className={`border-t border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-slate-600/50 transition-colors ${
                              idx % 2 === 0 ? 'bg-white dark:bg-slate-700' : 'bg-gray-50 dark:bg-slate-800'
                            }`}
                          >
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
