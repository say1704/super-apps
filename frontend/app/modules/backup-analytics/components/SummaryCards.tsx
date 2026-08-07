"use client";

import type { DashboardSummary } from "../types";

interface Props {
  data?: DashboardSummary;
}

export default function SummaryCards({ data }: Props) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-800"></div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Total KB",
      value: data.total_kb.toLocaleString(),
      sub: "kilobytes",
      color: "text-slate-300",
    },
    {
      label: "Total MB",
      value: data.total_mb.toLocaleString(),
      sub: "megabytes",
      color: "text-blue-400",
    },
    {
      label: "Total GB",
      value: data.total_gb.toFixed(1),
      sub: "gigabytes",
      color: "text-emerald-400",
    },
    {
      label: "Total Files",
      value: data.total_files.toLocaleString(),
      sub: "file ter-backup",
      color: "text-amber-400",
    },
    {
      label: "Server Aktif",
      value: String(data.server_count),
      sub: `backup hari ini: ${data.backed_up_today}`,
      color: "text-emerald-400",
    },
    {
      label: "Belum Backup",
      value: String(data.missing_count),
      sub: "server tidak backup",
      color: data.missing_count > 0 ? "text-red-400" : "text-emerald-400",
    },
    {
      label: "Avg Growth",
      value: `${data.avg_daily_growth_pct > 0 ? "+" : ""}${data.avg_daily_growth_pct.toFixed(1)}%`,
      sub: "rata-rata harian",
      color: data.avg_daily_growth_pct > 0 ? "text-red-400" : "text-emerald-400",
    },
    {
      label: "Anomali",
      value: String(data.anomaly_count || 0),
      sub: "spike/drop terdeteksi",
      color: (data.anomaly_count || 0) > 0 ? "text-amber-400" : "text-emerald-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg bg-slate-800 border border-slate-700 p-3">
          <div className="text-xs text-slate-500 mb-1">{c.label}</div>
          <div className={`text-lg font-bold ${c.color}`}>{c.value}</div>
          <div className="text-xs text-slate-500 mt-0.5">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
