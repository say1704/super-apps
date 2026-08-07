"use client";

interface SearchFilterSectionProps {
  searchTerm: string;
  statusFilter: string;
  dateRangeFilter: string;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onDateRangeFilterChange: (value: string) => void;
  onClear: () => void;
  total: number;
  filtered: number;
}

export function SearchFilterSection({
  searchTerm,
  statusFilter,
  dateRangeFilter,
  onSearchChange,
  onStatusFilterChange,
  onDateRangeFilterChange,
  onClear,
  total,
  filtered,
}: SearchFilterSectionProps) {
  return (
    <div className="mb-6 p-4 rounded-lg shadow bg-white dark:bg-gray-800">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Search Server</label>
          <input type="text" value={searchTerm} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search by IP (e.g., 192.168.60.192)" className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Status</label>
          <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
            <option value="all">All Status</option>
            <option value="today">Backed Up Today</option>
            <option value="week">Last 7 Days</option>
            <option value="old">Older than 7 Days</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Last Backup</label>
          <select value={dateRangeFilter} onChange={(e) => onDateRangeFilterChange(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="old">Older than 30 Days</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Showing <strong>{filtered}</strong> of <strong>{total}</strong> servers
        </div>
        <button onClick={onClear} className="px-4 py-2 text-sm rounded-lg font-medium transition-colors bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
          Clear Filters
        </button>
      </div>
    </div>
  );
}
