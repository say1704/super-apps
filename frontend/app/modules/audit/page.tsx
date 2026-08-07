"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/auth';
import { exportAuditPDF } from '@/lib/export';
import AuditDetailModal from './components/audit-detail-modal';

interface ServerData {
  hostname: string;
  ip_address: string | null;
  total_events: number;
  last_scan: string | null;
  total_activities: number;
}

interface DashboardStats {
  total_events: number;
  total_servers: number;
  recent_7_days: number;
  with_activity: number;
}

export default function AuditPage() {
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [servers, setServers] = useState<ServerData[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFetchForm, setShowFetchForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkServers, setBulkServers] = useState('');
  const [bulkAuthMode, setBulkAuthMode] = useState<'password' | 'key'>('password');
  const [bulkPassword, setBulkPassword] = useState('');
  const [bulkShowPassword, setBulkShowPassword] = useState(false);
  const [bulkMaxWorkers, setBulkMaxWorkers] = useState(50);
  const [bulkSelectFromList, setBulkSelectFromList] = useState(false);
  const [bulkSelectedServers, setBulkSelectedServers] = useState<string[]>([]);
  const [fetchData, setFetchData] = useState({
    hostname: '',
    username: '',
    password: '',
    port: 22,
    audit_report_dir: '',
    private_key: '',
  });
  const [authMode, setAuthMode] = useState<'root' | 'sudo'>('root');
  const [authMethod, setAuthMethod] = useState<'password' | 'key'>('password');
  const [showPassword, setShowPassword] = useState(false);
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
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    initialLoad();
  }, []);

  useEffect(() => {
    if (!pageLoading) {
      refreshTable();
    }
  }, [searchTerm]);

  const initialLoad = async () => {
    setPageLoading(true);
    try {
      const [statsData, serversResp] = await Promise.all([
        apiRequest('/api/audit/dashboard/stats'),
        apiRequest('/api/audit/servers?page=1&page_size=10000'),
      ]);
      setStats(statsData);
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
      const serversResp = await apiRequest(`/api/audit/servers?${params}`);
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
      const [statsData, serversResp] = await Promise.all([
        apiRequest('/api/audit/dashboard/stats'),
        apiRequest('/api/audit/servers?page=1&page_size=10000'),
      ]);
      setStats(statsData);
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
        audit_report_dir: fetchData.audit_report_dir,
        auth_mode: authMode,
      };

      if (authMethod === 'key' && fetchData.private_key) {
        bodyData.private_key = fetchData.private_key;
      } else if (authMethod === 'password' && fetchData.password) {
        bodyData.password = fetchData.password;
      }

      const startResult = await apiRequest('/api/audit/fetch', {
        method: 'POST',
        body: JSON.stringify(bodyData),
      });

      if (bodyData.password) bodyData.password = '';
      if (bodyData.private_key) bodyData.private_key = '';

      const operationId = startResult.operation_id;

      const pollInterval = setInterval(async () => {
        try {
          const progress = await apiRequest(`/api/audit/progress/${operationId}`);

          setScanProgress({
            processed: progress.processed || 0,
            total: progress.total || 100,
            current: progress.current || 'Processing...',
            status: progress.status || 'running',
            result: progress.result,
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
              if (s.errors && s.errors.length > 0) {
                alertMsg += `❌ Errors: ${s.errors.length}\n\n`;
                s.errors.slice(0, 3).forEach((err: string, i: number) => {
                  alertMsg += `  ${i + 1}. ${err}\n`;
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
      const result = await apiRequest('/api/audit/scan-all', {
        method: 'POST',
        body: JSON.stringify({
          servers: serverList,
          username: fetchData.username,
          private_key: hasKey ? fetchData.private_key : undefined,
          password: hasPassword ? bulkPassword : undefined,
          port: fetchData.port || 22,
          audit_report_dir: fetchData.audit_report_dir || '/var/log/audit',
          auth_mode: 'sudo',
          max_workers: bulkMaxWorkers,
        }),
      });

      const operationId = result.operation_id;

      const pollInterval = setInterval(async () => {
        try {
          const progress = await apiRequest(`/api/audit/progress/${operationId}`);

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit File</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">File activity monitoring from audit-email reports</p>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            max={today}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            max={today}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          />
          <button
            onClick={async () => {
              if (!fromDate || !toDate) { alert('Please select both from and to dates'); return; }
              if (fromDate > toDate) { alert('From date must be before or equal to to date'); return; }
              const diffDays = Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24));
              if (diffDays > 365) { alert('Date range maximum 365 days'); return; }
              setReportLoading(true);
              try {
                const res = await apiRequest(`/api/audit/export?from_date=${fromDate}&to_date=${toDate}`);
                if (!res.records || res.records.length === 0) { alert('No data for selected date range'); return; }
                exportAuditPDF(res, fromDate, toDate);
              } catch (err: any) {
                alert('Failed to load report data: ' + (err.message || 'Unknown error'));
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
                <div className="grid grid-cols-2 gap-1">
                  {servers.map((server: any) => {
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
                <label className="block text-sm font-medium mb-1">Audit Report Directory *</label>
                <input
                  type="text"
                  value={fetchData.audit_report_dir}
                  onChange={(e) => setFetchData({...fetchData, audit_report_dir: e.target.value})}
                  placeholder="e.g., /var/log/audit"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                />
              </div>

              {bulkAuthMode === 'password' && (
                <>
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
                </>
              )}

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
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
                      <tr key={host}
                        className={`border-t border-gray-200 dark:border-gray-700 ${
                          status === 'success' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'
                        }`}
                      >
                        <td className="p-2 font-mono">{host}</td>
                        <td className="p-2 text-center">{status === 'success' ? '✅' : '❌'}</td>
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

      {showFetchForm && (
        <form onSubmit={handleFetch} className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">🔐 SSH Credentials (Zero-Trust: Not Stored)</h3>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">👤 User Mode:</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setAuthMode('root'); setFetchData({...fetchData, username: 'root'}); }}
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
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Login sebagai root. Command langsung tanpa sudo.</p>
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('sudo'); setFetchData({...fetchData, username: ''}); }}
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
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">User biasa dengan akses sudo. Command pakai `sudo`.</p>
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Authentication Method:</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="auth_method" value="password" checked={authMethod === 'password'}
                  onChange={() => { setAuthMethod('password'); setShowPassword(false); setFetchData({...fetchData, private_key: ''}); }}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm">🔑 Password</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="auth_method" value="key" checked={authMethod === 'key'}
                  onChange={() => { setAuthMethod('key'); setFetchData({...fetchData, password: ''}); }}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm">🔐 SSH Key (Recommended)</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                📅 <strong>Auto-Scan:</strong> Sistem akan membaca <strong>SEMUA file audit-email</strong> di folder tersebut.
                <br />
                Pola: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">audit-email-YYYY-MM-DD.txt</code>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Server IP/Address *</label>
              <input type="text" value={fetchData.hostname}
                onChange={(e) => setFetchData({...fetchData, hostname: e.target.value})}
                placeholder="e.g., 192.168.60.32"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">💡 IP address untuk SSH connect</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">SSH Username *</label>
              <input type="text" value={fetchData.username}
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
                    <input type={showPassword ? "text" : "password"} value={fetchData.password}
                      onChange={(e) => setFetchData({...fetchData, password: e.target.value})}
                      placeholder="Enter password"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-lg">
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">SSH Port</label>
                  <input type="number" value={fetchData.port}
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
                  <textarea value={fetchData.private_key}
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
                  <input type="number" value={fetchData.port}
                    onChange={(e) => setFetchData({...fetchData, port: parseInt(e.target.value)})}
                    placeholder="22"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
              </>
            )}

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Audit Report Directory</label>
              <input type="text" value={fetchData.audit_report_dir}
                onChange={(e) => setFetchData({...fetchData, audit_report_dir: e.target.value})}
                placeholder="e.g., /var/log/audit"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">💡 Auto-Scan: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">audit-email-*.txt</code></p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              🚀 Scan & Import All Logs
            </button>
            <button type="button" onClick={() => setShowFetchForm(false)}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-sm text-blue-600 dark:text-blue-400">Total Events</div>
            <div className="text-3xl font-bold">{stats.total_events}</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="text-sm text-green-600 dark:text-green-400">Total Servers</div>
            <div className="text-3xl font-bold">{stats.total_servers}</div>
          </div>
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="text-sm text-purple-600 dark:text-purple-400">Recent 7 Days</div>
            <div className="text-3xl font-bold">{stats.recent_7_days}</div>
          </div>
          <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <div className="text-sm text-orange-600 dark:text-orange-400">With Activity</div>
            <div className="text-3xl font-bold">{stats.with_activity}</div>
          </div>
        </div>
      )}

      <div className="mb-6 flex gap-4 items-center">
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
      </div>

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
              <th className="px-4 py-3 text-left text-sm font-medium">🖥️ Hostname</th>
              <th className="px-4 py-3 text-left text-sm font-medium">🌐 IP Address</th>
              <th className="px-4 py-3 text-left text-sm font-medium">🗓️ Last Scan</th>
              <th className="px-4 py-3 text-right text-sm font-medium">📊 Total Events</th>
              <th className="px-4 py-3 text-right text-sm font-medium">📝 Activities</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => {
              const hasActivity = server.total_activities > 0;
              return (
                <tr key={server.hostname}
                  className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedServer(server.hostname)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🖥️</span>
                      <div>
                        <span className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                          {server.hostname}
                        </span>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {hasActivity ? '📊 Klik untuk detail' : '⏳ Belum ada aktivitas'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {server.ip_address || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <span>🗓️</span>
                      {server.last_scan
                        ? new Date(server.last_scan).toLocaleDateString('id-ID', {
                          year: 'numeric', month: 'short', day: 'numeric'
                        })
                        : '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                      server.total_events > 0
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}>
                      📊 {server.total_events}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                      hasActivity
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}>
                      📝 {server.total_activities}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {servers.length === 0 && (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <p>No servers found</p>
            <p className="text-sm mt-1">Click "Add Server" to scan audit reports</p>
          </div>
        )}
      </div>

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
                <div className="h-4 rounded-full bg-blue-500 transition-all duration-300"
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

      {selectedServer && (
        <AuditDetailModal
          hostname={selectedServer}
          onClose={() => setSelectedServer(null)}
          onRefresh={reloadFull}
        />
      )}
    </div>
  );
}
