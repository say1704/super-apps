"use client";

import { useState, useMemo } from "react";
import ExportActions from "./ExportActions";

interface UnifiedServer {
  ip: string;
  last_backup: string | null;
  days_ago: number;
  size_kb: number;
  size_mb: number;
  size_gb: number;
  files: number;
  status: "OK" | "Warning" | "Critical";
  growth_pct: number;
  trend: Array<{ date: string; size_gb: number }>;
}

interface Props {
  data: UnifiedServer[] | undefined;
  summary: {
    total_kb: number;
    total_mb: number;
    total_gb: number;
    total_files: number;
    server_count: number;
    backed_up_today: number;
    missing_count: number;
    avg_daily_growth_pct: number;
  } | undefined;
  onServerClick: (ip: string) => void;
}

const PAGE_SIZE = 20;

function Sparkline({ data, color }: { data: Array<{ size_gb: number }>; color: string }) {
  if (!data || data.length < 2) return <span className="text-slate-500 text-xs">-</span>;
  const values = data.map(d => d.size_gb);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 20;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="inline-block">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}

export default function UnifiedServerTable({ data, summary, onServerClick }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>("ip");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    if (!data) return [];
    let result = [...data];
    if (search) {
      result = result.filter(s => s.ip.toLowerCase().includes(search.toLowerCase()));
    }
    result.sort((a, b) => {
      const aVal = (a as any)[sortBy];
      const bVal = (b as any)[sortBy];
      if (typeof aVal === "string") return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortOrder === "asc" ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
    });
    return result;
  }, [data, search, sortBy, sortOrder]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortOrder("asc"); }
    setPage(1);
  };

  const exportColumns = [
    { key: "IP", label: "IP" },
    { key: "Last_Backup", label: "Last Backup" },
    { key: "Days_Ago", label: "Days Ago" },
    { key: "Size_KB", label: "Size KB" },
    { key: "Size_MB", label: "Size MB" },
    { key: "Size_GB", label: "Size GB" },
    { key: "Files", label: "Files" },
    { key: "Status", label: "Status" },
    { key: "Growth_Pct", label: "Growth %" },
  ];

  const exportData = useMemo(() => {
    if (!data) return [];
    return data.map(s => ({
      IP: s.ip,
      Last_Backup: s.last_backup || "Never",
      Days_Ago: s.days_ago,
      Size_KB: s.size_kb.toLocaleString(),
      Size_MB: s.size_mb.toFixed(1),
      Size_GB: s.size_gb.toFixed(3),
      Files: s.files,
      Status: s.status,
      Growth_Pct: s.growth_pct.toFixed(1),
    }));
  }, [data]);

  const SortIcon = ({ col }: { col: string }) => (
    <span className="ml-1 text-slate-500">
      {sortBy === col ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  if (!data) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
        Memuat data server...
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Semua Server</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {summary?.server_count || 0} server · {summary?.total_kb.toLocaleString()} KB / {summary?.total_mb.toFixed(0)} MB / {summary?.total_gb.toFixed(1)} GB total · {summary?.backed_up_today || 0} backup hari ini
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Cari IP..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="bg-slate-900 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-48"
          />
          <ExportActions
            columns={exportColumns}
            data={exportData}
            filename={`backup-servers-${new Date().toISOString().split("T")[0]}`}
            title="Semua Server - Backup Analytics"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/50">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200" onClick={() => handleSort("ip")}>IP <SortIcon col="ip" /></th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200" onClick={() => handleSort("last_backup")}>Last Backup <SortIcon col="last_backup" /></th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200" onClick={() => handleSort("size_kb")}>Size KB <SortIcon col="size_kb" /></th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200" onClick={() => handleSort("size_mb")}>Size MB <SortIcon col="size_mb" /></th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200" onClick={() => handleSort("size_gb")}>Size GB <SortIcon col="size_gb" /></th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200" onClick={() => handleSort("files")}>Files <SortIcon col="files" /></th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200" onClick={() => handleSort("growth_pct")}>Growth % <SortIcon col="growth_pct" /></th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-400">Trend</th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-400">Action</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((s) => (
              <tr key={s.ip} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                <td className="px-4 py-2.5 font-mono text-slate-200">{s.ip}</td>
                <td className="px-4 py-2.5 text-slate-300">
                  {s.last_backup ? (
                    <span>
                      {s.last_backup}
                      <span className="text-slate-500 text-xs ml-1">({s.days_ago}d ago)</span>
                    </span>
                  ) : (
                    <span className="text-red-400">Never</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-200">{s.size_kb.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right text-slate-200">{s.size_mb.toFixed(1)}</td>
                <td className="px-4 py-2.5 text-right text-slate-200">{s.size_gb.toFixed(3)}</td>
                <td className="px-4 py-2.5 text-right text-slate-300">{s.files.toLocaleString()}</td>
                <td className={`px-4 py-2.5 text-right font-medium ${s.growth_pct > 0 ? "text-red-400" : s.growth_pct < 0 ? "text-emerald-400" : "text-slate-400"}`}>
                  {s.growth_pct > 0 ? "+" : ""}{s.growth_pct.toFixed(1)}%
                </td>
                <td className="px-4 py-2.5 text-center">
                  <Sparkline data={s.trend} color={s.growth_pct > 0 ? "#f87171" : "#34d399"} />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <button
                    onClick={() => onServerClick(s.ip)}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Detail
                  </button>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  {search ? `Tidak ada server matching "${search}"` : "Tidak ada data"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-3 border-t border-slate-700 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 rounded"
            >
              Prev
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) p = i + 1;
              else if (page <= 3) p = i + 1;
              else if (page >= totalPages - 2) p = totalPages - 4 + i;
              else p = page - 2 + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-2 py-1 text-xs rounded ${p === page ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-200"}`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 rounded"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
