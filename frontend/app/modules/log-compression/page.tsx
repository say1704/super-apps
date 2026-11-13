"use client";

import { CompressionInsight } from './components/compression-insight';

export default function LogCompressionModule() {
  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Log Compression</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Scan hasil Log Compressor via SSH + insight — mode SAFE/TEST & DELETE AFTER VERIFY, hemat %, file dihapus, detail per-arsip.
        </p>
      </div>
      <CompressionInsight />
    </div>
  );
}
