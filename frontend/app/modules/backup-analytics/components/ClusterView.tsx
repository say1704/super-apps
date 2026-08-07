"use client";

import useSWR from "swr";
import { apiRequest } from "@/lib/auth";
import { useState, useMemo } from "react";
import ExportActions from "./ExportActions";

function swrFetcher<T>(url: string): Promise<T> {
  return apiRequest(url);
}

const CLUSTER_META: Record<string, { name: string; description: string; color: string }> = {
  large_stable: { name: "Large Stable", description: "Ukuran besar, stabil", color: "#3b82f6" },
  fast_growing: { name: "Fast Growing", description: "Pertumbuhan sangat cepat", color: "#ef4444" },
  volatile: { name: "Volatile", description: "Fluktuatif, tidak terprediksi", color: "#f97316" },
  small_stable: { name: "Small Stable", description: "Ukuran kecil, stabil", color: "#22c55e" },
  at_risk: { name: "At Risk", description: "Konsistensi rendah / sering miss", color: "#991b1b" },
};

interface ClusterData {
  clusters: Record<string, string[]>;
  cluster_details: Record<string, {
    count: number;
    avg_size_gb: number;
    avg_growth_pct: number;
    avg_consistency: number;
    servers: string[];
  }>;
  server_assignments: Record<string, string>;
  total_servers: number;
}

export default function ClusterView() {
  const [days, setDays] = useState(90);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);

  const { data, isLoading } = useSWR<ClusterData>(
    `/api/backup-analytics/analytics/ml/clusters?days=${days}`,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
        Memuat klaster server...
      </div>
    );
  }

  if (!data || data.total_servers === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
        Tidak ada data klaster. Pastikan server memiliki minimal 3 data point backup.
      </div>
    );
  }

  const clusterKeys = Object.keys(data.clusters);

  const exportData = useMemo(() => {
    return Object.entries(data.cluster_details).map(([key, detail]) => ({
      Cluster: key,
      Name: CLUSTER_META[key]?.name || key,
      Count: detail.count,
      Avg_Size_GB: detail.avg_size_gb?.toFixed(1) ?? "N/A",
      Avg_Growth_Pct: detail.avg_growth_pct?.toFixed(1) ?? "N/A",
      Avg_Consistency: detail.avg_consistency?.toFixed(0) ?? "N/A",
      Servers: detail.servers.join(", "),
    }));
  }, [data]);

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Server Clustering — Pengelompokan Pola Backup</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {data.total_servers} server dikelompokkan berdasarkan perilaku backup
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportActions
            columns={[
              { key: "Cluster", label: "Cluster" },
              { key: "Name", label: "Nama" },
              { key: "Count", label: "Jumlah Server" },
              { key: "Avg_Size_GB", label: "Rata-rata Size (GB)" },
              { key: "Avg_Growth_Pct", label: "Rata-rata Growth (%)" },
              { key: "Avg_Consistency", label: "Rata-rata Consistency (%)" },
              { key: "Servers", label: "Daftar Server" },
            ]}
            data={exportData}
            filename="server-clusters"
            title="Server Clustering — Pengelompokan Pola Backup"
          />
          <label className="text-xs text-slate-400">Data:</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded-md border border-slate-600"
          >
            <option value={30}>30 hari</option>
            <option value={90}>90 hari</option>
            <option value={180}>180 hari</option>
          </select>
        </div>
      </div>

      {/* Cluster Summary Cards */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {clusterKeys.map((key) => {
          const servers = data.clusters[key] ?? [];
          const detail = data.cluster_details[key];
          const meta = CLUSTER_META[key] ?? { name: key, description: "", color: "#6b7280" };
          const isExpanded = expandedCluster === key;

          return (
            <div
              key={key}
              className={`rounded-lg border cursor-pointer transition-all ${
                isExpanded ? "border-blue-500/50 bg-slate-700/50" : "border-slate-700 bg-slate-800/30 hover:bg-slate-700/30"
              }`}
              onClick={() => setExpandedCluster(isExpanded ? null : key)}
            >
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: meta.color }} />
                    <span className="text-sm font-semibold text-slate-200">{meta.name}</span>
                  </div>
                  <span className="text-xs text-slate-400">{servers.length} server</span>
                </div>
                <p className="text-xs text-slate-400 mb-2">{meta.description}</p>

                {detail && (
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-slate-500">Avg Size</div>
                      <div className="text-slate-300 font-medium">{(detail.avg_size_gb ?? 0).toFixed(1)} GB</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Growth</div>
                      <div className={`font-medium ${((detail.avg_growth_pct ?? 0) > 0) ? "text-red-400" : "text-emerald-400"}`}>
                        {((detail.avg_growth_pct ?? 0) > 0) ? "+" : ""}{(detail.avg_growth_pct ?? 0).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Consistency</div>
                      <div className="text-slate-300 font-medium">{(detail.avg_consistency ?? 0).toFixed(0)}%</div>
                    </div>
                  </div>
                )}
              </div>

              {isExpanded && servers.length > 0 && (
                <div className="px-3 pb-3 border-t border-slate-700 pt-2">
                  <div className="text-xs text-slate-400 mb-1">Servers:</div>
                  <div className="flex flex-wrap gap-1">
                    {servers.map((server) => (
                      <span
                        key={server}
                        className="px-1.5 py-0.5 text-xs bg-slate-700 text-slate-300 rounded font-mono"
                      >
                        {server}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-slate-700 bg-slate-900/30 text-xs text-slate-400">
        Klaster dibuat berdasarkan fitur: ukuran backup, pertumbuhan, konsistensi, dan volatilitas. Klik klaster untuk melihat daftar server.
      </div>
    </div>
  );
}
