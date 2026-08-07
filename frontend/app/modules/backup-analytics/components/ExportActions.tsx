"use client";

import { exportToCSV, exportToPDF } from "@/lib/export";

interface Column {
  key: string;
  label: string;
}

interface ExportActionsProps {
  columns: Column[];
  data: Record<string, unknown>[];
  filename: string;
  title?: string;
}

export default function ExportActions({ columns, data, filename, title }: ExportActionsProps) {
  if (!data.length) return null;

  const numberedColumns = [{ key: "__row_num__", label: "#" }, ...columns];
  const numberedData = data.map((row, i) => ({ __row_num__: i + 1, ...row }));

  return (
    <div className="flex gap-1.5">
      <button
        onClick={() => exportToCSV(numberedData, filename, numberedColumns)}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 hover:bg-green-500 text-white transition-colors flex items-center gap-1"
      >
        <span>📥</span> CSV
      </button>
      <button
        onClick={() => exportToPDF(numberedData, filename, title || filename, numberedColumns)}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center gap-1"
      >
        <span>📄</span> PDF
      </button>
    </div>
  );
}
