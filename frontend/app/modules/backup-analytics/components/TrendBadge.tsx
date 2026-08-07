"use client";

interface TrendBadgeProps {
  trend: string;
  description?: string;
  size?: "sm" | "md";
}

export function TrendBadge({ trend, description, size = "sm" }: TrendBadgeProps) {
  const getConfig = () => {
    switch (trend) {
      case "growing_fast":
        return { icon: "↑↑", label: "Growing Fast", color: "bg-red-500/20 text-red-400 border-red-500/30" };
      case "growing_slow":
        return { icon: "↑", label: "Growing Slow", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
      case "stable":
        return { icon: "→", label: "Stable", color: "bg-green-500/20 text-green-400 border-green-500/30" };
      case "shrinking":
        return { icon: "↓", label: "Shrinking", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
      case "volatile":
        return { icon: "↯", label: "Volatile", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" };
      case "seasonal":
        return { icon: "↻", label: "Seasonal", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
      default:
        return { icon: "?", label: trend, color: "bg-slate-500/20 text-slate-400 border-slate-500/30" };
    }
  };

  const config = getConfig();
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${config.color} ${sizeClasses[size]}`} title={description}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
