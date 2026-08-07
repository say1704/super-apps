"use client";

interface IncidentStatsProps {
  stats: {
    total: number;
    open: number;
    in_progress: number;
    resolved: number;
    closed: number;
    critical: number;
  };
}

export default function IncidentStats({ stats }: IncidentStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
        <div className="text-sm text-gray-500 dark:text-gray-400">Total</div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
      </div>
      
      <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
        <div className="text-sm text-gray-500 dark:text-gray-400">Open</div>
        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.open}</div>
      </div>
      
      <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
        <div className="text-sm text-gray-500 dark:text-gray-400">In Progress</div>
        <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.in_progress}</div>
      </div>
      
      <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
        <div className="text-sm text-gray-500 dark:text-gray-400">Resolved</div>
        <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.resolved}</div>
      </div>
      
      <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
        <div className="text-sm text-gray-500 dark:text-gray-400">Closed</div>
        <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{stats.closed}</div>
      </div>
      
      <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
        <div className="text-sm text-gray-500 dark:text-gray-400">Critical</div>
        <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.critical}</div>
      </div>
    </div>
  );
}
