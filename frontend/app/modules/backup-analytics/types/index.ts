export interface DashboardSummary {
  total_kb: number;
  total_mb: number;
  total_gb: number;
  total_files: number;
  server_count: number;
  avg_file_mb: number;
  backed_up_today: number;
  missing_count: number;
  avg_daily_growth_pct: number;
  anomaly_count: number;
}

export interface MissingServer {
  ip: string;
  last_backup: string;
  days_ago: number;
  size_kb: number;
  size_mb: number;
  size_gb: number;
  files: number;
}

export interface TopServer {
  ip: string;
  size_kb: number;
  size_mb: number;
  size_gb: number;
  files: number;
  last_backup: string;
}

export interface GrowthServer {
  ip: string;
  current_kb: number;
  current_mb: number;
  current_gb: number;
  first_kb: number;
  first_mb: number;
  first_gb: number;
  total_growth_kb: number;
  total_growth_mb: number;
  total_growth_gb: number;
  daily_growth_kb: number;
  daily_growth_mb: number;
  daily_growth_gb: number;
  growth_pct: number;
  data_points: number;
  trend: Array<{ date: string; size_kb: number; size_mb: number; size_gb: number }>;
}

export interface HeatmapResponse {
  servers: string[];
  dates: string[];
  grid: Record<string, Record<string, number>>;
}

export interface Anomaly {
  ip: string;
  date: string;
  prev_size_kb: number;
  prev_size_mb: number;
  prev_size_gb: number;
  curr_size_kb: number;
  curr_size_mb: number;
  curr_size_gb: number;
  change_pct: number;
  type: "drop" | "spike";
  files: number;
}

export interface TrendEntry {
  date: string;
  total_kb: number;
  total_mb: number;
  total_gb: number;
  total_files: number;
}

export interface ServerHistoryEntry {
  date: string;
  size_kb: number;
  size_mb: number;
  size_gb: number;
  files: number;
  status: string;
}

export interface ServerDetailResponse {
  server_ip: string;
  period_days: number;
  summary: {
    total_kb: number;
    total_mb: number;
    total_gb: number;
    total_files: number;
    record_count: number;
    growth_pct: number;
    last_backup: string | null;
    last_size_kb: number;
    last_size_mb: number;
    last_size_gb: number;
  };
  history: ServerHistoryEntry[];
}

export interface ConsistencyServer {
  ip: string;
  backup_days: number;
  total_days: number;
  consistency_pct: number;
  size_kb: number;
  size_mb: number;
  size_gb: number;
  files: number;
  last_backup: string | null;
}

export interface PeriodSummaryResponse {
  period: { start: string; end: string; total_days: number };
  summary: {
    total_kb: number;
    total_mb: number;
    total_gb: number;
    total_files: number;
    server_count: number;
    avg_daily_kb: number;
    avg_daily_mb: number;
    avg_daily_gb: number;
    avg_daily_files: number;
  };
  most_consistent: { ip: string; pct: number; days: number } | null;
  consistency: Array<{ ip: string; pct: number; days: number }>;
}

export interface AggregationPeriod {
  period: string;
  days: number;
  backup_count: number;
  total_files: number;
  total_size_kb: number;
  total_size_mb: number;
  total_size_gb: number;
  avg_size_kb: number;
  avg_size_mb: number;
  avg_size_gb: number;
  first_date: string | null;
  last_date: string | null;
}

export interface ServerAggregationResponse {
  server_ip: string;
  latest_backup: string | null;
  latest_size_kb: number;
  latest_size_mb: number;
  latest_size_gb: number;
  periods: AggregationPeriod[];
}

export interface UnifiedServer {
  ip: string;
  last_backup: string | null;
  days_ago: number;
  size_kb: number;
  size_mb: number;
  size_gb: number;
  files: number;
  status: "OK" | "Warning" | "Critical";
  growth_pct: number;
  trend: Array<{ date: string; size_kb: number; size_mb: number; size_gb: number }>;
}

export interface UnifiedServerListData {
  servers: UnifiedServer[];
  total: number;
  summary: {
    total_kb: number;
    total_mb: number;
    total_gb: number;
    total_files: number;
    server_count: number;
    backed_up_today: number;
    missing_count: number;
    avg_daily_growth_pct: number;
  };
}
