"use client";

interface Worklog {
  id: number;
  date: string;
  time: string;
  description: string;
  category: string;
  tags: string;
  estimated_time: string;
  actual_time: string;
  status: string;
  notes: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
}

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

interface WorklogTableProps {
  data: Worklog[];
  selectedIds: number[];
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  onEdit: (item: Worklog) => void;
  onDelete: (id: number) => void;
}

export default function WorklogTable({ 
  data, 
  selectedIds, 
  onToggleSelect, 
  onToggleSelectAll,
  onEdit,
  onDelete 
}: WorklogTableProps) {
  const allSelected = data.length > 0 && selectedIds.length === data.length;

  return (
    <div className="rounded-lg shadow overflow-hidden bg-white dark:bg-slate-800">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-slate-700">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="w-4 h-4"
              />
            </th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">ID</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Date/Time</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Description</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Category</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Tags</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Time Tracking</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id} className="border-t border-gray-200 dark:border-gray-700">
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => onToggleSelect(item.id)}
                  className="w-4 h-4"
                />
              </td>
              <td className="px-4 py-3 text-gray-900 dark:text-white">{item.id}</td>
              <td className="px-4 py-3 text-gray-900 dark:text-white">
                <div>{item.date}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{item.time}</div>
              </td>
              <td className="px-4 py-3 text-gray-900 dark:text-white max-w-[200px]">
                <div className="truncate">{item.description}</div>
                {item.notes && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">📝 {item.notes}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="px-2 py-1 rounded text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  {item.category || 'General'}
                </span>
              </td>
              <td className="px-4 py-3">
                {item.tags && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.split(',').map((tag: string, i: number) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        #{tag.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-gray-900 dark:text-white">
                {item.estimated_time && (
                  <div className="text-xs">Est: {item.estimated_time}</div>
                )}
                {item.actual_time && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">Actual: {item.actual_time}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <div>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      item.status === 'done'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : item.status === 'cancelled'
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    }`}
                  >
                    {item.status === 'done' ? 'Done' : item.status === 'cancelled' ? 'Cancelled' : 'In Progress'}
                  </span>
                </div>
                {item.status === 'done' && item.completed_at && (
                  <div className="mt-1 text-xs text-green-600 dark:text-green-400">
                    Completed: {formatTimestamp(item.completed_at)}
                  </div>
                )}
                {item.status === 'cancelled' && item.cancelled_at && (
                  <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                    Cancelled: {formatTimestamp(item.cancelled_at)}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(item)}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm"
                  >
                    ✕
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {data.length === 0 && (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          No worklog entries found
        </div>
      )}
    </div>
  );
}
