"use client";

interface ServerReport {
  server: string;
  total_archives: number;
  last_compression: string;
}

interface ReportData {
  summary: ServerReport[];
  total_servers: number;
  total_archives: number;
  filters: any;
}

interface AvailableFilters {
  servers: string[];
  years: number[];
}

interface ReportFilters {
  server: string;
  year: string;
}

interface CompressionReportProps {
  show: boolean;
  loading: boolean;
  data: ReportData | null;
  filters: ReportFilters;
  availableFilters: AvailableFilters;
  onGenerate: () => void;
  onReset: () => void;
  onFilterChange: (filters: ReportFilters) => void;
  onClose: () => void;
}

export function CompressionReport({
  show,
  loading,
  data,
  filters,
  availableFilters,
  onGenerate,
  onReset,
  onFilterChange,
  onClose,
}: CompressionReportProps) {
  if (!show) return null;

  return (
    <div className="mb-6 p-4 rounded-lg shadow bg-white dark:bg-gray-800">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Compression Report
        </h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Server</label>
          <select value={filters.server} onChange={(e) => onFilterChange({ ...filters, server: e.target.value })} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
            <option value="">All Servers</option>
            {availableFilters.servers.map((server, idx) => (
              <option key={idx} value={server}>{server}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Year</label>
          <select value={filters.year} onChange={(e) => onFilterChange({ ...filters, year: e.target.value })} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
            <option value="">All Years</option>
            {availableFilters.years.map((year, idx) => (
              <option key={idx} value={year}>{year}</option>
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
          >
            Reset
          </button>
        </div>
      </div>

      {/* Report Statistics */}
      {loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Loading report...
        </div>
      ) : data && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Servers</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.total_servers}</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Archives</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.total_archives}</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Avg per Server</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {data.total_servers > 0 ? (data.total_archives / data.total_servers).toFixed(1) : 0} archives
              </p>
            </div>
          </div>

          <div className="rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Server</th>
                  <th className="px-4 py-3 text-left text-sm font-medium bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Total Archives</th>
                  <th className="px-4 py-3 text-left text-sm font-medium bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Last Compression</th>
                  <th className="px-4 py-3 text-left text-sm font-medium bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.summary && data.summary.map((item: ServerReport, idx: number) => (
                  <tr key={idx} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{item.server}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{item.total_archives}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{item.last_compression || '-'}</td>
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
                ))}
              </tbody>
            </table>
            {data.summary.length === 0 && (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                No data found for selected filters
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
