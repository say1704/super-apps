"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/auth";
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";

interface Finding {
  id: number;
  module: string;
  entity: string | null;
  signal_type: string;
  severity: string;
  status: string;
  title: string | null;
  score: number | null;
  message: string | null;
  narrative: string | null;
  metric_current: number | null;
  metric_baseline: number | null;
  period_from: string | null;
  period_to: string | null;
  detected_at: string | null;
}

interface Summary {
  open_total: number;
  by_severity: Record<string, number>;
  by_module: Record<string, number>;
}

const MODULES = ["ssh-report", "capacity", "vulnerability", "backup-analytics", "incident", "inventory"];
const SEVERITIES = ["critical", "high", "medium", "low"];

const SEV_CLASS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  low: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

// Peta modul → route sumber untuk drill-down.
const MODULE_HREF: Record<string, string> = {
  "ssh-report": "/modules/ssh-report",
  capacity: "/modules/monthly-server-check",
  inventory: "/modules/monthly-server-check",
  vulnerability: "/modules/vulnerability",
  "backup-analytics": "/modules/backup-analytics",
  incident: "/modules/incident",
  correlation: "/modules/reports",
};

// modul agent/korelasi tambahan yang mungkin muncul di filter


// Satuan metrik per jenis sinyal → untuk memformat angka agar manusiawi.
const UNIT_BY_SIGNAL: Record<string, string> = {
  backup_size_anomaly: "bytes",
  capacity_cpu_outlier: "percent",
  capacity_ram_outlier: "percent",
  capacity_disk_outlier: "percent",
  ssh_bruteforce_spike: "count",
  new_source_ip: "count",
  vuln_high_spike: "count",
  incident_spike: "count",
  inventory_drift: "count",
};
const UNIT_SUFFIX: Record<string, string> = {
  backup_size_anomaly: "",
  capacity_cpu_outlier: "penggunaan",
  capacity_ram_outlier: "penggunaan",
  capacity_disk_outlier: "penggunaan",
  ssh_bruteforce_spike: "login gagal / hari",
  new_source_ip: "IP baru",
  vuln_high_spike: "temuan High",
  incident_spike: "insiden",
  inventory_drift: "software",
};

function fmtBytes(n: number): string {
  let v = Math.abs(n);
  for (const u of ["B", "KB", "MB", "GB", "TB"]) {
    if (v < 1024) return u === "B" ? `${Math.round(v)} ${u}` : `${v.toFixed(2)} ${u}`;
    v /= 1024;
  }
  return `${v.toFixed(2)} PB`;
}
function fmtMetric(v: number | null, signal: string): string {
  if (v == null) return "-";
  const unit = UNIT_BY_SIGNAL[signal] || "count";
  if (unit === "bytes") return fmtBytes(v);
  if (unit === "percent") return `${Math.round(v)}%`;
  return `${Math.round(v)}`;
}
function deltaPct(cur: number | null, base: number | null): { text: string; up: boolean } | null {
  if (cur == null || base == null || base === 0) return null;
  const pct = ((cur - base) / base) * 100;
  return { text: `${pct >= 0 ? "▲ +" : "▼ "}${Math.round(pct)}%`, up: pct >= 0 };
}

export default function AnomalyInsightsPage() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [fModule, setFModule] = useState("");
  const [fSeverity, setFSeverity] = useState("");
  const [fStatus, setFStatus] = useState("open");
  const [selected, setSelected] = useState<Finding | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (fModule) qs.set("module", fModule);
      if (fSeverity) qs.set("severity", fSeverity);
      qs.set("status", fStatus || "all");
      const [f, s] = await Promise.all([
        apiRequest(`/api/anomaly/findings?${qs.toString()}`),
        apiRequest(`/api/anomaly/summary`).catch(() => null),
      ]);
      setFindings(f.findings || []);
      setSummary(s);
    } catch {
      setFindings([]);
    } finally {
      setLoading(false);
    }
  }, [fModule, fSeverity, fStatus]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh saat ada event anomali baru (SSE) — lihat opsi #2.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useRealtimeEvents({ anomaly_detected: () => loadRef.current() });

  const scanAll = async () => {
    setScanning(true);
    try {
      await apiRequest(`/api/anomaly/scan?module=all`, { method: "POST" });
      await load();
    } catch {
      /* ignore */
    } finally {
      setScanning(false);
    }
  };

  const setStatus = async (id: number, action: "ack" | "resolve") => {
    try {
      await apiRequest(`/api/anomaly/${id}/${action}`, { method: "POST" });
      setSelected(null);
      await load();
    } catch {
      /* ignore */
    }
  };

  const suppress = async (id: number, kind: "snooze" | "false_positive") => {
    const path = kind === "snooze" ? `/api/anomaly/${id}/snooze?days=7` : `/api/anomaly/${id}/false_positive`;
    try {
      await apiRequest(path, { method: "POST" });
      setSelected(null);
      await load();
    } catch {
      /* ignore */
    }
  };

  const openSource = (f: Finding) => {
    const base = MODULE_HREF[f.module];
    if (!base) return;
    const q = f.entity ? `?host=${encodeURIComponent(f.entity)}` : "";
    router.push(`${base}${q}`);
  };

  // Tutup detail dengan Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">🤖 AI Insights</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Deteksi anomali lintas-modul · ML + narasi AI</p>
        </div>
        <button
          onClick={scanAll}
          disabled={scanning}
          className="px-4 py-2 rounded bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50"
        >
          {scanning ? "Menganalisa semua…" : "🔍 Scan semua modul"}
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Open</div>
            <div className="text-3xl font-bold tabular-nums text-gray-900 dark:text-white mt-1">{summary.open_total}</div>
          </div>
          {SEVERITIES.map((s) => (
            <div key={s} className={`p-4 rounded-lg ${SEV_CLASS[s]}`}>
              <div className="text-[11px] font-semibold uppercase tracking-wider">{s}</div>
              <div className="text-3xl font-bold tabular-nums mt-1">{summary.by_severity[s] || 0}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={fModule} onChange={(e) => setFModule(e.target.value)} className="px-3 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm">
          <option value="">Semua modul</option>
          {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={fSeverity} onChange={(e) => setFSeverity(e.target.value)} className="px-3 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm">
          <option value="">Semua severity</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="px-3 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm">
          <option value="open">Open</option>
          <option value="ack">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="all">Semua status</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-gray-400">Memuat…</p>
      ) : findings.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <div className="text-5xl mb-3">✅</div>
          Tidak ada anomali. Klik "Scan semua modul" untuk memindai sekarang.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-700/60">
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 text-left">Severity</th>
                <th className="px-4 py-3 text-left">Modul</th>
                <th className="px-4 py-3 text-left">Entity</th>
                <th className="px-4 py-3 text-left">Temuan</th>
                <th className="px-4 py-3 text-left">Waktu</th>
                <th className="px-4 py-3 text-left">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id} onClick={() => setSelected(f)}
                    className="border-t border-gray-100 dark:border-slate-700 align-top cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${SEV_CLASS[f.severity] || SEV_CLASS.low}`}>{f.severity}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-700 dark:text-gray-300">{f.module}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{f.entity}</td>
                  <td className="px-4 py-3 max-w-xl">
                    <div className="text-gray-800 dark:text-gray-200 leading-relaxed">{f.message}</div>
                    {f.narrative && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic line-clamp-2">{f.narrative}</div>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 tabular-nums">{f.detected_at ? new Date(f.detected_at).toLocaleString("id-ID") : "-"}</td>
                  <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {f.status === "open" && (
                      <div className="flex gap-1">
                        <button onClick={() => setStatus(f.id, "ack")} className="px-2.5 py-1 rounded bg-amber-500 text-white text-xs font-medium hover:bg-amber-600">Ack</button>
                        <button onClick={() => setStatus(f.id, "resolve")} className="px-2.5 py-1 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-700">Resolve</button>
                        <button onClick={() => suppress(f.id, "snooze")} title="Diamkan 7 hari" className="px-2 py-1 rounded bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-gray-200 text-xs hover:bg-gray-300">😴</button>
                        <button onClick={() => suppress(f.id, "false_positive")} title="Tandai false positive (abaikan permanen)" className="px-2 py-1 rounded bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-gray-200 text-xs hover:bg-gray-300">🚫</button>
                      </div>
                    )}
                    {f.status !== "open" && <span className="text-xs font-medium text-gray-400 capitalize">{f.status}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail full-screen */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header sticky */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded ${SEV_CLASS[selected.severity] || SEV_CLASS.low}`}>{selected.severity}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{selected.module}</span>
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white truncate">{selected.title || selected.signal_type}</h2>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {selected.entity && <span className="font-mono">{selected.entity}</span>}
                    {selected.entity && " · "}terdeteksi {selected.detected_at ? new Date(selected.detected_at).toLocaleString("id-ID") : "-"}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="text-2xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 leading-none shrink-0">✕</button>
              </div>
            </div>

            {/* Body scroll */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="max-w-4xl mx-auto space-y-6">
                {/* Perbandingan nilai (manusiawi) */}
                {selected.metric_current != null && (
                  <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Perbandingan</div>
                    <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Nilai saat ini</div>
                        <div className="text-3xl font-bold tabular-nums text-gray-900 dark:text-white">{fmtMetric(selected.metric_current, selected.signal_type)}</div>
                        {UNIT_SUFFIX[selected.signal_type] && <div className="text-[11px] text-gray-400 mt-0.5">{UNIT_SUFFIX[selected.signal_type]}</div>}
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Normal (rata-rata)</div>
                        <div className="text-3xl font-bold tabular-nums text-gray-400 dark:text-gray-500">{fmtMetric(selected.metric_baseline, selected.signal_type)}</div>
                      </div>
                      {(() => {
                        const d = deltaPct(selected.metric_current, selected.metric_baseline);
                        if (!d) return null;
                        return (
                          <span className={`mb-1 text-sm font-bold px-3 py-1.5 rounded-full ${d.up
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>
                            {d.text} dari normal
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Pesan utama (manusiawi) */}
                <p className="text-base leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-line">{selected.message}</p>

                {/* Narasi AI */}
                {selected.narrative && (
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-1.5">🤖 Penjelasan & Rekomendasi (AI)</div>
                    <div className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{selected.narrative}</div>
                  </div>
                )}

                {/* Detail teknis (sekunder) */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Detail teknis</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      ["Jenis sinyal", selected.signal_type],
                      ["Keyakinan", selected.score != null ? `${Math.round(selected.score * 100)}%` : "-"],
                      ["Status", selected.status],
                      ["Periode", selected.period_from && selected.period_to ? `${selected.period_from} → ${selected.period_to}` : (selected.period_to || "-")],
                      ["Entity", selected.entity || "-"],
                      ["Modul", selected.module],
                    ].map(([k, v]) => (
                      <div key={k as string} className="p-3 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{k}</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 break-all mt-0.5">{v as string}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer aksi */}
            <div className="flex flex-wrap items-center gap-2 px-6 py-4 border-t border-gray-200 dark:border-slate-700 shrink-0">
              {MODULE_HREF[selected.module] && (
                <button onClick={() => openSource(selected)} className="px-4 py-2 rounded bg-blue-500 text-white text-sm font-medium hover:bg-blue-600">
                  ↗ Buka modul sumber
                </button>
              )}
              <div className="ml-auto flex gap-2">
                {selected.status === "open" && (
                  <>
                    <button onClick={() => suppress(selected.id, "snooze")} title="Diamkan 7 hari" className="px-3 py-2 rounded bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-600">😴 Snooze</button>
                    <button onClick={() => suppress(selected.id, "false_positive")} title="Abaikan permanen untuk host+sinyal ini" className="px-3 py-2 rounded bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-600">🚫 False positive</button>
                    <button onClick={() => setStatus(selected.id, "ack")} className="px-4 py-2 rounded bg-amber-500 text-white text-sm font-medium hover:bg-amber-600">Ack</button>
                    <button onClick={() => setStatus(selected.id, "resolve")} className="px-4 py-2 rounded bg-green-600 text-white text-sm font-medium hover:bg-green-700">Resolve</button>
                  </>
                )}
                {selected.status !== "open" && <span className="text-sm text-gray-400 capitalize self-center">Status: {selected.status}</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
