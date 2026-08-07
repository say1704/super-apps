"use client";

interface AnomalyBadgeProps {
  anomaly_count: number;
  anomaly_rate_pct: number;
  severity?: "low" | "medium" | "high";
}

export function AnomalyBadge({ anomaly_count, anomaly_rate_pct, severity = "low" }: AnomalyBadgeProps) {
  const getColor = () => {
    if (severity === "high" || anomaly_rate_pct > 10) return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    if (severity === "medium" || anomaly_rate_pct > 5) return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  };

  const getIcon = () => {
    if (anomaly_count === 0) return "✓";
    if (severity === "high") return "⚠";
    if (severity === "medium") return "⚡";
    return "ℹ";
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getColor()}`}>
      <span>{getIcon()}</span>
      <span>{anomaly_count} anomalies ({anomaly_rate_pct.toFixed(1)}%)</span>
    </span>
  );
}
