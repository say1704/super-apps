// frontend/app/modules/activity/components/activity-table.tsx

"use client";

interface ActivityLog {
  id: number;
  timestamp: string;
  log_type: string;
  user: string;
  user_role?: string;
  action: string;
  module: string;
  description: string;
  ip_address: string;
  asset_code?: string;
}

interface ActivityTableProps {
  data: ActivityLog[];
  sort_by: string;
  sort_order: 'asc' | 'desc';
  onSort: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
}

const ACTION_BADGES: Record<string, string> = {
  'CREATE': '➕ Create',
  'UPDATE': '✏️ Update',
  'DELETE': '🗑️ Delete',
  'VIEW': '👁️ View',
  'EXPORT': '📤 Export',
  'LOGIN': '🔑 Login',
  'LOGOUT': '🚪 Logout',
  'ASSIGN': '📋 Assign',
  'APPROVE': '✅ Approve',
  'REJECT': '❌ Reject',
  'SUBMIT': '📤 Submit',
  'create': '➕ Create',
  'update': '✏️ Update',
  'delete': '🗑️ Delete',
  'bulk-delete': '🗑️ Bulk Delete',
  'bulk-status-update': '📋 Bulk Status',
  'password_reset': '🔑 Password Reset',
  'view_password': '👁️ View Password',
  'view_password_failed': '❌ Failed View',
  'edit': '✏️ Edit',
  'export': '📤 Export',
};

const ACTION_COLORS: Record<string, string> = {
  'CREATE': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  'UPDATE': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'DELETE': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  'VIEW': 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  'EXPORT': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  'LOGIN': 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  'LOGOUT': 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  'ASSIGN': 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  'APPROVE': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  'REJECT': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  'SUBMIT': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  'create': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  'update': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'delete': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  'bulk-delete': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  'bulk-status-update': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'password_reset': 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  'view_password': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  'view_password_failed': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  'edit': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'export': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
};

const MODULE_NAMES: Record<string, string> = {
  'assets': 'Asset Register',
  'configurations': 'Configuration Mgmt',
  'backup_check': 'Backup Check',
  'backup_analytics': 'Backup Analytics',
  'worklog': 'Worklog',
  'project_tasks': 'Project Tasks',
  'activity_logs': 'Activity Logs',
  'log_maintenance': 'Log Maintenance',
  'log_compression': 'Log Compression',
  'vulnerability': 'Vulnerability Report',
  'incident': 'Incident Report',
  'documentation': 'Documentation',
  'document_library': 'Document Library',
  'risk': 'Risk Assessment',
  'quality': 'Quality Objectives',
  'forms': 'Form Uploads',
  'monthly_check': 'Server Check',
  'configuration': 'Config Items',
  'irmc': 'IRMC Check',
  'authentication': 'Authentication',
  'settings': 'Settings',
  'penilaian_risiko': 'Risk Assessment',
  'interested_parties': 'Interested Parties',
  'peluang': 'Opportunities',
  'isu_matrix': 'Issue Matrix',
  'capacity': 'Server Capacity',
  'sprints': 'Sprints',
  'Asset Register': 'Asset Register',
};

const ROLE_BADGES: Record<string, string> = {
  'superadmin': 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300',
  'auditor': 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300',
  'manager': 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300',
  'viewer': 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
};

const getActionBadge = (action: string) => ACTION_BADGES[action] || action;
const getActionColor = (action: string) => ACTION_COLORS[action] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
const getModuleName = (module: string) => MODULE_NAMES[module] || module;

export default function ActivityTable({ data, sort_by, sort_order, onSort }: ActivityTableProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th
              className="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={() => onSort('timestamp', sort_order === 'desc' ? 'asc' : 'desc')}
            >
              <div className="flex items-center gap-2">
                <span>Timestamp</span>
                {sort_by === 'timestamp' && (
                  <span className="text-xs">{sort_order === 'desc' ? '🔽' : '🔼'}</span>
                )}
              </div>
            </th>
            <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
            <th className="px-4 py-3 text-left text-sm font-medium">User</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Action</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Module</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Description</th>
            <th className="px-4 py-3 text-left text-sm font-medium">IP Address</th>
          </tr>
        </thead>
        <tbody>
          {(data || []).map((item) => (
            <tr key={item.id} className="border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {item.timestamp ? new Date(item.timestamp).toLocaleString() : '-'}
              </td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  item.log_type === 'asset_audit' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                  'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                }`}>
                  {item.log_type === 'asset_audit' ? '🔐 Asset' : '📝 Activity'}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {item.user || '-'}
                  </span>
                  {item.user_role && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ROLE_BADGES[item.user_role] || 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                      {item.user_role}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded text-xs font-medium ${getActionColor(item.action)}`}>
                  {getActionBadge(item.action)}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                {getModuleName(item.module)}
                {item.asset_code && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                    {item.asset_code}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-md truncate">
                {item.description}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-gray-500 dark:text-gray-400 text-xs">
                {item.ip_address || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && (
        <div className="p-12 text-center text-gray-500 dark:text-gray-400">
          <p>No activity logs found</p>
        </div>
      )}
    </div>
  );
}
