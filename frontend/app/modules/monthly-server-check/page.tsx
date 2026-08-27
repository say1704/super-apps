// frontend/app/modules/monthly-server-check/page.tsx
// Monthly Server Check - SAR-based capacity monitoring (replaces manual input)

"use client";

import { useEffect, useState, useRef, useCallback, Fragment } from 'react';
import { apiRequest } from '@/lib/auth';
import { groupServersBySubnet } from '@/lib/subnet';
import ServerDetailModal from './components/server-detail-modal';
import { exportCapacityReportPDF, exportSLAPDF } from '@/lib/export';

interface NetworkInterfaceDetail {
  interface_name: string;
  speed: string;
  total_rx: string;
  total_tx: string;
  total_packet_drop: number;
  internet_status: string;
  ip_address: string;
  mac_address: string;
}

interface ServerMetrics {
  id: number;
  tanggal: string;
  hostname: string;
  ip_address: string;
  os?: string;
  status: 'ok' | 'warning' | 'critical';
  alert_reason: string;
  cpu_peak: number;
  cpu_peak_time: string | null;
  cpu_peak_max: number | null;
  ram_peak: number;
  ram_peak_time: string | null;
  disk_root_pct: number;
  disk_usr_local_syb_pct: number | null;
  net_rx_peak: number;
  net_tx_peak: number;
  net_rx_total: string;
  net_tx_total: string;
  packet_drop_total: number;
  internet_status: string;
  network_interfaces?: NetworkInterfaceDetail[];
}

interface DashboardStats {
  total_servers: number;
  ok_count: number;
  warning_count: number;
  critical_count: number;
  last_updated: string;
}

export default function MonthlyServerCheckModule() {
  const [loading, setLoading] = useState(true);
  const [servers, setServers] = useState<ServerMetrics[]>([]);
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
    sar_dir: '',
    private_key: '',
    mode: 'auto'  // NEW: scan mode
  });

  const [authMode, setAuthMode] = useState<'root' | 'sudo'>('root');
  // One-time correction: re-parse & overwrite existing dates instead of skipping them.
  const [overwrite, setOverwrite] = useState(false);
  const [authMethod, setAuthMethod] = useState<'password' | 'key'>('password');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

  const toggleExpand = (hostname: string) => {
    setExpandedServers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(hostname)) {
        newSet.delete(hostname);
      } else {
        newSet.add(hostname);
      }
      return newSet;
    });
  };
  const [scanning, setScanning] = useState(false);
  const [scanModeInfo, setScanModeInfo] = useState<{
    mode: string;
    days_to_check: number;
    last_scan_date: string | null;
    description: string;
  } | null>(null);
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

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [dataRange, setDataRange] = useState<{ earliest_date: string | null; latest_date: string | null } | null>(null);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    loadDashboard();
    fetchScanModeInfo();
  }, []);

  useEffect(() => {
    if (fromDate && toDate) {
      loadDashboard(fromDate, toDate);
      const t = setTimeout(() => handleExportPDF(), 800);
      return () => clearTimeout(t);
    } else {
      loadDashboard();
    }
  }, [fromDate, toDate]);

  const lastAutoRange = useRef('');
  const handleExportPDF = useCallback(async (force = false) => {
    if (!fromDate || !toDate) {
      alert('Please select both from and to dates');
      return;
    }
    if (fromDate > toDate) {
      alert('From date must be before or equal to to date');
      return;
    }
    const diffDays = Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 365) { alert('Date range maximum 365 days'); return; }
    const rangeKey = `${fromDate}_${toDate}`;
    if (!force && lastAutoRange.current === rangeKey) return;
    lastAutoRange.current = rangeKey;
    setReportLoading(true);
    try {
      const data = await apiRequest(`/api/v1/capacity-reports/export?from_date=${fromDate}&to_date=${toDate}`);
      if (!data.records || data.records.length === 0) {
        alert(`No capacity data available for ${fromDate} to ${toDate}.`);
        return;
      }
      await exportCapacityReportPDF(data, fromDate, toDate);
    } catch (err: any) {
      console.error('Export failed:', err);
    } finally {
      setReportLoading(false);
    }
  }, [fromDate, toDate]);

  const handleExportSLAPDF = async () => {
    if (!fromDate || !toDate) {
      alert('Please select both from and to dates');
      return;
    }
    if (fromDate > toDate) {
      alert('From date must be before or equal to to date');
      return;
    }
    const diffDays = Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 365) { alert('Date range maximum 365 days'); return; }
    setReportLoading(true);
    try {
      const data = await apiRequest(`/api/v1/capacity-reports/sla-export?from_date=${fromDate}&to_date=${toDate}`);
      if (!data.rows || data.rows.length === 0) {
        alert(`No SLA data available for ${fromDate} to ${toDate}.`);
        return;
      }
      await exportSLAPDF(data, fromDate, toDate);
    } catch (err: any) {
      console.error('Export SLA failed:', err);
    } finally {
      setReportLoading(false);
    }
  };

  const fetchScanModeInfo = async () => {
    try {
      const data = await apiRequest('/api/capacity-planning/scan-mode');
      setScanModeInfo(data);
    } catch (error: any) {
      console.error('Failed to fetch scan mode info:', error);
    }
  };

  const loadDashboard = async (from?: string, to?: string) => {
    setLoading(true);
    try {
      // Build query string for date range filter
      const dateQuery = from && to ? `?from_date=${from}&to_date=${to}` : '';

      // Load stats - will auto-redirect to login if 401
      const statsData = await apiRequest(`/api/capacity-planning/dashboard/stats${dateQuery}`);
      setStats(statsData);

      // Store data range if available
      if (statsData.data_range) {
        setDataRange(statsData.data_range);
      }

      // Load servers - will auto-redirect to login if 401
      const serversData = await apiRequest(`/api/capacity-planning/servers?page=1&page_size=100${from && to ? `&from_date=${from}&to_date=${to}` : ''}`);
      setServers(serversData.data || []);

      // Show message if no data found
      if ((!serversData.data || serversData.data.length === 0) && from && to) {
        const dataRangeMsg = statsData.data_range?.earliest_date && statsData.data_range?.latest_date
          ? ` Available data range: ${statsData.data_range.earliest_date} to ${statsData.data_range.latest_date}`
          : '';
        alert(`No capacity data found for ${from} to ${to}.${dataRangeMsg}`);
      }
    } catch (error: any) {
      // Don't show error if redirecting to login
      if (!error.message.includes('Session expired')) {
        console.error('Failed to load dashboard:', error);
      }
    } finally {
      setLoading(false);
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
        sar_dir: fetchData.sar_dir,
        mode: fetchData.mode,
        auth_mode: authMode,  // root or sudo
        overwrite: overwrite  // re-parse & update existing dates
      };

      if (authMethod === 'key' && fetchData.private_key) {
        bodyData.private_key = fetchData.private_key;
      } else if (authMethod === 'password' && fetchData.password) {
        bodyData.password = fetchData.password;
      }

      // Start scan - returns operation_id
      const startResult = await apiRequest('/api/capacity-planning/fetch', {
        method: 'POST',
        body: JSON.stringify(bodyData)
      });

      if (bodyData.password) bodyData.password = '';
      if (bodyData.private_key) bodyData.private_key = '';

      const operationId = startResult.operation_id;

      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const progress = await apiRequest(`/api/capacity-planning/progress/${operationId}`);
          
          setScanProgress({
            processed: progress.processed || 0,
            total: progress.total || 100,
            current: progress.current || 'Processing...',
            status: progress.status || 'running',
            result: progress.result
          });

          // Check if complete or error
          if (progress.status === 'completed' || progress.status === 'error') {
            clearInterval(pollInterval);
            setScanning(false);
            
            if (progress.status === 'completed' && progress.result) {
              const s = progress.result.summary;
              let alertMsg = `✅ Scan Complete!\n\n`;
              alertMsg += `📊 Mode: ${s.mode || 'Manual'}\n`;
              alertMsg += `📁 Total Files Found: ${s.total_files_found}\n`;
              alertMsg += `📥 Files to Import: ${s.files_after_filter}\n`;
              alertMsg += `✅ Imported: ${s.imported}\n`;
              if (s.overwritten) alertMsg += `🔁 Overwritten (re-parse): ${s.overwritten}\n`;
              alertMsg += `⏭️ Skipped (Duplicate): ${s.skipped_existing}\n`;
              alertMsg += `🗓️ Skipped (Old): ${s.skipped_old_date || 0}\n`;
              if (s.errors && s.errors.length > 0) {
                alertMsg += `❌ Errors: ${s.errors.length}\n\n`;
                // Show first 3 errors
                s.errors.slice(0, 3).forEach((err: string, i: number) => {
                  alertMsg += `  ${i+1}. ${err}\n`;
                });
                if (s.errors.length > 3) {
                  alertMsg += `  ... and ${s.errors.length - 3} more`;
                }
              }
              alert(alertMsg);
              setShowFetchForm(false);
              loadDashboard();
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

    // Determine server list source
    if (bulkSelectFromList) {
      // Use selected servers from existing list
      if (bulkSelectedServers.length === 0) {
        alert('Please select at least one server from the list');
        return;
      }
      serverList = bulkSelectedServers;
    } else {
      // Use pasted IPs
      if (!bulkServers.trim()) {
        alert('Please enter at least one server IP/hostname');
        return;
      }
      serverList = bulkServers.split('\n').filter(s => s.trim());
    }

    // Check auth credentials
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
      // Start parallel batch scan
      const result = await apiRequest('/api/capacity-planning/scan-all', {
        method: 'POST',
        body: JSON.stringify({
          servers: serverList,
          username: fetchData.username,
          private_key: hasKey ? fetchData.private_key : undefined,
          password: hasPassword ? bulkPassword : undefined,
          port: fetchData.port || 22,
          sar_dir: fetchData.sar_dir || '/var/log/sa',
          mode: fetchData.mode,
          auth_mode: 'sudo',
          max_workers: bulkMaxWorkers,
          overwrite: overwrite,  // re-parse & update existing dates
        }),
      });

      const operationId = result.operation_id;

      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const progress = await apiRequest(`/api/capacity-planning/progress/${operationId}`);

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

          // Check if complete
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
              if (errorList.length > 5) {
                alertMsg += `  ... and ${errorList.length - 5} more\n`;
              }
            }

            alert(alertMsg);
            setBatchProgress(null);
            setBulkServers('');
            loadDashboard();
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'critical':
        return '🚨 Critical';
      case 'warning':
        return '⚠️ Warning';
      default:
        return '✅ OK';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      case 'warning':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300';
      default:
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
    }
  };

  const filteredServers = servers.filter(server => {
    const matchesSearch = server.hostname.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || server.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📈 Server Capacity Monitoring</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">SAR-based capacity monitoring & planning</p>
        </div>
        <div className="flex gap-2">
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

      {/* Bulk Import Form */}
      {showBulkImport && (
        <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">📥 Bulk Import Servers</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Paste multiple server IPs or select from existing servers.
          </p>

          {/* Auth Method for Bulk */}
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
              ⚠️ Make sure sudo is setup on all target servers!
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Run <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">./setup_sudoers.sh</code> on each server first.
            </p>
          </div>

          {/* Server Source Toggle */}
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
            /* Select from existing servers */
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
                            // Use IP address for SSH connection (not hostname which may not resolve)
                            const serverLabel = server.hostname || server.ip_address;
                            const serverAddress = server.ip_address || server.hostname;
                            const isSelected = bulkSelectedServers.includes(serverAddress);
                            return (
                              <label
                                key={server.id}
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
                                {server.ip_address && server.hostname && (
                                  <span className="text-xs text-gray-400">({server.ip_address})</span>
                                )}
                                <span className="text-xs text-gray-400">({server.os || '?'})</span>
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
            /* Manual paste */
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Server IPs/Hostnames *</label>
              <textarea
                value={bulkServers}
                onChange={(e) => setBulkServers(e.target.value)}
                placeholder="192.168.1.10&#10;192.168.1.11&#10;192.168.1.12&#10;server-01&#10;server-02"
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono text-sm"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">💡 One server per line</p>
            </div>
          )}

          {/* Auth section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
            <h4 className="text-sm font-semibold mb-3">🔐 Authentication</h4>

            {/* Auth mode toggle */}
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
                <label className="block text-sm font-medium mb-1">SAR Log Directory *</label>
                <input
                  type="text"
                  value={fetchData.sar_dir}
                  onChange={(e) => setFetchData({...fetchData, sar_dir: e.target.value})}
                  placeholder="e.g., /root/log_job atau /var/log/sa"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* Password field */}
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
                      title="Show/Hide password"
                    >
                      {bulkShowPassword ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
              )}

              {/* Parallel Workers */}
              <div className="col-span-1">
                <label className="block text-sm font-medium mb-1">Parallel Workers</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={bulkMaxWorkers}
                  onChange={(e) => setBulkMaxWorkers(parseInt(e.target.value) || 50)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* Scan Mode */}
              <div className="col-span-1">
                <label className="block text-sm font-medium mb-1">📊 Scan Mode</label>
                <select
                  value={fetchData.mode}
                  onChange={(e) => setFetchData({ ...fetchData, mode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                >
                  <option value="auto">🤖 Auto-Detect (Recommended)</option>
                  <option value="daily">📅 Daily (Last 7 days)</option>
                  <option value="weekly">📆 Weekly (Last 30 days)</option>
                  <option value="monthly">🗓️ Monthly (All - 365 days)</option>
                </select>
                {fetchData.mode === 'auto' && scanModeInfo && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Auto-detected: <strong>{scanModeInfo.mode}</strong> - {scanModeInfo.description}
                  </p>
                )}
              </div>

              {/* Overwrite / re-parse toggle (one-time correction) */}
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
                      Hitung ulang & perbarui tanggal yang sudah ada (RAM/CPU/disk/network) dengan
                      logika terbaru — tanpa menghapus data. Nyalakan hanya untuk koreksi sekali.
                    </p>
                  </span>
                </label>
              </div>

              {/* SSH Key field */}
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

          {/* Action buttons */}
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

          {/* Progress bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6 mb-4">
            <div
              className="h-6 rounded-full bg-blue-500 text-sm font-medium text-white text-center transition-all duration-300"
              style={{ width: `${batchProgress.total > 0 ? Math.round(((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100) : 0}%` }}
            >
              {batchProgress.total > 0 ? Math.round(((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100) : 0}%
            </div>
          </div>

          {/* Stats row */}
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

          {/* Server results table */}
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

          {/* Errors */}
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

          {/* Auth Mode Selector (Root vs Sudo) */}
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

          {/* Scan Mode Selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">📊 Scan Mode:</label>
            <select
              value={fetchData.mode}
              onChange={(e) => setFetchData({...fetchData, mode: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            >
              <option value="auto">🤖 Auto-Detect (Recommended)</option>
              <option value="daily">📅 Daily (Last 7 days)</option>
              <option value="weekly">📆 Weekly (Last 30 days)</option>
              <option value="monthly">🗓️ Monthly (All - 365 days)</option>
            </select>
            {fetchData.mode === 'auto' && scanModeInfo && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Auto-detected: <strong>{scanModeInfo.mode}</strong> - {scanModeInfo.description}
                {scanModeInfo.last_scan_date && ` (Last scan: ${new Date(scanModeInfo.last_scan_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })})`}
              </p>
            )}
          </div>

          {/* Overwrite / re-parse toggle (one-time correction) */}
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
                  Perbarui tanggal yang sudah ada di database (hitung ulang RAM/CPU/disk/network
                  dengan logika terbaru), bukan melewatinya. Data lama TIDAK dihapus. Nyalakan hanya
                  untuk koreksi sekali; matikan lagi untuk scan rutin.
                </p>
              </span>
            </label>
          </div>

          {/* Auth Method Selector */}
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
                📅 <strong>Auto-Scan:</strong> Sistem akan membaca <strong>SEMUA file log</strong> di folder tersebut.
                <br />
                Pola: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">YYYYMMDD_daily-hostname.log</code>
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
            
            {/* Password Field (only if password auth selected) */}
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
                      title={showPassword ? "Hide password" : "Show password"}
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
            
            {/* SSH Key Field (only if key auth selected) */}
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
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">💡 Paste content of backup_reader_key file</p>
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
              <label className="block text-sm font-medium mb-1">SAR Log Directory</label>
              <input
                type="text"
                value={fetchData.sar_dir}
                onChange={(e) => setFetchData({...fetchData, sar_dir: e.target.value})}
                placeholder="e.g., /root/log_job atau /var/log/sa"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">💡 Auto-Scan: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">*_daily-*.log</code></p>
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
            <div className="text-sm text-green-600 dark:text-green-400">✅ OK</div>
            <div className="text-3xl font-bold">{stats.ok_count}</div>
          </div>
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <div className="text-sm text-yellow-600 dark:text-yellow-400">⚠️ Warning</div>
            <div className="text-3xl font-bold">{stats.warning_count}</div>
          </div>
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="text-sm text-red-600 dark:text-red-400">🚨 Critical</div>
            <div className="text-3xl font-bold">{stats.critical_count}</div>
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
            <option value="ok">✅ OK</option>
            <option value="warning">⚠️ Warning</option>
            <option value="critical">🚨 Critical</option>
          </select>
        </div>
        <div className="ml-auto flex gap-2 items-center">
          <div className="flex items-center gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">📅 From:</label>
            <input
              type="date"
              max={today}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">To:</label>
            <input
              type="date"
              max={today}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
          {dataRange && dataRange.earliest_date && dataRange.latest_date && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Data: {dataRange.earliest_date} to {dataRange.latest_date}
            </div>
          )}
          <button
            onClick={() => handleExportPDF(true)}
            disabled={reportLoading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
          >
            {reportLoading ? '⏳' : '📄'} PDF Report
          </button>
          <button
            onClick={handleExportSLAPDF}
            disabled={reportLoading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm"
          >
            {reportLoading ? '⏳' : '📊'} Analisa SLA
          </button>
          <button
            onClick={() => loadDashboard()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Server List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap w-10"></th>
              <th className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap">No</th>
              <th className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap">Hostname</th>
              <th className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap">Date</th>
              <th className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap">Status</th>
              <th className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap">CPU</th>
              <th className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap">RAM</th>
              <th className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap">Disk /</th>
              <th className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap">Disk /usr/local/syb</th>
              <th className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap">Network RX</th>
              <th className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap">Network TX</th>
              <th className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap">Packet Drop</th>
              <th className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap">Internet</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const groups = groupServersBySubnet(filteredServers);
              let counter = 0;
              return groups.map((group) => (
                <Fragment key={group.subnet}>
                  <tr className="bg-gray-100 dark:bg-slate-800/70 border-t border-gray-300 dark:border-gray-600">
                    <td colSpan={13} className="px-2 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 font-mono">
                      {group.subnet} <span className="font-normal text-gray-400">· {group.servers.length} server</span>
                    </td>
                  </tr>
                  {group.servers.map((server: any) => {
                    const index = counter++;
                    return (
              <Fragment key={server.id}>
                <tr key={server.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-2 py-2">
                    {server.network_interfaces && server.network_interfaces.length > 1 && (
                      <button
                        onClick={() => toggleExpand(server.hostname)}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-blue-600 dark:text-blue-400 font-bold"
                        title={expandedServers.has(server.hostname) ? 'Collapse interfaces' : 'Expand interfaces'}
                      >
                        {expandedServers.has(server.hostname) ? '−' : '+'}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2 text-sm text-gray-700 dark:text-gray-300">{index + 1}</td>
                  <td className="px-2 py-2">
                    <button
                      onClick={() => setSelectedServer(server.hostname)}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-sm"
                      title="View daily history"
                    >
                      {server.hostname}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-400">
                    {new Date(server.tanggal).toLocaleDateString('id-ID', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(server.status)}`}>
                      {getStatusBadge(server.status)}
                    </span>
                    {server.alert_reason && (
                      <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {server.alert_reason}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-gray-700 dark:text-gray-300">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 w-12">
                        <div
                          className={`h-2 rounded-full ${(server.cpu_peak_max ?? server.cpu_peak) > 90 ? 'bg-red-500' : (server.cpu_peak_max ?? server.cpu_peak) > 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(server.cpu_peak_max ?? server.cpu_peak, 100)}%` }}
                        ></div>
                      </div>
                      <div className="text-xs">
                        <span className="font-mono">{(server.cpu_peak_max ?? server.cpu_peak).toFixed(1)}%</span>
                        {server.cpu_peak_time && (
                          <div className="text-blue-600 dark:text-blue-400 text-xs">{server.cpu_peak_time}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-gray-700 dark:text-gray-300">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 w-12">
                        <div
                          className={`h-2 rounded-full ${server.ram_peak > 90 ? 'bg-red-500' : server.ram_peak > 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(server.ram_peak, 100)}%` }}
                        ></div>
                      </div>
                      <div className="text-xs">
                        <span className="font-mono">{(server.ram_peak ?? 0).toFixed(1)}%</span>
                        {server.ram_peak_time && (
                          <div className="text-purple-600 dark:text-purple-400 text-xs">{server.ram_peak_time}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-gray-700 dark:text-gray-300">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 w-12">
                        <div
                          className={`h-2 rounded-full ${server.disk_root_pct > 90 ? 'bg-red-500' : server.disk_root_pct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(server.disk_root_pct, 100)}%` }}
                        ></div>
                      </div>
                      <span className="text-xs font-mono">{server.disk_root_pct}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-gray-700 dark:text-gray-300">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 w-12">
                        <div
                          className={`h-2 rounded-full ${(server.disk_usr_local_syb_pct || 0) > 90 ? 'bg-red-500' : (server.disk_usr_local_syb_pct || 0) > 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(server.disk_usr_local_syb_pct || 0, 100)}%` }}
                        ></div>
                      </div>
                      <span className="text-xs font-mono">{server.disk_usr_local_syb_pct !== null ? `${server.disk_usr_local_syb_pct}%` : '-'}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 font-mono">
                    {server.net_rx_total || '-'}
                  </td>
                  <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 font-mono">
                    {server.net_tx_total || '-'}
                  </td>
                  <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 font-mono">
                    {server.packet_drop_total || 0}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`px-2 py-1 rounded text-xs ${server.internet_status === 'TERHUBUNG' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
                      {server.internet_status || 'TIDAK TERHUBUNG'}
                    </span>
                  </td>
                </tr>
                {expandedServers.has(server.hostname) && server.network_interfaces && server.network_interfaces.length > 1 && (
                  server.network_interfaces.map((iface: any, ifaceIdx: number) => (
                    <tr key={`${server.id}-iface-${ifaceIdx}`} className="bg-gray-50 dark:bg-slate-800/50 border-l-4 border-l-blue-500">
                      <td className="px-2 py-2"></td>
                      <td className="px-2 py-2"></td>
                      <td className="px-2 py-2 pl-12 text-xs font-mono text-gray-700 dark:text-gray-300">
                        {iface.interface_name}
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-400">
                        {iface.ip_address}
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-400">
                        {iface.speed}
                      </td>
                      <td className="px-2 py-2"></td>
                      <td className="px-2 py-2"></td>
                      <td className="px-2 py-2"></td>
                      <td className="px-2 py-2"></td>
                      <td className="px-2 py-2 text-xs text-blue-600 dark:text-blue-400 font-mono">
                        {iface.total_rx}
                      </td>
                      <td className="px-2 py-2 text-xs text-purple-600 dark:text-purple-400 font-mono">
                        {iface.total_tx}
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 font-mono">
                        {iface.total_packet_drop}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`px-2 py-1 rounded text-xs ${iface.internet_status === 'TERHUBUNG' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {iface.internet_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </Fragment>
                    );
                  })}
                </Fragment>
              ));
            })()}
          </tbody>
        </table>
        {filteredServers.length === 0 && (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <p>No servers found</p>
            <p className="text-sm mt-1">Click "Fetch SAR Data" to add servers</p>
          </div>
        )}
      </div>

      {/* Scanning Overlay with Progress */}
      {scanning && scanProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-8 max-w-lg w-full mx-4">
            <div className="text-center mb-6">
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mb-4"></div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">🔍 Scanning & Importing...</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{scanProgress.current}</p>
            </div>
            
            {/* Progress Bar */}
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

            <div className="text-xs text-gray-500 dark:text-gray-500 text-center">
              {scanProgress.current}
            </div>

            {scanProgress.result?.summary && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-gray-700 dark:text-gray-300">
                <p className="font-semibold mb-1">📊 Scan Summary:</p>
                <p>📁 Total Files: {scanProgress.result.summary.total_files_found}</p>
                <p>📥 To Import: {scanProgress.result.summary.files_after_filter}</p>
                <p>✅ Imported: {scanProgress.result.summary.imported}</p>
                {scanProgress.result.summary.backfilled_network > 0 && (
                  <p>🔁 Network Backfill: {scanProgress.result.summary.backfilled_network}</p>
                )}
                {scanProgress.result.summary.network_interfaces_saved > 0 && (
                  <p>🌐 Interfaces Saved: {scanProgress.result.summary.network_interfaces_saved}</p>
                )}
                <p>⏭️ Duplicates: {scanProgress.result.summary.skipped_existing}</p>
                <p>🗓️ Skipped (Old): {scanProgress.result.summary.skipped_old_date || 0}</p>
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
        />
      )}
    </div>
  );
}
