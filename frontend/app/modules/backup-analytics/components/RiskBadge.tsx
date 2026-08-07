"use client";

interface RiskBadgeProps {
  riskScore: number;
  riskLevel?: string;
  size?: "sm" | "md";
}

export function RiskBadge({ riskScore, riskLevel, size = "sm" }: RiskBadgeProps) {
  const getConfig = () => {
    const level = riskLevel || getLevel(riskScore);
    switch (level) {
      case "critical":
        return { icon: "🔴", label: "Critical", color: "bg-red-500/20 text-red-400 border-red-500/30" };
      case "high":
        return { icon: "🟠", label: "High", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" };
      case "medium":
        return { icon: "🟡", label: "Medium", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
      case "low":
        return { icon: "🟢", label: "Low", color: "bg-green-500/20 text-green-400 border-green-500/30" };
      default:
        return { icon: "⚪", label: level, color: "bg-slate-500/20 text-slate-400 border-slate-500/30" };
    }
  };

  function getLevel(score: number): string {
    if (score >= 80) return "critical";
    if (score >= 60) return "high";
    if (score >= 30) return "medium";
    return "low";
  }

  const getTooltip = () => {
    const level = riskLevel || getLevel(riskScore);
    switch (level) {
      case "critical": return "Risiko kritis — storage hampir penuh, pertumbuhan cepat, backup sering gagal";
      case "high": return "Risiko tinggi — pertumbuhan storage cepat atau backup tidak konsisten";
      case "medium": return "Risiko sedang — ada indikasi pertumbuhan atau inkonsistensi yang perlu dipantau";
      case "low": return "Risiko rendah — backup stabil dan storage dalam kondisi aman";
      default: return `Risk score: ${riskScore}`;
    }
  };

  const config = getConfig();
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${config.color} ${sizeClasses[size]}`} title={getTooltip()}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
      <span className="opacity-60">({riskScore})</span>
    </span>
  );
}
