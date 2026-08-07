"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface MonthlyTrendEntry {
  month: string;
  count: number;
  size_gb: number;
}

interface MonthlyTrendProps {
  data: MonthlyTrendEntry[];
}

export function MonthlyTrend({ data }: MonthlyTrendProps) {
  const chartData = data.map((d) => ({
    label: d.month,
    count: d.count,
    size: d.size_gb,
  }));

  return (
    <div className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
      <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">Monthly Trend</h3>
      {chartData.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
          No data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} />
            <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v: number) => `${v} GB`} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "6px",
                fontSize: "12px",
                color: "#f9fafb",
              }}
            />
            <Area type="monotone" dataKey="size" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} name="Size (GB)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
