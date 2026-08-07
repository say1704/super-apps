"use client";

interface AssetStatsProps {
  stats: {
    total: number;
    by_category: Record<string, number>;
    by_classification: Record<string, number>;
    by_status: Record<string, number>;
  };
}

const categoryIcons: Record<string, string> = {
  'users': 'USR',
  'hardware': 'HW',
  'software': 'SW',
  'virtual-infrastructure': 'VI',
  'information': 'INFO'
};

const categoryLabels: Record<string, string> = {
  'users': 'Users',
  'hardware': 'Hardware',
  'software': 'Software',
  'virtual-infrastructure': 'Virtual',
  'information': 'Information'
};

export default function AssetStats({ stats }: AssetStatsProps) {
  const categoryStats = stats.by_category || {};
  const classificationStats = stats.by_classification || {};
  const statusStats = stats.by_status || {};

  return (
    <div className="space-y-4 mb-6">
      {/* Category Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total */}
        <div className="p-4 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-700 dark:to-slate-800 shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total Assets</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
            {stats.total || 0}
          </div>
        </div>

        {/* Users */}
        <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded mr-1">
              {categoryIcons.users}
            </span>
            Users
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
            {categoryStats.users || 0}
          </div>
        </div>

        {/* Hardware */}
        <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded mr-1">
              {categoryIcons.hardware}
            </span>
            Hardware
          </div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
            {categoryStats.hardware || 0}
          </div>
        </div>

        {/* Software */}
        <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded mr-1">
              {categoryIcons.software}
            </span>
            Software
          </div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
            {categoryStats.software || 0}
          </div>
        </div>

        {/* Virtual Infrastructure */}
        <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded mr-1">
              {categoryIcons['virtual-infrastructure']}
            </span>
            Virtual
          </div>
          <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mt-1">
            {categoryStats['virtual-infrastructure'] || 0}
          </div>
        </div>

        {/* Information */}
        <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded mr-1">
              {categoryIcons.information}
            </span>
            Information
          </div>
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">
            {categoryStats.information || 0}
          </div>
        </div>
      </div>

      {/* Classification & Status Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Classification */}
        <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Classification Distribution
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                Public
              </span>
              <span className="text-lg font-bold text-gray-900 dark:text-white">
                {classificationStats.public || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                Internal
              </span>
              <span className="text-lg font-bold text-gray-900 dark:text-white">
                {classificationStats.internal || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                Confidential
              </span>
              <span className="text-lg font-bold text-gray-900 dark:text-white">
                {classificationStats.confidential || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Status Distribution
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                Active
              </span>
              <span className="text-lg font-bold text-green-600 dark:text-green-400">
                {statusStats.active || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
                In Maintenance
              </span>
              <span className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                {statusStats['in-maintenance'] || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                <span className="inline-block w-2 h-2 bg-gray-500 rounded-full mr-2"></span>
                Retired
              </span>
              <span className="text-lg font-bold text-gray-600 dark:text-gray-400">
                {statusStats.retired || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                Lost
              </span>
              <span className="text-lg font-bold text-red-600 dark:text-red-400">
                {statusStats.lost || 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
