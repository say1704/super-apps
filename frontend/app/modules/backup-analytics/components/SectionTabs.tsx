"use client";

interface Props {
  active: string;
  onChange: (id: string) => void;
  missingCount: number;
  anomalyCount: number;
}

const tabs = [
  { id: "all", label: "Semua" },
  { id: "missing", label: "⚠️ Belum" },
  { id: "top", label: "🏆 Top 10" },
  { id: "growth", label: "📈 Growth" },
  { id: "heatmap", label: "🗓️ Heatmap" },
  { id: "anomalies", label: "🔍 Anomali" },
  { id: "projection", label: "📊 Proyeksi" },
  { id: "ml-predict", label: "🤖 ML Prediction" },
  { id: "clusters", label: "🔗 Clusters" },
  { id: "history", label: "📋 History" },
  { id: "aggregation", label: "📐 Agregasi" },
];

export default function SectionTabs({ active, onChange, missingCount, anomalyCount }: Props) {
  return (
    <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
      {tabs.map((t) => {
        let label = t.label;
        if (t.id === "missing") label = `⚠️ Belum (${missingCount})`;
        if (t.id === "anomalies") label = `🔍 Anomali (${anomalyCount})`;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              active === t.id ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-700"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
