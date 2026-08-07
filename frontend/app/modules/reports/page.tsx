"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/auth';
import { useToast } from '@/components/toast';
import ExportButton from '@/components/ExportButton';
import SummaryCard from './components/summary-card';
import ReportTable from './components/report-table';

type TabType = 'daily' | 'weekly' | 'monthly';

interface DailyReport {
  date: string;
  backup: { total_servers: number; ok_count: number; warning_count: number; critical_count: number; success_rate: number; servers: { server_name: string; status: string; files: number; size_gb: number }[] };
  ssh_failed: { total: number; unique_ips: number; top_logins: { source_ip: string; username: string; login_timestamp: string; hostname: string }[] };
  capacity_alerts: { total: number; servers: { hostname: string; cpu: number; ram: number; disk_root: number; disk_data: number; status: string }[] };
  open_incidents: { total: number; incidents: { id: number; server_name: string; incident_type: string; status: string; description: string }[] };
  irmc_failures: { total: number; checks: { id: number; server_name: string; status: string; check_date: string }[] };
}

interface WeeklyReport {
  period: { from: string; to: string };
  incidents: { total: number; by_status: Record<string, number>; by_type: Record<string, number> };
  vulnerabilities: { total_reports: number; high_count: number; medium_count: number; low_count: number };
  risk: { total: number; overdue: number; by_status: Record<string, number> };
  activity: { total: number; by_module: Record<string, number> };
  backup: { success_rate: number; total_records: number; active_servers: number; alert_count: number };
}

interface MonthlyReport {
  period: { from: string; to: string };
  executive: { total_assets: number; total_incidents: number; total_risks: number; backup_rate: number; irmc_pass_rate: number; capacity_alerts: number };
  assets: { total: number; new_count: number; by_category: Record<string, number>; by_classification: Record<string, number> };
  risk: { total: number; by_level: Record<string, number>; by_status: Record<string, number> };
  incidents: { total: number; ongoing: number; by_month: Record<string, number>; by_type: Record<string, number> };
  backup: { success_rate: number; total_records: number; total_volume_gb: number; active_servers: number };
  capacity: { total: number; ok: number; warning: number; critical: number };
  quality: { total: number; by_work_unit: Record<string, number> };
}

function getStatusBadge(status: string) {
  const colors: Record<string, string> = {
    OK: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    Warning: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    Critical: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    fail: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    warning: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    pass: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    pending: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
    Open: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    'In Progress': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    Resolved: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    Closed: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  };
  const cls = colors[status] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
  return <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>{status}</span>;
}

export default function ReportsModule() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('daily');
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState<DailyReport | null>(null);
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null);
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [fetchingCapacity, setFetchingCapacity] = useState(false);
  const router = useRouter();

  const handleScanSSH = async () => {
    setScanning(true);
    try {
      await apiRequest('/api/ssh-report/scan-all', { method: 'POST' });
      toast.success('SSH scan started, refresh page in a moment');
    } catch {
      toast.error('Failed to start SSH scan');
    } finally {
      setScanning(false);
    }
  };

  const handleFetchCapacity = async () => {
    setFetchingCapacity(true);
    try {
      await apiRequest('/api/capacity-planning/scan-all', { method: 'POST' });
      toast.success('Capacity fetch started, refresh page in a moment');
    } catch {
      toast.error('Failed to fetch capacity data');
    } finally {
      setFetchingCapacity(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  const fetchDaily = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest(`/api/reports/daily?date=${today}`);
      setDaily(result);
    } catch {
      toast.error('Failed to load daily report');
    } finally {
      setLoading(false);
    }
  }, [today]);

  const fetchWeekly = useCallback(async () => {
    setLoading(true);
    try {
      const to = today;
      const from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      const result = await apiRequest(`/api/reports/weekly?from=${from}&to=${to}`);
      setWeekly(result);
    } catch {
      toast.error('Failed to load weekly report');
    } finally {
      setLoading(false);
    }
  }, [today]);

  const fetchMonthly = useCallback(async () => {
    setLoading(true);
    try {
      const to = today;
      const from = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const result = await apiRequest(`/api/reports/monthly?from=${from}&to=${to}`);
      setMonthly(result);
    } catch {
      toast.error('Failed to load monthly report');
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    if (activeTab === 'daily') fetchDaily();
    else if (activeTab === 'weekly') fetchWeekly();
    else fetchMonthly();
  }, [activeTab]);

  const tabLabels: Record<TabType, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

  const getExportData = () => {
    if (!daily && !weekly && !monthly) return [];
    if (activeTab === 'daily' && daily) return daily.backup.servers || [];
    if (activeTab === 'weekly' && weekly) return [{ period: `${weekly.period.from} - ${weekly.period.to}` }];
    if (activeTab === 'monthly' && monthly) return [{ period: `${monthly.period.from} - ${monthly.period.to}` }];
    return [];
  };

  const getExportColumns = () => {
    if (activeTab === 'daily') return [
      { key: 'server_name', label: 'Server' },
      { key: 'status', label: 'Status' },
      { key: 'files', label: 'Files' },
      { key: 'size_gb', label: 'Size (GB)' },
    ];
    return [];
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ISO 27001 Reports</h1>
        <ExportButton
          data={getExportData()}
          filename={`report-${activeTab}-${today}`}
          title={`${tabLabels[activeTab]} Report`}
          columns={getExportColumns()}
        />
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {(Object.entries(tabLabels) as [TabType, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === key
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-12 text-gray-500">Loading...</div>}

      {!loading && activeTab === 'daily' && daily && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <SummaryCard title="Backup Rate" value={`${daily.backup.success_rate}%`} color={daily.backup.success_rate >= 90 ? 'green' : daily.backup.success_rate >= 70 ? 'yellow' : 'red'} icon="💾" subtitle={`${daily.backup.ok_count}/${daily.backup.total_servers} servers OK`} />
            <SummaryCard title="SSH Failed" value={daily.ssh_failed.total} color={daily.ssh_failed.total === 0 ? 'green' : 'red'} icon="🔐" subtitle={`${daily.ssh_failed.unique_ips} unique IPs`} />
            <SummaryCard title="Capacity Alerts" value={daily.capacity_alerts.total} color={daily.capacity_alerts.total === 0 ? 'green' : 'yellow'} icon="📈" subtitle="Warning / Critical" />
            <SummaryCard title="Open Incidents" value={daily.open_incidents.total} color={daily.open_incidents.total === 0 ? 'green' : 'orange'} icon="🚨" subtitle="Open / In Progress" />
            <SummaryCard title="IRMC Failures" value={daily.irmc_failures.total} color={daily.irmc_failures.total === 0 ? 'green' : 'red'} icon="🖥️" subtitle="Fail / Warning checks" />
          </div>

          {daily.backup.servers.length > 0 ? (
            <ReportTable
              title="Backup Status"
              columns={[
                { key: 'server_name', label: 'Server' },
                { key: 'status', label: 'Status', render: (v) => getStatusBadge(String(v)) },
                { key: 'files', label: 'Files' },
                { key: 'size_gb', label: 'Size (GB)' },
              ]}
              data={daily.backup.servers as unknown as Record<string, unknown>[]}
            />
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">No backup data for today</p>
              <button onClick={() => router.push('/modules/backup-check')} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                Go to Backup Check →
              </button>
            </div>
          )}

          {daily.ssh_failed.top_logins.length > 0 ? (
            <ReportTable
              title="SSH Failed Logins (Top 10)"
              columns={[
                { key: 'source_ip', label: 'Source IP' },
                { key: 'username', label: 'Username' },
                { key: 'login_timestamp', label: 'Time' },
                { key: 'hostname', label: 'Server' },
              ]}
              data={daily.ssh_failed.top_logins as unknown as Record<string, unknown>[]}
            />
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">No failed SSH logins today</p>
              <button onClick={handleScanSSH} disabled={scanning} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50">
                {scanning ? 'Scanning...' : 'Scan SSH Report →'}
              </button>
            </div>
          )}

          {daily.capacity_alerts.servers.length > 0 ? (
            <ReportTable
              title="Capacity Alerts"
              columns={[
                { key: 'hostname', label: 'Server' },
                { key: 'cpu', label: 'CPU %', render: (v) => `${v}%` },
                { key: 'ram', label: 'RAM %', render: (v) => `${v}%` },
                { key: 'disk_root', label: 'Disk Root %', render: (v) => `${v}%` },
                { key: 'status', label: 'Status', render: (v) => getStatusBadge(String(v)) },
              ]}
              data={daily.capacity_alerts.servers as unknown as Record<string, unknown>[]}
            />
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">No capacity alerts today</p>
              <button onClick={handleFetchCapacity} disabled={fetchingCapacity} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50">
                {fetchingCapacity ? 'Fetching...' : 'Fetch SAR Data →'}
              </button>
            </div>
          )}

          {daily.open_incidents.incidents.length > 0 ? (
            <ReportTable
              title="Open Incidents"
              columns={[
                { key: 'server_name', label: 'Server' },
                { key: 'incident_type', label: 'Type' },
                { key: 'status', label: 'Status', render: (v) => getStatusBadge(String(v)) },
                { key: 'description', label: 'Description' },
              ]}
              data={daily.open_incidents.incidents as unknown as Record<string, unknown>[]}
            />
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">No open incidents</p>
              <button onClick={() => router.push('/modules/incident')} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                Go to Incident Report →
              </button>
            </div>
          )}

          {daily.irmc_failures.checks.length > 0 ? (
            <ReportTable
              title="IRMC Failures"
              columns={[
                { key: 'server_name', label: 'Server' },
                { key: 'check_date', label: 'Date' },
                { key: 'status', label: 'Status', render: (v) => getStatusBadge(String(v)) },
              ]}
              data={daily.irmc_failures.checks as unknown as Record<string, unknown>[]}
            />
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">No IRMC failures today</p>
              <button onClick={() => router.push('/modules/irmc')} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                Go to IRMC Checks →
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && activeTab === 'weekly' && weekly && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <SummaryCard title="Incidents" value={weekly.incidents.total} color={weekly.incidents.total === 0 ? 'green' : 'orange'} icon="🚨" subtitle={`${weekly.incidents.by_status['Open'] || 0} open`} />
            <SummaryCard title="Vulnerability" value={weekly.vulnerabilities.high_count} color={weekly.vulnerabilities.high_count === 0 ? 'green' : 'red'} icon="⚠️" subtitle={`${weekly.vulnerabilities.total_reports} reports`} />
            <SummaryCard title="Overdue Risks" value={weekly.risk.overdue} color={weekly.risk.overdue === 0 ? 'green' : 'red'} icon="🎯" subtitle={`${weekly.risk.total} total risks`} />
            <SummaryCard title="User Activity" value={weekly.activity.total} color="blue" icon="📜" subtitle={`${Object.keys(weekly.activity.by_module).length} modules`} />
            <SummaryCard title="Backup Rate" value={`${weekly.backup.success_rate}%`} color={weekly.backup.success_rate >= 90 ? 'green' : weekly.backup.success_rate >= 70 ? 'yellow' : 'red'} icon="💾" subtitle={`${weekly.backup.active_servers} servers`} />
          </div>

          {weekly.incidents.total === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">No incidents this week</p>
              <button onClick={() => router.push('/modules/incident')} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                Go to Incident Report →
              </button>
            </div>
          ) : (
            <ReportTable
              title="Incidents by Status"
              columns={[{ key: 'status', label: 'Status' }, { key: 'count', label: 'Count' }]}
              data={Object.entries(weekly.incidents.by_status).map(([status, count]) => ({ status, count })) as unknown as Record<string, unknown>[]}
            />
          )}

          {weekly.risk.total === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">No risk assessments</p>
              <button onClick={() => router.push('/modules/risk')} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                Go to Risk Assessment →
              </button>
            </div>
          ) : (
            <ReportTable
              title="Risk by Status"
              columns={[{ key: 'status', label: 'Status' }, { key: 'count', label: 'Count' }]}
              data={Object.entries(weekly.risk.by_status).map(([status, count]) => ({ status, count })) as unknown as Record<string, unknown>[]}
            />
          )}

          {weekly.activity.total === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">No activity this week</p>
              <button onClick={() => router.push('/modules/activity')} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                Go to Activity Logs →
              </button>
            </div>
          ) : (
            <ReportTable
              title="Top Activity Modules"
              columns={[{ key: 'module', label: 'Module' }, { key: 'count', label: 'Actions' }]}
              data={Object.entries(weekly.activity.by_module).map(([module, count]) => ({ module, count })) as unknown as Record<string, unknown>[]}
            />
          )}
        </div>
      )}

      {!loading && activeTab === 'monthly' && monthly && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <SummaryCard title="Total Assets" value={monthly.executive.total_assets} color="purple" icon="📦" subtitle={`${monthly.assets.new_count} new`} />
            <SummaryCard title="Incidents" value={monthly.executive.total_incidents} color="orange" icon="🚨" subtitle={`${monthly.incidents.ongoing} ongoing`} />
            <SummaryCard title="Risks" value={monthly.executive.total_risks} color="amber" icon="🎯" />
            <SummaryCard title="Backup Rate" value={`${monthly.executive.backup_rate}%`} color={monthly.executive.backup_rate >= 90 ? 'green' : monthly.executive.backup_rate >= 70 ? 'yellow' : 'red'} icon="💾" />
            <SummaryCard title="IRMC Pass Rate" value={`${monthly.executive.irmc_pass_rate}%`} color={monthly.executive.irmc_pass_rate >= 90 ? 'green' : monthly.executive.irmc_pass_rate >= 70 ? 'yellow' : 'red'} icon="🖥️" />
            <SummaryCard title="Capacity Alerts" value={monthly.executive.capacity_alerts} color={monthly.executive.capacity_alerts === 0 ? 'green' : 'yellow'} icon="📈" />
          </div>

          {monthly.assets.new_count === 0 && monthly.assets.total === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">No assets registered</p>
              <button onClick={() => router.push('/modules/assets')} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                Go to Asset Management →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ReportTable title="Assets by Category" columns={[{ key: 'category', label: 'Category' }, { key: 'count', label: 'Count' }]} data={Object.entries(monthly.assets.by_category).map(([category, count]) => ({ category, count })) as unknown as Record<string, unknown>[]} />
              <ReportTable title="Assets by Classification" columns={[{ key: 'classification', label: 'Classification' }, { key: 'count', label: 'Count' }]} data={Object.entries(monthly.assets.by_classification).map(([classification, count]) => ({ classification, count })) as unknown as Record<string, unknown>[]} />
            </div>
          )}

          {monthly.risk.total === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">No risk assessments</p>
              <button onClick={() => router.push('/modules/risk')} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                Go to Risk Assessment →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ReportTable title="Risk by Level" columns={[{ key: 'level', label: 'Risk Level' }, { key: 'count', label: 'Count' }]} data={Object.entries(monthly.risk.by_level).map(([level, count]) => ({ level, count })) as unknown as Record<string, unknown>[]} />
              <ReportTable title="Risk by Status" columns={[{ key: 'status', label: 'Status' }, { key: 'count', label: 'Count' }]} data={Object.entries(monthly.risk.by_status).map(([status, count]) => ({ status, count })) as unknown as Record<string, unknown>[]} />
            </div>
          )}

          {monthly.incidents.total === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">No incidents this month</p>
              <button onClick={() => router.push('/modules/incident')} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                Go to Incident Report →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ReportTable title="Incidents by Month" columns={[{ key: 'month', label: 'Month' }, { key: 'count', label: 'Count' }]} data={Object.entries(monthly.incidents.by_month).map(([month, count]) => ({ month, count })) as unknown as Record<string, unknown>[]} />
              <ReportTable title="Incidents by Type" columns={[{ key: 'type', label: 'Type' }, { key: 'count', label: 'Count' }]} data={Object.entries(monthly.incidents.by_type).map(([type, count]) => ({ type, count })) as unknown as Record<string, unknown>[]} />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              {monthly.backup.total_records === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400">No backup data</p>
                  <button onClick={() => router.push('/modules/backup-check')} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                    Go to Backup Check →
                  </button>
                </div>
              ) : (
                <ReportTable title="Backup Summary" columns={[{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }]} data={[
                  { metric: 'Success Rate', value: `${monthly.backup.success_rate}%` },
                  { metric: 'Total Records', value: monthly.backup.total_records },
                  { metric: 'Total Volume', value: `${monthly.backup.total_volume_gb} GB` },
                  { metric: 'Active Servers', value: monthly.backup.active_servers },
                ]} />
              )}
            </div>
            <div>
              {monthly.capacity.total === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400">No capacity data</p>
                  <button onClick={handleFetchCapacity} disabled={fetchingCapacity} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50">
                    {fetchingCapacity ? 'Fetching...' : 'Fetch SAR Data →'}
                  </button>
                </div>
              ) : (
                <ReportTable title="Capacity Status" columns={[{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Count' }]} data={[
                  { metric: 'Total Servers', value: monthly.capacity.total },
                  { metric: 'OK', value: monthly.capacity.ok },
                  { metric: 'Warning', value: monthly.capacity.warning },
                  { metric: 'Critical', value: monthly.capacity.critical },
                ]} />
              )}
            </div>
          </div>

          {monthly.quality.total === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">No quality objectives</p>
              <button onClick={() => router.push('/modules/quality')} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                Go to Quality Objectives →
              </button>
            </div>
          ) : (
            <ReportTable title="Quality Objectives by Work Unit" columns={[{ key: 'unit', label: 'Work Unit' }, { key: 'count', label: 'Objectives' }]} data={Object.entries(monthly.quality.by_work_unit).map(([unit, count]) => ({ unit, count })) as unknown as Record<string, unknown>[]} />
          )}
        </div>
      )}
    </div>
  );
}
