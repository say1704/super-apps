"use client";

import useSWR from "swr";
import { apiRequest } from "@/lib/auth";
import { useState } from "react";
import ExportActions from "./ExportActions";

function swrFetcher<T>(url: string): Promise<T> {
  return apiRequest(url);
}

interface ProjectionServer {
  ip: string;
  current_gb: number;
  current_mb: number;
  current_kb: number;
  avg_daily_growth_gb: number;
  projected_30d_gb: number;
  projected_60d_gb: number;
  projected_180d_gb: number;
  trend: "increasing" | "decreasing" | "stable";
}

export default function CapacityProjection() {
  const [horizon, setHorizon] = useState(180);

  const { data, isLoading } = useSWR<{ servers: ProjectionServer[]; total_current_gb: number; total_projected_gb: number }>(
    `/api/backup-analytics/analytics/capacity-projection?horizon_months=${horizon > 90 ? 6 : horizon > 45 ? 2 : 1}`,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
        Memuat data proyeksi...
      </div>
    );
  }

  if (!data || !data.servers.length) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
        Tidak ada data proyeksi
      </div>
    );
  }

  const sorted = [...data.servers].sort((a, b) => b.projected_180d_gb - a.projected_180d_gb);

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Proyeksi Kapasitas Storage</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Total saat ini: {data.total_current_gb.toFixed(1)} GB → Proyeksi: {data.total_projected_gb.toFixed(1)} GB
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportActions
            columns={[
              { key: "IP_Server", label: "IP Server" },
              { key: "Current_KB", label: "Current KB" },
              { key: "Current_MB", label: "Current MB" },
              { key: "Current_GB", label: "Current GB" },
              { key: "Growth_Per_Hari_GB", label: "Growth/hari (GB)" },
              { key: "Proyeksi_30_Hari_GB", label: "30 Hari (GB)" },
              { key: "Proyeksi_60_Hari_GB", label: "60 Hari (GB)" },
              { key: "Proyeksi_180_Hari_GB", label: "180 Hari (GB)" },
              { key: "Trend", label: "Trend" },
            ]}
            data={sorted.map((s) => ({
              IP_Server: s.ip,
              Current_KB: s.current_kb.toLocaleString(),
              Current_MB: s.current_mb.toFixed(1),
              Current_GB: s.current_gb.toFixed(3),
              Growth_Per_Hari_GB: s.avg_daily_growth_gb.toFixed(3),
              Proyeksi_30_Hari_GB: s.projected_30d_gb.toFixed(2),
              Proyeksi_60_Hari_GB: s.projected_60d_gb.toFixed(2),
              Proyeksi_180_Hari_GB: s.projected_180d_gb.toFixed(2),
              Trend: s.trend === "increasing" ? "Naik" : s.trend === "decreasing" ? "Turun" : "Stabil",
            }))}
            filename="proyeksi-kapasitas"
            title="Proyeksi Kapasitas Storage"
          />
          <div className="flex gap-1">
            {[30, 60, 180].map((d) => (
              <button
                key={d}
                onClick={() => setHorizon(d)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${horizon === d ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
              >
                {d} hari
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/50">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400">IP Server</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Current KB</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Current MB</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Current GB</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Growth/hari</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">30 Hari</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">60 Hari</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">180 Hari</th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-400">Trend</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.ip} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                <td className="px-4 py-2.5 font-mono text-slate-200">{s.ip}</td>
                <td className="px-4 py-2.5 text-right text-slate-200">{s.current_kb.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right text-slate-200">{s.current_mb.toFixed(1)}</td>
                <td className="px-4 py-2.5 text-right text-slate-200">{s.current_gb.toFixed(3)}</td>
                <td className={`px-4 py-2.5 text-right font-medium ${s.avg_daily_growth_gb > 0 ? "text-red-400" : s.avg_daily_growth_gb < 0 ? "text-emerald-400" : "text-slate-400"}`}>
                  {s.avg_daily_growth_gb > 0 ? "+" : ""}{s.avg_daily_growth_gb.toFixed(3)} GB
                </td>
                <td className="px-4 py-2.5 text-right text-slate-300">{s.projected_30d_gb.toFixed(2)} GB</td>
                <td className="px-4 py-2.5 text-right text-slate-300">{s.projected_60d_gb.toFixed(2)} GB</td>
                <td className="px-4 py-2.5 text-right text-slate-300">{s.projected_180d_gb.toFixed(2)} GB</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                    s.trend === "increasing" ? "bg-red-500/20 text-red-400" :
                    s.trend === "decreasing" ? "bg-emerald-500/20 text-emerald-400" :
                    "bg-slate-500/20 text-slate-400"
                  }`}>
                    {s.trend === "increasing" ? "↑ Naik" : s.trend === "decreasing" ? "↓ Turun" : "→ Stabil"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
