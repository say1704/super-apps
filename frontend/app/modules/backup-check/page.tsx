"use client";

import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/auth';
import { exportBackupCheckReportPDF } from '@/lib/export';
import { PageContainer } from '@/components/page-container';
import { useToast } from '@/components/toast';

import { useThemeDetector } from '@/hooks/useTheme';
import { CredentialForm } from './components/credential-form';
import { SummaryCards } from './components/summary-cards';
import { BackupTable } from './components/backup-table';
import { SearchFilterSection } from './components/search-filter-section';
import { ServerHistoryModal } from './components/server-history-modal';

interface BackupRecord {
  server: string;
  date: string;
  files: number;
  files_formatted: string;
  size_bytes: number;
  size_formatted: string;
  status: 'OK' | 'Warning' | 'Critical';
  filename: string;
}

interface Summary {
  total_servers: number;
  ok_count: number;
  warning_count: number;
  critical_count: number;
  total_files: string;
  total_size: string;
}

interface ApiResponse {
  summary: Summary;
  records: BackupRecord[];
  message: string;
  warning?: string;
}

interface ExportSummary {
  total_servers: number;
  total_files: string;
  total_size: string;
}

export default function BackupCheckModule() {
  const { success, error, warning, info } = useToast();
  const isDark = useThemeDetector();

  // Data states
  const [summary, setSummary] = useState<Summary | null>(null);
  const [records, setRecords] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    total: number;
    processed: number;
    current_file: string;
    estimated_seconds: number;
  } | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [dataRange, setDataRange] = useState<{ earliest_date: string | null; latest_date: string | null } | null>(null);
  const today = new Date().toISOString().split('T')[0];
  const [filteredData, setFilteredData] = useState<BackupRecord[]>([]);

  // Modal states
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleServerClick = (serverName: string) => {
    setSelectedServer(serverName);
    setIsModalOpen(true);
  };

  // Load servers from DB on mount
  useEffect(() => {
    loadServersFromDB();
  }, []);

  // Reload data when date range changes
  useEffect(() => {
    if (fromDate && toDate) {
      loadServersFromDB(fromDate, toDate);
    } else {
      loadServersFromDB();
    }
  }, [fromDate, toDate]);

  const loadServersFromDB = async (from?: string, to?: string) => {
    try {
      const params = new URLSearchParams();
      if (from && to) {
        params.set('from_date', from);
        params.set('to_date', to);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await apiRequest(`/api/backup-check/servers${query}`);

      if (data.data_range) {
        setDataRange(data.data_range);
      }

      if (data.servers && data.servers.length > 0) {
        // Convert to summary format - count by days_since
        const todayCount = data.servers.filter((s: any) => s.days_since === 0).length;
        const yesterdayCount = data.servers.filter((s: any) => s.days_since === 1).length;
        const weekCount = data.servers.filter((s: any) => s.days_since >= 2 && s.days_since <= 7).length;
        const oldCount = data.servers.filter((s: any) => s.days_since > 7).length;
        
        setSummary({
          total_servers: data.total,
          ok_count: todayCount,
          warning_count: yesterdayCount + weekCount,
          critical_count: oldCount,
          total_files: data.servers.reduce((sum: number, s: any) => sum + s.latest_files, 0).toLocaleString(),
          total_size: formatSize(data.servers.reduce((sum: number, s: any) => sum + s.latest_size_bytes, 0))
        });
        
        // Convert to records format for table
        const serverRecords: BackupRecord[] = data.servers.map((s: any) => ({
          server: s.server,
          date: s.latest_backup,
          files: s.latest_files,
          files_formatted: s.latest_files.toLocaleString(),
          size_bytes: s.latest_size_bytes,
          size_formatted: s.latest_size,
          status: s.status
        }));
        
        setRecords(serverRecords);
        setFilteredData(serverRecords);
        setDataLoaded(true);
      }
    } catch (e: any) {
      console.error('Failed to load servers from DB:', e);
    }
  };

  // Apply filters when search or filter changes
  useEffect(() => {
    let filtered = [...records];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(record =>
        record.server.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(record => {
        if (statusFilter === 'today') {
          return record.status.includes('Today');
        } else if (statusFilter === 'week') {
          return record.status.includes('Yesterday') || 
                 (record.status.includes('days ago') && parseInt(record.status) <= 7);
        } else if (statusFilter === 'old') {
          return record.status.includes('days ago') && parseInt(record.status) > 7;
        }
        return true;
      });
    }

    // Date range filter
    if (dateRangeFilter !== 'all') {
      const today = new Date();
      const cutoffDate = new Date();
      
      if (dateRangeFilter === 'today') {
        cutoffDate.setDate(today.getDate());
      } else if (dateRangeFilter === 'week') {
        cutoffDate.setDate(today.getDate() - 7);
      } else if (dateRangeFilter === 'month') {
        cutoffDate.setDate(today.getDate() - 30);
      } else if (dateRangeFilter === 'old') {
        cutoffDate.setDate(today.getDate() - 30);
      }
      
      filtered = filtered.filter(record => {
        const recordDate = new Date(record.date);
        if (dateRangeFilter === 'old') {
          return recordDate < cutoffDate;
        }
        return recordDate >= cutoffDate;
      });
    }

    setFilteredData(filtered);
  }, [searchTerm, statusFilter, dateRangeFilter, records]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return unitIndex === 0 ? `${Math.round(size)} ${units[unitIndex]}` : `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  // Test connection
  const handleTestConnection = async (credentials: any) => {
    setLoading(true);
    try {
      const data = await apiRequest('/api/backup-check/test-connection', {
        method: 'POST',
        body: JSON.stringify({
          nas_ip: credentials.nas_ip,
          username: credentials.username,
          password: credentials.password,
          port: credentials.port
        })
      });

      success(data.message);  // Remove extra emoji
    } catch (e: any) {
      error(e.message || 'Connection failed');  // Remove extra emoji
    } finally {
      setLoading(false);
    }
  };

  // Check backups with progress tracking
  const handleCheckBackups = async (credentials: any) => {
    setLoading(true);
    setWarningMessage(null);
    setProgress({ total: 0, processed: 0, current_file: '', estimated_seconds: 0 });
    
    try {
      // Start backup check with auto mode (returns operation_id immediately)
      const startData = await apiRequest('/api/backup-check/run-manual', {
        method: 'POST',
        body: JSON.stringify({
          ...credentials,
          mode: 'auto'  // Use hybrid auto-detect
        })
      });

      const operationId = startData.operation_id;
      console.log('Backup check started:', operationId);
      
      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const progressData = await apiRequest(`/api/backup-check/progress/${operationId}`);
          console.log('Progress:', progressData);
          
          if (progressData.status === 'completed') {
            clearInterval(pollInterval);
            
            // Fetch results and reload from DB
            console.log('Fetching results...');
            await loadServersFromDB();  // Reload from DB to get updated data
            
            success('Backup check completed successfully');
            setLoading(false);
            setProgress(null);
          } else if (progressData.status === 'error') {
            clearInterval(pollInterval);
            error(progressData.error || 'Unknown error');  // Remove extra emoji
            setLoading(false);
            setProgress(null);
          } else {
            // Update progress
            setProgress({
              total: progressData.total || 0,
              processed: progressData.processed || 0,
              current_file: progressData.current || '',
              estimated_seconds: 0
            });
          }
        } catch (e) {
          console.error('Poll error:', e);
        }
      }, 500); // Poll every 500ms
      
      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (loading) {
          error('Operation timeout');
          setLoading(false);
          setProgress(null);
        }
      }, 300000);
      
    } catch (e: any) {
      error(e.message || 'Failed to start backup check');  // Remove extra emoji
      setLoading(false);
      setProgress(null);
    }
  };

  // Re-check
  const handleRecheck = () => {
    info('Please enter credentials and click "Check Backups"');
  };

  return (
    <PageContainer
      title="Backup Check"
    >
      {/* Info Banner */}
      <div className="mb-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <span className="text-2xl">Info</span>
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100">
              Zero-Trust Security
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              Credentials are entered manually each session and stored in-memory only. 
              They are automatically deleted after use and never saved to disk or database.
            </p>
          </div>
        </div>
      </div>

      {/* Performance Warning Banner */}
      {warningMessage && (
        <div className="mb-4 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-start gap-3">
            <span className="text-2xl">Warning</span>
            <div>
              <h4 className="font-medium text-yellow-900 dark:text-yellow-100">
                Performance Optimization
              </h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                {warningMessage}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Monitor backup status from QNAP NAS via SSH
        </p>
      </div>

      {/* Credential Form */}
      <CredentialForm
        onTestConnection={handleTestConnection}
        onCheckBackups={handleCheckBackups}
        isLoading={loading}
      />

      {/* Search & Filter Section */}
      <SearchFilterSection
        searchTerm={searchTerm}
        statusFilter={statusFilter}
        dateRangeFilter={dateRangeFilter}
        onSearchChange={setSearchTerm}
        onStatusFilterChange={setStatusFilter}
        onDateRangeFilterChange={setDateRangeFilter}
        onClear={() => {
          setSearchTerm('');
          setStatusFilter('all');
          setDateRangeFilter('all');
        }}
        total={records.length}
        filtered={filteredData.length}
      />

      {/* PDF Report Toolbar */}
      <div className="mb-4 flex gap-2 items-center">
        <div className="ml-auto flex gap-2 items-center">
        <div className="flex items-center gap-1">
          <label className="text-sm font-medium">📅 From:</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            max={today}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-sm font-medium">To:</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            max={today}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          />
        </div>
        {dataRange && dataRange.earliest_date && dataRange.latest_date && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Data available: {dataRange.earliest_date} to {dataRange.latest_date}
          </div>
        )}
        <button
          onClick={async () => {
            if (!fromDate || !toDate) { alert('Please select both from and to dates'); return; }
            if (fromDate > toDate) { alert('From date must be before or equal to to date'); return; }
            const diffDays = Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 365) { alert('Date range maximum 365 days'); return; }
            setReportLoading(true);
            try {
              const allData = await apiRequest(
                `/api/backup-check/export?from_date=${fromDate}&to_date=${toDate}`
              );
              if (!allData.backups || allData.backups.length === 0) {
                alert('No data for selected date range');
                return;
              }
              const allRecords: BackupRecord[] = allData.backups;
              const uniqueServers = new Set(allRecords.map(r => r.server));
              const totalFiles = allRecords.reduce((sum, r) => sum + (r.files || 0), 0);
              const totalSizeBytes = allRecords.reduce((sum, r) => sum + (r.size_bytes || 0), 0);
              const exportSummary: ExportSummary = {
                total_servers: uniqueServers.size,
                total_files: totalFiles.toLocaleString(),
                total_size: formatSize(totalSizeBytes)
              };
              exportBackupCheckReportPDF(
                { summary: exportSummary, records: allRecords },
                fromDate,
                toDate,
              );
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
        <button
          onClick={() => loadServersFromDB()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          🔄 Refresh
        </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && <SummaryCards summary={summary} />}

      {/* Backup Table */}
      <BackupTable
        records={filteredData}
        onRecheck={handleRecheck}
        isLoading={loading}
        onServerClick={handleServerClick}
      />

      {/* Server History Modal */}
      {selectedServer && (
        <ServerHistoryModal
          serverName={selectedServer}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedServer(null);
          }}
        />
      )}

      {/* Loading Overlay with Progress */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="text-lg font-medium">Processing...</span>
            </div>
            
            {progress && progress.total > 0 ? (
              <div className="space-y-3">
                {/* Progress Bar */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">
                      {progress.processed} / {progress.total} files
                    </span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {Math.round((progress.processed / progress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min((progress.processed / progress.total) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
                
                {/* Current File */}
                {progress.current_file && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">
                    {progress.current_file}
                  </div>
                )}
                
                {/* Estimated Time */}
                {progress.estimated_seconds > 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    ~{progress.estimated_seconds < 60 
                      ? `${progress.estimated_seconds} seconds` 
                      : `${Math.round(progress.estimated_seconds / 60)} minutes`} remaining
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-600 dark:text-gray-400">
                Connecting to NAS...
              </div>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
