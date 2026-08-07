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

export default function ServerAggregation() {
  const [serverIp, setServerIp] = useState("");
  const [submittedIp, setSubmittedIp] = useState("");

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
  );
}
