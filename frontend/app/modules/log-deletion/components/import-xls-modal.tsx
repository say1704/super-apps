"use client";

import { useState } from 'react';
import { apiRequest } from '@/lib/auth';
import { useToast } from '@/components/toast';

interface ImportResult {
  total_rows: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

interface ImportPanelProps {
  onImported: () => void;
  onCancel: () => void;
}

export function ImportXlsPanel({ onImported, onCancel }: ImportPanelProps) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleUpload = async () => {
    if (!file) {
      toast.error('Pilih file dulu (.xlsx / .csv / .ods)');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('overwrite', String(overwrite));
    setUploading(true);
    setResult(null);
    try {
      const res: ImportResult = await apiRequest('/api/log-maintenance/import', { method: 'POST', body: form });
      setResult(res);
      toast.success(`Import selesai: +${res.imported} baru, ${res.updated} update, ${res.skipped} dilewati`);
      onImported();
    } catch (error: any) {
      toast.error(error?.message || 'Gagal import file');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mb-6 p-4 rounded-lg shadow bg-white dark:bg-gray-800">
      <h3 className="text-lg font-bold mb-1 text-gray-900 dark:text-white">📥 Import dari Spreadsheet</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Format didukung: <b>.xlsx</b>, <b>.csv</b>, <b>.ods</b> (LibreOffice). Kolom: Server, Path, Script Eksekusi,
        Tanggal Eksekusi (DD-MM-YYYY), Size, Keterangan. Sel Server/Tanggal yang di-merge otomatis diisi ke tiap baris.
        File <b>.xls</b> lama → simpan dulu sebagai .xlsx.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".xlsx,.xlsm,.csv,.ods"
          onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }}
          className="text-sm text-gray-900 dark:text-white file:mr-3 file:px-3 file:py-2 file:rounded file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          Timpa data lama (re-import)
        </label>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading || !file}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'Mengimport…' : 'Upload & Import'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
        >
          Tutup
        </button>
      </div>

      {result && (
        <div className="mt-4 text-sm rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900/40">
          <div className="flex flex-wrap gap-4 text-gray-800 dark:text-gray-200">
            <span>Total baris: <b>{result.total_rows}</b></span>
            <span className="text-emerald-600 dark:text-emerald-400">Baru: <b>{result.imported}</b></span>
            <span className="text-blue-600 dark:text-blue-400">Update: <b>{result.updated}</b></span>
            <span className="text-gray-500">Dilewati (duplikat): <b>{result.skipped}</b></span>
          </div>
          {result.errors && result.errors.length > 0 && (
            <div className="mt-2">
              <div className="font-medium text-amber-600 dark:text-amber-400">Catatan ({result.errors.length}):</div>
              <ul className="list-disc ml-5 text-xs text-gray-600 dark:text-gray-400">
                {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
