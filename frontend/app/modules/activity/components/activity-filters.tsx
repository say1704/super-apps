// frontend/app/modules/activity/components/activity-filters.tsx

"use client";

interface ActivityFiltersProps {
  page: number;
  page_size: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export default function ActivityFilters({
  page,
  page_size,
  onPageChange,
  onPageSizeChange
}: ActivityFiltersProps) {
  return (
    <div className="mb-6 flex justify-between items-center flex-wrap gap-4">
      <div className="flex gap-4 items-center flex-wrap">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
            Rows per page:
          </label>
          <select
            value={page_size}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400 self-end">
          Page {page}
        </div>
      </div>
    </div>
  );
}
