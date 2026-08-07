"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { apiRequest } from "@/lib/auth";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ServerDetailResponse, ServerHistoryEntry } from "../types";
import { formatDate, formatGB, getConsistencyColor } from "../lib/utils";
import ExportActions from "./ExportActions";

function swrFetcher<T>(url: string): Promise<T> {
  return apiRequest(url);
}

interface Props {
  serverIp: string | null;
  onClose: () => void;
}

const PAGE_SIZE = 10;

export default function ServerDetailDrawer({ serverIp, onClose }: Props) {
  const [page, setPage] = useState(0);
  const [days, setDays] = useState(30);
  const contentRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useSWR<ServerDetailResponse>(
    serverIp ? `/api/backup-analytics/analytics/server/${encodeURIComponent(serverIp)}/history?days=${days}` : null,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (serverIp) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [serverIp, onClose]);

  if (!serverIp) return null;

  const totalPages = data ? Math.ceil(data.history.length / PAGE_SIZE) : 0;
  const paged = data ? data.history.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];

  const chartData = data ? data.history.slice().reverse().map((h) => ({
    label: formatDate(h.date),
    gb: h.size_gb,
  })) : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative w-full max-w-lg overflow-y-auto bg-slate-900 shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-700 bg-slate-900 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Detail Server</h2>
            <p className="font-mono text-sm text-slate-400">{serverIp}</p>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex gap-1 mr-2">
              {[7, 30, 60].map(d => (
                <button
                  key={d}
                  onClick={() => { setDays(d); setPage(0); }}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${days === d ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
                >
                  {d}d
                </button>
              ))}
            </div>
            {data && (
              <ExportActions
                columns={[
                  { key: "Tanggal", label: "Tanggal" },
                  { key: "Size_KB", label: "Size KB" },
                  { key: "Size_MB", label: "Size MB" },
                  { key: "Size_GB", label: "Size GB" },
                  { key: "Files", label: "File" },
                ]}
                data={data.history.map((h) => ({
                  Tanggal: h.date,
                  Size_KB: h.size_kb.toLocaleString(),
                  Size_MB: h.size_mb.toFixed(1),
                  Size_GB: h.size_gb.toFixed(3),
                  Files: h.files,
                }))}
                filename={`history-${serverIp}`}
                title={`Backup History - ${serverIp}`}
              />
            )}
            <button onClick={onClose} className="rounded p-2 text-slate-400 hover:bg-slate-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div ref={contentRef} id="drawer-content" className="p-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-slate-800"></div>)}</div>
          ) : data ? (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
                  <div className="text-xs text-slate-500">Size KB</div>
                  <div className="text-lg font-bold text-blue-400">{data.summary.last_size_kb.toLocaleString()}</div>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
                  <div className="text-xs text-slate-500">Size MB</div>
                  <div className="text-lg font-bold text-emerald-400">{data.summary.last_size_mb.toFixed(1)}</div>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
                  <div className="text-xs text-slate-500">Size GB</div>
                  <div className="text-lg font-bold text-amber-400">{data.summary.last_size_gb.toFixed(3)}</div>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
                  <div className="text-xs text-slate-500">Total File</div>
                  <div className="text-lg font-bold text-slate-300">{data.summary.total_files.toLocaleString()}</div>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
                  <div className="text-xs text-slate-500">Growth {days} Hari</div>
                  <div className={`text-lg font-bold ${data.summary.growth_pct >= 0 ? "text-amber-400" : "text-emerald-400"}`}>
                    {data.summary.growth_pct >= 0 ? "+" : ""}{data.summary.growth_pct.toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
                  <div className="text-xs text-slate-500">Terakhir Backup</div>
                  <div className="text-lg font-bold text-slate-300">{formatDate(data.summary.last_backup || "")}</div>
                </div>
              </div>

              {/* Chart */}
              <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
                <h3 className="text-sm font-semibold text-slate-200 mb-2">Grafik {days} Hari</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickFormatter={(v: number) => `${v} GB`} />
                    <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "6px", fontSize: "11px" }} />
                    <Line type="monotone" dataKey="gb" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* History Table */}
              <div>
                <h3 className="text-sm font-semibold text-slate-200 mb-2">Riwayat Backup</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Tanggal</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">Size KB</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">Size MB</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">Size GB</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">File</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((h, i) => (
                        <tr key={h.date} className="border-b border-slate-700/50">
                          <td className="px-3 py-2 text-xs text-slate-300">{formatDate(h.date)}</td>
                          <td className="px-3 py-2 text-right text-xs text-blue-400">{h.size_kb.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-xs text-emerald-400">{h.size_mb.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right text-xs text-amber-400">{h.size_gb.toFixed(3)}</td>
                          <td className="px-3 py-2 text-right text-xs text-slate-300">{h.files.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-slate-500">{page + 1}/{totalPages}</span>
                    <div className="flex gap-1">
                      <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-1 text-xs text-slate-400 disabled:opacity-30 hover:bg-slate-700">←</button>
                      <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-2 py-1 text-xs text-slate-400 disabled:opacity-30 hover:bg-slate-700">→</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Tidak ada data</p>
          )}
        </div>
      </div>
    </div>
  );
}
