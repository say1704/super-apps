"use client";

import useSWR from "swr";
import { apiRequest } from "@/lib/auth";
import type {
  MissingServer,
  TopServer,
  GrowthServer,
  HeatmapResponse,
  Anomaly,
  TrendEntry,
  UnifiedServer,
  UnifiedServerListData,
} from "../types";

function swrFetcher<T>(url: string): Promise<T> {
  return apiRequest(url);
}

interface DashboardData {
  total_kb: number;
  total_mb: number;
  total_gb: number;
  total_files: number;
  server_count: number;
  avg_file_mb: number;
}

interface MissingData {
  missing: MissingServer[];
  total_servers: number;
  backed_up_today: number;
  missing_count: number;
}

interface TopData {
  servers: TopServer[];
  total_top_gb: number;
}

interface GrowthData {
  servers: GrowthServer[];
}

interface AnomaliesData {
  anomalies: Anomaly[];
  total_anomalies: number;
}

interface TrendData {
  trend: TrendEntry[];
}

export function useBackupData(filters: { tab: string; range: string; trendDays: number; heatmapDays: number; growthDays: number; server: string }) {
  const { tab, range, trendDays, heatmapDays, growthDays, server } = filters;

  const { data: dashboard, error: dashboardError, mutate: mutateDashboard } = useSWR<DashboardData>(
    tab === "all" ? "/api/backup-analytics/analytics/dashboard" : null,
    swrFetcher,
    { refreshInterval: tab === "all" ? 60000 : 0, revalidateOnFocus: false },
  );

  const { data: missingData, error: missingError, mutate: mutateMissing } = useSWR<MissingData>(
    (tab === "all" || tab === "missing") ? "/api/backup-analytics/analytics/missing-today" : null,
    swrFetcher,
    { refreshInterval: (tab === "all" || tab === "missing") ? 60000 : 0, revalidateOnFocus: false },
  );

  const { data: topData, error: topError, mutate: mutateTop } = useSWR<TopData>(
    (tab === "all" || tab === "top") ? "/api/backup-analytics/analytics/top-servers?limit=10" : null,
    swrFetcher,
    { refreshInterval: (tab === "all" || tab === "top") ? 60000 : 0, revalidateOnFocus: false },
  );

  const { data: growthData, error: growthError, mutate: mutateGrowth } = useSWR<GrowthData>(
    (tab === "all" || tab === "growth") ? `/api/backup-analytics/analytics/server-growth?days=${growthDays}&limit=10` : null,
    swrFetcher,
    { refreshInterval: (tab === "all" || tab === "growth") ? 60000 : 0, revalidateOnFocus: false },
  );

  const { data: heatmapData, error: heatmapError, mutate: mutateHeatmap } = useSWR<HeatmapResponse>(
    (tab === "all" || tab === "heatmap") ? `/api/backup-analytics/analytics/heatmap?days=${heatmapDays}` : null,
    swrFetcher,
    { refreshInterval: (tab === "all" || tab === "heatmap") ? 120000 : 0, revalidateOnFocus: false },
  );

  const { data: anomaliesData, error: anomaliesError, mutate: mutateAnomalies } = useSWR<AnomaliesData>(
    (tab === "all" || tab === "anomalies") ? "/api/backup-analytics/analytics/anomalies?days=30" : null,
    swrFetcher,
    { refreshInterval: (tab === "all" || tab === "anomalies") ? 60000 : 0, revalidateOnFocus: false },
  );

  const { data: trendData, error: trendError, mutate: mutateTrend } = useSWR<TrendData>(
    `/api/backup-analytics/analytics/simple-trend?days=${trendDays}`,
    swrFetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );

  const { data: unifiedServerList, error: unifiedError, mutate: mutateUnified } = useSWR<UnifiedServerListData>(
    `/api/backup-analytics/analytics/unified-servers?days=${trendDays}`,
    swrFetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );

  const loading = (tab === "all" && !unifiedServerList && !unifiedError);
  const error = unifiedError || dashboardError;

  const retry = () => {
    mutateDashboard();
    mutateMissing();
    mutateTop();
    mutateGrowth();
    mutateHeatmap();
    mutateAnomalies();
    mutateTrend();
    mutateUnified();
  };

  return {
    dashboard,
    missingData,
    topData,
    growthData,
    heatmapData,
    anomaliesData,
    trendData,
    unifiedServerList,
    loading,
    error,
    retry,
  };
}
