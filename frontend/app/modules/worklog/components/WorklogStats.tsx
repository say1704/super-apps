"use client";

interface StatsProps {
  stats: {
    total: number;
    done: number;
    in_progress: number;
    cancelled: number;
    total_estimated_hours: number;
    total_actual_hours: number;
  };
}

export default function WorklogStats({ stats }: StatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
        <div className="text-sm text-gray-500 dark:text-gray-400">Total</div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
      </div>
      
      <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
        <div className="text-sm text-gray-500 dark:text-gray-400">Done</div>
        <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.done}</div>
      </div>
      
      <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
        <div className="text-sm text-gray-500 dark:text-gray-400">In Progress</div>
        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.in_progress}</div>
      </div>
      
      <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
        <div className="text-sm text-gray-500 dark:text-gray-400">Cancelled</div>
        <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.cancelled}</div>
      </div>
      
      <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
        <div className="text-sm text-gray-500 dark:text-gray-400">Est. Hours</div>
        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.total_estimated_hours}h</div>
      </div>
      
      <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
        <div className="text-sm text-gray-500 dark:text-gray-400">Actual Hours</div>
        <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{stats.total_actual_hours}h</div>
      </div>
    </div>
  );
}
