"use client";

interface ServerHealthEntry {
  server: string;
  status: "healthy" | "warning" | "critical";
  last_deletion: string | null;
  days_ago: number | null;
}

interface ServerHealthProps {
  servers: ServerHealthEntry[];
}

const statusConfig: Record<string, { color: string; label: string }> = {
  healthy: { color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", label: "Healthy" },
  warning: { color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", label: "Warning" },
  critical: { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", label: "Critical" },
};

export function ServerHealth({ servers }: ServerHealthProps) {
  return (
    <div className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
      <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">Server Health</h3>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Server</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Last Deletion</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Days Ago</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((s, idx) => {
              const cfg = statusConfig[s.status];
              return (
                <tr key={idx} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-white font-medium">{s.server}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${cfg.color}`}>{cfg.label}</span>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{s.last_deletion || "Never"}</td>
                  <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{s.days_ago !== null ? `${s.days_ago} days` : "N/A"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
