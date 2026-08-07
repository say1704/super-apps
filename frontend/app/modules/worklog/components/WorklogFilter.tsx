"use client";

interface Filters {
  start_date: string;
  end_date: string;
  status: string;
  category: string;
  tags: string;
}

interface WorklogFilterProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  categories: string[];
}

export default function WorklogFilter({ filters, onFilterChange, categories }: WorklogFilterProps) {
  const resetFilters = () => {
    onFilterChange({
      start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0],
      status: '',
      category: '',
      tags: '',
    });
  };

  return (
    <div className="mb-6 p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">From Date</label>
          <input
            type="date"
            value={filters.start_date}
            onChange={(e) => onFilterChange({ ...filters, start_date: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">To Date</label>
          <input
            type="date"
            value={filters.end_date}
            onChange={(e) => onFilterChange({ ...filters, end_date: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Status</label>
          <select
            value={filters.status}
            onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          >
            <option value="">All</option>
            <option value="in_progress">🔄 In Progress</option>
            <option value="done">✅ Done</option>
            <option value="cancelled">❌ Cancelled</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Category</label>
          <select
            value={filters.category}
            onChange={(e) => onFilterChange({ ...filters, category: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          >
            <option value="">All</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tags</label>
          <input
            type="text"
            value={filters.tags}
            onChange={(e) => onFilterChange({ ...filters, tags: e.target.value })}
            placeholder="Search tags..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          />
        </div>
        
        <div className="flex items-end">
          <button
            onClick={resetFilters}
            className="w-full px-4 py-2 rounded-lg font-medium bg-gray-500 hover:bg-gray-600 text-white"
          >
            🔄 Reset
          </button>
        </div>
      </div>
    </div>
  );
}
