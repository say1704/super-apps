"use client";

import { SizeDistribution } from './size-distribution';

interface AnalyticsCardsProps {
  advancedData: any;
  loading: boolean;
}

export function AnalyticsCards({ advancedData, loading }: AnalyticsCardsProps) {
  if (loading || !advancedData) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-4 mb-4">
        <div className="text-center py-4 text-gray-500 dark:text-gray-400">Loading analytics...</div>
      </div>
    );
  }

  const sa = advancedData.size_analytics;
  const srv = advancedData.server_analytics;

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-4 mb-4">
      {/* 6 Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Servers</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{srv.total_servers}</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Logs</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{advancedData.server_analytics.total_logs}</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Size</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{sa.total_size_formatted}</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Avg Size/Server</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{sa.avg_size_per_server_gb} GB</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Largest Server</p>
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate" title={sa.largest_server?.server}>
            {sa.largest_server?.server || "N/A"}
          </p>
          <p className="text-xs text-gray-500">{sa.largest_server?.size_gb} GB</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Most Active</p>
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate" title={srv.most_active_server?.server}>
            {srv.most_active_server?.server || "N/A"}
          </p>
          <p className="text-xs text-gray-500">{srv.most_active_server?.count} entries</p>
        </div>
      </div>

      {/* Size Distribution */}
      <SizeDistribution distribution={sa.size_distribution} />
    </div>
  );
}
