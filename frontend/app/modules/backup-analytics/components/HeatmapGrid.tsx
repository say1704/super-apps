"use client";

import { useMemo } from "react";
import type { HeatmapResponse } from "../types";
import ExportActions from "./ExportActions";

interface Props {
  data?: HeatmapResponse;
  days: number;
  onDaysChange: (d: number) => void;
}

export default function HeatmapGrid({ data, days, onDaysChange }: Props) {
  if (!data) return <div className="p-8 text-center text-slate-500 text-sm">Memuat...</div>;

  const exportData = useMemo(() => {
    const rows: Record<string, unknown>[] = [];
    for (const server of data.servers) {
      for (const date of data.dates) {
        rows.push({
          Server: server,
          Date: date,
          Status: data.grid[server]?.[date] === 1 ? "Ada Backup" : "Tidak Ada",
        });
      }
    }
    return rows;
  }, [data]);

  return (
    <div className="rounded-lg bg-slate-800 border border-slate-700 mb-4">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">🗓️ Calendar Heatmap</h2>
          <p className="text-xs text-slate-500 mt-1">
            <span className="inline-block w-3 h-3 bg-emerald-500 rounded-sm align-middle mr-1"></span> Ada backup
            <span className="inline-block w-3 h-3 bg-slate-700 rounded-sm align-middle ml-3 mr-1"></span> Tidak ada
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportActions
            columns={[
              { key: "Server", label: "Server" },
              { key: "Date", label: "Tanggal" },
              { key: "Status", label: "Status" },
            ]}
            data={exportData}
            filename="heatmap"
            title="Calendar Heatmap - Backup Analytics"
          />
          <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`px-2 py-1 text-xs rounded ${days === d ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-700"}`}
            >
              {d} hari
            </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto p-4">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="px-1 py-1 text-left text-slate-500 sticky left-0 bg-slate-800 z-10">Server</th>
              {data.dates.map((d) => (
                <th key={d} className="px-0.5 py-1 text-slate-500 text-center" style={{ minWidth: "18px" }}>
                  {new Date(d).getDate()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.servers.map((server) => (
              <tr key={server}>
                <td className="px-1 py-0.5 font-mono text-slate-400 sticky left-0 bg-slate-800" title={server}>
                  {server.slice(-8)}
                </td>
                {data.dates.map((d) => (
                  <td key={d} className="px-0.5 py-0.5 text-center">
                    <div
                      className={`w-3 h-3 rounded-sm mx-auto ${
                        data.grid[server]?.[d] === 1 ? "bg-emerald-500" : "bg-slate-700"
                      }`}
                      title={`${server}: ${data.grid[server]?.[d] === 1 ? "Ada" : "Tidak"}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
