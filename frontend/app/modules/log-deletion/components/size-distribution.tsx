"use client";

interface SizeDistribution {
  large: { count: number; label: string; servers: string[] };
  medium: { count: number; label: string; servers: string[] };
  small: { count: number; label: string; servers: string[] };
}

interface SizeDistributionProps {
  distribution: SizeDistribution;
}

export function SizeDistribution({ distribution }: SizeDistributionProps) {
  return (
    <div className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
      <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">Size Distribution</h3>
      <div className="grid grid-cols-3 gap-4">
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">{distribution.large.label}</p>
          <p className="text-2xl font-bold text-red-600">{distribution.large.count}</p>
          <p className="text-xs text-gray-500 mt-1">servers</p>
          {distribution.large.servers.length > 0 && (
            <p className="text-xs text-gray-400 mt-1 truncate" title={distribution.large.servers.join(", ")}>
              {distribution.large.servers.join(", ")}
            </p>
          )}
        </div>
        <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">{distribution.medium.label}</p>
          <p className="text-2xl font-bold text-yellow-600">{distribution.medium.count}</p>
          <p className="text-xs text-gray-500 mt-1">servers</p>
          {distribution.medium.servers.length > 0 && (
            <p className="text-xs text-gray-400 mt-1 truncate" title={distribution.medium.servers.join(", ")}>
              {distribution.medium.servers.join(", ")}
            </p>
          )}
        </div>
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">{distribution.small.label}</p>
          <p className="text-2xl font-bold text-green-600">{distribution.small.count}</p>
          <p className="text-xs text-gray-500 mt-1">servers</p>
          {distribution.small.servers.length > 0 && (
            <p className="text-xs text-gray-400 mt-1 truncate" title={distribution.small.servers.join(", ")}>
              {distribution.small.servers.join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
