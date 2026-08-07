"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiRequest } from "@/lib/auth";
import type { ConsistencyServer, PeriodSummaryResponse } from "../types";
import { formatGB, getConsistencyColor, getConsistencyBg } from "../lib/utils";
import ExportActions from "./ExportActions";

function swrFetcher<T>(url: string): Promise<T> {
  return apiRequest(url);
}

interface Props {
  onServerClick: (ip: string) => void;
}

const PAGE_SIZE = 10;

export default function HistoryOverview({ onServerClick }: Props) {
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [page, setPage] = useState(0);

  const { data: summary } = useSWR<PeriodSummaryResponse>(
    `/api/backup-analytics/analytics/period-summary?start=${start}&end=${end}`,
    swrFetcher,
    { refreshInterval: 60000 },
  );

  const { data: consistency } = useSWR<{ servers: ConsistencyServer[] }>(
    `/api/backup-analytics/analytics/consistency?days=30`,
    swrFetcher,
    { refreshInterval: 60000 },
  );

  const servers = consistency?.servers || [];
  const totalPages = Math.ceil(servers.length / PAGE_SIZE);
  const paged = servers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="rounded-lg bg-slate-800 border border-slate-700 mb-4">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">📋 History Keseluruhan</h2>
            <p className="text-xs text-slate-500 mt-1">Ringkasan backup semua server dalam periode tertentu</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={start} onChange={(e) => { setStart(e.target.value); setPage(0); }} className="rounded-md border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-slate-200" />
            <span className="text-xs text-slate-500">s/d</span>
            <input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPage(0); }} className="rounded-md border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-slate-200" />
            <ExportActions
              columns={[
                { key: "IP", label: "IP" },
                { key: "Hari_Backup", label: "Hari Backup" },
                { key: "Konsistensi", label: "Konsistensi" },
                { key: "Size_GB", label: "Size (GB)" },
                { key: "Files", label: "File" },
              ]}
              data={servers.map((s) => ({
                IP: s.ip,
                Hari_Backup: s.backup_days,
                Konsistensi: `${s.consistency_pct}%`,
                Size_GB: s.size_gb,
                Files: s.files,
              }))}
              filename="history-keseluruhan"
              title="History Keseluruhan - Backup Analytics"
            />
          </div>
        </div>
      </div>

      {/* Period Summary */}
      {summary && (
        <div className="p-4 border-b border-slate-700 bg-slate-800/50">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <div className="text-xs text-slate-500">Total Backup</div>
              <div className="text-lg font-bold text-blue-400">{formatGB(summary.summary.total_gb)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Total File</div>
              <div className="text-lg font-bold text-emerald-400">{summary.summary.total_files.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Server</div>
              <div className="text-lg font-bold text-slate-300">{summary.summary.server_count}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Rata-rata/Hari</div>
              <div className="text-lg font-bold text-amber-400">{formatGB(summary.summary.avg_daily_gb)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Paling Konsisten</div>
              <div className="text-lg font-bold text-slate-300">
                {summary.most_consistent ? (
                  <span className={getConsistencyColor(summary.most_consistent.pct)}>
                    {summary.most_consistent.ip.slice(-8)} ({summary.most_consistent.pct}%)
                  </span>
                ) : "-"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Consistency Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">#</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">IP Server</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">Hari Backup</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">Konsistensi</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">Size</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">File</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((s, i) => (
              <tr
                key={s.ip}
                className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                onClick={() => onServerClick(s.ip)}
              >
                <td className="px-4 py-2 text-xs text-slate-500">{page * PAGE_SIZE + i + 1}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-200">{s.ip}</td>
                <td className="px-4 py-2 text-right text-xs text-slate-300">{s.backup_days}/{s.total_days}</td>
                <td className="px-4 py-2 text-right">
                  <span className={`inline-block rounded border px-1.5 py-0.5 text-xs ${getConsistencyBg(s.consistency_pct)}`}>
                    {s.consistency_pct}%
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-xs text-blue-400">{formatGB(s.size_gb)}</td>
                <td className="px-4 py-2 text-right text-xs text-slate-300">{s.files.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-700">
          <span className="text-xs text-slate-500">{page + 1}/{totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-1 text-xs text-slate-400 disabled:opacity-30 hover:bg-slate-700">←</button>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-2 py-1 text-xs text-slate-400 disabled:opacity-30 hover:bg-slate-700">→</button>
          </div>
        </div>
      )}
    </div>
  );
}
