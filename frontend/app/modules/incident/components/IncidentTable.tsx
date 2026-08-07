"use client";

interface Incident {
  id: number;
  title: string;
  status: string;
  priority: string;
  incident_type: string;
  created_at: string;
}

interface IncidentTableProps {
  data: Incident[];
  onEdit: (item: Incident) => void;
  onDelete: (id: number) => void;
}

export default function IncidentTable({ data, onEdit, onDelete }: IncidentTableProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'in_progress': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300';
      case 'resolved': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'closed': return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      case 'high': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300';
      case 'medium': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300';
      case 'low': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="rounded-lg shadow overflow-hidden bg-white dark:bg-slate-800">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-slate-700">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">ID</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Title</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Priority</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Type</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Created</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id} className="border-t border-gray-200 dark:border-gray-700">
              <td className="px-4 py-3 text-gray-900 dark:text-white">{item.id}</td>
              <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{item.title}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded text-xs ${getStatusColor(item.status)}`}>
                  {item.status}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded text-xs ${getPriorityColor(item.priority)}`}>
                  {item.priority}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-900 dark:text-white">{item.incident_type}</td>
              <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">
                {new Date(item.created_at).toLocaleDateString()}
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
          No incidents found
        </div>
      )}
    </div>
  );
}
