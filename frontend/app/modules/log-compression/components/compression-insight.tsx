"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/auth';
import { useToast } from '@/components/toast';

function fmtBytes(n?: number | null): string {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${u[i]}`;
}

interface Archive {
  archive_path: string; year_month: string | null; file_count: number;
  size_original_bytes: number | null; size_archive_bytes: number | null; keterangan: string | null;
}
interface Run {
  id: number; run_id: string; server: string; folder: string; app_name: string | null;
  mode: string; period_from: string | null; period_to: string | null; status: string | null;
  archives_created: number; archives_verified: number; files_in_archive: number; files_deleted: number;
  size_original_bytes: number | null; size_archive_bytes: number | null; savings_pct: number | null;
  finished_at: string | null; archives?: Archive[];
}
interface Summary {
  total_runs: number; by_mode: Record<string, number>;
  space_compressed_bytes: number; space_after_bytes: number; space_saved_bytes: number;
  disk_reclaimed_bytes: number; avg_savings_pct: number; files_archived: number; files_deleted: number;
  by_month: { year_month: string; saved_bytes: number; original_bytes: number; archives: number }[];
  by_server: { server: string; runs: number; files_deleted: number }[];
}

const MODE_BADGE: Record<string, string> = {
  SAFE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  DELETE_AFTER_VERIFY: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  OTHER: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

export function CompressionInsight() {
  const toast = useToast();
  const [cred, setCred] = useState({ nas_ip: '', username: '', password: '', path: '', port: 22 });
  const [testing, setTesting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Run | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        apiRequest('/api/log-compression/insight/summary'),
        apiRequest('/api/log-compression/insight/runs?page=1&page_size=100'),
      ]);
      setSummary(s);
      setRuns(r.data || []);
    } catch (e: any) {
      // diamkan bila belum ada data
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const testConn = async () => {
    setTesting(true);
    try {
      const res = await apiRequest('/api/log-compression/insight/test-connection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cred),
      });
      toast.success(res.message || 'Koneksi OK');
    } catch (e: any) {
      toast.error(e?.message || 'Koneksi gagal');
    } finally { setTesting(false); }
  };

  const startScan = async () => {
    if (!cred.nas_ip || !cred.username || !cred.password || !cred.path) {
      toast.error('Isi IP, username, password, dan path folder');
      return;
    }
    setScanning(true);
    setProgress({ status: 'running', processed: 0, total: 0 });
    try {
      const res = await apiRequest('/api/log-compression/insight/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cred),
      });
      const opId = res.operation_id;
      let fails = 0;
      const iv = setInterval(async () => {
        try {
          const p = await apiRequest(`/api/log-compression/insight/progress/${opId}`);
          fails = 0;
          setProgress(p);
          if (p.status === 'completed' || p.status === 'error') {
            clearInterval(iv);
            setScanning(false);
            if (p.status === 'completed') {
              toast.success(`Scan selesai: +${p.runs_new || 0} baru, ${p.runs_updated || 0} update, ${p.runs_skipped || 0} dilewati`);
              refresh();
            } else {
              toast.error(`Scan gagal: ${p.error || 'unknown'}`);
            }
          }
        } catch (err) {
          fails += 1;
          if (fails >= 5) { clearInterval(iv); setScanning(false); toast.error('Gagal memantau progress'); }
        }
      }, 1000);
    } catch (e: any) {
      setScanning(false);
      toast.error(e?.message || 'Gagal memulai scan');
    }
  };

  const openDetail = async (run: Run) => {
    try {
      const full = await apiRequest(`/api/log-compression/insight/runs/${run.id}`);
      setSelected(full);
    } catch (e: any) {
      toast.error('Gagal memuat detail');
    }
  };

  const pct = progress && progress.total ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="space-y-4 mb-6">
      {/* Scan card */}
      <div className="p-4 rounded-lg shadow bg-white dark:bg-gray-800">
        <h3 className="text-lg font-bold mb-3 text-gray-900 dark:text-white">🔁 Scan Compressor (SSH)</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
            placeholder="IP host (mis. 10.20.100.63)" value={cred.nas_ip} onChange={e => setCred({ ...cred, nas_ip: e.target.value })} />
          <input className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
            placeholder="Username" value={cred.username} onChange={e => setCred({ ...cred, username: e.target.value })} />
          <input type="password" className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
            placeholder="Password" value={cred.password} onChange={e => setCred({ ...cred, password: e.target.value })} />
          <input className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white md:col-span-1"
            placeholder="Folder log compressor" value={cred.path} onChange={e => setCred({ ...cred, path: e.target.value })} />
          <input type="number" className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white w-24"
            placeholder="Port" value={cred.port} onChange={e => setCred({ ...cred, port: Number(e.target.value) || 22 })} />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Membaca file <code>log_compression-DD-MM-YYYY.log</code> di folder; satu file bisa banyak run; duplikat dilewati otomatis.</p>
        <div className="mt-3 flex gap-2">
          <button onClick={testConn} disabled={testing} className="px-4 py-2 rounded-lg border border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-sm disabled:opacity-50">
            {testing ? 'Menguji…' : 'Test Connection'}</button>
          <button onClick={startScan} disabled={scanning} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm disabled:opacity-50">
            {scanning ? 'Scanning…' : '🔁 Scan Compressor'}</button>
        </div>
        {progress && scanning && (
          <div className="mt-3">
            <div className="h-2 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-xs text-gray-500 mt-1">{progress.current || '…'} ({progress.processed || 0}/{progress.total || 0})</div>
          </div>
        )}
      </div>

      {/* Insight cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { l: 'Disk Dibebaskan', v: fmtBytes(summary.disk_reclaimed_bytes), c: 'text-emerald-600 dark:text-emerald-400' },
            { l: 'Rata² Hemat', v: `${summary.avg_savings_pct}%`, c: 'text-blue-600 dark:text-blue-400' },
            { l: 'Space Dihemat', v: fmtBytes(summary.space_saved_bytes), c: 'text-blue-600 dark:text-blue-400' },
            { l: 'File Dihapus', v: summary.files_deleted.toLocaleString(), c: 'text-amber-600 dark:text-amber-400' },
            { l: 'File Diarsip', v: summary.files_archived.toLocaleString(), c: 'text-gray-700 dark:text-gray-300' },
            { l: 'Total Run', v: String(summary.total_runs), c: 'text-gray-700 dark:text-gray-300' },
          ].map((k, i) => (
            <div key={i} className="p-3 rounded-lg bg-white dark:bg-gray-800 shadow">
              <div className="text-xs text-gray-500 dark:text-gray-400">{k.l}</div>
              <div className={`text-xl font-bold ${k.c}`}>{k.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Runs table */}
      <div className="rounded-lg bg-white dark:bg-gray-800 shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-600 dark:text-gray-400">
              <th className="px-4 py-2">Server</th><th className="px-4 py-2">Mode</th><th className="px-4 py-2">Periode</th>
              <th className="px-4 py-2 text-right">Hemat</th><th className="px-4 py-2 text-right">File Dihapus</th>
              <th className="px-4 py-2">Status</th><th className="px-4 py-2">Selesai</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">{loading ? 'Memuat…' : 'Belum ada hasil scan. Jalankan Scan Compressor.'}</td></tr>
            )}
            {runs.map(r => (
              <tr key={r.id} onClick={() => openDetail(r)} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer">
                <td className="px-4 py-2 font-mono text-xs text-gray-800 dark:text-gray-200">{r.server}</td>
                <td className="px-4 py-2"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${MODE_BADGE[r.mode] || MODE_BADGE.OTHER}`}>{r.mode}</span></td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{r.period_from}–{r.period_to}</td>
                <td className="px-4 py-2 text-right text-blue-600 dark:text-blue-400">{r.savings_pct != null ? `${r.savings_pct}%` : '—'}</td>
                <td className="px-4 py-2 text-right text-amber-600 dark:text-amber-400">{r.files_deleted || 0}</td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{r.status || '—'}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{r.finished_at ? new Date(r.finished_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-900 dark:text-white">{selected.server} · <span className={`text-xs px-2 py-0.5 rounded ${MODE_BADGE[selected.mode] || MODE_BADGE.OTHER}`}>{selected.mode}</span></div>
                <div className="text-xs text-gray-500 mt-1">{selected.folder}</div>
                <div className="text-xs text-gray-500">Periode {selected.period_from}–{selected.period_to} · {selected.files_in_archive} file di arsip{selected.files_deleted ? ` · ${selected.files_deleted} source dihapus` : ''}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-600 dark:text-gray-400">
                    <th className="px-3 py-2">Arsip</th><th className="px-3 py-2 text-right">File</th>
                    <th className="px-3 py-2 text-right">Asli</th><th className="px-3 py-2 text-right">Arsip</th><th className="px-3 py-2">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {(selected.archives || []).map((a, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                      <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-300">{a.archive_path}</td>
                      <td className="px-3 py-2 text-right">{a.file_count}</td>
                      <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">{fmtBytes(a.size_original_bytes)}</td>
                      <td className="px-3 py-2 text-right text-blue-600 dark:text-blue-400">{fmtBytes(a.size_archive_bytes)}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{a.keterangan || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
