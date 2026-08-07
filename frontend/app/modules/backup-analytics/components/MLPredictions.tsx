"use client";

import useSWR from "swr";
import { apiRequest } from "@/lib/auth";
import { useState, useMemo, useEffect } from "react";
import ExportActions from "./ExportActions";
import { HealthScoreBadge } from "./HealthScoreBadge";
import { TrendBadge } from "./TrendBadge";
import { RiskBadge } from "./RiskBadge";
import { PredictionChart } from "./PredictionChart";

function swrFetcher<T>(url: string): Promise<T> {
  return apiRequest(url);
}

interface PredictionResult {
  server_ip: string;
  data_points: number;
  model_used: string;
  current_kb: number;
  current_mb: number;
  current_gb: number;
  predictions: Record<string, number>;
  accuracy: { mape: number; rmse: number; mae: number; r_squared: number };
  health_score: number;
  health_grade: string;
  trend: string;
  trend_description: string;
  risk_score: number;
  risk_level: string;
}

interface RawPredictResponse {
  server_ip: string;
  data_points: number;
  current: { gb: number };
  current_bytes: number;
  predictions: Record<string, {
    projected_bytes: number;
    lower: number;
    upper: number;
    projected: { gb: number };
    lower_human: { gb: number };
    upper_human: { gb: number };
  }>;
  model: string;
  accuracy: { mape: number; rmse: number; mae: number; r_squared: number };
  historical: Array<{ date: string; size_gb: number }>;
}

export default function MLPredictions() {
  const [horizon, setHorizon] = useState(6);
  const [days, setDays] = useState(180);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading } = useSWR<{
    servers: PredictionResult[];
    total_servers: number;
  }>(
    `/api/backup-analytics/analytics/ml/enhanced-predict-all?horizon_months=${horizon}&days=${days}`,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const { data: serverDetailRaw } = useSWR<RawPredictResponse>(
    selectedServer && showModal
      ? `/api/backup-analytics/analytics/ml/predict/${selectedServer}?horizon_months=${horizon}&days=${days}`
      : null,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const serverDetail = useMemo(() => {
    if (!serverDetailRaw) return null;
    const r = serverDetailRaw;
    const predictions: Record<string, { projected_gb: number; lower_gb: number; upper_gb: number }> = {};
    for (const [key, pred] of Object.entries(r.predictions)) {
      predictions[key] = {
        projected_gb: pred.projected?.gb ?? pred.projected_bytes / (1024 ** 3),
        lower_gb: pred.lower_human?.gb ?? pred.lower / (1024 ** 3),
        upper_gb: pred.upper_human?.gb ?? pred.upper / (1024 ** 3),
      };
    }
    return {
      predictions,
      current_gb: r.current?.gb ?? r.current_bytes / (1024 ** 3),
      model_used: r.model,
      accuracy: r.accuracy,
      historical: r.historical ?? [],
    };
  }, [serverDetailRaw]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showModal) {
        setShowModal(false);
        setSelectedServer(null);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [showModal]);

  const exportColumns = [
    { key: "IP_Server", label: "IP Server" },
    { key: "Data_Points", label: "Data Points" },
    { key: "Model", label: "Model" },
    { key: "Current_KB", label: "Current KB" },
    { key: "Current_MB", label: "Current MB" },
    { key: "Current_GB", label: "Current GB" },
    { key: "1M_Predicted_GB", label: "1B Predicted GB" },
    { key: "3M_Predicted_GB", label: "3B Predicted GB" },
    { key: "6M_Predicted_GB", label: "6B Predicted GB" },
    { key: "Health_Score", label: "Health Score" },
    { key: "Health_Grade", label: "Health Grade" },
    { key: "Trend", label: "Trend" },
    { key: "Risk_Score", label: "Risk Score" },
    { key: "Risk_Level", label: "Risk Level" },
  ];

  const exportData = useMemo(() => {
    if (!data) return [];
    return data.servers.map((s) => ({
      IP_Server: s.server_ip,
      Data_Points: s.data_points,
      Model: s.model_used,
      Current_KB: (s.current_kb ?? 0).toFixed(1),
      Current_MB: (s.current_mb ?? 0).toFixed(1),
      Current_GB: (s.current_gb ?? 0).toFixed(3),
      "1M_Predicted_GB": s.predictions["1m"]?.toFixed(3) || "N/A",
      "3M_Predicted_GB": s.predictions["3m"]?.toFixed(3) || "N/A",
      "6M_Predicted_GB": s.predictions["6m"]?.toFixed(3) || "N/A",
      Health_Score: s.health_score,
      Health_Grade: s.health_grade,
      Trend: s.trend,
      Risk_Score: s.risk_score,
      Risk_Level: s.risk_level,
    }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
        Memuat prediksi ML...
      </div>
    );
  }

  if (!data || !data.servers.length) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
        Tidak ada data prediksi. Pastikan server memiliki minimal 10 data point backup.
      </div>
    );
  }

  const avgHealth = data.servers.reduce((sum, s) => sum + s.health_score, 0) / data.servers.length;
  const highRiskCount = data.servers.filter((s) => s.risk_score >= 60).length;

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div className="text-xs text-slate-400">Rata-rata Health Score</div>
          <div className="text-2xl font-bold text-slate-100 mt-1">{avgHealth.toFixed(0)}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div className="text-xs text-slate-400">Server Risiko Tinggi</div>
          <div className="text-2xl font-bold text-red-400 mt-1">{highRiskCount}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div className="text-xs text-slate-400">Total Server</div>
          <div className="text-2xl font-bold text-slate-100 mt-1">{data.total_servers}</div>
        </div>
      </div>

      {/* Chart Modal */}
      {showModal && serverDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowModal(false); setSelectedServer(null); }}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Prediksi: {selectedServer}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Model: {serverDetail.model_used} | MAPE: {serverDetail.accuracy?.mape?.toFixed(1)}% | R²: {serverDetail.accuracy?.r_squared?.toFixed(3)}</p>
              </div>
              <button
                onClick={() => { setShowModal(false); setSelectedServer(null); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <PredictionChart
                historicalData={serverDetail.historical}
                predictions={serverDetail.predictions}
                model_used={serverDetail.model_used}
                accuracy={serverDetail.accuracy}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">ML Prediction — Forecasting & Time Series</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {data.total_servers} servers diprediksi menggunakan model ML otomatis + Health Score + Risk Prediction
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ExportActions
              columns={exportColumns}
              data={exportData}
              filename="ml-predictions-enhanced"
              title="ML Prediction — Forecasting & Time Series"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Horizon:</label>
              <select
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
                className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded-md border border-slate-600"
              >
                <option value={3}>3 bulan</option>
                <option value={6}>6 bulan</option>
                <option value={12}>12 bulan</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Data:</label>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded-md border border-slate-600"
              >
                <option value={90}>90 hari</option>
                <option value={180}>180 hari</option>
                <option value={365}>1 tahun</option>
              </select>
            </div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/50">
              <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-400">IP Server</th>
              <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-400">📊</th>
              <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-400">KB</th>
              <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-400">MB</th>
              <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-400">GB</th>
              <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-400">1B</th>
              <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-400">3B</th>
              <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-400">6B</th>
              <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-400">Health</th>
              <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-400">Trend</th>
              <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-400">Risk</th>
            </tr>
          </thead>
          <tbody>
            {data.servers.map((s) => (
              <tr key={s.server_ip} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                <td className="px-3 py-2 font-mono text-slate-200 text-xs">{s.server_ip}</td>
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => { setSelectedServer(s.server_ip); setShowModal(true); }}
                    className="px-2 py-1 text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded transition-colors"
                  >
                    Lihat
                  </button>
                </td>
                <td className="px-2 py-2 text-right text-slate-300 text-xs">{(s.current_kb ?? 0).toFixed(0)}</td>
                <td className="px-2 py-2 text-right text-slate-300 text-xs">{(s.current_mb ?? 0).toFixed(1)}</td>
                <td className="px-2 py-2 text-right text-slate-200 text-xs font-medium">{(s.current_gb ?? 0).toFixed(2)}</td>
                <td className="px-2 py-2 text-right text-slate-300 text-xs">{s.predictions["1m"]?.toFixed(2) || "—"}</td>
                <td className="px-2 py-2 text-right text-slate-300 text-xs">{s.predictions["3m"]?.toFixed(2) || "—"}</td>
                <td className="px-2 py-2 text-right text-slate-300 text-xs">{s.predictions["6m"]?.toFixed(2) || "—"}</td>
                <td className="px-2 py-2 text-center">
                  <HealthScoreBadge score={s.health_score} grade={s.health_grade} />
                </td>
                <td className="px-2 py-2 text-center">
                  <TrendBadge trend={s.trend} description={s.trend_description} />
                </td>
                <td className="px-2 py-2 text-center">
                  <RiskBadge riskScore={s.risk_score} riskLevel={s.risk_level} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Legend */}
        <div className="p-3 border-t border-slate-700 bg-slate-900/30 text-xs text-slate-400">
          <div className="flex flex-wrap gap-4">
            <span>📖 Health: <span className="text-emerald-400">A=90+ Sangat Sehat</span> | <span className="text-green-400">B=80+ Sehat</span> | <span className="text-amber-400">C=70+ Cukup</span> | <span className="text-orange-400">D=60+ Kurang</span> | <span className="text-red-400">F=&lt;60 Buruk</span></span>
          </div>
          <div className="flex flex-wrap gap-4 mt-1">
            <span>📈 Trend: <span className="text-red-400">↑↑ Naik Cepat</span> | <span className="text-amber-400">↑ Naik Lambat</span> | <span className="text-green-400">→ Stabil</span> | <span className="text-emerald-400">↓ Turun</span> | <span className="text-orange-400">↯ Fluktuatif</span> | <span className="text-purple-400">↻ Musiman</span></span>
          </div>
          <div className="flex flex-wrap gap-4 mt-1">
            <span>⚠️ Risk: <span className="text-green-400">🟢 Rendah (0-29)</span> | <span className="text-amber-400">🟡 Sedang (30-59)</span> | <span className="text-orange-400">🟠 Tinggi (60-79)</span> | <span className="text-red-400">🔴 Critical (80+)</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
