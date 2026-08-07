"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TrendEntry } from "../types";
import { formatDateShort } from "../lib/utils";

interface Props {
  data?: TrendEntry[];
  days: number;
  onDaysChange: (d: number) => void;
}

export default function TrendChart({ data, days, onDaysChange }: Props) {
  const chartData = (data || []).map((d) => ({
    label: formatDateShort(d.date),
    gb: d.total_gb,
  }));

  return (
    <div className="rounded-lg bg-slate-800 border border-slate-700 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-200">Trend Backup Harian</h2>
        <div className="flex gap-1">
          {[7, 14, 30, 60].map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`px-2 py-1 text-xs rounded ${
                days === d ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-700"
              }`}
            >
              {d} hari
            </button>
          ))}
        </div>
      </div>
      {chartData.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-slate-500 text-sm">Memuat...</div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} />
            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(v: number) => `${v} GB`} />
            <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "6px", fontSize: "12px" }} />
            <Area type="monotone" dataKey="gb" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
