"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";

interface Finding {
  id: number;
  module: string;
  entity: string | null;
  signal_type: string;
  severity: string;
  message: string | null;
  narrative: string | null;
  detected_at: string | null;
}

const SEV_CLASS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  low: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

/**
 * Panel anomali ringkas untuk disematkan di halaman modul mana pun.
 * Menampilkan temuan open untuk `module` + tombol "Analisa" (scan on-demand).
 */
export default function AnomalyPanel({ module, title }: { module: string; title?: string }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/api/anomaly/findings?module=${module}&status=open&limit=50`);
      setFindings(res.findings || []);
    } catch {
      setFindings([]);
    } finally {
      setLoading(false);
    }
  }, [module]);

  useEffect(() => {
    load();
  }, [load]);

  const scan = async () => {
    setScanning(true);
    try {
      await apiRequest(`/api/anomaly/scan?module=${module}`, { method: "POST" });
      await load();
    } catch {
      /* diamkan */
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">
          🤖 {title || "Deteksi Anomali (AI)"}
          {findings.length > 0 && (
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {findings.length}
            </span>
          )}
        </h3>
        <button
          onClick={scan}
          disabled={scanning}
          className="px-3 py-1.5 rounded bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
        >
          {scanning ? "Menganalisa…" : "🔍 Analisa"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Memuat…</p>
      ) : findings.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Tidak ada anomali terbuka. Klik "Analisa" untuk memindai.</p>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto">
          {findings.map((f) => (
            <li key={f.id} className="text-sm border-b border-gray-100 dark:border-slate-700 pb-2 last:border-0">
              <div className="flex items-start gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${SEV_CLASS[f.severity] || SEV_CLASS.low}`}>
                  {f.severity}
                </span>
                <div className="flex-1">
                  <div className="text-gray-800 dark:text-gray-200">
                    {f.entity && <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{f.entity} · </span>}
                    {f.message}
                  </div>
                  {f.narrative && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">{f.narrative}</div>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
