"use client";

import { useEffect, useState, useCallback, useMemo, useRef, Fragment } from 'react';
import { apiRequest } from '@/lib/auth';
import { groupServersBySubnet } from '@/lib/subnet';
import ExportButton from '@/components/ExportButton';
import ServerDetailModal from './components/server-detail-modal';
import { exportSSHReportPDF } from '@/lib/export';
import AnomalyPanel from '@/components/AnomalyPanel';

interface ServerData {
  hostname: string;
  ip_address: string;
  scan_date: string | null;
  total_logins: number;
  success_count: number;
  failed_count: number;
}

interface DashboardStats {
  total_servers: number;
  success_count: number;
  failed_count: number;
  unique_ips: number;
}

export default function SSHReportModule() {
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [servers, setServers] = useState<ServerData[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFetchForm, setShowFetchForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkServers, setBulkServers] = useState('');
  const [bulkAuthMode, setBulkAuthMode] = useState<'password' | 'key'>('password');
  const [bulkPassword, setBulkPassword] = useState('');
  const [bulkShowPassword, setBulkShowPassword] = useState(false);
  const [bulkSelectFromList, setBulkSelectFromList] = useState(false);
  const [bulkSelectedServers, setBulkSelectedServers] = useState<string[]>([]);
  const [bulkMaxWorkers, setBulkMaxWorkers] = useState(50);
  const [fetchData, setFetchData] = useState({
    hostname: '',
    username: '',
    password: '',
    port: 22,
    ssh_report_dir: '',
    private_key: '',
    mode: 'auto',
  });

  const [authMode, setAuthMode] = useState<'root' | 'sudo'>('root');
  const [authMethod, setAuthMethod] = useState<'password' | 'key'>('password');
  const [showPassword, setShowPassword] = useState(false);
  // One-time correction: re-parse & timpa data lama pada (host, scan_date) daripada melewatinya.
  const [overwrite, setOverwrite] = useState(false);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{
    processed: number;
    total: number;
    current: string;
    status: string;
    result?: any;
  } | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    operation_id: string;
    total: number;
    completed: number;
    failed: number;
    current: string;
    status: string;
    results: Record<string, string>;
    errors: string[];
  } | null>(null);

  const [exportData, setExportData] = useState<any[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [dataRange, setDataRange] = useState<{ earliest_date: string | null; latest_date: string | null } | null>(null);
  const today = new Date().toISOString().split('T')[0];

  const fetchExportData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page_size: '5000' });
      if (searchTerm) params.set('search', searchTerm);
      if (statusFilter === 'failed' || statusFilter === 'success') params.set('status', statusFilter);
      if (startDate) params.set('from_date', startDate);
      if (endDate) params.set('to_date', endDate);
      const result = await apiRequest(`/api/ssh-report/export-data?${params}`);
      setExportData(result.data || []);
    } catch (error: any) {
      console.error('Failed to fetch export data:', error);
    }
  }, [searchTerm, statusFilter, startDate, endDate]);

  const exportColumns = useMemo(() => [
    { key: 'rowNumber', label: '#' },
    { key: 'hostname', label: 'Hostname' },
    { key: 'ip_address', label: 'IP Address' },
    { key: 'login_timestamp', label: 'Timestamp' },
    { key: 'username', label: 'Username' },
    { key: 'source_ip', label: 'Source IP' },
    { key: 'auth_method', label: 'Auth Method' },
    { key: 'status', label: 'Status' },
    { key: 'severity', label: 'Severity' },
  ], []);

  const exportDataWithNumbering = useMemo(() =>
    exportData.map((row, idx) => ({
      ...row,
      rowNumber: idx + 1,
      login_timestamp: row.login_timestamp ? new Date(row.login_timestamp).toLocaleString() : '',
    })),
  [exportData]);

  useEffect(() => {
    fetchExportData();
  }, [fetchExportData]);

  useEffect(() => {
    initialLoad();
  }, []);

  useEffect(() => {
    if (!pageLoading) refreshTable();
  }, [searchTerm, statusFilter, startDate, endDate]);

  const lastAutoRange = useRef('');
  const handleExportPDF = useCallback(async (force = false) => {
    if (!startDate || !endDate) { alert('Please select both from and to dates'); return; }
    if (startDate > endDate) { alert('From date must be before or equal to to date'); return; }
    const diffDays = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 365) { alert('Date range maximum 365 days'); return; }
    const rangeKey = `${startDate}_${endDate}`;
    if (!force && lastAutoRange.current === rangeKey) return;
    lastAutoRange.current = rangeKey;
    setReportLoading(true);
    try {
      const res = await apiRequest(`/api/ssh-report/export?from_date=${startDate}&to_date=${endDate}`);
      if (!res.records || res.records.length === 0) { alert('No data for selected date range'); return; }
      exportSSHReportPDF(res, startDate, endDate);
    } catch (err: any) {
      alert('Failed to load report data: ' + (err.message || 'Unknown error'));
    } finally {
      setReportLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (!startDate || !endDate) return;
    const t = setTimeout(() => handleExportPDF(), 800);
    return () => clearTimeout(t);
  }, [startDate, endDate, handleExportPDF]);

  const initialLoad = async () => {
    setPageLoading(true);
    try {
      const [statsData, serversResp] = await Promise.all([
        apiRequest('/api/ssh-report/dashboard/stats'),
        apiRequest('/api/ssh-report/servers?page=1&page_size=10000'),
      ]);
      setStats(statsData);
      if (statsData.data_range) {
        setDataRange(statsData.data_range);
      }
      setServers(serversResp.data || []);
    } catch (error: any) {
      if (!error.message.includes('Session expired')) {
        console.error('Failed to load dashboard:', error);
      }
    } finally {
      setPageLoading(false);
    }
  };

  const refreshTable = async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams({ page: '1', page_size: '10000' });
      if (searchTerm) params.set('search', searchTerm);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (startDate) params.set('from_date', startDate);
      if (endDate) params.set('to_date', endDate);

      const serversResp = await apiRequest(`/api/ssh-report/servers?${params}`);
      setServers(serversResp.data || []);
    } catch (error: any) {
      if (!error.message.includes('Session expired')) {
        console.error('Failed to refresh table:', error);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const reloadFull = async () => {
    try {
      const params = new URLSearchParams({ page: '1', page_size: '10000' });
      if (searchTerm) params.set('search', searchTerm);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (startDate) params.set('from_date', startDate);
      if (endDate) params.set('to_date', endDate);

      const [statsData, serversResp] = await Promise.all([
        apiRequest('/api/ssh-report/dashboard/stats'),
        apiRequest(`/api/ssh-report/servers?${params}`),
      ]);
      setStats(statsData);
      if (statsData.data_range) {
        setDataRange(statsData.data_range);
      }
      setServers(serversResp.data || []);
    } catch (error: any) {
      if (!error.message.includes('Session expired')) {
        console.error('Failed to reload:', error);
      }
    }
  };

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    setScanning(true);
    setScanProgress({ processed: 0, total: 100, current: 'Starting scan...', status: 'running' });

    try {
      const bodyData: any = {
        hostname: fetchData.hostname,
        username: fetchData.username,
        port: fetchData.port,
        ssh_report_dir: fetchData.ssh_report_dir,
        auth_mode: authMode,
        mode: fetchData.mode,
        overwrite: overwrite
      };

      if (authMethod === 'key' && fetchData.private_key) {
        bodyData.private_key = fetchData.private_key;
      } else if (authMethod === 'password' && fetchData.password) {
        bodyData.password = fetchData.password;
      }

      const startResult = await apiRequest('/api/ssh-report/fetch', {
        method: 'POST',
        body: JSON.stringify(bodyData)
      });

      if (bodyData.password) bodyData.password = '';
      if (bodyData.private_key) bodyData.private_key = '';

      const operationId = startResult.operation_id;

      const pollInterval = setInterval(async () => {
        try {
          const progress = await apiRequest(`/api/ssh-report/progress/${operationId}`);

          setScanProgress({
            processed: progress.processed || 0,
            total: progress.total || 100,
            current: progress.current || 'Processing...',
            status: progress.status || 'running',
            result: progress.result
          });

          if (progress.status === 'completed' || progress.status === 'error') {
            clearInterval(pollInterval);
            setScanning(false);

            if (progress.status === 'completed' && progress.result) {
              const s = progress.result.summary;
let alertMsg = `✅ Scan Complete!\n\n`;
             alertMsg += `📁 Total Files: ${s.total_files}\n`;
             alertMsg += `✅ Imported: ${s.imported}\n`;
             alertMsg += `⏭️ Skipped (Duplicate): ${s.skipped_existing}\n`;
             if (s.overwritten) alertMsg += `🔁 Overwritten (re-parse): ${s.overwritten}\n`;
             if (s.mode) {
               alertMsg += `📊 Mode: ${s.mode}${s.days_checked ? ` (${s.days_checked} hari)` : ''}\n`;
             }
             if (s.skipped_old) {
               alertMsg += `⏭️ Skipped (outside range): ${s.skipped_old}\n`;
             }
              if (s.errors && s.errors.length > 0) {
                alertMsg += `❌ Errors: ${s.errors.length}\n\n`;
                s.errors.slice(0, 3).forEach((err: string, i: number) => {
                  alertMsg += `  ${i+1}. ${err}\n`;
                });
              }
              alert(alertMsg);
              setShowFetchForm(false);
              reloadFull();
            } else if (progress.status === 'error') {
              alert(`❌ Scan Failed\n\n${progress.error || 'Unknown error'}`);
            }

            setScanProgress(null);
          }
        } catch (err) {
          clearInterval(pollInterval);
          setScanning(false);
          setScanProgress(null);
          alert('Failed to poll progress');
        }
      }, 1000);

    } catch (error: any) {
      setScanning(false);
      setScanProgress(null);
      if (!error.message.includes('Session expired') && !error.message.includes('No token')) {
        alert(`Failed: ${error.message}`);
      }
    }
  };

  const handleBulkImport = async () => {
    let serverList: string[] = [];

    if (bulkSelectFromList) {
      if (bulkSelectedServers.length === 0) {
        alert('Please select at least one server from the list');
        return;
      }
      serverList = bulkSelectedServers;
    } else {
      if (!bulkServers.trim()) {
        alert('Please enter at least one server IP/hostname');
        return;
      }
      serverList = bulkServers.split('\n').filter(s => s.trim());
    }

    const hasKey = !!fetchData.private_key;
    const hasPassword = !!bulkPassword;

    if (!hasKey && !hasPassword) {
      alert('⚠️ SSH Private Key or Password is required!');
      return;
    }

    if (!fetchData.username) {
      alert('⚠️ SSH username is required!');
      return;
    }

    setBatchProgress({
      operation_id: '',
      total: serverList.length,
      completed: 0,
      failed: 0,
      current: 'Starting...',
      status: 'running',
      results: {},
      errors: [],
    });

    try {
      const result = await apiRequest('/api/ssh-report/scan-all', {
        method: 'POST',
        body: JSON.stringify({
          servers: serverList,
          username: fetchData.username,
          private_key: hasKey ? fetchData.private_key : undefined,
          password: hasPassword ? bulkPassword : undefined,
          port: fetchData.port || 22,
          ssh_report_dir: fetchData.ssh_report_dir || '/var/log/sa',
          auth_mode: 'sudo',
          max_workers: bulkMaxWorkers,
          mode: fetchData.mode,
          overwrite: overwrite,
        }),
      });

      const operationId = result.operation_id;

      const pollInterval = setInterval(async () => {
        try {
          const progress = await apiRequest(`/api/ssh-report/progress/${operationId}`);

          setBatchProgress((prev) =>
            prev
              ? {
                  ...prev,
                  operation_id: operationId,
                  total: progress.total || prev.total,
                  completed: progress.completed || 0,
                  failed: progress.failed || 0,
                  current: progress.current || '',
                  status: progress.status || 'running',
                  results: progress.results || prev.results,
                  errors: progress.errors || prev.errors,
                }
              : null,
          );

          if (progress.status === 'completed') {
            clearInterval(pollInterval);
            const completedCount = progress.completed || 0;
            const failedCount = progress.failed || 0;
            const errorList = progress.errors || [];

            let alertMsg = `✅ Parallel Bulk Scan Complete!\n\n`;
            alertMsg += `✅ Success: ${completedCount}\n`;
            alertMsg += `❌ Failed: ${failedCount}\n`;
            alertMsg += `📊 Total: ${serverList.length} servers\n`;

            if (errorList.length > 0) {
              alertMsg += `\n❌ Errors:\n`;
              errorList.slice(0, 5).forEach((err: string, i: number) => {
                alertMsg += `  ${i + 1}. ${err}\n`;
              });
            }

            alert(alertMsg);
            setBatchProgress(null);
            setBulkServers('');
            reloadFull();
          } else if (progress.status === 'error') {
            clearInterval(pollInterval);
            alert(`❌ Bulk Scan Failed\n\n${progress.error || 'Unknown error'}`);
            setBatchProgress(null);
          }
        } catch (err) {
          clearInterval(pollInterval);
          setBatchProgress(null);
          alert('Failed to poll progress');
        }
      }, 1000);
    } catch (error: any) {
      setBatchProgress(null);
      if (!error.message.includes('Session expired') && !error.message.includes('No token')) {
        alert(`Failed: ${error.message}`);
      }
    }
  };

  if (pageLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-gray-500 dark:text-gray-400 font-medium">Loading server data...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🔐 SSH Login Report</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">SSH login audit from server report files</p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={exportDataWithNumbering}
            filename="ssh-login-report"
            columns={exportColumns}
            title="SSH Login Report"
          />
          <button
            onClick={() => setShowBulkImport(!showBulkImport)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            📥 Bulk Import
          </button>
          <button
            onClick={() => setShowFetchForm(!showFetchForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {showFetchForm ? '❌ Cancel' : '➕ Add Server'}
          </button>
        </div>
      </div>

      {/* AI anomaly panel (brute-force spikes, source IP baru) */}
      <AnomalyPanel module="ssh-report" title="Deteksi Anomali SSH (AI)" />

      {/* Bulk Import Form */}
      {showBulkImport && (
        <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">📥 Bulk Import Servers</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Paste multiple server IPs or select from existing servers.
          </p>

          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
              ⚠️ Make sure sudo is setup on all target servers!
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Run <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">./setup_sudoers.sh</code> on each server first.
            </p>
          </div>

          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={bulkSelectFromList}
                onChange={(e) => setBulkSelectFromList(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Pilih dari daftar server yang sudah ada ({servers.length} servers)</span>
            </label>
          </div>

          {bulkSelectFromList ? (
            <div className="mb-4 max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-slate-900">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">{bulkSelectedServers.length} selected</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkSelectedServers(servers.map(s => s.ip_address || s.hostname))}
                    className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkSelectedServers([])}
                    className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              {servers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Belum ada server tersimpan</p>
              ) : (
                <div className="space-y-3">
                  {groupServersBySubnet(servers).map((group) => {
                    const groupAddrs = group.servers.map((s: any) => s.ip_address || s.hostname);
                    return (
                      <div key={group.subnet}>
                        <div className="flex items-center justify-between px-1 mb-1">
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 font-mono">
                            {group.subnet} <span className="font-normal text-gray-400">· {group.servers.length} server</span>
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setBulkSelectedServers(prev => Array.from(new Set([...prev, ...groupAddrs])))}
                              className="text-[11px] px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200"
                            >
                              Pilih grup
                            </button>
                            <button
                              type="button"
                              onClick={() => setBulkSelectedServers(prev => prev.filter(addr => !groupAddrs.includes(addr)))}
                              className="text-[11px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200"
                            >
                              Kosongkan grup
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {group.servers.map((server: any) => {
                            const serverLabel = server.hostname || server.ip_address;
                            const serverAddress = server.ip_address || server.hostname;
                            const isSelected = bulkSelectedServers.includes(serverAddress);
                            return (
                              <label
                                key={server.hostname}
                                className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm transition ${
                                  isSelected
                                    ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                                    : 'hover:bg-gray-100 dark:hover:bg-slate-800 border border-transparent'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setBulkSelectedServers(prev => [...prev, serverAddress]);
                                    } else {
                                      setBulkSelectedServers(prev => prev.filter(addr => addr !== serverAddress));
                                    }
                                  }}
                                  className="w-4 h-4"
                                />
                                <span className="truncate">{serverLabel}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Server IPs/Hostnames *</label>
              <textarea
                value={bulkServers}
                onChange={(e) => setBulkServers(e.target.value)}
                placeholder="192.168.1.10&#10;192.168.1.11&#10;server-01"
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono text-sm"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">💡 One server per line</p>
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
            <h4 className="text-sm font-semibold mb-3">🔐 Authentication</h4>
            <div className="mb-3 flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="bulkAuthMode"
                  checked={bulkAuthMode === 'password'}
                  onChange={() => setBulkAuthMode('password')}
                />
                <span className="text-sm">Password</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="bulkAuthMode"
                  checked={bulkAuthMode === 'key'}
                  onChange={() => setBulkAuthMode('key')}
                />
                <span className="text-sm">SSH Private Key</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">SSH Username *</label>
                <input
                  type="text"
                  value={fetchData.username}
                  onChange={(e) => setFetchData({...fetchData, username: e.target.value})}
                  placeholder="backup_reader"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">SSH Report Directory *</label>
                <input
                  type="text"
                  value={fetchData.ssh_report_dir}
                  onChange={(e) => setFetchData({...fetchData, ssh_report_dir: e.target.value})}
                  placeholder="e.g., /var/log/sa"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                />
              </div>

              {bulkAuthMode === 'password' && (
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">SSH Password *</label>
                  <div className="relative">
                    <input
                      type={bulkShowPassword ? 'text' : 'password'}
                      value={bulkPassword}
                      onChange={(e) => setBulkPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setBulkShowPassword(!bulkShowPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      {bulkShowPassword ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
              )}

              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Parallel Workers</label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={bulkMaxWorkers}
                    onChange={(e) => setBulkMaxWorkers(parseInt(e.target.value) || 50)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {bulkAuthMode === 'key' && (
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">SSH Private Key *</label>
                  <textarea
                    value={fetchData.private_key}
                    onChange={(e) => setFetchData({...fetchData, private_key: e.target.value})}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">💡 Passwordless sudo must be setup on all servers</p>
                </div>
              )}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">📊 Scan Mode</label>
            <select
              value={fetchData.mode}
              onChange={(e) => setFetchData({ ...fetchData, mode: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            >
              <option value="auto">🤖 Auto — Semua file (Recommended)</option>
              <option value="daily">📅 Daily — 7 hari terakhir</option>
              <option value="weekly">📆 Weekly — 30 hari terakhir</option>
              <option value="monthly">🗓️ Monthly — 365 hari (backfill libur panjang)</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">💡 Mode selain Auto membatasi scan ke rentang tanggal file.</p>
          </div>

          {/* Overwrite / re-parse toggle (koreksi sekali) */}
          <div className="mb-4">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-medium text-sm">🔁 Timpa data lama (re-parse)</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  Hitung ulang & perbarui tanggal yang sudah ada dengan logika terbaru (baris lama pada
                  host+tanggal itu diganti). Nyalakan hanya untuk koreksi sekali.
                </p>
              </span>
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleBulkImport}
              disabled={batchProgress?.status === 'running'}
              className={`px-4 py-2 rounded-lg ${
                batchProgress?.status === 'running'
                  ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {batchProgress?.status === 'running' ? '⏳ Scanning...' : '🚀 Import All Servers'}
            </button>
            <button
              type="button"
              onClick={() => setShowBulkImport(false)}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Batch Scan Progress */}
      {batchProgress && (
        <div className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg border-2 border-blue-200 dark:border-blue-800">
          <h3 className="text-lg font-semibold mb-4">🚀 Parallel Bulk Scan Progress</h3>

          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6 mb-4">
            <div
              className="h-6 rounded-full bg-blue-500 text-sm font-medium text-white text-center transition-all duration-300"
              style={{ width: `${batchProgress.total > 0 ? Math.round(((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100) : 0}%` }}
            >
              {batchProgress.total > 0 ? Math.round(((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100) : 0}%
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{batchProgress.total}</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400">✅ Success</div>
              <div className="text-lg font-bold text-green-600 dark:text-green-400">{batchProgress.completed}</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400">❌ Failed</div>
              <div className="text-lg font-bold text-red-600 dark:text-red-400">{batchProgress.failed}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400">Current</div>
              <div className="text-sm font-bold text-gray-700 dark:text-gray-300 truncate">{batchProgress.current || '-'}</div>
            </div>
          </div>

          {Object.keys(batchProgress.results).length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Server Results:</h4>
              <div className="max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 dark:bg-gray-700">
                    <tr>
                      <th className="text-left p-2">Server</th>
                      <th className="text-center p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(batchProgress.results).map(([host, status]) => (
                      <tr
                        key={host}
                        className={`border-t border-gray-200 dark:border-gray-700 ${
                          status === 'success' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'
                        }`}
                      >
                        <td className="p-2 font-mono">{host}</td>
                        <td className="p-2 text-center">
                          {status === 'success' ? '✅' : '❌'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {batchProgress.errors.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700">
              <h4 className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">⚠️ Errors:</h4>
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 max-h-24 overflow-y-auto">
                {batchProgress.errors.slice(-5).map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Fetch Form */}
      {showFetchForm && (
        <form onSubmit={handleFetch} className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">🔐 SSH Credentials (Zero-Trust: Not Stored)</h3>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">👤 User Mode:</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('root');
                  setFetchData({...fetchData, username: 'root'});
                }}
                className={`p-3 border-2 rounded-lg text-left transition-all ${
                  authMode === 'root'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">👑</span>
                  <span className="font-semibold text-sm">Root Mode</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Login sebagai root. Command langsung tanpa sudo.
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('sudo');
                  setFetchData({...fetchData, username: ''});
                }}
                className={`p-3 border-2 rounded-lg text-left transition-all ${
                  authMode === 'sudo'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔐</span>
                  <span className="font-semibold text-sm">Sudo Mode</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  User biasa dengan akses sudo. Command pakai `sudo`.
                </p>
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Authentication Method:</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="auth_method"
                  value="password"
                  checked={authMethod === 'password'}
                  onChange={() => {
                    setAuthMethod('password');
                    setShowPassword(false);
                    setFetchData({...fetchData, private_key: ''});
                  }}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm">🔑 Password</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="auth_method"
                  value="key"
                  checked={authMethod === 'key'}
                  onChange={() => {
                    setAuthMethod('key');
                    setFetchData({...fetchData, password: ''});
                  }}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm">🔐 SSH Key (Recommended)</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                📅 <strong>Auto-Scan:</strong> Sistem akan membaca <strong>SEMUA file SSH report</strong> di folder tersebut.
                <br />
                Pola: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">YYYYMMDD_ssh_login_hostname.log</code>
                <br />
                <span className="text-xs">💡 Hostname & tanggal otomatis dari nama file!</span>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Server IP/Address *</label>
              <input
                type="text"
                value={fetchData.hostname}
                onChange={(e) => setFetchData({...fetchData, hostname: e.target.value})}
                placeholder="e.g., 192.168.60.32"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">💡 IP address untuk SSH connect</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">SSH Username *</label>
              <input
                type="text"
                value={fetchData.username}
                onChange={(e) => setFetchData({...fetchData, username: e.target.value})}
                placeholder="e.g., root atau backup_reader"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                required
              />
            </div>

            {authMethod === 'password' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">SSH Password *</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={fetchData.password}
                      onChange={(e) => setFetchData({...fetchData, password: e.target.value})}
                      placeholder="Enter password"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-lg"
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">SSH Port</label>
                  <input
                    type="number"
                    value={fetchData.port}
                    onChange={(e) => setFetchData({...fetchData, port: parseInt(e.target.value)})}
                    placeholder="22"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
              </>
            )}

            {authMethod === 'key' && (
              <>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">SSH Private Key *</label>
                  <textarea
                    value={fetchData.private_key}
                    onChange={(e) => setFetchData({...fetchData, private_key: e.target.value})}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono text-sm"
                    required
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">💡 Paste content of SSH private key file</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">SSH Port</label>
                  <input
                    type="number"
                    value={fetchData.port}
                    onChange={(e) => setFetchData({...fetchData, port: parseInt(e.target.value)})}
                    placeholder="22"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
              </>
            )}

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">SSH Report Directory</label>
              <input
                type="text"
                value={fetchData.ssh_report_dir}
                onChange={(e) => setFetchData({...fetchData, ssh_report_dir: e.target.value})}
                placeholder="e.g., /var/log/sa"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">💡 Auto-Scan: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">*_ssh_login_*.log</code></p>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">📊 Scan Mode</label>
              <select
                value={fetchData.mode}
                onChange={(e) => setFetchData({ ...fetchData, mode: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              >
                <option value="auto">🤖 Auto — Semua file (Recommended)</option>
                <option value="daily">📅 Daily — 7 hari terakhir</option>
                <option value="weekly">📆 Weekly — 30 hari terakhir</option>
                <option value="monthly">🗓️ Monthly — 365 hari (backfill libur panjang)</option>
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">💡 Mode selain Auto membatasi scan ke rentang tanggal file.</p>
            </div>
            {/* Overwrite / re-parse toggle (koreksi sekali) */}
            <div className="col-span-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-sm">🔁 Timpa data lama (re-parse)</span>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    Hitung ulang & perbarui tanggal yang sudah ada dengan logika terbaru (baris lama
                    pada host+tanggal itu diganti). Nyalakan hanya untuk koreksi sekali.
                  </p>
                </span>
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              🚀 Scan & Import All Logs
            </button>
            <button type="button" onClick={() => setShowFetchForm(false)} className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Dashboard Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-sm text-blue-600 dark:text-blue-400">Total Servers</div>
            <div className="text-3xl font-bold">{stats.total_servers}</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="text-sm text-green-600 dark:text-green-400">✅ Success</div>
            <div className="text-3xl font-bold">{stats.success_count}</div>
          </div>
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="text-sm text-red-600 dark:text-red-400">❌ Failed</div>
            <div className="text-3xl font-bold">{stats.failed_count}</div>
          </div>
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="text-sm text-purple-600 dark:text-purple-400">🌐 Unique IPs</div>
            <div className="text-3xl font-bold">{stats.unique_ips}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex gap-4 items-center flex-wrap">
        <div>
          <label className="block text-sm font-medium mb-1">🔍 Search:</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search server..."
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">📊 Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          >
            <option value="all">All</option>
            <option value="failed">Failed</option>
            <option value="success">Success</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">📅 Start Date:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">📅 End Date:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          />
        </div>
        <div className="ml-auto flex gap-2 items-center">
          {dataRange && dataRange.earliest_date && dataRange.latest_date && (
            <div className="text-xs text-gray-500 dark:text-gray-400 self-center">
              Data: {dataRange.earliest_date} to {dataRange.latest_date}
            </div>
          )}
          <button
            onClick={() => handleExportPDF(true)}
            disabled={reportLoading}
            className={`px-4 py-2 rounded-lg text-white ${reportLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {reportLoading ? '⏳ Loading...' : '📄 PDF Report'}
          </button>
          {(searchTerm || statusFilter !== 'all' || startDate || endDate) && (
            <button
              onClick={() => { setSearchTerm(''); setStatusFilter('all'); setStartDate(''); setEndDate(''); }}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              ✕ Clear
            </button>
          )}
          <button
            onClick={refreshTable}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Server List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden relative">
        {refreshing && (
          <div className="absolute inset-0 bg-white/60 dark:bg-gray-800/60 z-10 flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 font-medium">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              Memuat ulang...
            </div>
          </div>
        )}
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">Hostname</th>
              <th className="px-4 py-3 text-left text-sm font-medium">IP Address</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Last Scan</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Total Logins</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Success</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Failed</th>
            </tr>
          </thead>
          <tbody>
            {groupServersBySubnet(servers).map((group) => (
              <Fragment key={group.subnet}>
                <tr className="bg-gray-100 dark:bg-slate-800/70 border-t border-gray-300 dark:border-gray-600">
                  <td colSpan={6} className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 font-mono">
                    {group.subnet} <span className="font-normal text-gray-400">· {group.servers.length} server</span>
                  </td>
                </tr>
                {group.servers.map((server: any) => (
                  <tr key={server.hostname} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedServer(server.hostname)}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                        title="View SSH report details"
                      >
                        {server.hostname}
                      </button>
                      <div className="text-xs text-gray-500 dark:text-gray-400">📊 Click for details</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-mono text-sm">{server.ip_address || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {server.scan_date ? new Date(server.scan_date).toLocaleDateString('id-ID', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300 font-mono">{server.total_logins}</td>
                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400 font-mono">{server.success_count}</td>
                    <td className="px-4 py-3 text-right text-red-600 dark:text-red-400 font-mono">{server.failed_count}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        {servers.length === 0 && (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <p>No servers found</p>
            <p className="text-sm mt-1">Click "Add Server" to scan SSH reports</p>
          </div>
        )}
      </div>

      {/* Scanning Overlay */}
      {scanning && scanProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-8 max-w-lg w-full mx-4">
            <div className="text-center mb-6">
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mb-4"></div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">🔍 Scanning & Importing...</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{scanProgress.current}</p>
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600 dark:text-gray-400">Progress:</span>
                <span className="font-bold text-gray-900 dark:text-white">{scanProgress.processed}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                <div
                  className="h-4 rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${Math.min(scanProgress.processed, 100)}%` }}
                ></div>
              </div>
            </div>

            {scanProgress.result?.summary && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-gray-700 dark:text-gray-300">
                <p className="font-semibold mb-1">📊 Scan Summary:</p>
                <p>📁 Total Files: {scanProgress.result.summary.total_files}</p>
                <p>✅ Imported: {scanProgress.result.summary.imported}</p>
                <p>⏭️ Duplicates: {scanProgress.result.summary.skipped_existing}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Server Detail Modal */}
      {selectedServer && (
        <ServerDetailModal
          hostname={selectedServer}
          onClose={() => setSelectedServer(null)}
          onRefresh={reloadFull}
        />
      )}
    </div>
  );
}
