"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export interface BackupFilters {
  tab: string;
  server: string;
  range: string;
  trendDays: number;
  heatmapDays: number;
  growthDays: number;
}

const DEFAULTS: BackupFilters = {
  tab: "all",
  server: "all",
  range: "30d",
  trendDays: 30,
  heatmapDays: 14,
  growthDays: 30,
};

const RANGE_TO_DAYS: Record<string, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "60d": 60,
  "6mo": 180,
};

export function useBackupFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo<BackupFilters>(() => {
    const range = searchParams.get("range") || DEFAULTS.range;
    const days = RANGE_TO_DAYS[range] || DEFAULTS.trendDays;
    return {
      tab: searchParams.get("tab") || DEFAULTS.tab,
      server: searchParams.get("server") || DEFAULTS.server,
      range,
      trendDays: days,
      heatmapDays: days,
      growthDays: days,
    };
  }, [searchParams]);

  const updateFilters = useCallback((updates: Partial<BackupFilters>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === DEFAULTS[key as keyof BackupFilters]) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });
    if (updates.range && RANGE_TO_DAYS[updates.range]) {
      const days = RANGE_TO_DAYS[updates.range];
      params.set("trendDays", String(days));
      params.set("heatmapDays", String(days));
      params.set("growthDays", String(days));
    }
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [searchParams, router, pathname]);

  const setTab = useCallback((tab: string) => updateFilters({ tab }), [updateFilters]);
  const setServer = useCallback((server: string) => updateFilters({ server }), [updateFilters]);
  const setRange = useCallback((range: string) => updateFilters({ range }), [updateFilters]);

  return { filters, setTab, setServer, setRange, updateFilters };
}
