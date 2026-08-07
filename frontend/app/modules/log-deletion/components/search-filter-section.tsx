"use client";

interface SearchFilterSectionProps {
  searchTerm: string;
  filterSize: string;
  dateFrom: string;
  dateTo: string;
  onSearchChange: (value: string) => void;
  onSizeChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onClear: () => void;
  total: number;
  filtered: number;
}

export function SearchFilterSection({
  searchTerm,
  filterSize,
  dateFrom,
  dateTo,
  onSearchChange,
  onSizeChange,
  onDateFromChange,
  onDateToChange,
  onClear,
  total,
  filtered,
}: SearchFilterSectionProps) {
  return (
    <div className="mb-6 p-4 rounded-lg shadow bg-white dark:bg-gray-800">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Search</label>
          <input type="text" value={searchTerm} onChange={(e) => onSearchChange(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" placeholder="Search by server, path, or notes..." />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Size Filter</label>
          <select value={filterSize} onChange={(e) => onSizeChange(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
            <option value="all">All Sizes</option>
            <option value="KB">KB Only</option>
            <option value="MB">MB Only</option>
            <option value="GB">GB Only</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Date Range</label>
          <div className="flex gap-2">
            <input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} className="w-full px-2 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" />
            <input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} className="w-full px-2 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" />
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2 items-center">
        <button type="button" onClick={onClear} className="px-3 py-1 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600">
          Clear Filters
        </button>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Showing {filtered} of {total} entries
        </span>
      </div>
    </div>
  );
}
