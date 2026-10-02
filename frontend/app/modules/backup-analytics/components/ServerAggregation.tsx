"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { apiRequest } from "@/lib/auth";
import type { ServerAggregationResponse, UnifiedServer, UnifiedServerListData } from "../types";
import { formatGB } from "../lib/utils";
import ExportActions from "./ExportActions";

function swrFetcher<T>(url: string): Promise<T> {
  return apiRequest(url);
}

interface SameDatePoint {
  target: string;
  actual: string | null;
  size_bytes: number | null;
  size_formatted: string;
  jumlah_files: number | null;
  status: string | null;
  found: boolean;
  delta_pct: number | null;
}
interface SameDateResponse {
  server_ip: string;
  base_date: string;
  nearest_days: number;
  points: SameDatePoint[];
}

export default function ServerAggregation() {
  const [serverIp, setServerIp] = useState("");
  const [submittedIp, setSubmittedIp] = useState("");
  const [cmpDate, setCmpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cmpMonths, setCmpMonths] = useState(6);
  const [cmpNearest, setCmpNearest] = useState(0);

  const { data: serverListData } = useSWR<UnifiedServerListData>(
    "/api/backup-analytics/analytics/unified-servers?days=30",
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const { data, isLoading } = useSWR<ServerAggregationResponse>(
    submittedIp ? `/api/backup-analytics/analytics/server/${encodeURIComponent(submittedIp)}/aggregation` : null,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const { data: cmpData, isLoading: cmpLoading } = useSWR<SameDateResponse>(
    submittedIp
      ? `/api/backup-analytics/analytics/server/${encodeURIComponent(submittedIp)}/same-date-comparison?date=${cmpDate}&months=${cmpMonths}&nearest=${cmpNearest}`
      : null,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    if (serverListData?.servers && serverListData.servers.length > 0 && !submittedIp) {
      const firstServer = serverListData.servers[0];
      setServerIp(firstServer.ip);
      setSubmittedIp(firstServer.ip);
    }
  }, [serverListData, submittedIp]);

  const handleSearch = () => {
    if (serverIp.trim()) setSubmittedIp(serverIp.trim());
  };

  const handleServerSelect = (ip: string) => {
    setServerIp(ip);
    setSubmittedIp(ip);
  };

  const servers = serverListData?.servers || [];

  return (
    <>
    <div className="rounded-lg bg-slate-800 border border-slate-700 mb-4">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">📊 Agregasi Backup Per-Server</h2>
            <p className="text-xs text-slate-500 mt-1">Total file dan size untuk 7 hari sampai 12 bulan ke belakang</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={serverIp}
              onChange={(e) => handleServerSelect(e.target.value)}
              className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs text-slate-200 w-56"
            >
              {servers.length === 0 && <option value="">Memuat server...</option>}
              {servers.map((s: UnifiedServer) => (
                <option key={s.ip} value={s.ip}>
                  {s.ip}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={serverIp}
              onChange={(e) => setServerIp(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder="Atau masukkan IP manual"
              className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 w-48"
            />
            <button
              onClick={handleSearch}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500"
            >
              Cari
            </button>
            {data && (
              <ExportActions
                columns={[
                  { key: "Periode", label: "Periode" },
                  { key: "Hari", label: "Jumlah Hari" },
                  { key: "Backup", label: "Jumlah Backup" },
                  { key: "Total_File", label: "Total File" },
                  { key: "Total_Size_GB", label: "Total Size (GB)" },
                  { key: "Rata2_Size_GB", label: "Rata-rata/Backup" },
                ]}
                data={data.periods.map((p) => ({
                  Periode: p.period,
                  Hari: p.days,
                  Backup: p.backup_count,
                  Total_File: p.total_files,
                  Total_Size_GB: p.total_size_gb,
                  Rata2_Size_GB: p.avg_size_gb,
                }))}
                filename={`agregasi-${submittedIp}`}
                title={`Agregasi Backup - ${submittedIp}`}
              />
            )}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="p-8">
          <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-slate-700"></div>)}</div>
        </div>
      )}

      {!submittedIp && !isLoading && servers.length === 0 && (
        <div className="p-8 text-center text-slate-500 text-sm">
          Memuat daftar server...
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* Server Info */}
          <div className="p-4 border-b border-slate-700 bg-slate-800/50">
            <div className="flex items-center gap-4">
              <span className="font-mono text-sm text-slate-200">{data.server_ip}</span>
              <span className="text-xs text-slate-500">Terakhir backup: {data.latest_backup || "-"}</span>
              <span className="text-xs text-slate-500">Size: {formatGB(data.latest_size_gb)}</span>
            </div>
          </div>

          {/* Aggregation Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">Periode</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">Jumlah Hari</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">Jumlah Backup</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">Total File</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">Total Size</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">Rata-rata/Backup</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">Periode Data</th>
                </tr>
              </thead>
              <tbody>
                {data.periods.map((p) => (
                  <tr key={p.period} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="px-4 py-2 font-medium text-xs text-slate-200">{p.period}</td>
                    <td className="px-4 py-2 text-right text-xs text-slate-300">{p.days}</td>
                    <td className="px-4 py-2 text-right text-xs text-slate-300">{p.backup_count}</td>
                    <td className="px-4 py-2 text-right text-xs text-emerald-400">{p.total_files.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-xs text-blue-400 font-medium">{formatGB(p.total_size_gb)}</td>
                    <td className="px-4 py-2 text-right text-xs text-slate-300">{formatGB(p.avg_size_gb)}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {p.first_date && p.last_date ? `${p.first_date} s/d ${p.last_date}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>

    {/* Komparasi Tanggal Sama Antar-Bulan (per-server) */}
    <div className="rounded-lg bg-slate-800 border border-slate-700 mb-4">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">📅 Komparasi Tanggal Sama Antar-Bulan</h2>
            <p className="text-xs text-slate-500 mt-1">
              Ukuran backup pada tanggal yang sama di beberapa bulan terakhir (mis. 2 Okt vs 2 Sep vs 2 Agu …)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={cmpDate}
              onChange={(e) => setCmpDate(e.target.value)}
              className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs text-slate-200"
            />
            <select
              value={cmpMonths}
              onChange={(e) => setCmpMonths(Number(e.target.value))}
              className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs text-slate-200"
            >
              <option value={3}>3 bulan</option>
              <option value={6}>6 bulan</option>
              <option value={12}>12 bulan</option>
            </select>
            <select
              value={cmpNearest}
              onChange={(e) => setCmpNearest(Number(e.target.value))}
              className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs text-slate-200"
              title="Toleransi hari bila tak ada backup tepat di tanggal target"
            >
              <option value={0}>Tepat tanggal</option>
              <option value={1}>±1 hari</option>
              <option value={3}>±3 hari</option>
              <option value={7}>±7 hari</option>
            </select>
            {cmpData && cmpData.points.length > 0 && (
              <ExportActions
                columns={[
                  { key: "Tanggal_Target", label: "Tanggal Target" },
                  { key: "Tanggal_Aktual", label: "Tanggal Aktual" },
                  { key: "Size", label: "Size" },
                  { key: "Total_File", label: "Total File" },
                  { key: "Status", label: "Status" },
                  { key: "Delta_Persen", label: "Delta %" },
                ]}
                data={cmpData.points.map((p) => ({
                  Tanggal_Target: p.target,
                  Tanggal_Aktual: p.actual || "-",
                  Size: p.size_formatted,
                  Total_File: p.jumlah_files ?? "-",
                  Status: p.status || "-",
                  Delta_Persen: p.delta_pct ?? "-",
                }))}
                filename={`komparasi-tanggal-${submittedIp}`}
                title={`Komparasi Tanggal Sama - ${submittedIp}`}
              />
            )}
          </div>
        </div>
      </div>

      {cmpLoading && (
        <div className="p-8">
          <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-slate-700"></div>)}</div>
        </div>
      )}

      {!cmpLoading && cmpData && cmpData.points.length === 0 && (
        <div className="p-8 text-center text-slate-500 text-sm">Tidak ada data untuk tanggal ini.</div>
      )}

      {!cmpLoading && cmpData && cmpData.points.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">Tanggal Target</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">Tanggal Aktual</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">Total Size</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">Total File</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">Δ vs bulan sebelumnya</th>
              </tr>
            </thead>
            <tbody>
              {cmpData.points.map((p) => (
                <tr key={p.target} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="px-4 py-2 font-medium text-xs text-slate-200">{p.target}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">
                    {p.found ? (p.actual && p.actual !== p.target ? `${p.actual} (terdekat)` : p.actual) : "—"}
                  </td>
                  <td className={`px-4 py-2 text-right text-xs font-medium ${p.found ? "text-blue-400" : "text-slate-600"}`}>
                    {p.size_formatted}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-emerald-400">
                    {p.jumlah_files != null ? p.jumlah_files.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400">{p.status || "—"}</td>
                  <td className="px-4 py-2 text-right text-xs">
                    {p.delta_pct == null ? (
                      <span className="text-slate-600">—</span>
                    ) : p.delta_pct > 0 ? (
                      <span className="text-amber-400">▲ {p.delta_pct}%</span>
                    ) : p.delta_pct < 0 ? (
                      <span className="text-emerald-400">▼ {Math.abs(p.delta_pct)}%</span>
                    ) : (
                      <span className="text-slate-400">0%</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </>
  );
}
