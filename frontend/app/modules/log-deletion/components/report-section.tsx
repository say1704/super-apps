"use client";

import ExportButton from '@/components/ExportButton';
import { SizeDistribution } from './size-distribution';
import { MonthlyTrend } from './monthly-trend';
import { ServerHealth } from './server-health';
import { InsightsPanel } from './insights-panel';

interface ServerReport {
  server: string;
  total_logs: number;
  total_size_gb: number;
  last_execution: string;
  logs: any[];
}

interface ReportData {
  summary: ServerReport[];
  total_servers: number;
  total_logs: number;
  total_size_gb: number;
  filters: any;
}

interface AdvancedReportData {
  size_analytics: {
    total_size_gb: number;
    total_size_formatted: string;
    avg_size_per_server_gb: number;
    median_size_gb: number;
    largest_server: { server: string; size_gb: number } | null;
    smallest_server: { server: string; size_gb: number } | null;
    top_5_servers: { server: string; size_gb: number; percentage: number }[];
    size_distribution: {
      large: { count: number; label: string; servers: string[] };
      medium: { count: number; label: string; servers: string[] };
      small: { count: number; label: string; servers: string[] };
    };
    path_categories: { category: string; size_gb: number; count: number; percentage: number }[];
  };
  time_analytics: {
    most_active_date: { date: string; count: number; size_gb: number } | null;
    avg_deletions_per_month: number;
    monthly_trend: { month: string; count: number; size_gb: number }[];
    days_since_last_deletion: number | null;
  };
  server_analytics: {
    total_servers: number;
    most_active_server: { server: string; count: number } | null;
    least_active_server: { server: string; count: number } | null;
    inactive_servers: { server: string; last_deletion: string | null; days_ago: number | null }[];
    server_health: { server: string; status: "healthy" | "warning" | "critical"; last_deletion: string | null; days_ago: number | null }[];
  };
  path_analytics: {
    unique_paths: number;
    most_common_paths: { path: string; count: number; size_gb: number }[];
  };
  script_analytics: {
    automation_rate: number;
    automated_count: number;
    manual_count: number;
    most_used_scripts: { script: string; count: number; servers: string[] }[];
  };
  combined_insights: {
    efficiency_score: number;
    compliance_rate: number;
    compliant_servers: number;
    non_compliant_servers: number;
    trend_alert: "stable" | "increasing" | "decreasing";
  };
  filters: any;
}

interface AvailableFilters {
  servers: string[];
  years: number[];
  months: number[];
}

interface ReportFilters {
  server: string;
  year: string;
  month: string;
}

interface ReportSectionProps {
  show: boolean;
  loading: boolean;
  data: ReportData | null;
  advancedData: AdvancedReportData | null;
  advancedLoading: boolean;
  filters: ReportFilters;
  availableFilters: AvailableFilters;
  onGenerate: () => void;
  onReset: () => void;
  onFilterChange: (filters: ReportFilters) => void;
  onClose: () => void;
}

export function ReportSection({
  show,
  loading,
  data,
  advancedData,
  advancedLoading,
  filters,
  availableFilters,
  onGenerate,
  onReset,
  onFilterChange,
  onClose,
}: ReportSectionProps) {
  if (!show) return null;

  const isLoading = loading || advancedLoading;

  return (
    <div className="mb-6 p-4 rounded-lg shadow bg-white dark:bg-gray-800">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Report Log & Maintenance
        </h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          ✕
        </button>
      </div>

      {/* Report Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Server</label>
          <select value={filters.server} onChange={(e) => onFilterChange({ ...filters, server: e.target.value })} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
            <option value="">All Servers</option>
            {availableFilters.servers && availableFilters.servers.map((server, idx) => (
              <option key={idx} value={server}>{server}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Year</label>
          <select value={filters.year} onChange={(e) => onFilterChange({ ...filters, year: e.target.value })} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
            <option value="">All Years</option>
            {availableFilters.years && availableFilters.years.map((year, idx) => (
              <option key={idx} value={year}>{year}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Month</label>
          <select value={filters.month} onChange={(e) => onFilterChange({ ...filters, month: e.target.value })} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
            <option value="">All Months</option>
            {availableFilters.months && availableFilters.months.map((month, idx) => (
              <option key={idx} value={month}>
                {new Date(2024, month - 1).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button
            onClick={onGenerate}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Generate Report
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            title="Clear all filters"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Report Statistics */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Loading report...
        </div>
      ) : data && advancedData && (
        <div>
          {/* Enhanced Stat Cards (6 cards) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Servers</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.total_servers}</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Logs</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.total_logs}</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Size</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{advancedData.size_analytics.total_size_formatted}</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Avg Size/Server</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{advancedData.size_analytics.avg_size_per_server_gb} GB</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Largest Server</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white truncate" title={advancedData.size_analytics.largest_server?.server}>
                {advancedData.size_analytics.largest_server?.server || "N/A"}
              </p>
              <p className="text-xs text-gray-500">{advancedData.size_analytics.largest_server?.size_gb} GB</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Most Active</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white truncate" title={advancedData.server_analytics.most_active_server?.server}>
                {advancedData.server_analytics.most_active_server?.server || "N/A"}
              </p>
              <p className="text-xs text-gray-500">{advancedData.server_analytics.most_active_server?.count} entries</p>
            </div>
          </div>

          {/* Size Distribution */}
          <SizeDistribution distribution={advancedData.size_analytics.size_distribution} />

          {/* Monthly Trend */}
          <MonthlyTrend data={advancedData.time_analytics.monthly_trend} />

          {/* Server Health + Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <ServerHealth servers={advancedData.server_analytics.server_health} />
            <InsightsPanel insights={advancedData.combined_insights} />
          </div>

          {/* Per-Server Summary Table with Visual Size Bar */}
          <div className="rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Server</th>
                  <th className="px-4 py-3 text-left text-sm font-medium bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Total Logs</th>
                  <th className="px-4 py-3 text-left text-sm font-medium bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Total Size</th>
                  <th className="px-4 py-3 text-left text-sm font-medium bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Last Execution</th>
                  <th className="px-4 py-3 text-left text-sm font-medium bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.summary && data.summary.map((item: ServerReport, idx: number) => {
                  const pct = data.total_size_gb > 0 ? (item.total_size_gb / data.total_size_gb) * 100 : 0;
                  const barColor = item.total_size_gb > 10 ? "bg-red-500" : item.total_size_gb >= 1 ? "bg-yellow-500" : "bg-green-500";
                  return (
                    <tr key={idx} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{item.server}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{item.total_logs}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${barColor}`}
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{item.total_size_gb} GB</span>
                          <span className="text-xs text-gray-500 whitespace-nowrap">({pct.toFixed(1)}%)</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{item.last_execution || '-'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            onFilterChange({ ...filters, server: item.server });
                            onGenerate();
                          }}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Filter by Server
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.summary.length === 0 && (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                No data found for selected filters
              </div>
            )}
          </div>

          {/* Export Button */}
          <div className="mt-4 flex justify-end">
            <ExportButton
              data={data.summary.map(item => ({
                server: item.server,
                total_logs: item.total_logs,
                total_size_gb: item.total_size_gb,
                last_execution: item.last_execution,
              }))}
              filename="log_maintenance_report"
              columns={[
                { key: 'server', label: 'Server' },
                { key: 'total_logs', label: 'Total Logs' },
                { key: 'total_size_gb', label: 'Total Size (GB)' },
                { key: 'last_execution', label: 'Last Execution' },
              ]}
              title="Log Deletion Report"
            />
          </div>
        </div>
      )}
    </div>
  );
}
