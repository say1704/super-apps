"use client";

import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart } from "recharts";

interface PredictionData {
  date: string;
  actual?: number;
  predicted?: number;
  lower?: number;
  upper?: number;
}

interface PredictionChartProps {
  historicalData: Array<{ date: string; size_gb: number }>;
  predictions: Record<string, { projected_gb: number; lower_gb: number; upper_gb: number }>;
  model_used: string;
  accuracy?: { mape: number; rmse: number };
}

export function PredictionChart({
  historicalData,
  predictions,
  model_used,
  accuracy,
}: PredictionChartProps) {
  const chartData: PredictionData[] = [];

  historicalData.forEach((d) => {
    chartData.push({
      date: d.date,
      actual: d.size_gb,
    });
  });

  const lastDate = historicalData[historicalData.length - 1]?.date;
  if (lastDate && Object.keys(predictions).length > 0) {
    const months = [1, 3, 6];
    months.forEach((m) => {
      const pred = predictions[`${m}m`];
      if (pred) {
        const predDate = new Date(lastDate);
        predDate.setMonth(predDate.getMonth() + m);
        chartData.push({
          date: predDate.toISOString().split("T")[0],
          predicted: pred.projected_gb,
          lower: pred.lower_gb,
          upper: pred.upper_gb,
        });
      }
    });
  }

  const formatGB = (value: number) => `${value.toFixed(2)} GB`;

  const hasPredictions = Object.keys(predictions).length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">ML Prediction with Confidence Bands</h3>
        <div className="flex items-center gap-4 text-sm">
          <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded">
            Model: {model_used}
          </span>
          {accuracy && (
            <span className="px-2 py-1 bg-green-100 dark:bg-green-900 rounded">
              MAPE: {accuracy.mape.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" />
          <YAxis tickFormatter={formatGB} />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [
              `${((value as number) ?? 0).toFixed(2)} GB`,
              (name as string) === "actual" ? "Actual" : (name as string) === "predicted" ? "Predicted" : (name as string),
            ]}
          />
          {lastDate && <ReferenceLine x={lastDate} stroke="gray" strokeDasharray="3 3" label="Today" />}

          {hasPredictions && (
            <Area
              type="monotone"
              dataKey="upper"
              stroke="none"
              fill="#3b82f6"
              fillOpacity={0.12}
              isAnimationActive={false}
            />
          )}

          <Area
            type="monotone"
            dataKey="actual"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.2}
            name="Actual"
            isAnimationActive={false}
          />

          {hasPredictions && (
            <Line
              type="monotone"
              dataKey="predicted"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ fill: "#f59e0b", r: 4 }}
              name="Predicted"
              strokeDasharray="5 5"
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500 rounded"></div>
          <span>Actual</span>
        </div>
        {hasPredictions && (
          <>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-500 rounded" style={{ borderTop: "2px dashed" }}></div>
              <span>Predicted</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-200 rounded opacity-30"></div>
              <span>95% Confidence Band</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
