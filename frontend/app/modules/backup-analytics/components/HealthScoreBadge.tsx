"use client";

interface HealthScoreBadgeProps {
  score: number;
  grade?: string;
  size?: "sm" | "md" | "lg";
  showGrade?: boolean;
}

export function HealthScoreBadge({ score, grade, size = "sm", showGrade = true }: HealthScoreBadgeProps) {
  const getColor = () => {
    if (score >= 90) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    if (score >= 80) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (score >= 70) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    if (score >= 60) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    return "bg-red-500/20 text-red-400 border-red-500/30";
  };

  const getGrade = () => {
    if (grade) return grade;
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  };

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
    lg: "px-3 py-1.5 text-base",
  };

  const getTooltip = () => {
    if (score >= 90) return "Sangat sehat — backup konsisten, pertumbuhan stabil, tidak ada anomali";
    if (score >= 80) return "Sehat — backup rutin dengan minor issue yang tidak signifikan";
    if (score >= 70) return "Cukup — ada beberapa inkonsistensi atau anomali yang perlu diperhatikan";
    if (score >= 60) return "Kurang — backup tidak konsisten atau pertumbuhan storage tidak normal";
    return "Buruk — backup sering gagal, anomali tinggi, perlu tindakan segera";
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${getColor()} ${sizeClasses[size]}`} title={getTooltip()}>
      <span className="font-bold">{score}</span>
      {showGrade && <span className="opacity-75">({getGrade()})</span>}
    </span>
  );
}
