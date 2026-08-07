"use client";

import { useEffect, useState, useCallback } from "react";
import { apiRequest } from "@/lib/auth";
import { useToast } from "@/components/toast";

interface RetentionPolicy {
  module: string;
  enabled: boolean;
  retention_days: number;
}

interface CleanupLog {
  id: number;
  module: string;
  records_deleted: number;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  error_message: string | null;
}

const MODULE_LABELS: Record<string, string> = {
  activity_logs: "Activity Logs",
  notifications: "Notifications",
  backup_history: "Backup History",
  ssh_login_logs: "SSH Login Logs",
  incident_report: "Incident Reports",
  vulnerability_report: "Vulnerability Reports",
  work_logs: "Work Logs",
};

const MODULE_DESCRIPTIONS: Record<string, string> = {
  activity_logs: "Log aktivitas pengguna di seluruh menu aplikasi.",
  notifications: "Notifikasi sistem dan pengingat yang pernah dikirim.",
  backup_history: "Riwayat file backup database yang tersimpan.",
  ssh_login_logs: "Log akses SSH ke server yang tercatat.",
  incident_report: "Laporan insiden keamanan yang pernah dibuat.",
  vulnerability_report: "Laporan kerentanan keamanan yang pernah dibuat.",
  work_logs: "Data worklog harian pengguna.",
};

function formatCutoff(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return d.toLocaleDateString("id-ID", { year: "numeric", month: "short", day: "numeric" });
}

export default function RetentionTab() {
  const toast = useToast();
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [logs, setLogs] = useState<CleanupLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [previewAll, setPreviewAll] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("02:30");
  const [scheduleHour, setScheduleHour] = useState(2);
  const [scheduleMinute, setScheduleMinute] = useState(30);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const fetchPolicies = useCallback(async () => {
    try {
      const data = await apiRequest("/retention/policies");
      setPolicies(data.policies || []);
    } catch (e) {
      console.error("Failed to fetch retention policies:", e);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await apiRequest("/retention/logs");
      setLogs(data.logs || []);
    } catch (e) {
      console.error("Failed to fetch cleanup logs:", e);
    }
  }, []);

  const fetchSchedule = useCallback(async () => {
    try {
      const data = await apiRequest("/retention/schedule");
      if (data.schedule_time) {
        setScheduleTime(data.schedule_time);
        const [h, m] = data.schedule_time.split(":").map(Number);
        setScheduleHour(h);
        setScheduleMinute(m);
      }
    } catch (e) {
      console.error("Failed to fetch schedule:", e);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchPolicies(), fetchLogs(), fetchSchedule()]).finally(() => setLoading(false));
  }, [fetchPolicies, fetchLogs, fetchSchedule]);

  const handleToggle = async (module: string, current: boolean) => {
    const policy = policies.find((p) => p.module === module);
    if (!policy) return;
    try {
      await apiRequest(`/retention/policies/${module}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !current, retention_days: policy.retention_days }),
      });
      await fetchPolicies();
      toast.success(`${MODULE_LABELS[module] || module}: ${!current ? "Enabled" : "Disabled"}`);
    } catch (e) {
      toast.error("Failed to update policy");
    }
  };

  const handleDaysChange = async (module: string, days: number) => {
    const policy = policies.find((p) => p.module === module);
    if (!policy) return;
    try {
      await apiRequest(`/retention/policies/${module}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: policy.enabled, retention_days: days }),
      });
      await fetchPolicies();
      toast.success(`${MODULE_LABELS[module] || module}: retention updated to ${days} days`);
    } catch (e) {
      toast.error("Failed to update retention days");
    }
  };

  const handlePreview = async (module: string) => {
    setPreviewing(module);
    try {
      const result = await apiRequest(`/retention/run/${module}?dry_run=true`, { method: "POST" });
      const label = MODULE_LABELS[module] || module;
      const count = result.records_deleted;
      if (count > 0) {
        toast.warning(`${label}: ${count} records akan dihapus jika dijalankan`);
      } else {
        toast.success(`${label}: Tidak ada data yang perlu dihapus`);
      }
    } catch (e) {
      toast.error("Preview failed");
    } finally {
      setPreviewing(null);
    }
  };

  const handleRunNow = async (module: string) => {
    setRunning(module);
    try {
      const result = await apiRequest(`/retention/run/${module}`, { method: "POST" });
      toast.success(`Cleaned ${result.records_deleted} records from ${MODULE_LABELS[module] || module}`);
      await fetchLogs();
    } catch (e) {
      toast.error("Cleanup failed");
    } finally {
      setRunning(null);
    }
  };

  const handlePreviewAll = async () => {
    setPreviewAll(true);
    try {
      const result = await apiRequest("/retention/run-all?dry_run=true", { method: "POST" });
      await fetchLogs();
      toast.info(result.message);
    } catch (e) {
      toast.error("Preview all failed");
    } finally {
      setPreviewAll(false);
    }
  };

  const handleRunAll = async () => {
    setRunningAll(true);
    try {
      const result = await apiRequest("/retention/run-all", { method: "POST" });
      toast.success(result.message);
      await fetchLogs();
      await fetchPolicies();
    } catch (e) {
      toast.error("Bulk cleanup failed");
    } finally {
      setRunningAll(false);
    }
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const time = `${String(scheduleHour).padStart(2, "0")}:${String(scheduleMinute).padStart(2, "0")}`;
      await apiRequest("/retention/schedule", {
        method: "PUT",
        body: JSON.stringify({ schedule_time: time }),
      });
      setScheduleTime(time);
      toast.success(`Jadwal otomatis diubah ke ${time}`);
    } catch (e) {
      toast.error("Gagal menyimpan jadwal");
    } finally {
      setSavingSchedule(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading retention policies...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Data Retention</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Configure auto-deletion of old records per module
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePreviewAll}
            disabled={previewAll}
            className="px-4 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 font-medium disabled:opacity-50"
          >
            {previewAll ? "Previewing..." : "Preview All"}
          </button>
          <button
            onClick={handleRunAll}
            disabled={runningAll}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
          >
            {runningAll ? "Cleaning..." : "Run All Cleanups"}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center gap-4">
          <label className="text-sm font-semibold text-gray-900 dark:text-slate-100">Jadwal Otomatis:</label>
          <select
            value={scheduleHour}
            onChange={(e) => setScheduleHour(Number(e.target.value))}
            className="px-2.5 py-1.5 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
            ))}
          </select>
          <span className="text-gray-500 dark:text-slate-400">:</span>
          <select
            value={scheduleMinute}
            onChange={(e) => setScheduleMinute(Number(e.target.value))}
            className="px-2.5 py-1.5 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50"
          >
            {Array.from({ length: 60 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
            ))}
          </select>
          <button
            onClick={handleSaveSchedule}
            disabled={savingSchedule}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
          >
            {savingSchedule ? "Menyimpan..." : "Simpan"}
          </button>
          <span className="text-xs text-gray-400 dark:text-slate-500">
            Saat ini: {scheduleTime}
          </span>
        </div>
      </div>

      <div className="grid gap-4">
        {policies.map((p) => (
          <div
            key={p.module}
            className="bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/50 rounded-xl p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggle(p.module, p.enabled)}
                  className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${p.enabled ? "bg-blue-600" : "bg-slate-600"}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow ${p.enabled ? "left-5" : "left-0.5"}`}
                  />
                </button>
                <div>
                  <span className="font-semibold text-gray-900 dark:text-slate-100 text-base">
                    {MODULE_LABELS[p.module] || p.module}
                  </span>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
                    {MODULE_DESCRIPTIONS[p.module] || ""}
                  </p>
                  {p.enabled && (
                    <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">
                      Data sebelum {formatCutoff(p.retention_days)} akan dihapus.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePreview(p.module)}
                  disabled={previewing === p.module || !p.enabled}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium shrink-0 ${
                    !p.enabled
                      ? "bg-gray-200 dark:bg-slate-700 text-gray-400 cursor-not-allowed"
                      : "bg-gray-600/20 text-gray-400 hover:bg-gray-600/30"
                  }`}
                >
                  {previewing === p.module ? "..." : "Preview"}
                </button>
                <button
                  onClick={() => handleRunNow(p.module)}
                  disabled={running === p.module || !p.enabled}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium shrink-0 ${
                    !p.enabled
                      ? "bg-gray-200 dark:bg-slate-700 text-gray-400 cursor-not-allowed"
                      : "bg-amber-600/20 text-amber-400 hover:bg-amber-600/30"
                  }`}
                >
                  {running === p.module ? "Running..." : "Run Now"}
                </button>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <label className="text-sm text-gray-500 dark:text-slate-400 mt-1.5">Retention:</label>
              <div>
                <div className="flex items-center gap-2">
                  <input
                    key={`ret-${p.module}-${p.retention_days}`}
                    type="text"
                    inputMode="numeric"
                    defaultValue={p.retention_days.toString()}
                    onBlur={(e) => {
                      const cleaned = e.target.value.replace(/\D/g, '');
                      const num = parseInt(cleaned, 10);
                      if (num >= 1 && num <= 3650 && num !== p.retention_days) {
                        handleDaysChange(p.module, num);
                      } else if (cleaned && num !== p.retention_days) {
                        e.target.value = p.retention_days.toString();
                      }
                    }}
                    className="w-20 px-2.5 py-1.5 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50 focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-sm text-gray-500 dark:text-slate-400">hari</span>
                </div>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Maks: 3650 hari (±10 tahun)</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-3">Cleanup History</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">No cleanup logs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700/50 text-left text-gray-500 dark:text-slate-400">
                  <th className="pb-2 pr-4">Module</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Deleted</th>
                  <th className="pb-2 pr-4">Started</th>
                  <th className="pb-2 pr-4">Completed</th>
                  <th className="pb-2 pr-4">Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100 dark:border-slate-700/30">
                    <td className="py-2 pr-4 text-gray-900 dark:text-slate-100">{MODULE_LABELS[l.module] || l.module}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          l.status === "completed"
                            ? "bg-green-600/20 text-green-400"
                            : l.status === "skipped"
                              ? "bg-gray-600/20 text-gray-400"
                              : l.status === "preview"
                                ? "bg-blue-600/20 text-blue-400"
                                : "bg-red-600/20 text-red-400"
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-900 dark:text-slate-100">{l.records_deleted}</td>
                    <td className="py-2 pr-4 text-gray-500 dark:text-slate-400">{l.started_at ? new Date(l.started_at).toLocaleString() : "-"}</td>
                    <td className="py-2 pr-4 text-gray-500 dark:text-slate-400">{l.completed_at ? new Date(l.completed_at).toLocaleString() : "-"}</td>
                    <td className="py-2 pr-4 text-red-400 max-w-[200px] truncate">{l.error_message || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
