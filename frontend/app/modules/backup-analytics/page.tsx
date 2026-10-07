"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useBackupFilters } from "./hooks/useFilterState";
import { useBackupData } from "./hooks/useBackupData";
import { exportBackupAnalyticsReportPDF } from "@/lib/export";
import type { DashboardSummary } from "./types";
import SummaryCards from "./components/SummaryCards";
import TrendChart from "./components/TrendChart";
import SectionTabs from "./components/SectionTabs";
import UnifiedServerTable from "./components/UnifiedServerTable";
import HeatmapGrid from "./components/HeatmapGrid";
import AnomalyTable from "./components/AnomalyTable";
import HistoryOverview from "./components/HistoryOverview";
import ServerDetailDrawer from "./components/ServerDetailDrawer";
import ServerAggregation from "./components/ServerAggregation";
import CapacityProjection from "./components/CapacityProjection";
import MLPredictions from "./components/MLPredictions";
import ClusterView from "./components/ClusterView";

function BackupAnalyticsContent() {
  const { filters, setTab, setServer, setRange } = useBackupFilters();
  const searchParams = useSearchParams();
  const { dashboard, missingData, topData, growthData, heatmapData, anomaliesData, trendData, unifiedServerList, loading, error, retry } = useBackupData(filters);

  const [drawerServer, setDrawerServer] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
    const serverParam = searchParams.get("server");
    if (serverParam && serverParam !== "all") {
      setDrawerServer(serverParam);
    }
  }, [searchParams, setServer]);

  const handleServerClick = (ip: string) => {
    setDrawerServer(ip);
    setServer(ip);
  };

  const handleDrawerClose = () => {
    setDrawerServer(null);
    setServer("all");
  };

  const summaryData: DashboardSummary | undefined = loading ? undefined : {
    total_kb: unifiedServerList?.summary?.total_kb || 0,
    total_mb: unifiedServerList?.summary?.total_mb || 0,
    total_gb: unifiedServerList?.summary?.total_gb || 0,
    total_files: unifiedServerList?.summary?.total_files || 0,
    server_count: unifiedServerList?.summary?.server_count || 0,
    avg_file_mb: dashboard?.avg_file_mb || 0,
    backed_up_today: unifiedServerList?.summary?.backed_up_today || 0,
    missing_count: unifiedServerList?.summary?.missing_count || 0,
    avg_daily_growth_pct: unifiedServerList?.summary?.avg_daily_growth_pct || 0,
    anomaly_count: anomaliesData?.total_anomalies || 0,
  };

  const handleExportPDF = useCallback(() => {
    const servers = unifiedServerList?.servers;
    exportBackupAnalyticsReportPDF({
      summary: summaryData ? {
        total_gb: summaryData.total_gb,
        total_files: summaryData.total_files,
        server_count: summaryData.server_count,
        backed_up_today: summaryData.backed_up_today,
        missing_count: summaryData.missing_count,
        avg_daily_growth_pct: summaryData.avg_daily_growth_pct,
        anomaly_count: summaryData.anomaly_count,
      } : undefined,
      servers: servers,
      anomalies: anomaliesData?.anomalies,
      heatmapInfo: heatmapData ? {
        servers: heatmapData.servers.length,
        dates: heatmapData.dates.length,
      } : undefined,
      missingServers: servers?.filter(s => s.days_ago > 1).map(s => ({
        ip: s.ip, last_backup: s.last_backup, days_ago: s.days_ago,
        size_gb: s.size_gb, files: s.files, status: s.status, growth_pct: s.growth_pct,
      })),
      topServers: servers ? [...servers].sort((a, b) => b.size_gb - a.size_gb).slice(0, 10).map(s => ({
        ip: s.ip, size_gb: s.size_gb, files: s.files, last_backup: s.last_backup,
        status: s.status, growth_pct: s.growth_pct,
      })) : undefined,
      growthServers: servers ? [...servers].filter(s => s.growth_pct !== 0).sort((a, b) => b.growth_pct - a.growth_pct).slice(0, 10).map(s => ({
        ip: s.ip, current_gb: s.size_gb, growth_pct: s.growth_pct, files: s.files, status: s.status,
      })) : undefined,
    }, fromDate, toDate);
  }, [unifiedServerList, anomaliesData, heatmapData, summaryData, fromDate, toDate]);

  if (error) {
    return (
    <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Analytics Backup</h1>
        </div>
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-8 text-center">
          <div className="text-red-400 text-lg font-semibold mb-2">Gagal memuat data</div>
          <div className="text-gray-500 dark:text-slate-400 text-sm mb-4">Terjadi kesalahan saat mengambil data dari server</div>
          <button
            onClick={retry}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md text-sm font-medium transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Analytics Backup</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Monitoring backup semua server — siapa yang backup, siapa yang tidak, dan prediksi storage</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">📅 From:</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-md px-3 py-1.5 text-sm text-gray-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
            />
            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">To:</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-md px-3 py-1.5 text-sm text-gray-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleExportPDF}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center gap-1"
            >
              <span>📄</span> PDF Report
            </button>
            <button
              onClick={retry}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-500 dark:bg-slate-600 hover:bg-slate-500 text-white transition-colors flex items-center gap-1"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards data={summaryData} />

      {/* Trend Chart */}
      <TrendChart data={trendData?.trend} days={filters.trendDays} onDaysChange={(d) => {
        const rangeMap: Record<number, string> = { 7: "7d", 14: "14d", 30: "30d", 60: "60d", 180: "6mo" };
        setRange(rangeMap[d] || "30d");
      }} />

      {/* Section Tabs */}
      <SectionTabs
        active={filters.tab}
        onChange={setTab}
        missingCount={missingData?.missing_count || 0}
        anomalyCount={anomaliesData?.total_anomalies || 0}
      />

      {/* Unified Server Table (replaces Missing, Top, Growth) */}
      {filters.tab === "all" && (
        <UnifiedServerTable
          data={unifiedServerList?.servers}
          summary={unifiedServerList?.summary}
          onServerClick={handleServerClick}
        />
      )}

      {filters.tab === "missing" && (
        <UnifiedServerTable
          data={unifiedServerList?.servers?.filter(s => s.days_ago > 1)}
          summary={unifiedServerList?.summary}
          onServerClick={handleServerClick}
        />
      )}

      {filters.tab === "top" && (
        <UnifiedServerTable
          data={unifiedServerList?.servers?.sort((a, b) => b.size_gb - a.size_gb).slice(0, 10)}
          summary={unifiedServerList?.summary}
          onServerClick={handleServerClick}
        />
      )}

      {filters.tab === "growth" && (
        <UnifiedServerTable
          data={unifiedServerList?.servers?.filter(s => s.growth_pct !== 0).sort((a, b) => b.growth_pct - a.growth_pct).slice(0, 10)}
          summary={unifiedServerList?.summary}
          onServerClick={handleServerClick}
        />
      )}

      {filters.tab === "heatmap" && (
        <HeatmapGrid data={heatmapData} days={filters.heatmapDays} onDaysChange={(d) => {
          const rangeMap: Record<number, string> = { 7: "7d", 14: "14d", 30: "30d" };
          setRange(rangeMap[d] || "30d");
        }} />
      )}

      {filters.tab === "anomalies" && (
        <AnomalyTable data={anomaliesData?.anomalies} />
      )}

      {filters.tab === "projection" && (
        <CapacityProjection />
      )}

      {filters.tab === "ml-predict" && (
        <MLPredictions />
      )}

      {filters.tab === "clusters" && (
        <ClusterView />
      )}

      {filters.tab === "history" && (
        <HistoryOverview onServerClick={handleServerClick} />
      )}

      {filters.tab === "aggregation" && (
        <ServerAggregation />
      )}

      {/* Server Detail Drawer */}
      <ServerDetailDrawer serverIp={drawerServer} onClose={handleDrawerClose} />
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="p-6 flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
}

export default function BackupAnalyticsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <BackupAnalyticsContent />
    </Suspense>
  );
}
