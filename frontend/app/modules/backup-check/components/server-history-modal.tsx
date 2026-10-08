"use client";

import { Fragment, useEffect, useRef, useState, useMemo } from 'react';
import { apiRequest } from '@/lib/auth';
import ExportButton from '@/components/ExportButton';
import { exportBackupCheckHistoryPDF } from '@/lib/export';

const ALL_DAYS = 36500;
const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 1000;
const FILES_PAGE_SIZE = 50;

type PeriodOption = 'all' | '30' | '90' | '365';

interface PaginationInfo {
  page: number;
  page_size: number;
  total_records: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

interface ServerHistoryModalProps {
  serverName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface HistoryRecord {
  backup_date: string;
  jumlah_files: number;
  total_size_bytes: number;
  total_size_formatted: string;
  status: string;
  filename: string;
}

interface Statistics {
  total_records: number;
  avg_files: number;
  avg_size_gb: number;
  max_files: number;
  max_size_gb: number;
  min_files: number;
  min_size_gb: number;
}

interface FileEntry {
  path: string;
  section: string | null;
}

interface FilesState {
  available: boolean;
  truncated: boolean;
  files: FileEntry[];
  pagination: PaginationInfo | null;
}

export function ServerHistoryModal({ serverName, isOpen, onClose }: ServerHistoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [period, setPeriod] = useState<PeriodOption>('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [fullHistory, setFullHistory] = useState<HistoryRecord[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  // Expandable file-list states (one row expanded at a time)
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesData, setFilesData] = useState<FilesState | null>(null);
  const [filesPage, setFilesPage] = useState(1);
  const [filesSearch, setFilesSearch] = useState('');
  // Skip the debounced search effect once right after expanding a row
  // (toggleExpand already triggers the initial load with an empty query).
  const skipNextSearchRef = useRef(false);

  const daysForPeriod = () => (period === 'all' ? ALL_DAYS : parseInt(period, 10));

  useEffect(() => {
    if (isOpen && serverName) {
      setPage(1);
      setExpandedDate(null);
      setFilesData(null);
      loadHistory(1);
      loadFullHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, serverName, period]);

  const loadFiles = async (backupDate: string, targetPage: number, q: string) => {
    setFilesLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        page_size: String(FILES_PAGE_SIZE),
      });
      if (q.trim()) params.set('q', q.trim());
      const data = await apiRequest(
        `/api/backup-check/server/${encodeURIComponent(serverName)}/history/${backupDate}/files?${params.toString()}`
      );
      setFilesData({
        available: data.available,
        truncated: data.truncated,
        files: data.files || [],
        pagination: data.pagination || null,
      });
    } catch (e: any) {
      console.error('Failed to load backup files:', e);
      setFilesData({ available: false, truncated: false, files: [], pagination: null });
    } finally {
      setFilesLoading(false);
    }
  };

  const toggleExpand = (backupDate: string | null) => {
    if (!backupDate) return;
    if (expandedDate === backupDate) {
      setExpandedDate(null);
      return;
    }
    skipNextSearchRef.current = true; // the reset below must not double-fire the search effect
    setExpandedDate(backupDate);
    setFilesPage(1);
    setFilesSearch('');
    setFilesData(null);
    loadFiles(backupDate, 1, '');
  };

  // Live search (autocomplete): debounce query typing -> reload page 1
  useEffect(() => {
    if (!expandedDate) return;
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      setFilesPage(1);
      loadFiles(expandedDate, 1, filesSearch);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesSearch]);

  const goToFilesPage = (next: number) => {
    if (!expandedDate) return;
    if (filesData?.pagination && (next < 1 || next > filesData.pagination.total_pages)) return;
    setFilesPage(next);
    loadFiles(expandedDate, next, filesSearch);
  };

  const loadHistory = async (targetPage: number) => {
    setLoading(true);
    try {
      const days = daysForPeriod();
      const data = await apiRequest(`/api/backup-check/server/${encodeURIComponent(serverName)}/history?days=${days}&page=${targetPage}&page_size=${PAGE_SIZE}`);
      setHistory(data.history || []);
      setStatistics(data.statistics);
      setPagination(data.pagination || null);
    } catch (e: any) {
      console.error('Failed to load server history:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadFullHistory = async () => {
    try {
      const days = daysForPeriod();
      const data = await apiRequest(`/api/backup-check/server/${encodeURIComponent(serverName)}/history?days=${days}&page=1&page_size=${EXPORT_PAGE_SIZE}`);
      setFullHistory(data.history || []);
    } catch (e: any) {
      console.error('Failed to load full history for export:', e);
    }
  };

  const goToPage = (next: number) => {
    if (pagination && (next < 1 || next > pagination.total_pages)) return;
    setPage(next);
    setExpandedDate(null);
    setFilesData(null);
    loadHistory(next);
  };

  const exportColumns = [
    { key: "No", label: "#" },
    { key: "Date", label: "Date" },
    { key: "Files", label: "Files" },
    { key: "Size", label: "Size" },
    { key: "Status", label: "Status" },
  ];

  const exportData = useMemo(() => {
    return fullHistory.map((h, i) => ({
      No: i + 1,
      Date: h.backup_date,
      Files: h.jumlah_files.toLocaleString(),
      Size: h.total_size_formatted,
      Status: h.status,
    }));
  }, [fullHistory]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b dark:border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              📊 Server History: {serverName}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {period === 'all' ? 'All backup history' : `Last ${period} days backup history`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border border-gray-300 dark:border-gray-600 rounded-lg p-0.5">
              {(['all', '30', '90', '365'] as PeriodOption[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${period === p ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                  {p === 'all' ? 'All' : `${p}d`}
                </button>
              ))}
            </div>
            <button
              onClick={async () => {
                if (!statistics || fullHistory.length === 0) { alert('No history data available'); return; }
                setReportLoading(true);
                try {
                  exportBackupCheckHistoryPDF({ serverName, periodDays: period === 'all' ? ALL_DAYS : parseInt(period, 10), statistics, history: fullHistory });
                } catch (err: any) {
                  alert('Failed to generate report: ' + (err.message || 'Unknown error'));
                } finally {
                  setReportLoading(false);
                }
              }}
              disabled={reportLoading}
              className={`px-4 py-2 rounded-lg text-white ${reportLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {reportLoading ? '⏳ Loading...' : '📄 PDF Report'}
            </button>
            <ExportButton
              data={exportData}
              filename={`history-${serverName}`}
              columns={exportColumns}
              title={`Backup History - ${serverName}`}
            />
            <button onClick={onClose} className="text-2xl hover:opacity-70 text-gray-900 dark:text-white">
              ✕
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        {statistics && (
          <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-b dark:border-gray-700">
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400">Total Backups</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{statistics.total_records}</div>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400">Avg Files</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{statistics.avg_files.toLocaleString()}</div>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400">Avg Size</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{statistics.avg_size_gb.toFixed(2)} GB</div>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400">Max Size</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{statistics.max_size_gb.toFixed(2)} GB</div>
            </div>
          </div>
        )}

        {/* History Table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-4 text-gray-500 dark:text-gray-400">Loading history...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No backup history found for this server
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-white dark:bg-gray-800">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="w-10 px-2 py-3"></th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Files</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Size</th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record, idx) => {
                  const isExpanded = expandedDate === record.backup_date;
                  return (
                  <Fragment key={idx}>
                  <tr
                    onClick={() => toggleExpand(record.backup_date)}
                    className={`border-b dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${idx % 2 === 0 ? 'bg-gray-50 dark:bg-gray-900' : 'bg-white dark:bg-gray-800'}`}
                  >
                    <td className="px-2 py-3 text-center text-gray-500 dark:text-gray-400">
                      <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{record.backup_date}</td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{record.jumlah_files.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{record.total_size_formatted}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-3 py-1 rounded-full text-xs font-medium">
                        {record.status}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-100 dark:bg-gray-900/60">
                      <td colSpan={5} className="px-4 py-4">
                        {(filesLoading && !filesData) ? (
                          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                            Loading files...
                          </div>
                        ) : !filesData || !filesData.available ? (
                          <div className="text-sm text-gray-500 dark:text-gray-400 py-2">
                            Daftar file belum tersedia untuk tanggal ini (perlu scan ulang).
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <input
                                type="text"
                                value={filesSearch}
                                onChange={(e) => setFilesSearch(e.target.value)}
                                placeholder="Cari file..."
                                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white w-64 max-w-full"
                              />
                              {filesData.pagination && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {filesData.pagination.total_records} file
                                </span>
                              )}
                            </div>
                            {filesData.truncated && (
                              <div className="text-xs text-amber-600 dark:text-amber-400">
                                Daftar dipotong (maksimum tersimpan tercapai) — sebagian file mungkin tidak tampil.
                              </div>
                            )}
                            {filesLoading ? (
                              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-4">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                                Memuat...
                              </div>
                            ) : filesData.files.length === 0 ? (
                              <div className="text-sm text-gray-500 dark:text-gray-400 py-2">Tidak ada file yang cocok.</div>
                            ) : (
                              <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                {filesData.files.map((f, fi) => (
                                  <li key={fi} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800">
                                    {f.section && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0">
                                        {f.section}
                                      </span>
                                    )}
                                    <span className="font-mono text-xs text-gray-800 dark:text-gray-200 break-all">{f.path}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {filesData.pagination && filesData.pagination.total_pages > 1 && (
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => goToFilesPage(Math.max(1, filesPage - 1))} disabled={!filesData.pagination.has_prev} className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50 hover:bg-blue-700 font-medium">← Prev</button>
                                <span className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded-lg">Hal {filesData.pagination.page} / {filesData.pagination.total_pages}</span>
                                <button onClick={() => goToFilesPage(Math.min(filesData.pagination!.total_pages, filesPage + 1))} disabled={!filesData.pagination.has_next} className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50 hover:bg-blue-700 font-medium">Next →</button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {pagination && pagination.total_pages > 1 && (
          <div className="px-6 py-3 border-t dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Menampilkan {((pagination.page - 1) * pagination.page_size) + 1}-{Math.min(pagination.page * pagination.page_size, pagination.total_records)} dari {pagination.total_records} data
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => goToPage(Math.max(1, page - 1))} disabled={!pagination.has_prev} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50 hover:bg-blue-700 font-medium">← Sebelumnya</button>
              <span className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm">Halaman {pagination.page} / {pagination.total_pages}</span>
              <button onClick={() => goToPage(Math.min(pagination.total_pages, page + 1))} disabled={!pagination.has_next} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50 hover:bg-blue-700 font-medium">Selanjutnya →</button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t dark:border-gray-700 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-white">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
