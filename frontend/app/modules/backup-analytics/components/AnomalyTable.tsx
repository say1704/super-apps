"use client";

import { useState } from "react";
import type { Anomaly } from "../types";
import { formatDate, formatGB } from "../lib/utils";
import ExportActions from "./ExportActions";

interface Props {
  data?: Anomaly[];
}

const PAGE_SIZE = 15;

export default function AnomalyTable({ data }: Props) {
  const [page, setPage] = useState(0);

  if (!data) return <div className="p-8 text-center text-slate-500 text-sm">Memuat...</div>;
  if (data.length === 0) return <div className="p-8 text-center text-emerald-400 text-sm">✅ Tidak ada anomali terdeteksi</div>;

  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const paged = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="rounded-lg bg-slate-800 border border-slate-700 mb-4">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">🔍 Deteksi Anomali</h2>
          <p className="text-xs text-slate-500 mt-1">Perubahan storage tidak wajar (drop &gt;30% atau naik &gt;100%)</p>
        </div>
        <ExportActions
          columns={[
            { key: "IP", label: "IP" },
            { key: "Tanggal", label: "Tanggal" },
            { key: "Sebelum_GB", label: "Sebelum (GB)" },
            { key: "Sesudah_GB", label: "Sesudah (GB)" },
            { key: "Perubahan", label: "Perubahan" },
            { key: "Tipe", label: "Tipe" },
          ]}
          data={data.map(a => ({
            IP: a.ip,
            Tanggal: a.date,
            Sebelum_GB: a.prev_size_gb,
            Sesudah_GB: a.curr_size_gb,
            Perubahan: `${a.change_pct}%`,
            Tipe: a.type,
          }))}
          filename="anomali"
          title="Deteksi Anomali - Backup Analytics"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">IP</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">Tanggal</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">Sebelumnya</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">Sesudah</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">Perubahan</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-slate-400">Tipe</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((a, i) => (
              <tr key={`${a.ip}-${a.date}-${i}`} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                <td className="px-4 py-2 font-mono text-xs text-slate-200">{a.ip}</td>
                <td className="px-4 py-2 text-xs text-slate-300">{formatDate(a.date)}</td>
                <td className="px-4 py-2 text-right text-xs text-slate-300">{formatGB(a.prev_size_gb)}</td>
                <td className="px-4 py-2 text-right text-xs text-slate-300">{formatGB(a.curr_size_gb)}</td>
                <td className={`px-4 py-2 text-right text-xs font-medium ${a.change_pct < 0 ? "text-red-400" : "text-amber-400"}`}>
                  {a.change_pct >= 0 ? "+" : ""}{a.change_pct.toFixed(1)}%
                </td>
                <td className="px-4 py-2 text-center">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${a.type === "drop" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}>
                    {a.type === "drop" ? "🔻 Turun" : "🔺 Naik"}
                  </span>
                </td>
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
