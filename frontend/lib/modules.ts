/**
 * Shared module definitions — single source of truth for all frontend RBAC.
 * Must match backend ALL_MODULES in backend/api/dependencies.py exactly.
 */

export interface ModuleDef {
  key: string;
  label: string;
  icon: string;
  href: string;
  submenu?: ModuleDef[];
}

export const ALL_MODULES: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", icon: "📊", href: "/" },

  {
    key: "infrastructure", label: "Infrastructure", icon: "🖥️", href: "/modules/infrastructure",
    submenu: [
      { key: "monthly-server-check", label: "Server Capacity", icon: "📈", href: "/modules/monthly-server-check" },
      { key: "irmc", label: "IRMC Checks", icon: "🖥️", href: "/modules/irmc" },
    ],
  },

  {
    key: "security-compliance", label: "Security & Compliance", icon: "🔒", href: "/modules/security-compliance",
    submenu: [
      { key: "vulnerability", label: "Vulnerability Report", icon: "⚠️", href: "/modules/vulnerability" },
      { key: "incident", label: "Incident Report", icon: "🚨", href: "/modules/incident" },
      { key: "risk", label: "Risk Assessment", icon: "🎯", href: "/modules/risk" },
      { key: "quality", label: "Quality Objectives", icon: "✅", href: "/modules/quality" },
      { key: "audit", label: "Audit File", icon: "🔍", href: "/modules/audit" },
      { key: "audit-trail", label: "Audit Trail", icon: "📋", href: "/modules/audit-trail" },
    ],
  },

  { key: "assets", label: "Asset Management", icon: "📦", href: "/modules/assets" },

  {
    key: "operations", label: "Operations", icon: "📝", href: "/modules/operations",
    submenu: [
      { key: "worklog", label: "Worklog", icon: "📝", href: "/modules/worklog" },
      { key: "tasks", label: "Project Tasks", icon: "📌", href: "/modules/tasks" },
      { key: "documentation", label: "Documentation", icon: "📚", href: "/modules/documentation" },
      { key: "forms", label: "Form Uploads", icon: "📋", href: "/modules/forms" },
    ],
  },

  {
    key: "log-management", label: "Log Management", icon: "📋", href: "/modules/log-management",
    submenu: [
      { key: "log-deletion", label: "Log Deletion", icon: "🗑️", href: "/modules/log-deletion" },
      { key: "log-compression", label: "Log Compression", icon: "📦", href: "/modules/log-compression" },
      { key: "ssh-report", label: "SSH Report", icon: "🔐", href: "/modules/ssh-report" },
    ],
  },

  {
    key: "backup-management", label: "Backup Management", icon: "💾", href: "/modules/backup-management",
    submenu: [
      { key: "backup-check", label: "Backup Check", icon: "✅", href: "/modules/backup-check" },
      { key: "backup-analytics", label: "Backup Analytics", icon: "📊", href: "/modules/backup-analytics" },
    ],
  },

  { key: "reports", label: "Reports", icon: "📊", href: "/modules/reports" },
  { key: "anomaly-insights", label: "AI Insights", icon: "🤖", href: "/modules/anomaly-insights" },
  { key: "activity", label: "Activity Logs", icon: "📜", href: "/modules/activity" },
  { key: "notifications", label: "Notifications", icon: "🔔", href: "/modules/notifications" },
  { key: "settings", label: "Settings", icon: "⚙️", href: "/modules/settings" },
];

/**
 * Flat list of all module keys (for RBAC checks).
 */
export const MODULE_KEYS: string[] = ALL_MODULES.flatMap((m) => {
  if (m.submenu && m.submenu.length > 0) {
    return [m.key, ...m.submenu.map((s) => s.key)];
  }
  return [m.key];
});

/**
 * Dashboard grid modules — subset of ALL_MODULES that have stat cards.
 * Excludes: dashboard (already on it), log-management (parent only).
 */
export const DASHBOARD_GRID_MODULES = ALL_MODULES.filter(
  (m) => m.key !== "dashboard" && !m.submenu
);

/**
 * Quick action definitions for dashboard.
 */
export interface QuickActionDef {
  label: string;
  href: string;
  moduleKey: string;
  icon: string;
}

export const QUICK_ACTIONS: QuickActionDef[] = [
  { label: "New Task", href: "/modules/tasks?action=new", moduleKey: "tasks", icon: "+ Task" },
  { label: "Log Work", href: "/modules/worklog?action=new", moduleKey: "worklog", icon: "+ Work" },
  { label: "Report Incident", href: "/modules/incident?action=new", moduleKey: "incident", icon: "+ Incident" },
  { label: "Add Vulnerability", href: "/modules/vulnerability?action=new", moduleKey: "vulnerability", icon: "+ Vuln" },
  { label: "Add Document", href: "/modules/documentation?action=new", moduleKey: "documentation", icon: "+ Doc" },
  { label: "L&M Record", href: "/modules/log-maintenance?action=new", moduleKey: "log-deletion", icon: "+ L&M" },
];

/**
 * Stat card definitions for dashboard.
 */
export interface StatCardDef {
  label: string;
  href: string;
  moduleKey: string;
  icon: string;
  color: string;
  statKey: string;
}

export const STAT_CARDS: StatCardDef[] = [
  { label: "IRMC Checks", href: "/modules/irmc", moduleKey: "irmc", icon: "🖥️", color: "teal", statKey: "irmc_checks" },
  { label: "L&M Records", href: "/modules/log-maintenance", moduleKey: "log-deletion", icon: "📝", color: "blue", statKey: "log_maintenance" },
  { label: "Vulnerabilities", href: "/modules/vulnerability", moduleKey: "vulnerability", icon: "⚠️", color: "red", statKey: "vulnerabilities" },
  { label: "Incidents", href: "/modules/incident", moduleKey: "incident", icon: "🚨", color: "orange", statKey: "incidents" },
  { label: "Documents", href: "/modules/documentation", moduleKey: "documentation", icon: "📚", color: "indigo", statKey: "documents_count" },
  { label: "Assets", href: "/modules/assets", moduleKey: "assets", icon: "💻", color: "purple", statKey: "assets_hardware_count" },
  { label: "Tasks", href: "/modules/tasks", moduleKey: "tasks", icon: "📌", color: "cyan", statKey: "active_tasks" },
  { label: "Worklogs This Week", href: "/modules/worklog", moduleKey: "worklog", icon: "📝", color: "emerald", statKey: "worklogs" },
  { label: "Risk Items", href: "/modules/risk", moduleKey: "risk", icon: "🎯", color: "amber", statKey: "risk_items" },
];

export interface UserContext {
  role?: string;
  modules?: string[];
}

export function hasModuleAccess(user: UserContext | null | undefined, moduleKey: string): boolean {
  if (user?.role === 'superadmin') return true;
  if (!user?.modules || user.modules.length === 0) return false;
  return user.modules.includes(moduleKey);
}

export function hasAnyModuleAccess(user: UserContext | null | undefined, moduleKeys: string[]): boolean {
  if (user?.role === 'superadmin') return true;
  if (!user?.modules || user.modules.length === 0) return false;
  return moduleKeys.some(k => user?.modules?.includes(k));
}
