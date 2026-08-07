"use client";

interface CombinedInsights {
  efficiency_score: number;
  compliance_rate: number;
  compliant_servers: number;
  non_compliant_servers: number;
  trend_alert: "stable" | "increasing" | "decreasing";
}

interface InsightsPanelProps {
  insights: CombinedInsights;
}

const trendConfig: Record<string, { icon: string; color: string; label: string }> = {
  stable: { icon: "\u2192", color: "text-blue-600", label: "Stable" },
  increasing: { icon: "\u2191", color: "text-red-600", label: "Increasing" },
  decreasing: { icon: "\u2193", color: "text-green-600", label: "Decreasing" },
};

export function InsightsPanel({ insights }: InsightsPanelProps) {
  const trend = trendConfig[insights.trend_alert];

  return (
    <div className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
      <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">Insights</h3>
      <div className="grid grid-cols-4 gap-4">
        <div className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Efficiency</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{insights.efficiency_score}</p>
          <p className="text-xs text-gray-500">GB/log</p>
        </div>
        <div className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Compliance</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{insights.compliance_rate}%</p>
          <p className="text-xs text-gray-500">{insights.compliant_servers}/{insights.compliant_servers + insights.non_compliant_servers} servers</p>
        </div>
        <div className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Trend</p>
          <p className={`text-xl font-bold ${trend.color}`}>{trend.icon}</p>
          <p className="text-xs text-gray-500">{trend.label}</p>
        </div>
        <div className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Non-Compliant</p>
          <p className="text-xl font-bold text-red-600">{insights.non_compliant_servers}</p>
          <p className="text-xs text-gray-500">servers</p>
        </div>
      </div>
    </div>
  );
}
